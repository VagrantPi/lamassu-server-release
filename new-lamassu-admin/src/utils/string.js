import * as R from 'ramda'

const formatLong = value => {
  if (!value || value.length <= 20) return value

  return `${value.slice(0, 8)}(...)${value.slice(
    value.length - 8,
    value.length
  )}`
}

const toFirstLower = R.compose(R.join(''), R.adjust(0, R.toLower))

const toFirstUpper = R.compose(R.join(''), R.adjust(0, R.toUpper))

const onlyFirstToUpper = R.compose(toFirstUpper, R.toLower)

const splitOnUpper = R.compose(
  R.split(' '),
  R.replace(/([A-Z])/g, ' $1'),
  toFirstLower
)
const startCase = R.compose(R.join(' '), R.map(onlyFirstToUpper), splitOnUpper)

const sentenceCase = R.compose(onlyFirstToUpper, R.join(' '), splitOnUpper)

const singularOrPlural = (amount, singularStr, pluralStr) =>
  parseInt(amount) === 1 ? singularStr : pluralStr

export {
  startCase,
  onlyFirstToUpper,
  formatLong,
  singularOrPlural,
  sentenceCase
}
