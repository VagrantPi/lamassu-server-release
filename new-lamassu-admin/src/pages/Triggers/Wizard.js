import { makeStyles } from '@material-ui/core'
import { Form, Formik, useFormikContext } from 'formik'
import * as R from 'ramda'
import React, { useState, Fragment, useEffect } from 'react'

import ErrorMessage from 'src/components/ErrorMessage'
import Modal from 'src/components/Modal'
import Stepper from 'src/components/Stepper'
import { Button } from 'src/components/buttons'
import { H5, Info3 } from 'src/components/typography'
import { comet } from 'src/styling/variables'
import { singularOrPlural } from 'src/utils/string'

import { type, requirements } from './helper'

const LAST_STEP = 2

const styles = {
  stepper: {
    margin: [[16, 0, 14, 0]]
  },
  submit: {
    display: 'flex',
    flexDirection: 'row',
    margin: [['auto', 0, 24]]
  },
  button: {
    marginLeft: 'auto'
  },
  form: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  },
  infoTitle: {
    margin: [[18, 0, 20, 0]]
  },
  infoCurrentText: {
    color: comet
  },
  blankSpace: {
    padding: [[0, 30]],
    margin: [[0, 4, 0, 2]],
    borderBottom: `1px solid ${comet}`,
    display: 'inline-block'
  }
}

const useStyles = makeStyles(styles)

const getStep = (
  { step, config },
  currency,
  customInfoRequests,
  complianceServices,
  emailAuth,
  triggers
) => {
  switch (step) {
    // case 1:
    //   return txDirection
    case 1:
      return type(currency)
    case 2:
      return requirements(
        config,
        triggers,
        customInfoRequests,
        complianceServices,
        emailAuth
      )
    default:
      return Fragment
  }
}

const getText = (step, config, currency, classes) => {
  switch (step) {
    // case 1:
    //   return `In ${getDirectionText(config)} transactions`
    case 1:
      return <>If the user {getTypeText(config, currency, classes)}</>
    case 2:
      return <>the user will be {getRequirementText(config, classes)}.</>
    default:
      return <></>
  }
}

const orUnderline = (value, classes) => {
  const blankSpaceEl = <span className={classes.blankSpace}></span>
  return R.isEmpty(value) || R.isNil(value) ? blankSpaceEl : value
}

// const getDirectionText = config => {
//   switch (config.direction) {
//     case 'both':
//       return 'both cash-in and cash-out'
//     case 'cashIn':
//       return 'cash-in'
//     case 'cashOut':
//       return 'cash-out'
//     default:
//       return orUnderline(null)
//   }
// }

const getTypeText = (config, currency, classes) => {
  switch (config.triggerType) {
    case 'txAmount':
      return (
        <>
          makes a single transaction over{' '}
          {orUnderline(config.threshold.threshold, classes)} {currency}
        </>
      )
    case 'txVolume':
      return (
        <>
          makes more than {orUnderline(config.threshold.threshold, classes)}{' '}
          {currency} worth of transactions within{' '}
          {orUnderline(config.threshold.thresholdDays, classes)}{' '}
          {singularOrPlural(config.threshold.thresholdDays, 'day', 'days')}
        </>
      )
    case 'txVelocity':
      return (
        <>
          makes more than {orUnderline(config.threshold.threshold, classes)}{' '}
          {singularOrPlural(
            config.threshold.threshold,
            'transaction',
            'transactions'
          )}{' '}
          in {orUnderline(config.threshold.thresholdDays, classes)}{' '}
          {singularOrPlural(config.threshold.thresholdDays, 'day', 'days')}
        </>
      )
    case 'consecutiveDays':
      return (
        <>
          at least one transaction every day for{' '}
          {orUnderline(config.threshold.thresholdDays, classes)}{' '}
          {singularOrPlural(config.threshold.thresholdDays, 'day', 'days')}
        </>
      )
    default:
      return <></>
  }
}

const getRequirementText = (config, classes) => {
  switch (config.requirement?.requirement) {
    case 'email':
      return <>asked to enter code provided through email verification</>
    case 'sms':
      return <>asked to enter code provided through SMS verification</>
    case 'idCardPhoto':
      return <>asked to scan a ID with photo</>
    case 'idCardData':
      return <>asked to scan a ID</>
    case 'facephoto':
      return <>asked to have a photo taken</>
    case 'usSsn':
      return <>asked to input his social security number</>
    case 'sanctions':
      return <>matched against the OFAC sanctions list</>
    case 'superuser':
      return <></>
    case 'suspend':
      return (
        <>
          suspended for{' '}
          {orUnderline(config.requirement.suspensionDays, classes)}{' '}
          {singularOrPlural(config.requirement.suspensionDays, 'day', 'days')}
        </>
      )
    case 'block':
      return <>blocked</>
    case 'custom':
      return <>asked to fulfill a custom requirement</>
    case 'external':
      return <>redirected to an external verification process</>
    default:
      return orUnderline(null, classes)
  }
}

