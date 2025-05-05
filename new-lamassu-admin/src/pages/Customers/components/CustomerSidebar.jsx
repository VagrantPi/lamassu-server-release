import { makeStyles } from '@material-ui/core/styles'
import classnames from 'classnames'
import React from 'react'
import CustomerDataReversedIcon from 'src/styling/icons/customer-nav/data/comet.svg?react'
import CustomerDataIcon from 'src/styling/icons/customer-nav/data/white.svg?react'
import NoteReversedIcon from 'src/styling/icons/customer-nav/note/comet.svg?react'
import NoteIcon from 'src/styling/icons/customer-nav/note/white.svg?react'
import OverviewReversedIcon from 'src/styling/icons/customer-nav/overview/comet.svg?react'
import OverviewIcon from 'src/styling/icons/customer-nav/overview/white.svg?react'
import PhotosReversedIcon from 'src/styling/icons/customer-nav/photos/comet.svg?react'
import Photos from 'src/styling/icons/customer-nav/photos/white.svg?react'

import styles from './CustomerSidebar.styles'

const useStyles = makeStyles(styles)

const CustomerSidebar = ({ isSelected, onClick }) => {
  const classes = useStyles()
  const sideBarOptions = [
    {
      code: 'overview',
      display: 'Overview',
      Icon: OverviewIcon,
      InverseIcon: OverviewReversedIcon
    },
    {
      code: 'customerData',
      display: 'Customer data',
      Icon: CustomerDataIcon,
      InverseIcon: CustomerDataReversedIcon
    },
    {
      code: 'notes',
      display: 'Notes',
      Icon: NoteIcon,
      InverseIcon: NoteReversedIcon
    },
    {
      code: 'photos',
      display: 'Photos & files',
      Icon: Photos,
      InverseIcon: PhotosReversedIcon
    }
  ]

  return (
    <div className={classes.sidebar}>
      {sideBarOptions?.map(({ Icon, InverseIcon, display, code }, idx) => (
        <div
          key={idx}
          className={classnames({
            [classes.activeLink]: isSelected(code),
            [classes.link]: true
          })}
          onClick={() => onClick(code)}>
          <div className={classes.icon}>
            {isSelected(code) ? <Icon /> : <InverseIcon />}
          </div>
          {display}
        </div>
      ))}
    </div>
  )
}

export default CustomerSidebar
