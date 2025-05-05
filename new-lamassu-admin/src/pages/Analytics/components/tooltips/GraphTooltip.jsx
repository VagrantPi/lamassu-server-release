import { Paper } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import * as R from 'ramda'
import React, { memo } from 'react'
import { Info2, Label3, P } from 'src/components/typography'
import TxInIcon from 'src/styling/icons/direction/cash-in.svg?react'
import TxOutIcon from 'src/styling/icons/direction/cash-out.svg?react'

import { numberToFiatAmount } from 'src/utils/number'
import { singularOrPlural } from 'src/utils/string'
import { formatDate, formatDateNonUtc } from 'src/utils/timezones'

import styles from './GraphTooltip.styles'

const useStyles = makeStyles(styles)

const GraphTooltip = ({
  coords,
  data,
  dateInterval,
  period,
  currency,
  representing
}) => {
  const classes = useStyles(coords)

  const formattedDateInterval = !R.includes('hourOfDay', representing.code)
    ? [
        formatDate(dateInterval[1], null, 'MMM d'),
        formatDate(dateInterval[1], null, 'HH:mm'),
        formatDate(dateInterval[0], null, 'HH:mm')
      ]
    : [
        formatDate(dateInterval[1], null, 'MMM d'),
        formatDateNonUtc(dateInterval[1], 'HH:mm'),
        formatDateNonUtc(dateInterval[0], 'HH:mm')
      ]

  const transactions = R.reduce(
    (acc, value) => {
      acc.volume += parseInt(value.fiat)
      if (value.txClass === 'cashIn') acc.cashIn++
      if (value.txClass === 'cashOut') acc.cashOut++
      return acc
    },
    { volume: 0, cashIn: 0, cashOut: 0 },
    data
  )

  return (
    <Paper className={classes.dotOtWrapper}>
      {!R.includes('hourOfDay', representing.code) && (
        <Info2 noMargin>{`${formattedDateInterval[0]}`}</Info2>
      )}
      <Info2 noMargin>
        {`${formattedDateInterval[1]} - ${formattedDateInterval[2]}`}
      </Info2>
      <P noMargin className={classes.dotOtTransactionAmount}>
        {R.length(data)}{' '}
        {singularOrPlural(R.length(data), 'transaction', 'transactions')}
      </P>
      <P noMargin className={classes.dotOtTransactionVolume}>
        {numberToFiatAmount(transactions.volume)} {currency} in volume
      </P>
      <div className={classes.dotOtTransactionClasses}>
        <Label3 noMargin>
          <TxInIcon />
          <span>{transactions.cashIn} cash-in</span>
        </Label3>
        <Label3 noMargin>
          <TxOutIcon />
          <span>{transactions.cashOut} cash-out</span>
        </Label3>
      </div>
    </Paper>
  )
}

export default memo(GraphTooltip, (prev, next) => prev.coords === next.coords)
