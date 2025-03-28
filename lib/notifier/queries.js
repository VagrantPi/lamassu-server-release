const { v4: uuidv4 } = require('uuid')
const pgp = require('pg-promise')()
const _ = require('lodash/fp')

const dbm = require('../postgresql_interface')
const db = require('../db')
const logger = require('../logger')

// types of notifications able to be inserted into db:
/*
highValueTransaction - for transactions of value higher than threshold
fiatBalance - when the number of notes in cash cassettes falls below threshold
cryptoBalance - when ammount of crypto balance in fiat falls below or above low/high threshold
compliance - notifications related to warnings triggered by compliance settings
error - notifications related to errors
*/

function getMachineName (machineId) {
  const sql = 'SELECT * FROM devices WHERE device_id=$1'
  return db.oneOrNone(sql, [machineId])
    .then(it => it.name).catch(logger.error)
}

const addNotification = (type, message, detail) => {
  const sql = `INSERT INTO notifications (id, type, message, detail) VALUES ($1, $2, $3, $4)`
  return db.oneOrNone(sql, [uuidv4(), type, message, detail]).catch(logger.error)
}

const getAllValidNotifications = (type) => {
  const sql = `SELECT * FROM notifications WHERE type = $1 AND valid = 't'`
  return db.any(sql, [type]).catch(logger.error)
}

const invalidateNotification = (detail, type) => {
  detail = _.omitBy(_.isEmpty, detail)
  const sql = `UPDATE notifications SET valid = 'f', read = 't' WHERE valid = 't' AND type = $1 AND detail::jsonb @> $2::jsonb`
  return db.none(sql, [type, detail]).catch(logger.error)
}

const batchInvalidate = (ids) => {
  const formattedIds = _.map(pgp.as.text, ids).join(',')
  const sql = `UPDATE notifications SET valid = 'f', read = 't' WHERE id IN ($1^)`
  return db.none(sql, [formattedIds]).catch(logger.error)
}

const clearBlacklistNotification = (cryptoCode, cryptoAddress) => {
  const sql = `UPDATE notifications SET valid = 'f', read = 't' WHERE type = 'compliance' AND detail->>'cryptoCode' = $1 AND detail->>'cryptoAddress' = $2 AND (detail->>'code' = 'BLOCKED' OR detail->>'code' = 'REUSED')`
  return db.none(sql, [cryptoCode, cryptoAddress]).catch(logger.error)
}

const getValidNotifications = (type, detail) => {
  const sql = `SELECT * FROM notifications WHERE type = $1 AND valid = 't' AND detail @> $2`
  return db.any(sql, [type, detail]).catch(logger.error)
}

const WITHIN_PAST_WEEK = `created > (CURRENT_TIMESTAMP - INTERVAL '7' DAY)`

const getNotifications = () => {
  const sql = `
    SELECT * FROM notifications
    WHERE ${WITHIN_PAST_WEEK}
    ORDER BY created DESC
  `
  return db.any(sql).catch(logger.error)
}
const setRead = (id, read) => {
  const sql = `UPDATE notifications SET read = $1 WHERE id = $2`
  return db.none(sql, [read, id]).catch(logger.error)
}

const markAllAsRead = () => {
  const sql = `UPDATE notifications SET read = 't'`
  return db.none(sql).catch(logger.error)
}

const hasUnreadNotifications = () => {
  const sql = `
    SELECT EXISTS
    (SELECT * FROM notifications
    WHERE NOT read AND ${WITHIN_PAST_WEEK})
    `
  return db.oneOrNone(sql).then(res => res.exists).catch(logger.error)
}

const getAlerts = () => {
  const types = ['fiatBalance', 'cryptoBalance', 'error']
  const sql = `
    SELECT * FROM notifications
    WHERE ${WITHIN_PAST_WEEK} AND valid='t' AND type IN ($1:list)
    ORDER BY created DESC
    `
  return db.any(sql, [types]).catch(logger.error)
}

module.exports = {
  machineEvents: dbm.machineEvents,
  addNotification,
  getAllValidNotifications,
  invalidateNotification,
  batchInvalidate,
  clearBlacklistNotification,
  getValidNotifications,
  getNotifications,
  setRead,
  markAllAsRead,
  hasUnreadNotifications,
  getAlerts,
  getMachineName
}
