const db = require('lamassu-server/lib/db')

function deleteItem(customerId, infoRequestId) {
  const sql = `DELETE FROM customers_custom_info_requests WHERE customer_id = $1 and info_request_id = $2`
  return db.any(sql, [customerId, infoRequestId])
}

module.exports = {
  deleteItem,
}