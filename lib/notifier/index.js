const _ = require('lodash/fp')

const configManager = require('../new-config-manager')
const logger = require('../logger')
const queries = require('./queries')
const settingsLoader = require('../new-settings-loader')
const customers = require('../customers')
const btmSumsub = require('../btm-sumsub')
const btmCrypto = require('../btm-crypto')
const btmInvoice = require('../btm-invoice')
const EcpayInvoiceClient = require('../../btm-tools/ecpay'); 
const btmRiskcontrol = require('../btm-riskcontrol')
const btmTx = require('../btm-tx')
const btmRiskControlCustomerLimitSetting = require('lamassu-server/lib/btm-risk-control-customer-limit-setting')
const btmChangeLogs = require('../btm-change-log')
const BN = require('../bn')
const { add, intervalToDuration } = require('date-fns/fp')
const EmailSender = require('../../btm-tools/email'); 

const notificationCenter = require('./notificationCenter')
const utils = require('./utils')
const emailFuncs = require('./email')
const smsFuncs = require('./sms')
const webhookFuncs = require('./webhook')
const { STALE, STALE_STATE } = require('./codes')

const sensitiveDataEncryptKey = process.env.SENSITIVE_DATA_ENCRYPT_KEY
const ecpayEnv = process.env.ECPAY_ENV
const ecpayHashKey = process.env.ECPAY_HASH_KEY
const ecpayHashIV = process.env.ECPAY_HASH_IV
const ecpayMerchantID = process.env.ECPAY_MERCHANT_ID

function buildMessage (alerts, notifications) {
  const smsEnabled = utils.isActive(notifications.sms)
  const emailEnabled = utils.isActive(notifications.email)

  let rec = {}
  if (smsEnabled) {
    rec = _.set(['sms', 'body'])(
      smsFuncs.printSmsAlerts(alerts, notifications.sms)
    )(rec)
  }
  if (emailEnabled) {
    rec = _.set(['email', 'subject'])(
      emailFuncs.alertSubject(alerts, notifications.email)
    )(rec)
    rec = _.set(['email', 'body'])(
      emailFuncs.printEmailAlerts(alerts, notifications.email)
    )(rec)
  }

  return rec
}

function checkNotification (plugins) {
  const notifications = plugins.getNotificationConfig()
  const smsEnabled = utils.isActive(notifications.sms)
  const emailEnabled = utils.isActive(notifications.email)
  const notificationCenterEnabled = utils.isActive(notifications.notificationCenter)

  if (!(notificationCenterEnabled || smsEnabled || emailEnabled)) return Promise.resolve()

  return getAlerts(plugins)
    .then(alerts => {
      notifyIfActive('errors', 'errorAlertsNotify', alerts)
      const currentAlertFingerprint = utils.buildAlertFingerprint(
        alerts,
        notifications
      )
      if (!currentAlertFingerprint) {
        const inAlert = !!utils.getAlertFingerprint()
        // variables for setAlertFingerprint: (fingerprint = null, lastAlertTime = null)
        utils.setAlertFingerprint(null, null)
        if (inAlert) return utils.sendNoAlerts(plugins, smsEnabled, emailEnabled)
      }
      if (utils.shouldNotAlert(currentAlertFingerprint)) return

      const message = buildMessage(alerts, notifications)
      utils.setAlertFingerprint(currentAlertFingerprint, Date.now())
      return plugins.sendMessage(message)
    })
    .then(results => {
      if (results && results.length > 0) {
        logger.debug('Successfully sent alerts')
      }
    })
    .catch(logger.error)
}

function getAlerts (plugins) {
  return Promise.all([
    plugins.checkBalances(),
    queries.machineEvents(),
    plugins.getMachineNames()
  ]).then(([balances, events, devices]) => {
    notifyIfActive('balance', 'balancesNotify', balances)
    return buildAlerts(checkPings(devices), balances, events, devices)
  })
}

function buildAlerts (pings, balances, events, devices) {
  const alerts = { devices: {}, deviceNames: {} }
  alerts.general = _.filter(r => !r.deviceId, balances)
  _.forEach(device => {
    const deviceId = device.deviceId
    const ping = pings[deviceId] || []
    const stuckScreen = checkStuckScreen(events, device)

    alerts.devices = _.set([deviceId, 'balanceAlerts'], _.filter(
      ['deviceId', deviceId],
      balances
    ), alerts.devices)
    alerts.devices[deviceId].deviceAlerts = _.isEmpty(ping) ? stuckScreen : ping

    alerts.deviceNames[deviceId] = device.name
  }, devices)

  return alerts
}

