const _ = require('lodash/fp')
const pgp = require('pg-promise')()
const pEachSeries = require('p-each-series')

const blacklist = require('../blacklist')
const db = require('../db')
const plugins = require('../plugins')
const logger = require('../logger')
const settingsLoader = require('../new-settings-loader')
const configManager = require('../new-config-manager')
const notifier = require('../notifier')

const cashInAtomic = require('./cash-in-atomic')
const cashInLow = require('./cash-in-low')

const PENDING_INTERVAL = '60 minutes'
const MAX_PENDING = 10

const TRANSACTION_STATES = `
case
  when operator_completed and error = 'Operator cancel' then 'Cancelled'
  when error is not null then 'Error'
  when send_confirmed then 'Sent'
  when ((not send_confirmed) and (created <= now() - interval '${PENDING_INTERVAL}')) then 'Expired'
  else 'Pending'
end`

module.exports = { post, monitorPending, cancel, PENDING_INTERVAL, TRANSACTION_STATES }

function post (machineTx, pi) {
  logger.silly('Updating cashin tx:', machineTx)
  return cashInAtomic.atomic(machineTx, pi)
    .then(r => {
      const updatedTx = r.tx
      let addressReuse = false

      const promises = [settingsLoader.loadLatestConfig()]

      const isFirstPost = !r.tx.fiat || r.tx.fiat.isZero()
      if (isFirstPost) {
        promises.push(
          checkForBlacklisted(updatedTx),
          doesTxReuseAddress(updatedTx),
          getWalletScore(updatedTx, pi)
        )
      }

      return Promise.all(promises)
        .then(([config, blacklisted = false, isReusedAddress = false, walletScore = null]) => {
          const { rejectAddressReuse } = configManager.getCompliance(config)
          const isBlacklisted = !!blacklisted

          if (isBlacklisted) {
            notifier.notifyIfActive('compliance', 'blacklistNotify', r.tx, false)
          } else if (isReusedAddress && rejectAddressReuse) {
            notifier.notifyIfActive('compliance', 'blacklistNotify', r.tx, true)
            addressReuse = true
          }
          return postProcess(r, pi, isBlacklisted, addressReuse, walletScore)
            .then(changes => _.set('walletScore', _.isNil(walletScore) ? null : walletScore.score, changes))
            .then(changes => cashInLow.update(db, updatedTx, changes))
            .then(_.flow(
              _.set('bills', machineTx.bills),
              _.set('blacklisted', isBlacklisted),
              _.set('blacklistMessage', blacklisted?.content),
              _.set('addressReuse', addressReuse),
              _.set('validWalletScore', _.isNil(walletScore) || walletScore.isValid),
            ))
        })
    })
}

function registerTrades (pi, r) {
  _.forEach(bill => pi.buy(bill, r.tx), r.newBills)
}

function logAction (rec, tx) {
  const action = {
    tx_id: tx.id,
    action: rec.action || (rec.sendConfirmed ? 'sendCoins' : 'sendCoinsError'),
    error: rec.error,
    error_code: rec.errorCode,
    tx_hash: rec.txHash
  }

  const sql = pgp.helpers.insert(action, null, 'cash_in_actions')

  return db.none(sql)
    .then(_.constant(rec))
}

function logActionById (action, _rec, txId) {
  const rec = _.assign(_rec, { action, tx_id: txId })
  const sql = pgp.helpers.insert(rec, null, 'cash_in_actions')

  return db.none(sql)
}

function checkForBlacklisted (tx) {
  return blacklist.blocked(tx.toAddress)
}

function postProcess (r, pi, isBlacklisted, addressReuse, walletScore) {
  if (addressReuse) {
    return Promise.resolve({
      operatorCompleted: true,
      error: 'Address Reused'
    })
  }

  if (isBlacklisted) {
    return Promise.resolve({
      operatorCompleted: true,
      error: 'Blacklisted Address'
    })
  }

  if (!_.isNil(walletScore) && !walletScore.isValid) {
    return Promise.resolve({
      walletScore: walletScore.score,
      operatorCompleted: true,
      error: 'Chain analysis score is above defined threshold',
      errorCode: 'scoreThresholdReached'
    })
  }

  registerTrades(pi, r)

  if (!cashInLow.isClearToSend(r.dbTx, r.tx)) return Promise.resolve({})

  return pi.sendCoins(r.tx)
    .then(txObj => {
      if (txObj.batched) {
        return {
          batched: true,
          batchTime: 'now()^',
          sendPending: true,
          error: null,
          errorCode: null
        }
      }

      return {
        txHash: txObj.txid,
        fee: txObj.fee,
        sendConfirmed: true,
        sendTime: 'now()^',
        sendPending: false,
        error: null,
        errorCode: null
      }
    })
    .catch(err => {
      // Important: We don't know what kind of error this is
      // so not safe to assume that funds weren't sent.

      // Setting sendPending to true ensures that the transaction gets
      // silently terminated and no retries are done

      return {
        sendTime: 'now()^',
        error: err.message,
        errorCode: err.name,
        sendPending: true
      }
    })
    .then(sendRec => {
      pi.notifyOperator(r.tx, sendRec)
        .catch((err) => logger.error('Failure sending transaction notification', err))
      return logAction(sendRec, r.tx)
    })
}

function doesTxReuseAddress (tx) {
  const sql = `
    SELECT EXISTS (
      SELECT DISTINCT to_address FROM (
        SELECT to_address FROM cash_in_txs WHERE id != $1
      ) AS x WHERE to_address = $2
    )`
  return db.one(sql, [tx.id, tx.toAddress]).then(({ exists }) => exists)
}

function getWalletScore (tx, pi) {
  return pi.isWalletScoringEnabled(tx)
    .then(isEnabled => {
      if (!isEnabled) return null
      return pi.rateAddress(tx.cryptoCode, tx.toAddress)
    })
}

function monitorPending (settings) {
  const sql = `select * from cash_in_txs
  where created > now() - interval $1
  and send
  and not send_confirmed
  and not send_pending
  and not operator_completed
  order by created
  limit $2`

  const processPending = row => {
    const tx = cashInLow.toObj(row)
    const pi = plugins(settings, tx.deviceId)

    return post(tx, pi)
      .catch(logger.error)
  }

  return db.any(sql, [PENDING_INTERVAL, MAX_PENDING])
    .then(rows => pEachSeries(rows, row => processPending(row)))
    .catch(logger.error)
}

function cancel (txId) {
  const updateRec = {
    error: 'Operator cancel',
    error_code: 'operatorCancel',
    operator_completed: true,
    batch_id: null
  }

  return Promise.resolve()
    .then(() => {
      return pgp.helpers.update(updateRec, null, 'cash_in_txs') +
      pgp.as.format(' where id=$1', [txId])
    })
    .then(sql => db.result(sql, false))
    .then(res => {
      if (res.rowCount !== 1) throw new Error('No such tx-id')
    })
    .then(() => logActionById('operatorCompleted', {}, txId))
}
