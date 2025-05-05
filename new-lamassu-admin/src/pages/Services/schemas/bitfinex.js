import * as Yup from 'yup'

import {
  SecretInput,
  TextInput,
  Autocomplete
} from 'src/components/inputs/formik'

import { secretTest, buildCurrencyOptions } from './helper'

const schema = markets => {
  return {
    code: 'bitfinex',
    name: 'Bitfinex',
    title: 'Bitfinex (Exchange)',
    elements: [
      {
        code: 'key',
        display: 'API key',
        component: TextInput,
        face: true,
        long: true
      },
      {
        code: 'secret',
        display: 'API secret',
        component: SecretInput
      },
      {
        code: 'currencyMarket',
        display: 'Currency Market',
        component: Autocomplete,
        inputProps: {
          options: buildCurrencyOptions(markets),
          labelProp: 'display',
          valueProp: 'code'
        },
        face: true
      }
    ],
    getValidationSchema: account => {
      return Yup.object().shape({
        key: Yup.string('The API key must be a string')
          .max(100, 'The API key is too long')
          .required('The API key is required'),
        secret: Yup.string('The API secret must be a string')
          .max(100, 'The API secret is too long')
          .test(secretTest(account?.secret, 'API secret')),
        currencyMarket: Yup.string(
          'The currency market must be a string'
        ).required('The currency market is required')
      })
    }
  }
}

export default schema