function checkPings (devices) {
  const deviceIds = _.map('deviceId', devices)
  const pings = _.map(utils.checkPing, devices)
  return _.zipObject(deviceIds)(pings)
}

function checkStuckScreen (deviceEvents, machine) {
  const lastEvent = _.pipe(
    _.filter(e => e.device_id === machine.deviceId),
    _.sortBy(utils.getDeviceTime),
    _.map(utils.parseEventNote),
    _.last
  )(deviceEvents)

  if (!lastEvent) return []

  const state = lastEvent.note.state
  const isIdle = lastEvent.note.isIdle

  if (isIdle) return []

  const age = Math.floor(lastEvent.age)
  const machineName = machine.name
  if (age > STALE_STATE) return [{ code: STALE, state, age, machineName }]

  return []
}

function transactionNotify (tx, rec) {
  logger.info(`${tx.customerId} !! transactionNotify`)
  const eppayClient = new EcpayInvoiceClient({
    merchantId: ecpayMerchantID,
    hashKey: ecpayHashKey,
    hashIV: ecpayHashIV,
    env: ecpayEnv ? ecpayEnv : 'sandbox'
  });

  logger.info(`${tx.customerId} !! before settingsLoader.loadLatest()`)

  return settingsLoader.loadLatest().then(settings => {
    const notifSettings = configManager.getGlobalNotifications(settings.config)
    logger.info(`${tx.customerId} notifSettings.highValueTransaction`, notifSettings.highValueTransaction || Infinity)
    logger.info(`${tx.customerId} tx.fiat`, tx.fiat)
    const highValueTx = tx.fiat.gt(notifSettings.highValueTransaction || Infinity)
    const isCashOut = tx.direction === 'cashOut'

    // for notification center
    const directionDisplay = isCashOut ? 'cash-out' : 'cash-in'
    const readyToNotify = !isCashOut || (tx.direction === 'cashOut' && rec.isRedemption)
    // awaiting for redesign. notification should not be sent if toggle in the settings table is disabled,
    // but currently we're sending notifications of high value tx even with the toggle disabled
    logger.info(`${tx.customerId} readyToNotify`, readyToNotify)
    logger.info(`${tx.customerId} !highValueTx`, !highValueTx)
    logger.info(`${tx.customerId} readyToNotify && !highValueTx`, readyToNotify && !highValueTx)
    if (readyToNotify && !highValueTx) {
      console.log('before notifyIfActive');
      notifyIfActive('transactions', 'notifCenterTransactionNotify', highValueTx, directionDisplay, tx.fiat, tx.fiatCode, tx.deviceId, tx.toAddress)
      console.log('after notifyIfActive');
    } else if (readyToNotify && highValueTx) {
      notificationCenter.notifCenterTransactionNotify(highValueTx, directionDisplay, tx.fiat, tx.fiatCode, tx.deviceId, tx.toAddress)
    }

    // alert through sms or email any transaction or high value transaction, if SMS || email alerts are enabled
    const walletSettings = configManager.getWalletSettings(tx.cryptoCode, settings.config)
    const zeroConfLimit = walletSettings.zeroConfLimit || 0
    const zeroConf = isCashOut && tx.fiat.lte(zeroConfLimit)
    const notificationsEnabled = notifSettings.sms.transactions || notifSettings.email.transactions
    const customerPromise = tx.customerId ? customers.getById(tx.customerId) : Promise.resolve({})

    logger.info(`${tx.customerId} !!zeroConf ${zeroConf}`) // false
    logger.info(`${tx.customerId} !!notificationsEnabled ${notificationsEnabled}`) // true
    logger.info(`${tx.customerId} !!highValueTx ${highValueTx}`) // false
    logger.info(`${tx.customerId} !!isCashOut ${isCashOut}`) // false
    logger.info(`${tx.customerId} !!rec.isRedemption ${rec.isRedemption}`) // false
    logger.info(`${tx.customerId} !!rec.error ${rec.error}`) // null

    logger.info(`${tx.customerId} (!notificationsEnabled && !highValueTx) ${(!notificationsEnabled && !highValueTx)}`)
    logger.info(`${tx.customerId} (zeroConf && isCashOut && !rec.isRedemption && !rec.error) ${zeroConf && isCashOut && !rec.isRedemption && !rec.error}`)
    logger.info(`${tx.customerId} (!zeroConf && rec.isRedemption) ${(!zeroConf && rec.isRedemption)}`)
    
    if (!notificationsEnabled && !highValueTx) return Promise.resolve()
    if (zeroConf && isCashOut && !rec.isRedemption && !rec.error) return Promise.resolve()
    if (!zeroConf && rec.isRedemption) return sendRedemptionMessage(tx.id, rec.error)

    let startOfDayAtUTC0 = btmRiskcontrol.todayUTC0()
    let startOfMonthAtUTC0 = btmRiskcontrol.firstDayOfMonthUTC0()    
    return Promise.all([
      queries.getMachineName(tx.deviceId),
      customerPromise,
      btmSumsub.getById(tx.customerId),
      btmRiskcontrol.fetchTxVolume(tx.customerId)
    ]).then(([machineName, customer, sumsubInfo, limit]) => {
      logger.info(`${tx.customerId} 撈取用戶交易紀錄，日限額 startOfDayAtUTC0: ${startOfDayAtUTC0}(UTC+0), 月限額 startOfMonthAtUTC0: ${startOfMonthAtUTC0}(UTC+0)`)

      return btmRiskcontrol.fetchDefaultLimit(limit.role)
        .then(defaultLimit => {
          const { level1: defaultLevel1, level2: defaultLevel2, level1_days: defaultLevel1Days, level2_days: defaultLevel2Days } = defaultLimit
          limitlevel1 = limit.level1 ? limit.level1 : defaultLevel1
          limitlevel2 = limit.level2 ? limit.level2 : defaultLevel2

          level1Days = limit.level1_days ? limit.level1_days : defaultLevel1Days
          level2Days = limit.level2_days ? limit.level2_days : defaultLevel2Days
          logger.info(`${tx.customerId} 撈出用戶交易紀錄 edd 條件一 ${limitlevel1}, 條件一天數 ${level1Days}, 條件二 ${limitlevel2}, 條件二天數 ${level2Days}`)

          level1DaysStartAt = btmRiskcontrol.dayMuteNUTC8(level1Days)
          level2DaysStartAt = btmRiskcontrol.dayMuteNUTC8(level2Days)

          // 如果有從黑名單解除
          if (!!limit && !!limit.last_black_to_normal_at) {
            // last_black_to_normal_at 儲存的是 UTC+0 的時間
            lastBlackToNormalAtUTC0 = new Date(limit.last_black_to_normal_at)
            if (lastBlackToNormalAtUTC0 > startOfDayAtUTC0) {
              logger.info(`${tx.customerId} 黑名單解除時間(edd 門檻一) lastBlackToNormalAtUTC0: ${lastBlackToNormalAtUTC0} 晚於當日 ${startOfDayAtUTC0}`)
              level1DaysStartAt = lastBlackToNormalAtUTC0
            }
            if (lastBlackToNormalAtUTC0 > startOfMonthAtUTC0) {
              logger.info(`${tx.customerId} 黑名單解除時間(edd 門檻二) lastBlackToNormalAtUTC0: ${lastBlackToNormalAtUTC0} 晚於當月 ${startOfMonthAtUTC0}`)
              level2DaysStartAt = lastBlackToNormalAtUTC0
            }
          }
          logger.info(`${tx.customerId} 撈取用戶交易紀錄 edd 條件一天數 ${level1DaysStartAt}, 條件二天數 ${level2DaysStartAt}`)


          const decryptSumsubInfoStr = btmCrypto.decryptAES256(sensitiveDataEncryptKey, sumsubInfo.info_hash)
          const decryptSumsubInfo = JSON.parse(decryptSumsubInfoStr)
          console.log('decryptSumsubInfo.email', decryptSumsubInfo.email)
          return Promise.all([
            btmTx.customerHistorySum(tx.customerId, startOfDayAtUTC0),
            btmTx.customerHistorySum(tx.customerId, startOfMonthAtUTC0),
            btmTx.customerHistorySum(tx.customerId, level1DaysStartAt),
            btmTx.customerHistorySum(tx.customerId, level2DaysStartAt),
            btmRiskControlCustomerLimitSetting.getCustomerCustomerLimitSettings(tx.customerId),
            eppayClient.issueB2CInvoice({
              relateNumber: tx.id,
              customerID: tx.customerId, 
              customerEmail: decryptSumsubInfo.email, 
              invoiceAmount: settings.config.commissions_fixedFee
            })
              .catch((error) => { return { err: error } })
          ]).then(([txSumTodayStr, txSumThisMonthStr, txSumLevel1Str, txSumLevel2Str, customerLimitSetting, res]) => {
    
            console.log('txSumTodayStr', txSumTodayStr)
            console.log('txSumThisMonthStr', txSumThisMonthStr)
            console.log('txSumLevel1Str', txSumLevel1Str)
            console.log('txSumLevel2Str', txSumLevel2Str)
            console.log('limit.daily_limit', limit.daily_limit.toString())
            console.log('limit.monthly_limit', limit.monthly_limit.toString())
            console.log('limitlevel1', limitlevel1)
            console.log('limitlevel2', limitlevel2)
            console.log('level1Days', level1Days)
            console.log('level2Days', level2Days)
            logger.info(`${tx.customerId} eppayClient res`, res)
    
            isBlock = false
            isEDDBlock = false
            alertLimitStr = ''
            alertEddStr = ''
            let promises = []

            // 到期時間至該日 00:00
            if (BN(txSumTodayStr).gte(BN(limit.daily_limit))) {
              logger.info(`${tx.customerId} 用戶撞到日限額`)
              isBlock = true
              endUTC0 = btmRiskcontrol.periodTodayUTC0()
              suspensionDuration = intervalToDuration({ start: btmRiskcontrol.nowUTC8(), end: endUTC0 })
              alertLimitStr = `1日內限額 ${limit.daily_limit}，封鎖 ${parseSuspensionDuration(suspensionDuration)}`
            }
            // 到期時間至該月最後一天 00:00
            if (BN(txSumThisMonthStr).gte(BN(limit.monthly_limit))) {
              logger.info(`${tx.customerId} 用戶撞到月限額`)
              isBlock = true
              endUTC0 = btmRiskcontrol.periodThisMonthUTC0()
              suspensionDuration = intervalToDuration({ start: btmRiskcontrol.nowUTC8(), end: endUTC0 })
              alertLimitStr = `30日內限額 ${limit.monthly_limit}，封鎖 ${parseSuspensionDuration(suspensionDuration)}`
            }

            // 檢查 EDD 門檻1 and 門檻2
            level1Flag = BN(txSumLevel1Str).gte(BN(limitlevel1))
            console.log('level1Flag', level1Flag)
            console.log('txSumLevel1Str', txSumLevel1Str)
            console.log('limitlevel1', limitlevel1)
            level2Flag = BN(txSumLevel2Str).gte(BN(limitlevel2))
            console.log('level2Flag', level2Flag)
            console.log('txSumLevel2Str', txSumLevel2Str)
            console.log('limitlevel2', limitlevel2)
            if (level1Flag || level2Flag) {
              eddType = level1Flag ? `${limit.role}_level1` : `${limit.role}_level2`
              isEDDBlock = true
              if (level1Flag) {
                alertEddStr = `EDD 門檻 1 超過交易限額 ${limitlevel1}，累積交易金額天數 ${level1Days}`
                logger.info(`${tx.customerId} EDD 門檻 1 撞到限額, txSumLevel1Str: ${txSumLevel1Str}, limit.level1: ${limit.level1}, level1DaysStartAt: ${level1DaysStartAt}`)
              }
              if (level2Flag) {
                alertEddStr = `EDD 門檻 2 超過交易限額 ${limitlevel2}，累積交易金額天數 ${level2Days}`
                logger.info(`${tx.customerId} EDD 門檻 2 撞到限額, txSumLevel2Str: ${txSumLevel2Str}, limit.level2: ${limit.level2}, level2DaysStartAt: ${level2DaysStartAt}`)
              }

              // EDD block
              promises.push(customers.update(tx.customerId, { authorizedOverride: 'blocked' }))
              promises.push(btmRiskcontrol.markCustomerEddType(tx.customerId, eddType, btmRiskcontrol.nowUTC8()))

              // 新增 btm_change_logs
              before_json = JSON.parse(JSON.stringify(customerLimitSetting))
              customerLimitSetting.role = 3 // 撞到 EDD 轉成黑名單
              customerLimitSetting.change_role_reason = "EDD"
              customerLimitSetting.change_limit_reason = "X"
              after_json = JSON.parse(JSON.stringify(customerLimitSetting))

              promises.push(btmChangeLogs.createChangeLog(tx.customerId, before_json, after_json))
            }

            // TODO: 檢查次數限制

    
            invoiceNo = ''
            invoiceDate = ''
            randomNumber = ''
            if (!!res && !!res.Data) {
              invoiceNo = res.Data.InvoiceNo
              invoiceDate = res.Data.InvoiceDate
              randomNumber = res.Data.RandomNumber
            }
    
            resJsonStr = JSON.stringify(res)
            if (!!res && !!res.err && !!res.err.response && !!res.err.response.data) {
              data = JSON.stringify(res.err.response.data)
              resJsonStr = JSON.stringify({ raw: res, data })
            }

            promises.push(btmInvoice.createUserInvoice(tx.customerId, tx.id, invoiceNo, invoiceDate, randomNumber, resJsonStr).catch((error) => error))

            const emailSender = new EmailSender({
              host: process.env.SMTP_HOST,
              port: 465,
              secure: true,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              },
            });
    
            if (isEDDBlock) {
              logger.info(`${customer.id} 觸發 EDD block`);
              // 郵件選項
              const mailOptions = {
                to: process.env.SMTP_TO,
                subject: `用戶 ${customer.phone} 撞到EDD`,
                text: `用戶 ${customer.phone} 撞到EDD`,
                html: `
                  <p>customer id: ${customer.id}</p>
                  <p>phone: ${customer.phone}</p>
                  <p>${alertEddStr}</p>
                `
              };
              logger.info(`${tx.customerId} EDD block: ${alertEddStr}`)

              promises.push(emailSender.sendMail(mailOptions)
                .then(result => {
                  logger.debug(`${customer.id} 郵件發送成功:`, result);
                }))
            }
            if (isBlock) {
              logger.info(`${customer.id} 觸發 suspend`);
              // 觸發 suspend
              promises.push(customers.update(tx.customerId, { suspendedUntil: add(suspensionDuration, new Date()) })
                .then(customer => {
    
                  // 郵件選項
                  const mailOptions = {
                    to: process.env.SMTP_TO,
                    subject: `用戶 ${customer.phone} 撞到限額`,
                    text: `用戶 ${customer.phone} 撞到限額`,
                    html: `
                      <p>customer id: ${customer.id}</p>
                      <p>phone: ${customer.phone}</p>
                      <p>${alertLimitStr}</p>
                    `
                  };

                  logger.info(`${tx.customerId} limit block: ${alertLimitStr}`)
      
                  emailSender.sendMail(mailOptions)
                    .then(result => {
                      logger.debug(`${customer.id} 郵件發送成功:`, result);
                    })
      
                  return Promise.resolve()
                })
                .catch((error) => error))
            }
            return Promise.all(promises)
              .then(() => {
                return utils.buildTransactionMessage(tx, rec, highValueTx, machineName, customer)
              })
          })
        })
    }).then(([msg, highValueTx]) => sendTransactionMessage(msg, highValueTx))
  })
}

