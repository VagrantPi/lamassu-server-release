const nodemailer = require('nodemailer');

const logger = require('../lib/logger')

/**
 * 郵件發送器類別
 */
class EmailSender {
  /**
   * 建立郵件發送器
   * @param {Object} smtpConfig - SMTP 伺服器配置
   * @param {string} smtpConfig.host - SMTP 伺服器地址
   * @param {number} smtpConfig.port - SMTP 伺服器端口
   * @param {boolean} smtpConfig.secure - 是否使用 SSL/TLS
   * @param {Object} smtpConfig.auth - 認證信息
   * @param {string} smtpConfig.auth.user - 郵箱用戶名
   * @param {string} smtpConfig.auth.pass - 郵箱密碼或應用專用密碼
   */
  constructor(smtpConfig) {
    this.config = smtpConfig;
    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  /**
   * 驗證 SMTP 連接設定
   * @returns {Promise<boolean>} - 驗證結果
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.log('SMTP 連接驗證成功');
      return true;
    } catch (error) {
      logger.error('SMTP 連接驗證失敗:', error);
      return false;
    }
  }

  /**
   * 發送郵件
   * @param {Object} options - 郵件選項
   * @param {string} options.from - 發件人郵箱
   * @param {string|string[]} options.to - 收件人郵箱或郵箱陣列
   * @param {string} options.subject - 郵件主題
   * @param {string} options.text - 純文本內容
   * @param {string} options.html - HTML 內容
   * @param {Array} [options.attachments] - 附件陣列
   * @returns {Promise<Object>} - 發送結果
   */
  async sendMail(options) {
    try {
      // 如果沒有設定發件人，使用默認配置中的用戶
      if (!options.from && this.config.auth && this.config.auth.user) {
        options.from = this.config.auth.user;
      }
      
      // 發送郵件
      const info = await this.transporter.sendMail(options);
      
      logger.info('郵件發送成功:', info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        info: info
      };
    } catch (error) {
      logger.error('郵件發送失敗:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 獲取當前 SMTP 配置
   * @returns {Object} - SMTP 配置
   */
  getConfig() {
    // 回傳配置的副本，避免直接修改原始配置
    return { ...this.config };
  }

  /**
   * 更新 SMTP 配置
   * @param {Object} newConfig - 新的 SMTP 配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.transporter = nodemailer.createTransport(this.config);
  }
}

module.exports = EmailSender;