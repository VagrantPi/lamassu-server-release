import { Paper } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import React, { memo } from 'react'
import CrossedCameraIcon from 'src/styling/icons/ID/photo/crossed-camera.svg?react'

import mainStyles from '../CustomersList.styles'

const useStyles = makeStyles(mainStyles)

const FrontCameraPhoto = memo(({ frontCameraPath }) => {
  const classes = useStyles()

  return (
    <Paper className={classes.photo} elevation={0}>
      {frontCameraPath ? (
        <img
          className={classes.img}
          src={`/front-camera-photo/${frontCameraPath}`}
          alt=""
        />
      ) : (
        <CrossedCameraIcon />
      )}
    </Paper>
  )
})

export default FrontCameraPhoto
