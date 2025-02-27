const db = require('lamassu-server/lib/db')

function blocked (pid) {
  const sql = `SELECT * from btm_cibs WHERE UPPER(TRIM(pid)) = UPPER(TRIM($1))`
  return db.any(sql, pid)
}

module.exports = {
  blocked,
}