const _ = require('lodash/fp')
const NodeCache = require('node-cache')
const base = require('../geth/base')
const T = require('../../../time')
const { BALANCE_FETCH_SPEED_MULTIPLIER } = require('../../../constants')

const NAME = 'infura'

function run (account) {
  if (!account.endpoint) throw new Error('Need to configure API endpoint for Infura')

  const endpoint = _.startsWith('https://')(account.endpoint)
    ? account.endpoint : `https://${account.endpoint}`

  base.connect(endpoint)
}

const txsCache = new NodeCache({
  stdTTL: T.hour / 1000,
  checkperiod: T.minute / 1000,
  deleteOnExpire: true
})

function shouldGetStatus (tx) {
  const timePassedSinceTx = Date.now() - new Date(tx.created)
  const timePassedSinceReq = Date.now() - new Date(txsCache.get(tx.id).lastReqTime)

  if (timePassedSinceTx < 3 * T.minutes) return _.isNil(txsCache.get(tx.id).res) || timePassedSinceReq > 10 * T.seconds
  if (timePassedSinceTx < 5 * T.minutes) return _.isNil(txsCache.get(tx.id).res) || timePassedSinceReq > 20 * T.seconds
  if (timePassedSinceTx < 30 * T.minutes) return _.isNil(txsCache.get(tx.id).res) || timePassedSinceReq > T.minute
  if (timePassedSinceTx < 1 * T.hour) return _.isNil(txsCache.get(tx.id).res) || timePassedSinceReq > 2 * T.minute
  if (timePassedSinceTx < 3 * T.hours) return _.isNil(txsCache.get(tx.id).res) || timePassedSinceReq > 5 * T.minute
  if (timePassedSinceTx < 1 * T.day) return _.isNil(txsCache.get(tx.id).res) || timePassedSinceReq > T.hour
  return _.isNil(txsCache.get(tx.id).res) || timePassedSinceReq > T.hour
}

// Override geth's getStatus function to allow for different polling timing
function getStatus (account, tx, requested, settings, operatorId) {
  if (_.isNil(txsCache.get(tx.id))) {
    txsCache.set(tx.id, { lastReqTime: Date.now() })
  }

  // return last available response
  if (!shouldGetStatus(tx)) {
    return Promise.resolve(txsCache.get(tx.id).res)
  }

  return base.getStatus(account, tx, requested, settings, operatorId)
    .then(res => {
      if (res.status === 'confirmed') {
        txsCache.del(tx.id) // Transaction reached final status, can trim it from the caching obj
      } else {
        txsCache.set(tx.id, { lastReqTime: Date.now(), res })
        txsCache.ttl(tx.id, T.hour / 1000)
      }
      return res
    })
}

module.exports = _.merge(base, { NAME, run, getStatus, fetchSpeed: BALANCE_FETCH_SPEED_MULTIPLIER.SLOW })
