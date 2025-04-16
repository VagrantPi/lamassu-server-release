const db = require('./db')

function createChangeLog (customer_id, before_json, after_json) {
    const sql = `
    INSERT INTO
      "btm_change_logs" ("created_at", "updated_at", "deleted_at", "operation_user_id", "table_name", "operation_type", "customer_id", "before_value", "after_value")
    VALUES
      (
        NOW(),
        NOW(),
        NULL,
        -1,
        'btm_risk_control_customer_limit_settings',
        2,
        $1,
        $2,
        $3
      )`

    return db.none(sql, [customer_id, before_json, after_json])
}

module.exports = {
  createChangeLog
}
