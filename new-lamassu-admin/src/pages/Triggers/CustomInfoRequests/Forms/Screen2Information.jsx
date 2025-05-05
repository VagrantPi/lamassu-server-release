import { Field } from 'formik'
import React from 'react'
import TextInputFormik from 'src/components/inputs/formik/TextInput'
import { H4, P } from 'src/components/typography'
import * as Yup from 'yup'

const ScreenInformation = () => {
  return (
    <>
      <H4>Screen 2 Information</H4> {/* TODO Add ? icon */}
      <P>
        If the user agrees, on screen 2 is where the user will enter the custom
        information.
      </P>
      <Field
        component={TextInputFormik}
        label="Screen 2 input title"
        name="screen2Title"
        fullWidth
      />
      <Field
        component={TextInputFormik}
        label="Screen 2 input description"
        name="screen2Text"
        fullWidth
      />
    </>
  )
}

const validationSchema = Yup.object().shape({
  screen2Title: Yup.string().label('Screen title').required(),
  screen2Text: Yup.string().label('Screen text').required()
})

const defaultValues = {
  screen2Title: '',
  screen2Text: ''
}

export default ScreenInformation
export { validationSchema, defaultValues }
