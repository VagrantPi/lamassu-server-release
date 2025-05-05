import { useFormikContext } from 'formik'
import * as R from 'ramda'
import React from 'react'
import * as Yup from 'yup'

import ChoiceList from './ChoiceList'
import NumericalEntry from './NumericalEntry'
import TextEntry from './TextEntry'

const nonEmptyStr = obj => obj.text && obj.text.length

const getForm = inputType => {
  switch (inputType) {
    case 'numerical':
      return NumericalEntry
    case 'text':
      return TextEntry
    case 'choiceList':
      return ChoiceList
    default:
      return NumericalEntry
  }
}

const TypeFields = () => {
  const inputType = R.path(['values', 'inputType'])(useFormikContext()) ?? null
  const Component = getForm(inputType)
  return inputType && <Component />
}

const defaultValues = {
  constraintType: '',
  inputLength: '',
  inputLabel1: '',
  inputLabel2: '',
  listChoices: [{ text: '' }, { text: '' }]
}

const validationSchema = Yup.lazy(values => {
  switch (values.inputType) {
    case 'numerical':
      return Yup.object({
        constraintType: Yup.string().label('Constraint type').required(),
        inputLength: Yup.number().when('constraintType', {
          is: 'length',
          then: schema =>
            schema.min(0).required('The number of digits is required'),
          otherwise: schema => schema.notRequired()
        })
      })
    case 'text':
      return Yup.object({
        constraintType: Yup.string().label('Constraint type').required(),
        inputLabel1: Yup.string().label('Text entry label').required(),
        inputLabel2: Yup.string().when('constraintType', {
          is: 'spaceSeparation',
          then: schema => schema.label('Second word label').required(),
          otherwise: schema => schema.notRequired()
        })
      })
    case 'choiceList':
      return Yup.object({
        constraintType: Yup.string().label('Constraint type').required(),
        listChoices: Yup.array().test(
          'has-2-or-more',
          'Choice list needs to have two or more non empty fields',
          (values, ctx) => {
            return R.filter(nonEmptyStr)(values).length > 1
          }
        )
      })
    default:
      return Yup.mixed().notRequired()
  }
})

export default TypeFields
export { defaultValues, validationSchema }