const InfoPanel = ({ step, config = {}, liveValues = {}, currency }) => {
  const classes = useStyles()

  const oldText = R.range(1, step).map((it, idx) => (
    <React.Fragment key={idx}>
      {getText(it, config, currency, classes)}
    </React.Fragment>
  ))
  const newText = getText(step, liveValues, currency, classes)
  const isLastStep = step === LAST_STEP

  return (
    <>
      <H5 className={classes.infoTitle}>Trigger overview so far</H5>
      <Info3 noMargin>
        {oldText}
        {step !== 1 && ', '}
        <span className={classes.infoCurrentText}>{newText}</span>
        {!isLastStep && '...'}
      </Info3>
    </>
  )
}

const GetValues = ({ setValues }) => {
  const { values } = useFormikContext()
  useEffect(() => {
    setValues && values && setValues(values)
  }, [setValues, values])

  return null
}

const Wizard = ({
  onClose,
  save,
  error,
  currency,
  customInfoRequests,
  complianceServices,
  emailAuth,
  triggers
}) => {
  const classes = useStyles()

  const [liveValues, setLiveValues] = useState({})
  const [{ step, config }, setState] = useState({
    step: 1
  })

  const isLastStep = step === LAST_STEP
  const stepOptions = getStep(
    { step, config },
    currency,
    customInfoRequests,
    complianceServices,
    emailAuth,
    triggers
  )

  const onContinue = async it => {
    const newConfig = R.merge(config, stepOptions.schema.cast(it))

    if (isLastStep) {
      return save(newConfig)
    }

    setState({
      step: step + 1,
      config: newConfig
    })
  }

  const createErrorMessage = (errors, touched, values) => {
    const triggerType = values?.triggerType
    const containsType = R.contains(triggerType)
    const isSuspend = values?.requirement?.requirement === 'suspend'
    const isCustom = values?.requirement?.requirement === 'custom'

    const hasRequirementError = requirements().hasRequirementError(
      errors,
      touched,
      values
    )
    const hasCustomRequirementError = requirements().hasCustomRequirementError(
      errors,
      touched,
      values
    )

    const hasAmountError =
      !!errors.threshold &&
      !!touched.threshold?.threshold &&
      !containsType(['consecutiveDays']) &&
      (!values.threshold?.threshold || values.threshold?.threshold < 0)

    const hasDaysError =
      !!errors.threshold &&
      !!touched.threshold?.thresholdDays &&
      !containsType(['txAmount']) &&
      (!values.threshold?.thresholdDays || values.threshold?.thresholdDays < 0)

    if (containsType(['txAmount', 'txVolume', 'txVelocity']) && hasAmountError)
      return errors.threshold

    if (
      containsType(['txVolume', 'txVelocity', 'consecutiveDays']) &&
      hasDaysError
    )
      return errors.threshold

    if (
      (isSuspend && hasRequirementError) ||
      (isCustom && hasCustomRequirementError)
    )
      return errors.requirement
  }

  return (
    <>
      <Modal
        title="New compliance trigger"
        handleClose={onClose}
        width={560}
        height={520}
        infoPanel={
          <InfoPanel
            currency={currency}
            step={step}
            config={config}
            liveValues={liveValues}
          />
        }
        infoPanelHeight={172}
        open={true}>
        <Stepper
          className={classes.stepper}
          steps={LAST_STEP}
          currentStep={step}
        />
        <Formik
          validateOnBlur={false}
          validateOnChange={true}
          enableReinitialize
          onSubmit={onContinue}
          initialValues={stepOptions.initialValues}
          validationSchema={stepOptions.schema}>
          {({ errors, touched, values }) => (
            <Form className={classes.form}>
              <GetValues setValues={setLiveValues} />
              <stepOptions.Component {...stepOptions.props} />
              <div className={classes.submit}>
                {error && <ErrorMessage>Failed to save</ErrorMessage>}
                {createErrorMessage(errors, touched, values) && (
                  <ErrorMessage>
                    {createErrorMessage(errors, touched, values)}
                  </ErrorMessage>
                )}
                <Button className={classes.button} type="submit">
                  {isLastStep ? 'Finish' : 'Next'}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </Modal>
    </>
  )
}

export default Wizard
