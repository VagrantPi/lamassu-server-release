const express = require('express')
const router = express.Router()
const semver = require('semver')
const _ = require('lodash/fp')
const { zonedTimeToUtc, utcToZonedTime } = require('date-fns-tz/fp')
const { add, intervalToDuration } = require('date-fns/fp')
const uuid = require('uuid')

const cibs = require('../btm-cibs')
const btmApi = require('../btm-api')
const btmSumsub = require('../btm-sumsub')
const btmMockTxHistoryLogs = require('../btm-mock-tx-history-logs')
const btmRiskcontrol = require('../btm-riskcontrol')
const sms = require('../sms')
const BN = require('../bn')
const EmailSender = require('../../btm-tools/email'); 
const compliance = require('../compliance')
const complianceTriggers = require('../compliance-triggers')
const configManager = require('../new-config-manager')
const customers = require('../customers')
const txs = require('../new-admin/services/transactions')
const httpError = require('../route-helpers').httpError
const notifier = require('../notifier')
const respond = require('../respond')
const { getTx } = require('../new-admin/services/transactions.js')
const machineLoader = require('../machine-loader')
const { loadLatestConfig } = require('../new-settings-loader')
const customInfoRequestQueries = require('../new-admin/services/customInfoRequests')
const T = require('../time')
const plugins = require('../plugins')
const Tx = require('../tx')
const loyalty = require('../loyalty')
const logger = require('../logger')
const externalCompliance = require('../compliance-external')

function updateCustomerCustomInfoRequest (customerId, patch) {
  const promise = _.isNil(patch.data) ?
    Promise.resolve(null) :
    customInfoRequestQueries.setCustomerDataViaMachine(customerId, patch.infoRequestId, patch)
  return promise.then(() => customers.getById(customerId))
}

const createPendingManualComplianceNotifs = (settings, customer, deviceId) => {
  const customInfoRequests = _.reduce(
    (reqs, req) => _.set(req.info_request_id, req, reqs),
    {},
    _.get(['customInfoRequestData'], customer)
  )

  const isPending = field =>
    uuid.validate(field) ?
      _.get([field, 'override'], customInfoRequests) === 'automatic' :
      customer[`${field}At`]
        && (!customer[`${field}OverrideAt`]
            || customer[`${field}OverrideAt`].getTime() < customer[`${field}At`].getTime())

  const unnestCustomTriggers = triggersAutomation => {
    const customTriggers = _.fromPairs(_.map(({ id, type }) => [id, type], triggersAutomation.custom))
    return _.flow(
      _.unset('custom'),
      _.mapKeys(k => k === 'facephoto' ? 'frontCamera' : k),
      _.assign(customTriggers),
    )(triggersAutomation)
  }

  const isManual = v => v === 'Manual'

  const hasManualAutomation = triggersAutomation =>
    _.any(isManual, _.values(triggersAutomation))

  configManager.getTriggersAutomation(customInfoRequestQueries.getCustomInfoRequests(true), settings.config)
    .then(triggersAutomation => {
      triggersAutomation = unnestCustomTriggers(triggersAutomation)
      if (!hasManualAutomation(triggersAutomation)) return

      const pendingFields = _.filter(
        field => isManual(triggersAutomation[field]) && isPending(field),
        _.keys(triggersAutomation)
      )

      if (!_.isEmpty(pendingFields))
        notifier.complianceNotify(settings, customer, deviceId, 'PENDING_COMPLIANCE')
    })
}

