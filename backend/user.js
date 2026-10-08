// backend/user.js
// Uso: node user.js [email] [password]
// Exemplo: node user.js admin@empresa.com minhaSenha123
require('dotenv').config()

const bcrypt = require('bcryptjs')
const db = require('./db')

const email = process.argv[2] || 'admin@empresa.com'
const password = process.argv[3]

if (!password) {
  console.error('Uso: node user.js <email> <senha>')
  console.error('Exemplo: node user.js admin@empresa.com minhaSenha123')
  process.exit(1)
}

async function criarAdmin() {
  const hash = await bcrypt.hash(password, 10)
  await db.execute('INSERT INTO admins (email, password) VALUES (?, ?)', [email, hash])
  console.log(`Admin criado: ${email}`)
  process.exit(0)
}

criarAdmin().catch(err => {
  console.error('Erro ao criar admin:', err)
  process.exit(1)
})
