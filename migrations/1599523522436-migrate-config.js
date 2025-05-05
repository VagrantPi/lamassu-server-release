// This migration was actually a config update
// it's from before 7.5 and we update one major version at a time
// v10.2 is good enough to deprecate it
// file still has to exist so that the migration tool doesn't throw an error
module.exports.up = function (next) {
  next()
}

module.exports.down = function (next) {
  next()
}
