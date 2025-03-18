const db = require('./db')

function createUserInvoice (customer_id, tx_id, invoice_no, invoice_date, random_number, raw_resp) {
    const sql = `INSERT INTO btm_invoices (customer_id, tx_id, invoice_no, invoice_date, random_number, raw_resp, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW());`

    invoice_date = invoice_date ? invoice_date : null
    return db.one(sql, [customer_id, tx_id, invoice_no, invoice_date, random_number, raw_resp])
}

module.exports = {
    createUserInvoice
}
