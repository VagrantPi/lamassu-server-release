const _ = require('lodash/fp')
const db = require('lamassu-server/lib/db')
const T = require('./time')
const BN = require('./bn')

const REDEEMABLE_AGE = T.day / 1000

function fetchTxVolume (customerId) {
  const sql = `SELECT role, last_black_to_normal_at, daily_limit, monthly_limit FROM btm_risk_control_customer_limit_settings WHERE customer_id = $1`
  return db.any(sql, [customerId])
    .then(res => {
      if (res.length === 0) {
        // 預設白名單日月限額
        return {
          daily_limit: 300000,
          monthly_limit: 1000000
        }
      }

      // 如果 role 為黑名單，則回傳 0, 0
      if (res[0].role === 3) {
        return {
          daily_limit: 0,
          monthly_limit: 0
        }
      }

      return {
        last_black_to_normal_at: res[0].last_black_to_normal_at,
        daily_limit: res[0].daily_limit,
        monthly_limit: res[0].monthly_limit
      }
    })
}

function getBillsFiatValue (bills) {
  return _.reduce((acc, value) => acc.plus(value.fiat), BN(0), bills)
}

function nowUTC8() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function todayUTC8() {
  const now = new Date();
  const taiwanMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0, 0, 0, 0
  );
  return new Date(taiwanMidnight.getTime() + 8 * 60 * 60 * 1000);
}

function periodTodayUTC8() {
  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  );
  todayMidnight.setHours(todayMidnight.getHours() + 8);
  return todayMidnight
}

function firstDayOfMonthUTC8() {
  const now = new Date();
  const firstDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0, 0, 0, 0
  );

  return new Date(firstDayOfMonth.getTime() + 8 * 60 * 60 * 1000);
}

function periodThisMonthUTC8() {
  const now = new Date();
  const lastDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23, 59, 59, 999
  );
  lastDayOfMonth.setHours(lastDayOfMonth.getHours() + 8);
  return lastDayOfMonth
}

function sumFiatByDateRange1(records) {
  const now = new Date(); // 取得當前時間
  const startDate = new Date(now); // 複製當前時間
  startDate.setDate(now.getDate() - 1); // 設定為 n 天前
  startDate.setHours(0, 0, 0, 0); // 設定為當天 00:00

  let totalFiat = new BN(0);

  records.forEach(record => {
    const recordDate = new Date(record.created); // 將紀錄時間轉為 Date 物件

    // 檢查紀錄時間是否在指定範圍內
    if (recordDate >= startDate && recordDate <= now) {
      totalFiat = totalFiat.plus(new BN(record.fiat));
    }
  });

  return totalFiat.toString(); // 回傳總和的 fiat 金額（以字串格式）
}

function machineRequestLimitLog(customer_id, tx_id, daily_add_tx, monthly_add_tx, now_limit_config) {
  const sql = `INSERT INTO btm_risk_control_customer_limit_settings (customer_id, tx_id, daily_add_tx, monthly_add_tx, now_limit_config, created_at) VALUES ($1, $2, $3, $4, $5, NOW());`
  return db.none(sql, [customer_id, tx_id, daily_add_tx, monthly_add_tx, now_limit_config])
}

module.exports = {
  fetchTxVolume,
  getBillsFiatValue,
  todayUTC8,
  periodTodayUTC8,
  firstDayOfMonthUTC8,
  periodThisMonthUTC8,
  sumFiatByDateRange1,
  machineRequestLimitLog,
  nowUTC8
}