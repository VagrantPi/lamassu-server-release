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
const btmRiskcontrol = require('../btm-riskcontrol')
const sms = require('../sms')
const BN = require('../bn')
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

  const triggers = configManager.getTriggers(req.settings.config)
  const getSuspendDays = _.compose(_.get('suspensionDays'), _.find(_.matches({ id: triggerId })))

  const days = _.includes(triggerId, ['no-ff-camera', 'id-card-photo-disabled']) ? 1 : getSuspendDays(triggers)

  const suspensionDuration = intervalToDuration({ start: 0, end: T.day * days })

  customers.update(id, { suspendedUntil: add(suspensionDuration, new Date()) })
    .then(customer => {
      notifier.complianceNotify(settings, customer, req.deviceId, 'SUSPENDED', days)
      return respond(req, res, { customer })
    })
    .catch(next)
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
  const maxDaysThreshold = complianceTriggers.maxDaysThreshold(triggers)

  const customerKey = isEmailAuth ? customerData.email : customerData.phone
  const getFunc = isEmailAuth ? customers.getWithEmail : customers.get
  const addFunction = isEmailAuth ? customers.addWithEmail : customers.add

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
      let startAt = btmRiskcontrol.firstDayOfMonthUTC8()
      if (sumsubInfo.ban_expire_date) {
        // 解析民國年月日
        const year = 1911 + Math.floor(sumsubInfo.ban_expire_date / 10000); // 民國年轉西元年
        const month = Math.floor((sumsubInfo.ban_expire_date % 10000) / 100); // 取出月份
        const day = sumsubInfo.ban_expire_date % 100; // 取出日期
      
        const banExpireDate = new Date(year, month - 1, day); // JavaScript 月份從 0 開始

        // 調整為 UTC+8
        banExpireDate.setHours(banExpireDate.getHours() - 8);
      
        if (banExpireDate > startAt) {
          startAt = banExpireDate;
        }
      }
    
      // 修改原始邏輯，改用月曆制，撈出當月 1/1 00:00 到至今或是解除黑名單的當天 00:00
      // 不用太別取解除黑名單時分秒，原因為解除前理應不能購買，因此撈進去也沒差
      return Tx.customerHistory(customer.id, startAt)
        .then(result => {
          customer.txHistory = result
          return customer
        })
    })
    .then(customer => {
      return btmRiskcontrol.fetchTxVolume(customer.id)
        .then(limit => {

          todaySum = btmRiskcontrol.sumFiatByDateRange1(customer.txHistory)
          console.log('todaySum', todaySum)

          console.log('triggers', triggers)
          // 預設白名單日月限額
          default_daily_limit = getThreshold(1)
          default_monthly_limit = getThreshold(30)

          // 日限額多賽入，當日塞入（預設日限額 - 客制日限額）
          now = new Date()
          const dayLimit = default_daily_limit.minus(new BN(limit.daily_limit))
          console.log('日限額多賽入，當日塞入（預設日限額 - 客制日限額）');
          console.log(`=>${default_daily_limit.toString()} - ${limit.daily_limit} = ${dayLimit.toString()}`)
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
          console.log(`判斷月限額是否多塞紀錄，現在日期為 ${_now}(UTC+8)`);
          const yesterdayDate = new Date(now);
          yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 2)// 前 2 日

          // 塞入前一日 - 的，以避免佔用月限額
          customer.txHistory.push({
            id: uuid.v4(),
            created: yesterdayDate.toISOString(),
            fiat: dayLimit.negated().toString(),
            direction: 'cashIn',
            expired: false
          })

          if (_now.getDate() !== 1) {
            const monthLimit = default_monthly_limit.minus(new BN(limit.monthly_limit))
            console.log('月限額多塞入，前日塞入（預設月限額 - 客制月限額）');
            console.log(`=>${default_monthly_limit.toString()} - ${limit.monthly_limit} = ${monthLimit.toString()}`)
            
            customer.txHistory.push({
              id: uuid.v4(),
              created: yesterdayDate.toISOString(),
              fiat: monthLimit.toString(),
              direction: 'cashIn',
              expired: false
            })
          }

          return customer
        })
    })
    .then(customer => {
      return loyalty.getCustomerActiveIndividualDiscount(customer.id)
        .then(discount => ({ ...customer, discount }))
    })
}


function getThreshold(thresholdDays) {
  const item = _.find(data, { requirement: 'suspend', thresholdDays });

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
          console.log('customer', customer);
          
          return btmApi.fetchIdNumber(customer.id)
            .then(resp => {
              console.log('resp', resp);
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