function updateCustomer (req, res, next) {
  const id = req.params.id
  const machineVersion = req.query.version
  const txId = req.query.txId
  const patch = req.body
  const triggers = configManager.getTriggers(req.settings.config)
  const compatTriggers = complianceTriggers.getBackwardsCompatibleTriggers(triggers)
  const deviceId = req.deviceId
  const settings = req.settings

  if (patch.customRequestPatch) {
    return updateCustomerCustomInfoRequest(id, patch.customRequestPatch)
      .then(customer => {
        createPendingManualComplianceNotifs(settings, customer, deviceId)
        respond(req, res, { customer })
      })
      .catch(next)
  }

  // BACKWARDS_COMPATIBILITY 7.5
  // machines before 7.5 expect customer with sanctions result
  const isOlderMachineVersion = !machineVersion || semver.lt(machineVersion, '7.5.0-beta.0')
  customers.getById(id)
    .then(customer =>
      !customer ? Promise.reject(httpError('Not Found', 404)) :
      !isOlderMachineVersion ? {} :
      compliance.validationPatch(deviceId, !!compatTriggers.sanctions, _.merge(customer, patch))
    )
    .then(_.merge(patch))
    .then(newPatch => customers.updatePhotoCard(id, newPatch))
    .then(newPatch => customers.updateFrontCamera(id, newPatch))
    .then(newPatch => customers.update(id, newPatch, null, txId))
    .then(customer => {
      createPendingManualComplianceNotifs(settings, customer, deviceId)
      respond(req, res, { customer })
    })
    .catch(next)
}

function updateIdCardData (req, res, next) {
  const id = req.params.id
  const patch = req.body
  customers.getById(id)
    .then(customer => {
      if (!customer) { throw httpError('Not Found', 404) }
      return customers.updateIdCardData(patch, id)
        .then(() => customer)
    })
    .then(customer => respond(req, res, { customer }))
    .catch(next)
}

function triggerSanctions (req, res, next) {
  const id = req.params.id

  customers.getById(id)
    .then(customer => {
      if (!customer) { throw httpError('Not Found', 404) }
      return compliance.validationPatch(req.deviceId, true, customer)
        .then(patch => customers.update(id, patch))
    })
    .then(customer => respond(req, res, { customer }))
    .catch(next)
}

function triggerBlock (req, res, next) {
  const id = req.params.id
  const settings = req.settings

  customers.update(id, { authorizedOverride: 'blocked' })
    .then(customer => {
      notifier.complianceNotify(settings, customer, req.deviceId, 'BLOCKED')
      return respond(req, res, { customer })
    })
    .catch(next)
}

