import { Paper } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import classnames from 'classnames'
import React, { memo } from 'react'

import { MainStatus } from 'src/components/Status'
import { ActionButton } from 'src/components/buttons'
import { H3 } from 'src/components/typography'
import { ReactComponent as AuthorizeReversedIcon } from 'src/styling/icons/button/authorize/white.svg'
import { ReactComponent as AuthorizeIcon } from 'src/styling/icons/button/authorize/zodiac.svg'
import { ReactComponent as RejectReversedIcon } from 'src/styling/icons/button/cancel/white.svg'
import { ReactComponent as RejectIcon } from 'src/styling/icons/button/cancel/zodiac.svg'
import { ReactComponent as EditReversedIcon } from 'src/styling/icons/button/edit/white.svg'
import { ReactComponent as EditIcon } from 'src/styling/icons/button/edit/zodiac.svg'

import { propertyCardStyles } from './PropertyCard.styles'

const useStyles = makeStyles(propertyCardStyles)

const OVERRIDE_PENDING = 'automatic'
const OVERRIDE_AUTHORIZED = 'verified'
const OVERRIDE_REJECTED = 'blocked'

const PropertyCard = memo(
  ({
    className,
    contentClassName,
    title,
    state,
    authorize,
    reject,
    edit,
    confirm,
    isEditing,
    formName,
    children
  }) => {
    const classes = useStyles()

    const label1ClassNames = {
      [classes.label1]: true,
      [classes.label1Pending]: state === OVERRIDE_PENDING,
      [classes.label1Rejected]: state === OVERRIDE_REJECTED,
      [classes.label1Accepted]: state === OVERRIDE_AUTHORIZED
    }

    const AuthorizeButton = () => (
      <ActionButton
        className={classes.cardActionButton}
        color="secondary"
        Icon={AuthorizeIcon}
        InverseIcon={AuthorizeReversedIcon}
        onClick={() => authorize()}>
        Authorize
      </ActionButton>
    )

    const RejectButton = () => (
      <ActionButton
        className={classes.cardActionButton}
        color="secondary"
        Icon={RejectIcon}
        InverseIcon={RejectReversedIcon}
        onClick={() => reject()}>
        Reject
      </ActionButton>
    )

    const EditButton = () => (
      <ActionButton
        className={classes.cardActionButton}
        color="secondary"
        Icon={EditIcon}
        InverseIcon={EditReversedIcon}
        onClick={() => edit()}>
        Edit
      </ActionButton>
    )

    const ConfirmButton = () => (
      <ActionButton
        className={classes.cardActionButton}
        type="submit"
        form={formName}
        color="secondary"
        Icon={AuthorizeIcon}
        InverseIcon={AuthorizeReversedIcon}>
        Confirm
      </ActionButton>
    )

    const authorized =
      state === OVERRIDE_PENDING
        ? { label: 'Pending', type: 'neutral' }
        : state === OVERRIDE_REJECTED
        ? { label: 'Rejected', type: 'error' }
        : { label: 'Accepted', type: 'success' }

        console.log('authorized2', authorized);
        
    return (
      <Paper
        className={classnames(classes.propertyCard, className)}
        elevation={0}>
        <H3 className={classes.propertyCardTopRow}>{title}</H3>
        <div
          className={classnames(
            classes.propertyCardBottomRow,
            contentClassName
          )}>
          {state && (
            <div className={classnames(label1ClassNames)}>
              <MainStatus statuses={[authorized]} />
            </div>
          )}
          {children}
          <div className={classes.buttonsWrapper}>
            {authorize && state !== OVERRIDE_AUTHORIZED && AuthorizeButton()}
            {reject && state !== OVERRIDE_REJECTED && RejectButton()}
            {edit && !isEditing && EditButton()}
            {confirm && isEditing && ConfirmButton()}
          </div>
        </div>
      </Paper>
    )
  }
)

export {
  PropertyCard,
  OVERRIDE_PENDING,
  OVERRIDE_AUTHORIZED,
  OVERRIDE_REJECTED
}
