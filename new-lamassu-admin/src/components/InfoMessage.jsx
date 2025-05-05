import { Box, makeStyles } from '@material-ui/core'
import React from 'react'
import { Label1 } from 'src/components/typography'
import WarningIcon from 'src/styling/icons/warning-icon/comet.svg?react'

const useStyles = makeStyles({
  message: ({ width }) => ({
    width,
    marginTop: 4,
    marginLeft: 16
  })
})

const InfoMessage = ({ children, width = 330, className }) => {
  const classes = useStyles({ width })

  return (
    <Box display="flex" className={className}>
      <WarningIcon />
      <Label1 className={classes.message}>{children}</Label1>
    </Box>
  )
}

export default InfoMessage
