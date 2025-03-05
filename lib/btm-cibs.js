const db = require('lamassu-server/lib/db')

function blocked (pid) {
  // 取得現在的中華民國年日期
  const now = new Date()
  const twYear = now.getFullYear() - 1911
  const today = `${twYear}${now.getMonth() + 1}${now.getDate()}`

  const sql = `SELECT * from btm_cibs WHERE UPPER(TRIM(pid)) = UPPER(TRIM($1)) AND data_type != 'D' AND expire_date >= $2`
  return db.any(sql, [pid, today])
}

module.exports = {
  blocked,
}