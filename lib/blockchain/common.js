const crypto = require('crypto')
const os = require('os')
const path = require('path')
const cp = require('child_process')
const fs = require('fs')
const makeDir = require('make-dir')

const _ = require('lodash/fp')

const logger = require('console-log-level')({level: 'info'})

const { isDevMode } = require('../environment-helper')

const BLOCKCHAIN_DIR = process.env.BLOCKCHAIN_DIR

module.exports = {
  es,
  writeSupervisorConfig,
  firewall,
  randomPass,
  fetchAndInstall,
  logger,
  isInstalledSoftware,
  writeFile,
  getBinaries,
  isUpdateDependent
}

const BINARIES = {
  BTC: {
    defaultUrl: 'https://bitcoincore.org/bin/bitcoin-core-0.20.1/bitcoin-0.20.1-x86_64-linux-gnu.tar.gz',
    defaultUrlHash: '376194f06596ecfa40331167c39bc70c355f960280bd2a645fdbf18f66527397',
    defaultDir: 'bitcoin-0.20.1/bin',
    url: 'https://bitcoincore.org/bin/bitcoin-core-28.0/bitcoin-28.0-x86_64-linux-gnu.tar.gz',
    dir: 'bitcoin-28.0/bin',
    urlHash: '7fe294b02b25b51acb8e8e0a0eb5af6bbafa7cd0c5b0e5fcbb61263104a82fbc',
  },
  ETH: {
    url: 'https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.14.12-293a300d.tar.gz',
    dir: 'geth-linux-amd64-1.14.12-293a300d',
    urlHash: 'e56216b9d179a66a8f71d3dee13ad554da5544d3d29dba33f64c9c0eda5a2237',
  },
  ZEC: {
    url: 'https://download.z.cash/downloads/zcash-6.0.0-linux64-debian-bullseye.tar.gz',
    dir: 'zcash-6.0.0/bin',
    urlHash: '3cb82f490e9c8e88007a0216b5261b33ef0fda962b9258441b2def59cb272a4d',
  },
  DASH: {
    defaultUrl: 'https://github.com/dashpay/dash/releases/download/v18.1.0/dashcore-18.1.0-x86_64-linux-gnu.tar.gz',
    defaultUrlHash: 'd89c2afd78183f3ee815adcccdff02098be0c982633889e7b1e9c9656fbef219',
    defaultDir: 'dashcore-18.1.0/bin',
    url: 'https://github.com/dashpay/dash/releases/download/v21.1.1/dashcore-21.1.1-x86_64-linux-gnu.tar.gz',
    dir: 'dashcore-21.1.1/bin',
    urlHash: 'c3157d4a82a3cb7c904a68e827bd1e629854fefcc0dcaf1de4343a810a190bf5',
  },
  LTC: {
    defaultUrl: 'https://download.litecoin.org/litecoin-0.18.1/linux/litecoin-0.18.1-x86_64-linux-gnu.tar.gz',
    defaultUrlHash: 'ca50936299e2c5a66b954c266dcaaeef9e91b2f5307069b9894048acf3eb5751',
    defaultDir: 'litecoin-0.18.1/bin',
    url: 'https://download.litecoin.org/litecoin-0.21.4/linux/litecoin-0.21.4-x86_64-linux-gnu.tar.gz',
    dir: 'litecoin-0.21.4/bin',
    urlHash: '857fc41091f2bae65c3bf0fd4d388fca915fc93a03f16dd2578ac3cc92898390',
  },
  BCH: {
    url: 'https://github.com/bitcoin-cash-node/bitcoin-cash-node/releases/download/v28.0.0/bitcoin-cash-node-28.0.0-x86_64-linux-gnu.tar.gz',
    dir: 'bitcoin-cash-node-28.0.0/bin',
    files: [['bitcoind', 'bitcoincashd'], ['bitcoin-cli', 'bitcoincash-cli']],
    urlHash: 'ba735cd3b70fab35ac1496e38596cec1f8d34989924376de001d4a86198f7158',
  },
  XMR: {
    url: 'https://downloads.getmonero.org/cli/monero-linux-x64-v0.18.3.4.tar.bz2',
    dir: 'monero-x86_64-linux-gnu-v0.18.3.4',
    files: [['monerod', 'monerod'], ['monero-wallet-rpc', 'monero-wallet-rpc']],
    urlHash: '51ba03928d189c1c11b5379cab17dd9ae8d2230056dc05c872d0f8dba4a87f1d',
  }
}

