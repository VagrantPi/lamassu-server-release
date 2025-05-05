const addRWBytes = () => (req, res, next) => {
  const handle = () => {
    res.removeListener('finish', handle)
    res.removeListener('close', handle)
    res.bytesRead = req.connection.bytesRead
    res.bytesWritten = req.connection.bytesWritten
  }

  res.on('finish', handle)
  res.on('close', handle)

  next()
}

module.exports = addRWBytes
