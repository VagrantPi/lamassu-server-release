const db = require('./db')

// This migration was updated on v10.2
// it's from before 7.5 and we update one major version at a time
// Data migration was removed, keeping only the schema update
exports.up = function (next) {
  const sql = [
    'alter table devices add column name text',
    'alter table devices alter column name set not null'
  ]

  return db.multi(sql, next)
}

exports.down = function (next) {
  const sql = ['alter table devices drop column name']
  db.multi(sql, next)
}