function parseSuspensionDuration(suspensionDuration) {
  return `${suspensionDuration.years}年 ${suspensionDuration.months}月 ${suspensionDuration.days}日 ${suspensionDuration.hours}小時 ${suspensionDuration.minutes}分鐘 ${suspensionDuration.seconds}秒`
}

function complianceNotify (settings, customer, deviceId, action, period) {
  const timestamp = (new Date()).toLocaleString()
  return queries.getMachineName(deviceId)
    .then(machineName => {
      const notifications = configManager.getGlobalNotifications(settings.config)

      const msgCore = {
        BLOCKED: `was blocked`,
        SUSPENDED: `was suspended for ${!!period && period} days`,
        PENDING_COMPLIANCE: `is waiting for your manual approval`,
      }

      const rec = {
        sms: {
          body: `Customer ${customer.phone} ${msgCore[action]} - ${machineName}. ${timestamp}`
        },
        email: {
          subject: `Customer compliance`,
          body: `Customer ${customer.phone} ${msgCore[action]} in machine ${machineName}. ${timestamp}`
        },
        webhook: {
          topic: `Customer compliance`,
          content: `Customer ${customer.phone} ${msgCore[action]} in machine ${machineName}. ${timestamp}`
        }
      }

      const promises = []

      const emailActive =
        notifications.email.active &&
        notifications.email.compliance

      const smsActive =
        notifications.sms.active &&
        notifications.sms.compliance

      const webhookActive = true

      if (emailActive) promises.push(emailFuncs.sendMessage(settings, rec))
      if (smsActive) promises.push(smsFuncs.sendMessage(settings, rec))
      if (webhookActive) promises.push(webhookFuncs.sendMessage(settings, rec))

      notifyIfActive('compliance', 'customerComplianceNotify', customer, deviceId, action, machineName, period)

      return Promise.all(promises)
        .catch(err => console.error(`An error occurred when sending a notification. Please check your notification preferences and 3rd party account configuration: ${err.stack}`))
    })
}

