const db = require('lamassu-server/lib/db')

function getById (id) {
  const sql = `SELECT * FROM btm_sumsubs WHERE customer_id = $1`
  return db.oneOrNone(sql, [id])
}

module.exports = {
  getById,
}