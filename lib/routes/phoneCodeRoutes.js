const express = require('express')
const router = express.Router()
const semver = require('semver')
const _ = require('lodash/fp')

const btmRiskcontrol = require('../btm-riskcontrol')
const compliance = require('../compliance')
const complianceTriggers = require('../compliance-triggers')
const configManager = require('../new-config-manager')
const { get, add, getById, update } = require('../customers')
const httpError = require('../route-helpers').httpError
const plugins = require('../plugins')
const Tx = require('../tx')
const respond = require('../respond')
const loyalty = require('../loyalty')

function addOrUpdateCustomer (req) {
  const customerData = req.body
  const machineVersion = req.query.version
  const triggers = configManager.getTriggers(req.settings.config)
  const compatTriggers = complianceTriggers.getBackwardsCompatibleTriggers(triggers)
  const maxDaysThreshold = complianceTriggers.maxDaysThreshold(triggers)

  return get(customerData.phone)
    .then(customer => {
      if (customer) return customer

      return add(req.body)
    })
    .then(customer => getById(customer.id))
    .then(customer => {
      // BACKWARDS_COMPATIBILITY 7.5
      // machines before 7.5 expect customer with sanctions result
      const isOlderMachineVersion = !machineVersion || semver.lt(machineVersion, '7.5.0-beta.0')
      const shouldRunOfacCompat = !compatTriggers.sanctions && isOlderMachineVersion
      if (!shouldRunOfacCompat) return customer

      return compliance.validationPatch(req.deviceId, !!compatTriggers.sanctions, customer)
        .then(patch => {
          if (_.isEmpty(patch)) return customer
          return update(customer.id, patch)
        })
    })
    .then(customer => {
      // 修改原始邏輯，改用月曆制，撈出當月 1/1 00:00 到至今
      return Tx.customerHistory(customer.id, maxDaysThreshold)
        .then(result => {
          customer.txHistory = result
          return customer
        })
    })
    .then(customer => {
      return loyalty.getCustomerActiveIndividualDiscount(customer.id)
        .then(discount => ({ ...customer, discount }))
    })
}

function getCustomerWithPhoneCode (req, res, next) {
  const pi = plugins(req.settings, req.deviceId)
  const phone = req.body.phone

  return pi.getPhoneCode(phone)
    .then(code => {
      return addOrUpdateCustomer(req)
        .then(customer => respond(req, res, { code, customer }))
    })
    .catch(err => {
      if (err.name === 'BadNumberError') throw httpError('Bad number', 401)
      throw err
    })
    .catch(next)
}

router.post('/', getCustomerWithPhoneCode)

module.exports = router
