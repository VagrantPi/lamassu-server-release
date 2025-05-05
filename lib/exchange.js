const _ = require('lodash/fp')
const { ALL_CRYPTOS } = require('@lamassu/coins')

const configManager = require('./new-config-manager')
const ccxt = require('./plugins/exchange/ccxt')
const mockExchange = require('./plugins/exchange/mock-exchange')
const accounts = require('./new-admin/config/accounts')

function lookupExchange (settings, cryptoCode) {
  const exchange = configManager.getWalletSettings(cryptoCode, settings.config).exchange
  if (exchange === 'no-exchange') return null
  return exchange
}

function fetchExchange (settings, cryptoCode) {
  return Promise.resolve()
    .then(() => {
      const exchangeName = lookupExchange(settings, cryptoCode)
      if (exchangeName === 'mock-exchange') return { exchangeName, account: { currencyMarket: 'EUR' } }
      if (!exchangeName) throw new Error('No exchange set')
      const account = settings.accounts[exchangeName]

      return { exchangeName, account }
    })
}

function buy (settings, tradeEntry) {
  const { cryptoAtoms, fiatCode, cryptoCode } = tradeEntry
  return fetchExchange(settings, cryptoCode)
    .then(r => {
      if (r.exchangeName === 'mock-exchange') {
        return mockExchange.buy(cryptoAtoms, fiatCode, cryptoCode)
      }
      return ccxt.trade('buy', r.account, tradeEntry, r.exchangeName)
    })
}

function sell (settings, tradeEntry) {
  const { cryptoAtoms, fiatCode, cryptoCode } = tradeEntry
  return fetchExchange(settings, cryptoCode)
    .then(r => {
      if (r.exchangeName === 'mock-exchange') {
        return mockExchange.sell(cryptoAtoms, fiatCode, cryptoCode)
      }
      return ccxt.trade('sell', r.account, tradeEntry, r.exchangeName)
    })
}

function active (settings, cryptoCode) {
  return !!lookupExchange(settings, cryptoCode)
}

function getMarkets () {
  const filterExchanges = _.filter(it => it.class === 'exchange' && !it.dev && it.code !== 'no-exchange')
  const availableExchanges = _.map(it => it.code, filterExchanges(accounts.ACCOUNT_LIST))

  const fetchMarketForExchange = exchange =>
    ccxt.getMarkets(exchange, ALL_CRYPTOS)
      .then(markets => ({ exchange, markets }))
      .catch(error => ({
        exchange,
        markets: [],
        error: error.message
      }))

  const transformToObject = _.reduce((acc, { exchange, markets }) => ({
    ...acc,
    [exchange]: markets
  }), {})

  const promises = _.map(fetchMarketForExchange, availableExchanges)
  return Promise.all(promises)
    .then(transformToObject)
}

module.exports = {
  fetchExchange,
  buy,
  sell,
  active,
  getMarkets
}
