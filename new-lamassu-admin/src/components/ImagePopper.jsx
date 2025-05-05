import { makeStyles, ClickAwayListener } from '@material-ui/core'
import classnames from 'classnames'
import React, { memo, useState } from 'react'
import Popper from 'src/components/Popper'
import ZoomIconInverse from 'src/styling/icons/circle buttons/search/white.svg?react'
import ZoomIcon from 'src/styling/icons/circle buttons/search/zodiac.svg?react'

import { FeatureButton } from 'src/components/buttons'

import imagePopperStyles from './ImagePopper.styles'

const useStyles = makeStyles(imagePopperStyles)

const ImagePopper = memo(
  ({ className, width, height, popupWidth, popupHeight, src }) => {
    const classes = useStyles({
      width,
      height,
      popupWidth,
      popupHeight
    })
    const [popperAnchorEl, setPopperAnchorEl] = useState(null)

    const handleOpenPopper = event => {
      setPopperAnchorEl(popperAnchorEl ? null : event.currentTarget)
    }

    const handleClosePopper = () => {
      setPopperAnchorEl(null)
    }

    const popperOpen = Boolean(popperAnchorEl)

    const Image = ({ className }) => (
      <img className={classnames(className)} src={src} alt="" />
    )

    return (
      <ClickAwayListener onClickAway={handleClosePopper}>
        <div className={classnames(classes.row, className)}>
          <Image className={classes.image} />
          <FeatureButton
            Icon={ZoomIcon}
            InverseIcon={ZoomIconInverse}
            className={classes.button}
            onClick={handleOpenPopper}
          />
          <Popper open={popperOpen} anchorEl={popperAnchorEl} placement="top">
            <div className={classes.popoverContent}>
              <Image className={classes.popupImage} />
            </div>
          </Popper>
        </div>
      </ClickAwayListener>
    )
  }
)

export default ImagePopper
