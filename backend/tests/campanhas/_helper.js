require('dotenv').config({ path: __dirname + '/../../.env' });

const db   = require('../../db');
const jwt  = require('jsonwebtoken');

/**
 * Insert a test empresa with a random slug and return { id, slug }.
 */
async function criarEmpresaTeste(nome) {
  const slug = 'test-' + Math.random().toString(36).slice(2, 10);
  const nomeFinal = nome || ('Empresa Teste ' + slug);
  const [result] = await db.execute(
    `INSERT INTO empresas (nome, slug, email, ativo) VALUES (?, ?, ?, 1)`,
    [nomeFinal, slug, slug + '@test.local']
  );
  return { id: result.insertId, slug };
}

/**
 * Delete a test empresa by id. CASCADE removes campanhas, portais, etc.
 */
async function limparEmpresa(empresaId) {
  await db.execute('DELETE FROM empresas WHERE id = ?', [empresaId]);
}

/**
 * Build a JWT that satisfies:
 *  - auth.js:     jwt.verify → req.user = decoded
 *  - tenant.js:   req.user.empresa_id for non-super_admin roles
 *  - checkPermissao: if role is 'owner', admin_grupos check returns 0 → bypass
 *
 * The payload must include:
 *   id          — used by checkPermissao to query admin_grupos
 *   empresa_id  — used by tenant.js
 *   role        — used by tenant.js and checkPermissao bypass logic
 *   email       — for completeness
 *
 * We use id = 0 (a non-existent admin_id) so admin_grupos COUNT = 0 → full access.
 */
function tokenFor(empresaId, role) {
  const payload = {
    id:         0,
    empresa_id: empresaId,
    role:       role || 'owner',
    email:      'test@test.local',
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Simple assertion helper.
 */
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

module.exports = { db, criarEmpresaTeste, limparEmpresa, tokenFor, assert };
