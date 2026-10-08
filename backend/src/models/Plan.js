const db = require('../../db')

const getAll = async () => {
  const [rows] = await db.execute('SELECT * FROM plans ORDER BY id DESC')
  return rows
}

const create = async (data) => {
  const { name, price, time_minutes, download, upload, active } = data
  await db.execute(
    'INSERT INTO plans (name, price, time_minutes, download, upload, active) VALUES (?, ?, ?, ?, ?, ?)',
    [name, price, time_minutes, download, upload, active]
  )
}

module.exports = { getAll, create }
