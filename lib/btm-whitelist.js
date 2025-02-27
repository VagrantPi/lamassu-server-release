const db = require('lamassu-server/lib/db')

// Get all whitelist rows from the DB "whitelist" table that were manually inserted by the operator
const getWhitelist = (customerId) => {
  return db.any(`SELECT * FROM btm_whitelists WHERE customer_id = $1`, [customerId]).then(res =>
    res.map(item => ({
      cryptoCode: item.crypto_code,
      address: item.address
    }))
  )
}

function blocked (customerId, address, cryptoCode) {
  const sql = `SELECT * FROM btm_whitelists WHERE customer_id = $1 AND lower(address) = lower($2) AND crypto_code = $3 AND deleted_at IS NULL`
  return db.any(sql, [customerId, address, cryptoCode])
}

module.exports = {
  blocked,
  getWhitelist,
}
