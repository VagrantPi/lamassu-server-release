import { useQuery, useMutation } from '@apollo/react-hooks'
import { makeStyles } from '@material-ui/core'
import gql from 'graphql-tag'
import * as R from 'ramda'
import React, { useState } from 'react'

import TitleSection from 'src/components/layout/TitleSection'
import { ReactComponent as ReverseListingViewIcon } from 'src/styling/icons/circle buttons/listing-view/white.svg'
import { ReactComponent as ListingViewIcon } from 'src/styling/icons/circle buttons/listing-view/zodiac.svg'
import { ReactComponent as OverrideLabelIcon } from 'src/styling/icons/status/spring2.svg'
import { fromNamespace, toNamespace, namespaces } from 'src/utils/config'

import CommissionsDetails from './components/CommissionsDetails'
import CommissionsList from './components/CommissionsList'

const styles = {
  listViewButton: {
    marginLeft: 4
  }
}

const useStyles = makeStyles(styles)

const GET_DATA = gql`
  query getData {
    config
    cryptoCurrencies {
      code
      display
    }
    machines {
      name
      deviceId
    }
  }
`

const SAVE_CONFIG = gql`
  mutation Save($config: JSONObject) {
    saveConfig(config: $config)
  }
`
const removeCoinFromOverride = crypto => override =>
  R.mergeRight(override, {
    cryptoCurrencies: R.without([crypto], override.cryptoCurrencies)
  })

const Commissions = ({ name: SCREEN_KEY }) => {
  const classes = useStyles()
  const [showMachines, setShowMachines] = useState(false)
  const [error, setError] = useState(null)
  const { data, loading } = useQuery(GET_DATA)
  const [saveConfig] = useMutation(SAVE_CONFIG, {
    refetchQueries: () => ['getData'],
    onError: error => setError(error)
  })

  const config = data?.config && fromNamespace(SCREEN_KEY)(data.config)
  const localeConfig =
    data?.config && fromNamespace(namespaces.LOCALE)(data.config)

  const currency = R.prop('fiatCurrency')(localeConfig)
  const overrides = R.prop('overrides')(config)

  const save = it => {
    const config = toNamespace(SCREEN_KEY)(it.commissions[0])
    return saveConfig({ variables: { config } })
  }

  const saveOverrides = it => {
    const config = toNamespace(SCREEN_KEY)(it)
    setError(null)
    return saveConfig({ variables: { config } })
  }

  const saveOverridesFromList = it => (_, override) => {
    const cryptoOverridden = R.path(['cryptoCurrencies', 0], override)

    const sameMachine = R.eqProps('machine', override)
    const notSameOverride = it => !R.eqProps('cryptoCurrencies', override, it)

    const filterMachine = R.filter(R.both(sameMachine, notSameOverride))
    const removeCoin = removeCoinFromOverride(cryptoOverridden)

    const machineOverrides = R.map(removeCoin)(filterMachine(it))

    const overrides = machineOverrides.concat(
      R.filter(it => !sameMachine(it), it)
    )

    const config = {
      commissions_overrides: R.prepend(override, overrides)
    }

    return saveConfig({ variables: { config } })
  }

  const labels = showMachines
    ? [
        {
          label: 'Override value',
          icon: <OverrideLabelIcon />
        }
      ]
    : []

  return (
    <>
      <TitleSection
        title="Commissions"
        labels={labels}
        buttons={[
          {
            text: 'List view',
            icon: ListingViewIcon,
            inverseIcon: ReverseListingViewIcon,
            toggle: setShowMachines
          }
        ]}
        iconClassName={classes.listViewButton}
      />

      {!showMachines && !loading && (
        <CommissionsDetails
          config={config}
          locale={localeConfig}
          currency={currency}
          data={data}
          error={error}
          save={save}
          saveOverrides={saveOverrides}
          classes={classes}
        />
      )}
      {showMachines && !loading && (
        <CommissionsList
          config={config}
          localeConfig={localeConfig}
          currency={currency}
          data={data}
          error={error}
          saveOverrides={saveOverridesFromList(overrides)}
        />
      )}
    </>
  )
}

export default Commissions
