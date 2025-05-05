import { Field } from 'formik'
import React from 'react'
import TextInputFormik from 'src/components/inputs/formik/TextInput'
import { H4, P } from 'src/components/typography'
import * as Yup from 'yup'

const Screen1Information = () => {
  return (
    <>
      <H4>Screen 1 Information</H4> {/* TODO Add ? icon */}
      <P>
        On screen 1 you will request the user if he agrees on providing this
        information, or if he wishes to terminate the transaction instead.
      </P>
      <Field
        component={TextInputFormik}
        label="Screen title"
        name="screen1Title"
        fullWidth
      />
      <Field
        component={TextInputFormik}
        label="Screen text"
        name="screen1Text"
        multiline
        fullWidth
        rows={5}
      />
    </>
  )
}

const validationSchema = Yup.object().shape({
  screen1Title: Yup.string().label('Screen title').required(),
  screen1Text: Yup.string().label('Screen text').required()
})

const defaultValues = {
  screen1Title: '',
  screen1Text: ''
}

export default Screen1Information
export { validationSchema, defaultValues }