function sendRedemptionMessage (txId, error) {
  logger.info(`!! sendRedemptionMessage txId ${txId}`)
  const subject = `Here's an update on transaction ${txId}`
  const body = error
    ? `Error: ${error}`
    : 'It was just dispensed successfully'

  const rec = {
    sms: {
      body: `${subject} - ${body}`
    },
    email: {
      subject,
      body
    },
    webhook: {
      topic: `Transaction update`,
      content: body
    }
  }
  return sendTransactionMessage(rec)
}

function sendTransactionMessage (rec, isHighValueTx) {
  logger.info(`!! sendTransactionMessage rec ${rec}`)
  return settingsLoader.loadLatest().then(settings => {
    const notifications = configManager.getGlobalNotifications(settings.config)

    const promises = []

    const emailActive =
      notifications.email.active &&
      (notifications.email.transactions || isHighValueTx)
    if (emailActive) promises.push(emailFuncs.sendMessage(settings, rec))

    const smsActive =
      notifications.sms.active &&
      (notifications.sms.transactions || isHighValueTx)
    if (smsActive) promises.push(smsFuncs.sendMessage(settings, rec))

    // TODO: Webhook transaction notifications are dependent on notification settings, due to how transactionNotify() is programmed
    // As changing it would require structural change to that function and the current behavior is temporary (webhooks will eventually have settings tied to them), it's not worth those changes right now
    const webhookActive = true
    if (webhookActive) promises.push(webhookFuncs.sendMessage(settings, rec))

    return Promise.all(promises)
      .catch(err => console.error(`An error occurred when sending a notification. Please check your notification preferences and 3rd party account configuration: ${err.stack}`))
  })
}