const coinsUpdateDependent = ['BTC', 'LTC', 'DASH']

function firewall (ports) {
  if (!ports || ports.length === 0) throw new Error('No ports supplied')
  const portsString = ports.join(',')
  es(`sudo ufw allow ${portsString}`)
}

function randomPass () {
  return crypto.randomBytes(32).toString('hex')
}

function es (cmd) {
  const env = {HOME: os.userInfo().homedir}
  const options = {encoding: 'utf8', env}
  const res = cp.execSync(cmd, options)
  logger.debug(res)
  return res.toString()
}

function generateSupervisorConfig (cryptoCode, command, isWallet = false) {
  return `[program:${cryptoCode}${isWallet ? `-wallet` : ``}]
command=nice ${command}
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/${cryptoCode}${isWallet ? `-wallet` : ``}.err.log
stdout_logfile=/var/log/supervisor/${cryptoCode}${isWallet ? `-wallet` : ``}.out.log
stderr_logfile_backups=2
stdout_logfile_backups=2
environment=HOME="/root"
`
}

function writeSupervisorConfig (coinRec, cmd, walletCmd = '') {
  if (isInstalledSoftware(coinRec)) return

  const blockchain = coinRec.code

  if (!_.isNil(coinRec.wallet)) {
    const supervisorConfigWallet = generateSupervisorConfig(blockchain, walletCmd, true)
    writeFile(`/etc/supervisor/conf.d/${coinRec.code}-wallet.conf`, supervisorConfigWallet)
  }

  const supervisorConfig = generateSupervisorConfig(blockchain, cmd)
  writeFile(`/etc/supervisor/conf.d/${coinRec.code}.conf`, supervisorConfig)
}

function isInstalledSoftware (coinRec) {
  if (isDevMode()) {
    return fs.existsSync(`${BLOCKCHAIN_DIR}/${coinRec.code}/${coinRec.configFile}`)
      && fs.existsSync(`${BLOCKCHAIN_DIR}/bin/${coinRec.daemon}`)
  }

  const nodeInstalled = fs.existsSync(`/etc/supervisor/conf.d/${coinRec.code}.conf`)
  const walletInstalled = _.isNil(coinRec.wallet)
    ? true
    : fs.existsSync(`/etc/supervisor/conf.d/${coinRec.code}.wallet.conf`)
  return nodeInstalled && walletInstalled
}

function fetchAndInstall (coinRec) {
  const requiresUpdate = isUpdateDependent(coinRec.cryptoCode)
  if (isInstalledSoftware(coinRec)) return

  const binaries = BINARIES[coinRec.cryptoCode]
  if (!binaries) throw new Error(`No such coin: ${coinRec.code}`)

  const url = requiresUpdate ? binaries.defaultUrl : binaries.url
  const hash = requiresUpdate ? binaries.defaultUrlHash : binaries.urlHash
  const downloadFile = path.basename(url)
  const binDir = requiresUpdate ? binaries.defaultDir : binaries.dir

  es(`wget -q ${url}`)
  if (es(`sha256sum ${downloadFile} | awk '{print $1}'`).trim() !== hash) {
    logger.info(`Failed to install ${coinRec.code}: Package signature do not match!`)
    return
  }
  es(`tar -xf ${downloadFile}`)

  const usrBinDir = isDevMode() ? path.resolve(BLOCKCHAIN_DIR, 'bin') : '/usr/local/bin'

  if (isDevMode()) {
    makeDir.sync(usrBinDir)
  }

  if (_.isEmpty(binaries.files)) {
    es(`sudo cp ${binDir}/* ${usrBinDir}`)
    return
  }

  _.forEach(([source, target]) => {
    es(`sudo cp ${binDir}/${source} ${usrBinDir}/${target}`)
  }, binaries.files)
}

function writeFile (path, content) {
  try {
    fs.writeFileSync(path, content)
  } catch (err) {
    if (err.code === 'EEXIST') {
      logger.info(`${path} exists, skipping.`)
      return
    }

    throw err
  }
}

function getBinaries (coinCode) {
  const binaries = BINARIES[coinCode]
  if (!binaries) throw new Error(`No such coin: ${coinCode}`)
  return binaries
}

function isUpdateDependent (coinCode) {
  return _.includes(coinCode, coinsUpdateDependent)
}
