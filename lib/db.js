const Pgp = require('pg-promise')
const uuid = require('uuid')
const _ = require('lodash/fp')

const { PSQL_URL } = require('./constants')
const logger = require('./logger')
const eventBus = require('./event-bus')
const { asyncLocalStorage, defaultStore } = require('./async-storage')

const DATABASE_NOT_REACHABLE = 'Database not reachable.'

const stripDefaultDbFuncs = dbCtx => {
  return {
    ctx: dbCtx.ctx,
    query: dbCtx.$query,
    result: dbCtx.$result,
    many: dbCtx.$many,
    oneOrNone: dbCtx.$oneOrNone,
    one: dbCtx.$one,
    none: dbCtx.$none,
    any: dbCtx.$any,
    manyOrNone: dbCtx.$manyOrNone,
    tx: dbCtx.$tx,
    task: dbCtx.$task,
    batch: dbCtx.batch,
    multi: dbCtx.$multi,
    connect: dbCtx.connect
  }
}

const _tx = (obj, opts, cb) => {
  return obj.tx(opts, t => {
    return cb(stripDefaultDbFuncs(t))
  })
}

const _task = (obj, opts, cb) => {
  return obj.task(opts, t => {
    return cb(stripDefaultDbFuncs(t))
  })
}

const getSchema = () => {
  const store = asyncLocalStorage.getStore() ?? defaultStore()
  return asyncLocalStorage.run(store, () => store.get('schema'))
}
const getDefaultSchema = () => 'ERROR_SCHEMA'

const searchPathWrapper = (t, cb) => {
  return t.none('SET search_path TO $1:name', [getSchema()])
    .then(cb.bind(t, t))
    .catch(logger.error)
    .finally(() => t.none('SET search_path TO $1:name', [getDefaultSchema()]))
}

const pgp = Pgp({
  pgNative: true,
  schema: 'ERROR_SCHEMA',
  extend (obj, dbContext) {
    obj.__taskEx = function (cb, throwOnError = true) {
      const args = pgp.utils.taskArgs(arguments)
      const schema = getSchema()
      if (!schema && throwOnError) {
        return Promise.reject(new Error('No schema selected, cannot complete query'))
      } else if (!schema) {
        return Promise.resolve('No schema selected, cannot complete query')
      }
      return obj.task.call(this, args.options, t => searchPathWrapper(t, cb))
    }
    obj.$query = (query, values, qrm, throwOnError) => obj.__taskEx(t => t.query(query, values, qrm), throwOnError)
    obj.$result = (query, variables, cb, thisArg) => obj.__taskEx(t => t.result(query, variables, cb, thisArg))
    obj.$many = (query, variables) => obj.__taskEx(t => t.many(query, variables))
    obj.$manyOrNone = (query, variables) => obj.__taskEx(t => t.manyOrNone(query, variables))
    obj.$oneOrNone = (query, variables) => obj.__taskEx(t => t.oneOrNone(query, variables))
    obj.$one = (query, variables) => obj.__taskEx(t => t.one(query, variables))
    obj.$none = (query, variables) => obj.__taskEx(t => t.none(query, variables))
    obj.$any = (query, variables) => obj.__taskEx(t => t.any(query, variables))
    obj.$multi = (query, variables) => obj.__taskEx(t => t.multi(query, variables))
    // when opts is not defined "cb" occupies the "opts" spot of the arguments
    obj.$tx = (opts, cb) => typeof opts === 'function' ? _tx(obj, {}, opts) : _tx(obj, opts, cb)
    obj.$task = (opts, cb) => typeof opts === 'function' ? _task(obj, {}, opts) : _task(obj, opts, cb)
  },
  error: (err, e) => {
    if (e.cn) logger.error(DATABASE_NOT_REACHABLE)
    else if (e.query) {
      logger.error(e.query)
      e.params && logger.error(e.params)
    }
    else logger.error(err)
  }
})

const db = stripDefaultDbFuncs(pgp(PSQL_URL))

eventBus.subscribe('log', args => {
  if (process.env.SKIP_SERVER_LOGS) return

  const { level, message, meta } = args

  // prevent loop if database is not reachable
  if (message === DATABASE_NOT_REACHABLE) return

  const msgToSave = message || _.get('message', meta)

  const sql = `insert into server_logs
  (id, device_id, message, log_level, meta) values ($1, $2, $3, $4, $5) returning *`
  // need to set AsyncLocalStorage (ALS) for this function as well
  // because this module is imported before ALS is set up on app.js
  const store = defaultStore()
  asyncLocalStorage.run(store, () => {
    db.one(sql, [uuid.v4(), '', msgToSave, level, meta])
      .then(_.mapKeys(_.camelCase))
      .catch(_.noop)
  })
})

module.exports = db
