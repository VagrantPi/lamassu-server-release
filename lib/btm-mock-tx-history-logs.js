const db = require('lamassu-server/lib/db')

function insertLog (customerID, deviceID, defaultDailyLimit, defaultMonthlyLimit, limitDailyLimit, limitMonthlyLimit, dayLimit, monthLimit, startAt, banExpireDateRaw, banExpireDate) {
  const sql = `INSERT INTO "public"."btm_mock_tx_history_logs" ("created_at", "customer_id", "device_id", "default_daily_limit", "default_monthly_limit", "limit_daily_limit", "limit_monthly_limit", "day_limit", "month_limit", "start_at", "ban_expire_date_raw", "ban_expire_date") VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`
  return db.none(sql, [customerID, deviceID, defaultDailyLimit, defaultMonthlyLimit, limitDailyLimit, limitMonthlyLimit, dayLimit, monthLimit, startAt, banExpireDateRaw, banExpireDate])
}

module.exports = {
  insertLog,
}