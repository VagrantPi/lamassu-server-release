import { useQuery, useLazyQuery } from '@apollo/react-hooks'
import { toUnit, formatCryptoAddress } from '@lamassu/coins/lightUtils'
import { makeStyles } from '@material-ui/core'
import BigNumber from 'bignumber.js'
import gql from 'graphql-tag'
import * as R from 'ramda'
import React, { useEffect, useState } from 'react'
import DetailsRow from 'src/pages/Transactions/DetailsCard'
import TxInIcon from 'src/styling/icons/direction/cash-in.svg?react'
import TxOutIcon from 'src/styling/icons/direction/cash-out.svg?react'

import { mainStyles } from 'src/pages/Transactions/Transactions.styles'
import { getStatus } from 'src/pages/Transactions/helper'
import * as Customer from 'src/utils/customer'
import { formatDate } from 'src/utils/timezones'

import DataTable from './DataTable'
const useStyles = makeStyles(mainStyles)

const NUM_LOG_RESULTS = 5

const GET_TRANSACTIONS = gql`
  query transactions($limit: Int, $from: Date, $until: Date, $deviceId: String) {
    transactions(
      limit: $limit
      from: $from
      until: $until
      deviceId: $deviceId
    ) {
      id
      txClass
      txHash
      toAddress
      commissionPercentage
      expired
      machineName
      operatorCompleted
      sendConfirmed
      dispense
      hasError: error
      deviceId
      fiat
      fixedFee
      fiatCode
      cryptoAtoms
      cryptoCode
      toAddress
      created
      customerName
      customerIdCardData
      customerIdCardPhotoPath
      customerFrontCameraPath
      customerPhone
      customerEmail
      discount
      customerId
      isAnonymous
      rawTickerPrice
      profit
    }
  }
`

const GET_DATA = gql`
  query getData {
    config
  }
`

const Transactions = ({ id }) => {
  const classes = useStyles()

  const [extraHeight, setExtraHeight] = useState(0)
  const [clickedId, setClickedId] = useState('')

  const [getTx, { data: txResponse, loading: txLoading }] = useLazyQuery(
    GET_TRANSACTIONS,
    {
      variables: {
        limit: NUM_LOG_RESULTS,
        deviceId: id
      }
    }
  )

  const { data: configData, loading: configLoading } = useQuery(GET_DATA)
  const timezone = R.path(['config', 'locale_timezone'], configData)

  const loading = txLoading || configLoading

  if (!loading && txResponse) {
    txResponse.transactions = txResponse.transactions.splice(0, 5)
  }

  useEffect(() => {
    if (id !== null) {
      getTx()
    }
  }, [getTx, id])

  const elements = [
    {
      header: '',
      width: 0,
      size: 'sm',
      view: it => (it.txClass === 'cashOut' ? <TxOutIcon /> : <TxInIcon />)
    },
    {
      header: 'Customer',
      width: 122,
      size: 'sm',
      view: Customer.displayName
    },
    {
      header: 'Cash',
      width: 144,
      textAlign: 'right',
      size: 'sm',
      view: it => `${Number.parseFloat(it.fiat)} ${it.fiatCode}`
    },
    {
      header: 'Crypto',
      width: 164,
      textAlign: 'right',
      size: 'sm',
      view: it =>
        `${toUnit(new BigNumber(it.cryptoAtoms), it.cryptoCode).toFormat(5)} ${
          it.cryptoCode
        }`
    },
    {
      header: 'Address',
      view: it => formatCryptoAddress(it.cryptoCode, it.toAddress),
      className: classes.overflowTd,
      size: 'sm',
      textAlign: 'left',
      width: 140
    },
    {
      header: 'Date',
      view: it => formatDate(it.created, timezone, 'yyyy‑MM‑dd'),
      textAlign: 'left',
      size: 'sm',
      width: 140
    },
    {
      header: 'Status',
      view: it => getStatus(it),
      size: 'sm',
      width: 20
    }
  ]

  const handleClick = e => {
    if (clickedId === e.id) {
      setClickedId('')
      setExtraHeight(0)
    } else {
      setClickedId(e.id)
      setExtraHeight(310)
    }
  }

  return (
    <DataTable
      extraHeight={extraHeight}
      onClick={handleClick}
      loading={loading || id === null}
      emptyText="No transactions so far"
      elements={elements}
      data={R.path(['transactions'])(txResponse)}
      Details={DetailsRow}
      expandable
    />
  )
}

export default Transactions
