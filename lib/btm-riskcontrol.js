const _ = require('lodash/fp')
const db = require('lamassu-server/lib/db')
const T = require('./time')
const BN = require('./bn')

const REDEEMABLE_AGE = T.day / 1000

function fetchTxVolume (customerId) {
  const sql = `SELECT role, last_black_to_normal_at, daily_limit, monthly_limit, level1, level2, level1_days, level2_days, velocity_days, velocity_times FROM btm_risk_control_customer_limit_settings WHERE customer_id = $1`
  return db.any(sql, [customerId])
    .then(res => {
      if (res.length === 0) {
        // 預設黑名單日月限額
        return {
          role: 3,
          daily_limit: 0,
          monthly_limit: 0,
          level1: 0,
          level2: 0,
          level1_days: 7,
          level2_days: 60,
          velocity_days: 1,
          velocity_times: 0
        }
      }

      // 如果 role 為黑名單，則回傳 0, 0
      if (res[0].role === 3) {
        return {
          role: 3,
          daily_limit: 0,
          monthly_limit: 0,
          level1: 0,
          level2: 0,
          level1_days: 7,
          level2_days: 60,
          velocity_days: 1,
          velocity_times: 0
        }
      }

      return {
        role: res[0].role,
        last_black_to_normal_at: res[0].last_black_to_normal_at,
        daily_limit: res[0].daily_limit,
        monthly_limit: res[0].monthly_limit,
        level1: res[0].level1,
        level2: res[0].level2,
        level1_days: res[0].level1_days,
        level2_days: res[0].level2_days,
        velocity_days: res[0].velocity_days,
        velocity_times: res[0].velocity_times
      }
    })
}

function fetchDefaultLimit (role) {
  const sql = `SELECT daily_limit, monthly_limit, level1, level2, level1_days, level2_days, velocity_days, velocity_times FROM btm_risk_control_limit_settings WHERE "role" = $1;`

  return db.any(sql, [role])
    .then(res => {
      if (res.length === 0) {
        // 找不到則回傳黑名單
        return {
          daily_limit: 0,
          monthly_limit: 0,
          level1: 0,
          level2: 0,
          level1_days: 7,
          level2_days: 60,
          velocity_days: 1,
          velocity_times: 0
        }
      }

      return {
        daily_limit: res[0].daily_limit,
        monthly_limit: res[0].monthly_limit,
        level1: res[0].level1,
        level2: res[0].level2,
        level1_days: res[0].level1_days,
        level2_days: res[0].level2_days,
        velocity_days: res[0].velocity_days,
        velocity_times: res[0].velocity_times
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

function todayUTC0() {
  const now = new Date();
  const taiwanMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0, 0, 0, 0
  );
  return new Date(taiwanMidnight.getTime());
}

function periodTodayUTC0() {
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

function firstDayOfMonthUTC0() {
  const now = new Date();
  const firstDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0, 0, 0, 0
  );

  return new Date(firstDayOfMonth.getTime());
}

function dayMuteNUTC8(n = 0) {
  const now = new Date();
  const today0 = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0, 0, 0, 0
  );
  
  // 計算 n 天前的毫秒時間戳
  const targetDate = new Date(today0.getTime() - n * 24 * 60 * 60 * 1000);
  
  // 調整為 UTC+8 時區
  const utcOffset = 8 * 60 * 60 * 1000; // UTC+8 的毫秒差
  const utc8Date = new Date(targetDate.getTime() + utcOffset);
  
  return utc8Date;
}

function periodThisMonthUTC0() {
  const now = new Date();
  const lastDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23, 59, 59, 999
  );
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

function markCustomerEddType(customer_id, edd_type, timeAt) {
  const sql = `UPDATE "public"."btm_risk_control_customer_limit_settings" SET "edd_type" = $2, "edd_at" = $3, "is_edd"=TRUE, "updated_at" = NOW(), "role" = 3 WHERE "customer_id" = $1;`
  return db.none(sql, [customer_id, edd_type, timeAt])
}

module.exports = {
  fetchTxVolume,
  getBillsFiatValue,
  todayUTC0,
  periodTodayUTC0,
  firstDayOfMonthUTC0,
  periodThisMonthUTC0,
  sumFiatByDateRange1,
  machineRequestLimitLog,
  nowUTC8,
  fetchDefaultLimit,
  dayMuteNUTC8,
  markCustomerEddType
}