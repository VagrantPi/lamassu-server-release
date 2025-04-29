const db = require('./db')
const T = require('./time')

// FP operations on Postgres result in very big errors.
// E.g.: 1853.013808 * 1000 = 1866149.494
const REDEEMABLE_AGE = T.day / 1000

// 與 ./tx.js 邏輯一致只是直接加總
function customerHistorySum(customerId, startAt) {
  const sql = `SELECT SUM(ch.fiat) FROM (
    SELECT txIn.fiat
      FROM cash_in_txs txIn
      WHERE txIn.customer_id = $1
      AND txIn.created > $2
      AND fiat > 0
      AND NOT ((NOT txIn.send_confirmed) AND (txIn.created <= now() - interval $3))
    UNION ALL
    SELECT txOut.fiat
      FROM cash_out_txs txOut
      WHERE txOut.customer_id = $1
      AND txOut.created > $2
      AND (error_code IS NULL OR error_code NOT IN ('operatorCancel', 'scoreThresholdReached', 'walletScoringError'))
      AND fiat > 0
      AND NOT (NOT txOut.dispense AND extract(epoch FROM (now() - greatest(txOut.created, txOut.confirmed_at))) >= $4)
  ) ch`

  return db.one(sql, [customerId, startAt, '60 minutes', REDEEMABLE_AGE]).then(res => res.sum)
}

function customerHistoryCount(customerId, startAt) {
  const sql = `SELECT COUNT(*) FROM (
    SELECT 1
      FROM cash_in_txs txIn
      WHERE txIn.customer_id = $1
      AND txIn.created > $2
      AND fiat > 0
      AND NOT ((NOT txIn.send_confirmed) AND (txIn.created <= now() - interval $3))
  ) ch`

  return db.one(sql, [customerId, startAt, '60 minutes']).then(res => Number(res.count))
}



module.exports = { customerHistorySum, customerHistoryCount }