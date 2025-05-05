import { makeStyles } from '@material-ui/core'
import classNames from 'classnames'
import React, { memo } from 'react'
import { H4 } from 'src/components/typography'
import EmptyTableIcon from 'src/styling/icons/table/empty-table.svg?react'

const styles = {
  emptyTable: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 52
  }
}

const useStyles = makeStyles(styles)

const EmptyTable = memo(({ message, className }) => {
  const classes = useStyles()

  return (
    <div className={classNames(className, classes.emptyTable)}>
      <EmptyTableIcon />
      <H4>{message}</H4>
    </div>
  )
})

export default EmptyTable