function cashboxNotify (deviceId) {
  return Promise.all([
    settingsLoader.loadLatest(),
    queries.getMachineName(deviceId)
  ])
    .then(([settings, machineName]) => {
      const notifications = configManager.getGlobalNotifications(settings.config)
      const rec = {
        sms: {
          body: `Cashbox removed - ${machineName}`
        },
        email: {
          subject: `Cashbox removal`,
          body: `Cashbox removed in machine ${machineName}`
        },
        webhook: {
          topic: `Cashbox removal`,
          content: `Cashbox removed in machine ${machineName}`
        }
      }

      const promises = []

      const emailActive =
        notifications.email.active &&
        notifications.email.security

      const smsActive =
        notifications.sms.active &&
        notifications.sms.security

      const webhookActive = true
      
      if (emailActive) promises.push(emailFuncs.sendMessage(settings, rec))
      if (smsActive) promises.push(smsFuncs.sendMessage(settings, rec))
      if (webhookActive) promises.push(webhookFuncs.sendMessage(settings, rec))
      notifyIfActive('security', 'cashboxNotify', deviceId)

      return Promise.all(promises)
        .catch(err => console.error(`An error occurred when sending a notification. Please check your notification preferences and 3rd party account configuration: ${err.stack}`))
    })
}

// for notification center, check if type of notification is active before calling the respective notify function
const notifyIfActive = (type, fnName, ...args) => {
  return settingsLoader.loadLatest().then(settings => {
    const notificationSettings = configManager.getGlobalNotifications(settings.config).notificationCenter
    logger.info(`!!type ${!type}`)
    logger.info(`!!fnName ${!fnName}`)
    logger.info(`!notificationCenter[fnName] ${!notificationCenter[fnName]}`)
    logger.info(`notificationSettings.active ${notificationSettings.active}`)
    logger.info(`notificationSettings[type] ${notificationSettings[type]}`)
    logger.info(`!(notificationSettings.active && notificationSettings[type]) ${!(notificationSettings.active && notificationSettings[type])}`)
    if (!notificationCenter[fnName]) return Promise.reject(new Error(`Notification function ${fnName} for type ${type} does not exist`))
    if (!(notificationSettings.active && notificationSettings[type])) return Promise.resolve()
    return notificationCenter[fnName](...args)
  }).catch(logger.error)
}

module.exports = {
  transactionNotify,
  complianceNotify,
  checkNotification,
  checkPings,
  checkStuckScreen,
  sendRedemptionMessage,
  cashboxNotify,
  notifyIfActive
}