function triggerSuspend (req, res, next) {
  const id = req.params.id
  const triggerId = req.body.triggerId
  const settings = req.settings

  const emailSender = new EmailSender({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const triggers = configManager.getTriggers(req.settings.config)
  const getSuspendDays = _.compose(_.get('suspensionDays'), _.find(_.matches({ id: triggerId })))

  const days = _.includes(triggerId, ['no-ff-camera', 'id-card-photo-disabled']) ? 1 : getSuspendDays(triggers)
  let suspensionDuration = intervalToDuration({ start: 0, end: T.day * days })

  // 根據月曆制，調整封鎖到期時間
  switch (days) {
  case 1:
    // 到期時間至該日 00:00
    endUTC8 = btmRiskcontrol.periodTodayUTC8()
    endUTC0 = new Date(endUTC8.getTime() - 8 * 60 * 60 * 1000);
    suspensionDuration = intervalToDuration({ start: btmRiskcontrol.nowUTC8(), end: endUTC0 })
    break
  case 30:
    // 到期時間至該月最後一天 00:00
    endUTC8 = btmRiskcontrol.periodThisMonthUTC8()
    endUTC0 = new Date(endUTC8.getTime() - 8 * 60 * 60 * 1000);
    suspensionDuration = intervalToDuration({ start: btmRiskcontrol.nowUTC8(), end: endUTC0 })
    break
  }
  console.log('suspensionDuration', suspensionDuration)

  customers.getById(id).then(customer => {
    if (!customer) {
      throw httpError('Not Found', 404)
    }

    const filteredItem = req.settings.config.triggers.find(item => item.id === req.body.triggerId);
    let alertStr = ''
    switch (filteredItem.triggerType) {
      case 'txVolume':
        alertStr = `${filteredItem.thresholdDays} 日內限額 ${filteredItem.threshold}，封鎖 ${filteredItem.suspensionDays} 日`
        break;
      case 'txVelocity':
        alertStr = `${filteredItem.thresholdDays} 日內購買超過 ${filteredItem.threshold} 次，封鎖 ${filteredItem.suspensionDays} 日`
        break;
      default:
        break;
    }

    // 郵件選項
    const mailOptions = {
      to: process.env.SMTP_TO,
      subject: `用戶 ${customer.phone} 撞到限額`,
      text: `用戶 ${customer.phone} 撞到限額`,
      html: `
        <p>customer id: ${customer.id}</p>
        <p>phone: ${customer.phone}</p>
        <p>${alertStr}</p>
      `
    };
    logger.debug(`${id} 郵件 alertStr:`, alertStr);
    // 發送郵件
    return emailSender.sendMail(mailOptions).then(result => {
      logger.debug(`${id} 郵件發送成功:`, result);
      return customers.update(id, { suspendedUntil: add(suspensionDuration, new Date()) })
        .then(customer => {
          notifier.complianceNotify(settings, customer, req.deviceId, 'SUSPENDED', days)
          return respond(req, res, { customer })
        })
        .catch(next)
    })
    .catch(error => {
      logger.error(`${id}郵件發送失敗:`, error);
      logger.debug(`${id} alertStr:`, alertStr);
      return customers.update(id, { suspendedUntil: add(suspensionDuration, new Date()) })
        .then(customer => {
          notifier.complianceNotify(settings, customer, req.deviceId, 'SUSPENDED', days)
          return respond(req, res, { customer })
        })
        .catch(next)
    });
  })
  
}

function updateTxCustomerPhoto (req, res, next) {
  const customerId = req.params.id
  const txId = req.params.txId
  const tcPhotoData = req.body.tcPhotoData
  const direction = req.body.direction

  Promise.all([customers.getById(customerId), txs.getTx(txId, direction)])
    .then(([customer, tx]) => {
      if (!customer || !tx) return
      return customers.updateTxCustomerPhoto(tcPhotoData)
        .then(newPatch => txs.updateTxCustomerPhoto(customerId, txId, direction, newPatch))
    })
    .then(() => respond(req, res, {}))
    .catch(next)
}

function buildSms (data, receiptOptions) {
  return Promise.all([getTx(data.session, data.txClass), loadLatestConfig()])
    .then(([tx, config]) => {
      return Promise.all([customers.getCustomerById(tx.customer_id), machineLoader.getMachine(tx.device_id, config)])
        .then(([customer, deviceConfig]) => {
          const formattedTx = _.mapKeys(_.camelCase)(tx)
          const localeConfig = configManager.getLocale(formattedTx.deviceId, config)
          const timezone = localeConfig.timezone

          const cashInCommission = new BN(1).plus(new BN(formattedTx.commissionPercentage))

          const rate = new BN(formattedTx.rawTickerPrice).multipliedBy(cashInCommission).decimalPlaces(2)
          const date = utcToZonedTime(timezone, zonedTimeToUtc(process.env.TZ, new Date()))
          const dateString = `${date.toISOString().replace('T', ' ').slice(0, 19)}`

          const data = {
            operatorInfo: configManager.getOperatorInfo(config),
            location: deviceConfig.machineLocation,
            customerName: customer.name,
            customerPhone: customer.phone,
            session: formattedTx.id,
            time: dateString,
            direction: formattedTx.txClass === 'cashIn' ? 'Cash-in' : 'Cash-out',
            fiat: `${formattedTx.fiat.toString()} ${formattedTx.fiatCode}`,
            crypto: `${sms.toCryptoUnits(BN(formattedTx.cryptoAtoms), formattedTx.cryptoCode)} ${formattedTx.cryptoCode}`,
            rate: `1 ${formattedTx.cryptoCode} = ${rate} ${formattedTx.fiatCode}`,
            address: formattedTx.toAddress,
            txId: formattedTx.txHash
          }

          return sms.formatSmsReceipt(data, receiptOptions)
        })
    })
}

function sendSmsReceipt (req, res, next) {
  const receiptOptions = _.omit(['active', 'sms'], configManager.getReceipt(req.settings.config))
  buildSms(req.body.data, receiptOptions)
    .then(smsRequest => {
      sms.sendMessage(req.settings, smsRequest)
        .then(() => respond(req, res, {}))
        .catch(next)
    })
}

function getExternalComplianceLink (req, res, next) {
  const customerId = req.query.customer
  const triggerId = req.query.trigger
  const isRetry = req.query.isRetry
  if (_.isNil(customerId) || _.isNil(triggerId)) return next(httpError('Not Found', 404))

  const settings = req.settings
  const triggers = configManager.getTriggers(settings.config)
  const trigger = _.find(it => it.id === triggerId)(triggers)
  const externalService = trigger.externalService

  if (isRetry) {
    return externalCompliance.createLink(settings, externalService, customerId)
      .then(url => respond(req, res, { url }))
  }

  return externalCompliance.createApplicant(settings, externalService, customerId)
    .then(applicant => customers.addExternalCompliance(customerId, externalService, applicant.id))
    .then(() => externalCompliance.createLink(settings, externalService, customerId))
    .then(url => respond(req, res, { url }))
}

function addOrUpdateCustomer (customerData, deviceId, config, isEmailAuth) {
  const triggers = configManager.getTriggers(config)

  const customerKey = isEmailAuth ? customerData.email : customerData.phone
  const getFunc = isEmailAuth ? customers.getWithEmail : customers.get
  const addFunction = isEmailAuth ? customers.addWithEmail : customers.add

  console.log('------------------------------------------------------------------')
  console.log('customerData', customerData)
  console.log('deviceId', deviceId)
  let dayLimit = new BN(0)
  let monthLimit = new BN(0)
  let startAt = btmRiskcontrol.firstDayOfMonthUTC8()
  let banExpireDateRaw = null
  let banExpireDate = null
  let default_daily_limit = new BN(0)
  let default_monthly_limit = new BN(0)
  let limit_daily_limit = new BN(0)
  let limit_monthly_limit = new BN(0)


  return getFunc(customerKey)
    .then(customer => {
      if (customer) return customer

      return addFunction(customerData)
    })
    .then(customer => customers.getById(customer.id))
    .then(customer => {
      customers.updateLastAuthAttempt(customer.id, deviceId).catch(() => {
        logger.info('failure updating last auth attempt for customer ', customer.id)
      })
      return customer
    })
    .then(customer => {
      return btmSumsub.getById(customer.id)
        .then(sumsubInfo => {
          return Promise.all([customer, sumsubInfo])
        })
    })
    .then(([customer, sumsubInfo]) => {
      // 假設 sumsubInfo 為 null，要先去 sync sumsub
      // 如果這個階段失敗，依然讓 Promises chaining 繼續往下，machine 會根據 kyc 狀態走到對應顯示
      if (!sumsubInfo) {
        return btmApi.fetchIdNumber(customer.id)
          .then(() => {
            return btmSumsub.getById(customer.id)
              .then(sumsubInfo => {
                return Promise.all([customer, sumsubInfo])
              })
          })
          .catch(() => {
            console.log(`customer.id ${customer.id} 用戶 sync sumsub 失敗`)
            return Promise.all([customer, sumsubInfo])
          })
      }
      return Promise.all([customer, sumsubInfo])
    })
    .then(([customer, sumsubInfo]) => {
      // 取得用戶限額、黑名單移除時間
      return btmRiskcontrol.fetchTxVolume(customer.id)
        .then(limit => {
          return Promise.all([customer, sumsubInfo, limit])
        })
    })
    // Step 1. 取得當月 1 號至今的所有交易
    .then(([customer, sumsubInfo, limit]) => {
      logger.debug(`${customer.id} 撈出交易紀錄的當月 1 號時間 startAt：`, startAt)
      if (sumsubInfo && sumsubInfo.ban_expire_date) {
        banExpireDateRaw = sumsubInfo.ban_expire_date
        // 解析民國年月日
        const year = 1911 + Math.floor(sumsubInfo.ban_expire_date / 10000); // 民國年轉西元年
        const month = Math.floor((sumsubInfo.ban_expire_date % 10000) / 100); // 取出月份
        const day = sumsubInfo.ban_expire_date % 100; // 取出日期
        cibExpireDate = new Date(year, month - 1, day); 

        // 調整為 UTC+8
        cibExpireDate.setHours(cibExpireDate.getHours() + 8);
      
        logger.debug(`${customer.id} 解除 告誡名單 帳號時間：`, cibExpireDate)
        if (cibExpireDate > startAt) {
          logger.debug(`${customer.id} 解除 告誡名單 帳號時間比當月 1 號時間晚，更新 startAt`)
          startAt = cibExpireDate;
          logger.debug(`${customer.id} 更新後的 startAt：`, startAt)
        }
      }
      if (!!limit && !!limit.last_black_to_normal_at) {
        lastBlackToNormalAtUTC0 = new Date(limit.last_black_to_normal_at)
        lastBlackToNormalAtUTC8 = new Date(lastBlackToNormalAtUTC0.getTime() + 8 * 60 * 60 * 1000);
        logger.debug(`${customer.id} 解除 Ban 帳號時間：`, lastBlackToNormalAtUTC8)

        if (lastBlackToNormalAtUTC8 > startAt) {
          logger.debug(`${customer.id} 解除 Ban 帳號時間比 startAt 晚，更新 startAt`)
          startAt = lastBlackToNormalAtUTC8
          logger.debug(`${customer.id} 更新後的 startAt：`, startAt)
        }
      }

      startAtUtc0 = new Date(startAt.getTime() - 8 * 60 * 60 * 1000);

      logger.debug(`撈取用戶 ${customer.id} 交易紀錄，startAt: ${startAt}(UTC+8), ${startAtUtc0}(UTC+0) `)

    
      // 修改原始邏輯，改用月曆制，撈出當月 1/1 00:00 到至今或是解除黑名單的當天 00:00
      // 不用太別取解除黑名單時分秒，原因為解除前理應不能購買，因此撈進去也沒差
      return Tx.customerHistory(customer.id, startAtUtc0)
        .then(result => {
          customer.txHistory = result
          return Promise.all([customer, limit])
        })
    })
    // Step 2. - 計算客製限額與預設限額差
    //         - 還需要撈出該角色的風控門檻
    //         添加進去回傳的交易紀錄
    .then(([customer, limit]) => {
      // todaySum = btmRiskcontrol.sumFiatByDateRange1(customer.txHistory)
      // console.log('todaySum', todaySum)
      console.log('customer.txHistory', customer.txHistory)

      // 預設白名單日月限額
      default_daily_limit = getDefaultThreshold(triggers, 1)
      default_monthly_limit = getDefaultThreshold(triggers, 30)
      // 客制日月限額``
      limit_daily_limit = limit.daily_limit.toString()
      limit_monthly_limit = limit.monthly_limit.toString()

      logger.debug(`${customer.id} default_daily_limit`, default_daily_limit.toString())
      logger.debug(`${customer.id} default_monthly_limit`, default_monthly_limit.toString())
      logger.debug(`${customer.id} limit.daily_limit`, limit.daily_limit.toString())
      logger.debug(`${customer.id} limit.monthly_limit`, limit.monthly_limit.toString())
      

      // 日限額多賽入，當日塞入（預設日限額 - 客制日限額）
      now = new Date()
      dayLimit = default_daily_limit.minus(new BN(limit.daily_limit))
      logger.debug(`${customer.id} 日限額多賽入，當日塞入（預設日限額 - 客制日限額）`);
      logger.debug(`${customer.id} =>${default_daily_limit.toString()} - ${limit.daily_limit} = ${dayLimit.toString()}`)
      customer.txHistory.push({
        id: uuid.v4(),
        created: now.toISOString(),
        fiat: dayLimit.toString(),
        direction: 'cashIn',
        expired: false
      })

      // 月限額多塞入，前日塞入（預設月限額 - 客制月限額 - （預設日限額 - 客制日限額 - 當日已購買））
      // 如果今日為當月 1 號則不多塞
      const _now = new Date();
      _now.setHours(_now.getHours() + 8);
      logger.debug(`${customer.id}  判斷月限額是否多塞紀錄，現在日期為 ${_now}(UTC+8)`);
      const yesterdayDate = new Date(now);
      yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 2)// 前 2 日

      // 塞入前一日負的，以避免佔用月限額
      customer.txHistory.push({
        id: uuid.v4(),
        created: yesterdayDate.toISOString(),
        fiat: dayLimit.negated().toString(),
        direction: 'cashIn',
        expired: false
      })

      if (_now.getDate() !== 1) {
        monthLimit = default_monthly_limit.minus(new BN(limit.monthly_limit))
        logger.debug(`${customer.id} 月限額多塞入，前日塞入（預設月限額 - 客制月限額）`);
        logger.debug(`${customer.id} =>${default_monthly_limit.toString()} - ${limit.monthly_limit} = ${monthLimit.toString()}`)
        
        customer.txHistory.push({
          id: uuid.v4(),
          created: yesterdayDate.toISOString(),
          fiat: monthLimit.toString(),
          direction: 'cashIn',
          expired: false
        })
      }
      console.log('------------------------------------------------------------------')
      return customer
    })
    .then(customer => {
      return btmMockTxHistoryLogs.insertLog(customer.id, deviceId, default_daily_limit, default_monthly_limit, limit_daily_limit, limit_monthly_limit, dayLimit, monthLimit, startAt, banExpireDateRaw, banExpireDate)
        .then(() => customer)
    })
    .then(customer => {
      return loyalty.getCustomerActiveIndividualDiscount(customer.id)
        .then(discount => ({ ...customer, discount }))
    })
}


function getDefaultThreshold(triggers, thresholdDays) {
  const item = _.find(triggers, { requirement: 'suspend', thresholdDays });

  // 當找不到設定時給的最 default limit
  defaultLimit = new BN(300000)
  if (thresholdDays == 30) {
    defaultLimit = new BN(1000000)
  }
  return item ? new BN(item.threshold) : defaultLimit;
}



// 一開始購買時呼叫的取得手機驗證碼進入點
function getOrAddCustomerPhone (req, res, next) {
  const deviceId = req.deviceId
  const customerData = req.body

  const pi = plugins(req.settings, deviceId)
  const phone = req.body.phone

  return pi.getPhoneCode(phone)
    .then(code => {
      return addOrUpdateCustomer(customerData, deviceId, req.settings.config, false)
        .then((customer) => {
          return btmApi.fetchIdNumber(customer.id)
            .then(resp => {
              console.log('fetchIdNumber.resp', resp);
              const haseIdNumber = resp &&!resp.id_number

              // 當客戶完成認證才需要比對身分證
              if (haseIdNumber) {
                throw httpError('is blocked(no fetch id number)', 401)
              }

              // 檢查告誡名單，當符合時將客戶 authorizedOverride 改成 blocked
              return cibs.blocked(resp.id_number)
                .then((matchedCibItems = []) => {
                  console.log('matchedCibItems', matchedCibItems);

                  if (matchedCibItems.length > 0) {
                    customer.authorizedOverride = 'blocked'
                    // 如果比對成功，呼叫 server 在 Sumsub 壓 tag
                    return btmApi.addSumsubTag(customer.id)
                      .then(() => {
                        logger.info('sumsub tag added for customer ' + customer.id + '!!')
                        return respond(req, res, { code, customer })
                      })
                  }
                  return respond(req, res, { code, customer })
                })
            })
            .catch(()=>{
              console.log('no fetch id number');
              return respond(req, res, { code, customer })
            })
        })
    })
    .catch(err => {
      if (err.name === 'BadNumberError') throw httpError('Bad number', 401)
      throw err
    })
    .catch(next)
}

function getOrAddCustomerEmail (req, res, next) {
  const customerData = req.body

  const pi = plugins(req.settings, req.deviceId)
  const email = req.body.email

  return pi.getEmailCode(email)
    .then(code => {
      return addOrUpdateCustomer(customerData, req.settings.config, true)
        .then(customer => respond(req, res, { code, customer }))
    })
    .catch(err => {
      if (err.name === 'BadNumberError') throw httpError('Bad number', 401)
      throw err
    })
    .catch(next)
}

router.patch('/:id', updateCustomer)
router.patch('/:id/sanctions', triggerSanctions)
router.patch('/:id/block', triggerBlock)
router.patch('/:id/suspend', triggerSuspend)
router.patch('/:id/photos/idcarddata', updateIdCardData)
router.patch('/:id/:txId/photos/customerphoto', updateTxCustomerPhoto)
router.post('/:id/smsreceipt', sendSmsReceipt)
router.get('/external', getExternalComplianceLink)
router.post('/phone_code', getOrAddCustomerPhone)
router.post('/email_code', getOrAddCustomerEmail)

module.exports = router
