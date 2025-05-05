import { useQuery, useMutation } from '@apollo/react-hooks'
import { makeStyles } from '@material-ui/core/styles'
import gql from 'graphql-tag'
import * as R from 'ramda'
import React, { memo } from 'react'
import { HelpTooltip } from 'src/components/Tooltip'
import { H4, P, Label2 } from 'src/components/typography'

import { BooleanPropertiesTable } from 'src/components/booleanPropertiesTable'
import { Switch } from 'src/components/inputs'
import { fromNamespace, toNamespace, namespaces } from 'src/utils/config'

import { SupportLinkButton } from '../../components/buttons'

import { global } from './OperatorInfo.styles'

const useStyles = makeStyles(global)

const GET_CONFIG = gql`
  query getData {
    config
  }
`

const SAVE_CONFIG = gql`
  mutation Save($config: JSONObject) {
    saveConfig(config: $config)
  }
`

const ReceiptPrinting = memo(({ wizard }) => {
  const classes = useStyles()

  const { data } = useQuery(GET_CONFIG)

  const [saveConfig] = useMutation(SAVE_CONFIG, {
    refetchQueries: () => ['getData']
  })

  const save = it =>
    saveConfig({
      variables: { config: toNamespace(namespaces.RECEIPT, it) }
    })

  const receiptPrintingConfig =
    data?.config && fromNamespace(namespaces.RECEIPT, data.config)
  if (!receiptPrintingConfig) return null

  return (
    <>
      <div className={classes.header}>
        <H4>Receipt options</H4>
        <HelpTooltip width={320}>
          <P>
            For details on configuring this panel, please read the relevant
            knowledgebase article:
          </P>
          <SupportLinkButton
            link="https://support.lamassu.is/hc/en-us/articles/360058513951-Receipt-options-printers"
            label="Lamassu Support Article"
            bottomSpace="1"
          />
        </HelpTooltip>
      </div>
      <div className={classes.switchRow}>
        <P>Enable receipt printing</P>
        <div className={classes.switch}>
          <Switch
            checked={receiptPrintingConfig.active}
            onChange={event =>
              saveConfig({
                variables: {
                  config: toNamespace(
                    namespaces.RECEIPT,
                    R.merge(receiptPrintingConfig, {
                      active: event.target.checked
                    })
                  )
                }
              })
            }
          />
          <Label2>{receiptPrintingConfig.active ? 'Yes' : 'No'}</Label2>
        </div>
      </div>
      <div className={classes.switchRow}>
        <P>Automatic receipt printing</P>
        <div className={classes.switch}>
          <Switch
            disabled={!receiptPrintingConfig.active}
            checked={receiptPrintingConfig.automaticPrint}
            onChange={event =>
              saveConfig({
                variables: {
                  config: toNamespace(
                    namespaces.RECEIPT,
                    R.merge(receiptPrintingConfig, {
                      automaticPrint: event.target.checked
                    })
                  )
                }
              })
            }
          />
          <Label2>{receiptPrintingConfig.automaticPrint ? 'Yes' : 'No'}</Label2>
        </div>
      </div>
      <div className={classes.switchRow}>
        <P>Offer SMS receipt</P>
        <div className={classes.switch}>
          <Switch
            checked={receiptPrintingConfig.sms}
            onChange={event =>
              saveConfig({
                variables: {
                  config: toNamespace(
                    namespaces.RECEIPT,
                    R.merge(receiptPrintingConfig, {
                      sms: event.target.checked
                    })
                  )
                }
              })
            }
          />
          <Label2>{receiptPrintingConfig.sms ? 'Yes' : 'No'}</Label2>
        </div>
      </div>
      <BooleanPropertiesTable
        editing={wizard}
        title={'Visible on the receipt (options)'}
        data={receiptPrintingConfig}
        elements={[
          {
            name: 'operatorWebsite',
            display: 'Operator website'
          },
          {
            name: 'operatorEmail',
            display: 'Operator email'
          },
          {
            name: 'operatorPhone',
            display: 'Operator phone'
          },
          {
            name: 'companyNumber',
            display: 'Company registration number'
          },
          {
            name: 'machineLocation',
            display: 'Machine location'
          },
          {
            name: 'customerNameOrPhoneNumber',
            display: 'Customer name or phone number (if known)'
          },
          {
            name: 'exchangeRate',
            display: 'Exchange rate'
          },
          {
            name: 'addressQRCode',
            display: 'Address QR code'
          }
        ]}
        save={save}
      />
    </>
  )
})

export default ReceiptPrinting
