import { spacer, tomato, primaryColor as zodiac } from 'src/styling/variables'

const colors = {
  cashOut: {
    empty: tomato,
    full: zodiac
  },
  cashIn: {
    empty: zodiac,
    full: tomato
  }
}

const colorPicker = ({ cashOut, applyColorVariant, isLow }) => {
  return colors[cashOut ? 'cashOut' : 'cashIn'][
    applyColorVariant || !isLow ? 'full' : 'empty'
  ]
}

const cashboxStyles = {
  cashbox: {
    borderColor: colorPicker,
    backgroundColor: colorPicker,
    height: ({ height }) => height ?? 118,
    width: ({ width }) => width ?? 80,
    border: '2px solid',
    textAlign: 'end',
    display: 'inline-block'
  },
  fiatBalanceAlertCashbox: {
    borderColor: colorPicker,
    backgroundColor: colorPicker,
    height: 118,
    width: 80,
    border: '4px solid'
  },
  emptyPart: {
    backgroundColor: 'white',
    height: ({ percent }) => `${100 - percent}%`,
    position: 'relative',
    '& > p': {
      color: colorPicker,
      display: 'inline-block',
      position: 'absolute',
      margin: 0,
      bottom: 0,
      right: 0
    }
  },
  fullPart: {
    backgroundColor: colorPicker,
    '& > p': {
      color: 'white',
      display: 'inline'
    }
  }
}

const gridStyles = {
  row: {
    display: 'flex',
    alignItems: 'center'
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  innerRow: {
    display: 'flex',
    justifyContent: 'flex-start'
  },
  col2: {
    marginLeft: 14
  },
  noMarginText: {
    marginTop: 0,
    marginBottom: 0
  },
  link: {
    marginTop: spacer
  },
  chip: {
    margin: [[0, 0, 0, 7]]
  }
}

export { cashboxStyles, gridStyles }
