const axios = require('axios')
const crypto = require("crypto")
const qs = require("querystring")

class EcpayInvoiceClient {
  constructor(params) {
    this.merchantId = params.merchantId;
    this.hashKey = params.hashKey;
    this.hashIV = params.hashIV;

    this.apiEndpoint =
      params.env === "sandbox"
        ? "https://einvoice-stage.ecpay.com.tw"
        : "https://einvoice.ecpay.com.tw";
  }

  encryptPostData(params) {
    const postData = encodeURIComponent(JSON.stringify(params));
    const key = this.hashKey ? this.hashKey.padEnd(16, "0").slice(0, 16) : '';
    const iv = this.hashIV ? this.hashIV.padEnd(16, "0").slice(0, 16) : '';
    const cipher = crypto.createCipheriv("aes128", key, iv);
    let encrypted = cipher.update(postData, "utf8", "base64");
    encrypted += cipher.final("base64");
    return encrypted;
  }

  decryptResponseData(data) {
    const key = this.hashKey ? this.hashKey.padEnd(16, "0").slice(0, 16) : '';
    const iv = this.hashIV ? this.hashIV.padEnd(16, "0").slice(0, 16) : '';
    const decipher = crypto.createDecipheriv(
      "aes128",
      key,
      iv
    );
    decipher.setAutoPadding(false);
    let decrypted = decipher.update(data, "base64", "utf8");
    decrypted += decipher.final("utf8");

    const decodedData = decodeURIComponent(decrypted).replace(
      /[\x00-\x20]+/g,
      ""
    );
    return JSON.parse(decodedData);
  }

  async issueB2CInvoice(params) {
    const { relateNumber, customerID, invoiceAmount, customerEmail } = params;

    return this.queryB2CApi("/B2CInvoice/Issue", {
      "MerchantID": this.merchantId,
      "RelateNumber": relateNumber.slice(0, 30),
      "CustomerID": customerID.slice(0, 20),
      "CustomerIdentifier": "",
      "CustomerName": "",
      "CustomerAddr": "",
      "CustomerPhone": "",
      "CustomerEmail": customerEmail,
      "ClearanceMark": "",
      "Print": "0",
      "Donation": "0",
      "LoveCode": "",
      "CarrierType": "1",
      "CarrierNum": "",
      "TaxType": "1",
      "SalesAmount": invoiceAmount,
      "InvoiceRemark": "手續費",
      "InvType": "07",
      "vat": "1",
      "Items": [
        {
            "ItemSeq": 1,
            "ItemName": "手續費",
            "ItemCount": 1,
            "ItemWord": "次",
            "ItemPrice": invoiceAmount,
            "ItemTaxType": "1",
            "ItemAmount": invoiceAmount,
            "ItemRemark": "手續費"
        }
      ]
    })
  }
  

  async queryB2CApi(path, params) {
    const { data } = await axios.post(`${this.apiEndpoint}${path}`, {
      MerchantID: this.merchantId,
      RqHeader: { Timestamp: Math.floor(new Date().getTime() / 1000) },
      Data: this.encryptPostData({
        MerchantID: this.merchantId,
        ...params,
      }),
    });
  
    return {
      PlatformID: data.PlatformID ?? null,
      MerchantID: data.MerchantID,
      RpHeader: data.RpHeader,
      TransCode: data.TransCode,
      TransMsg: data.TransMsg,
      Data: data.Data ? this.decryptResponseData(data.Data) : null,
    };
  }
  
}


module.exports = EcpayInvoiceClient