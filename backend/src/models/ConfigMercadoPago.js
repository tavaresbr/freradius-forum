const pool = require("../../db");

async function getConfig(empresaId) {
  const [rows] = await pool.query("SELECT * FROM config_mercadopago WHERE empresa_id = ? LIMIT 1", [empresaId]);
  return rows[0] || null;
}

async function saveConfig({ public_key, access_token, client_id, client_secret, webhook_secret }, empresaId) {
  const configAtual = await getConfig(empresaId);

  if (configAtual) {
    await pool.query(`
      UPDATE config_mercadopago
      SET public_key = ?, access_token = ?, client_id = ?, client_secret = ?, webhook_secret = ?
      WHERE empresa_id = ?
    `, [public_key, access_token, client_id, client_secret, webhook_secret, empresaId]);
  } else {
    await pool.query(`
      INSERT INTO config_mercadopago (empresa_id, public_key, access_token, client_id, client_secret, webhook_secret)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [empresaId, public_key, access_token, client_id, client_secret, webhook_secret]);
  }
}
module.exports = { getConfig, saveConfig };
