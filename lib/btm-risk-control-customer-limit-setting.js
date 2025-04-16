const db = require('lamassu-server/lib/db')

function getCustomerCustomerLimitSettings (id) {
  const sql = `SELECT * FROM btm_risk_control_customer_limit_settings WHERE customer_id = $1`
  return db.oneOrNone(sql, [id])
}

module.exports = {
  getCustomerCustomerLimitSettings,
}