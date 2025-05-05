const parser = require('./parsing')
const axios = require('axios')
const { createWriteStream } = require('fs')
const { rename, writeFile, readFile, mkdir, copyFile, unlink } = require('fs/promises')
const path = require('path')
const _ = require('lodash/fp')

const DOWNLOAD_DIR = path.resolve('/tmp')
const OFAC_DATA_DIR = process.env.OFAC_DATA_DIR
const OFAC_SOURCES_DIR = path.join(OFAC_DATA_DIR, 'sources')
const LAST_UPDATED_FILE = path.resolve(OFAC_DATA_DIR, 'last_updated.dat')

const OFAC_SOURCES = [{
  name: 'sdn_advanced',
  url: 'https://sanctionslistservice.ofac.treas.gov/api/download/sdn_advanced.xml'
}, {
  name: 'cons_advanced',
  url: 'https://sanctionslistservice.ofac.treas.gov/api/download/cons_advanced.xml'
}]

const _mkdir = path =>
  mkdir(path)
    .catch(err => err.code === 'EEXIST' ? Promise.resolve() : Promise.reject(err))

const download = (dstDir, { name, url }) => {
  const dstFile = path.join(dstDir, name + '.xml')
  const writer = createWriteStream(dstFile)

  return axios({
    method: 'get',
    url: url,
    responseType: 'stream',
  }).then(response => {
    return new Promise((resolve, reject) => {
      response.data.pipe(writer)
      let error = null
      writer.on('error', err => {
        error = err
        writer.close()
        reject(err)
      })
      writer.on('close', () => {
        if (!error) {
          resolve(dstFile)
        }
      })
    })
  })
}

const parseToJson = srcFile => {
  const dstFile = srcFile.replace(/\.xml$/, '.json')
  const writeStream = createWriteStream(dstFile)

  return new Promise((resolve, reject) => {
    parser.parse(srcFile, (err, profile) => {
      if (err) {
        reject(err)
        return
      }

      if (!profile) {
        writeStream.end()
        return
      }

      const json = JSON.stringify(profile)
      writeStream.write(json + '\n', 'utf-8')
    })

    writeStream.on('error', reject)
    writeStream.on('finish', () => resolve(dstFile))
  })
}

const moveToSourcesDir = async (srcFile, ofacSourcesDir) => {
  const name = path.basename(srcFile)
  const dstFile = path.join(ofacSourcesDir, name)
  try {
    await rename(srcFile, dstFile)
  } catch (err) {
    if (err.code === 'EXDEV') {
      // If rename fails due to cross-device link, fallback to copy + delete
      await copyFile(srcFile, dstFile)
      await unlink(srcFile)
    } else {
      throw err
    }
  }
  return dstFile
}

function update () {
  if (!OFAC_DATA_DIR) {
    throw new Error('ofacDataDir must be defined in the environment')
  }

  return _mkdir(OFAC_DATA_DIR)
    .then(() => _mkdir(OFAC_SOURCES_DIR))
    .catch(err => {
      if (err.code === 'EEXIST') return
      throw err
    })
    .then(() => readFile(LAST_UPDATED_FILE))
    .then(data => {
      const lastUpdate = new Date(data.toString())
      const now = new Date()
      const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60)

      return hoursSinceUpdate < 24
    })
    .catch(err => {
      // If file doesn't exist, continue with update
      if (err.code === 'ENOENT') return false
      throw err
    })
    .then(skipUpdate => {
      if (skipUpdate) return Promise.resolve()

      const downloads = _.flow(
        _.map(file => download(DOWNLOAD_DIR, file).then(parseToJson))
      )(OFAC_SOURCES)

      return Promise.all(downloads)
        .then(parsed => {
          const moves = _.map(src => moveToSourcesDir(src, OFAC_SOURCES_DIR), parsed)
          const timestamp = new Date().toISOString()

          return Promise.all([...moves])
            .then(() => writeFile(LAST_UPDATED_FILE, timestamp))
        })
    })
}

module.exports = { update }
