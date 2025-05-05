import React from 'react'
import { Td } from 'src/components/fake-table/Table'
import StripesSvg from 'src/styling/icons/stripes.svg?react'

const Stripes = ({ width }) => (
  <Td width={width}>
    <StripesSvg />
  </Td>
)

export default Stripes
