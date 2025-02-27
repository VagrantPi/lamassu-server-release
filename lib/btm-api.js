const axios = require('axios')


const BTM_API_URL = process.env.BTM_API_URL
const BTM_API_KEY = process.env.BTM_API_KEY

function fetchIdNumber (customerId) {
  return axios.get(`${BTM_API_URL}/api/btm/id_number?customer_id=${customerId}`, {
    headers: {
      token: BTM_API_KEY
    }
  })
  .then(response => {
    return response.data.data
  })
}

module.exports = { fetchIdNumber }
