import { makeStyles } from '@material-ui/core/styles'
import { format } from 'date-fns/fp'
import * as R from 'ramda'
import React from 'react'

import { MainStatus } from 'src/components/Status'
import DataTable from 'src/components/tables/DataTable'
import { ReactComponent as TxInIcon } from 'src/styling/icons/direction/cash-in.svg'
import { ReactComponent as TxOutIcon } from 'src/styling/icons/direction/cash-out.svg'

import styles from './CustomersList.styles'
import { getFormattedPhone, getName } from './helper'

const useStyles = makeStyles(styles)

const CustomersList = ({
  data,
  locale,
  onClick,
  loading,
  triggers,
  customRequests
}) => {
  const classes = useStyles()

  const elements = [
    {
      header: 'Phone/email',
      width: 199,
      view: it => `${getFormattedPhone(it.phone, locale.country) || ''} 
      ${it.email || ''}`
    },
    {
      header: 'Name',
      width: 241,
      view: getName
    },
    {
      header: 'Total TXs',
      width: 126,
      textAlign: 'right',
      view: it => `${Number.parseInt(it.totalTxs)}`
    },
    {
      header: 'Total spent',
      width: 152,
      textAlign: 'right',
      view: it =>
        `${Number.parseFloat(it.totalSpent)} ${it.lastTxFiatCode ?? ''}`
    },
    {
      header: 'Last active',
      width: 133,
      view: it =>
        (it.lastActive && format('yyyy-MM-dd', new Date(it.lastActive))) ?? ''
    },
    {
      header: 'Last transaction',
      width: 161,
      textAlign: 'right',
      view: it => {
        const hasLastTx = !R.isNil(it.lastTxFiatCode)
        const LastTxIcon = it.lastTxClass === 'cashOut' ? TxOutIcon : TxInIcon
        const lastIcon = <LastTxIcon className={classes.txClassIconRight} />
        return (
          <>
            {hasLastTx &&
              `${parseFloat(it.lastTxFiat)} ${it.lastTxFiatCode ?? ''}`}
            {hasLastTx && lastIcon}
          </>
        )
      }
    },
    {
      header: 'Status',
      width: 191,
      view: it => <MainStatus statuses={[it.authorizedStatus]} />
    }
  ]

  return (
    <>
      <DataTable
        loading={loading}
        emptyText="No customers so far"
        elements={elements}
        data={data}
        onClick={onClick}
      />
    </>
  )
}

export default CustomersList
