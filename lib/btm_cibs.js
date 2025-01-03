const db = require('lamassu-server/lib/db')

function blocked (pid) {
  const sql = `SELECT * from btm_cibs WHERE pid = $1`
  return db.any(sql, pid)
}

module.exports = {
  blocked,
}
