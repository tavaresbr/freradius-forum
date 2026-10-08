const db = require("../../db");

async function getConfig(empresaId) {
  const [rows] = await db.execute("SELECT * FROM efi_config WHERE empresa_id = ? LIMIT 1", [empresaId]);
  return rows[0] || null;
}

async function saveConfig(config, empresaId) {
  const { client_id, client_secret, chave_pix, ambiente, certificado_nome } = config;
  const existing = await getConfig(empresaId);

  if (existing) {
    await db.execute(
      `UPDATE efi_config SET client_id = ?, client_secret = ?, chave_pix = ?, ambiente = ?, certificado_nome = ? WHERE empresa_id = ?`,
      [client_id, client_secret, chave_pix, ambiente, certificado_nome, empresaId]
    );
  } else {
    await db.execute(
      `INSERT INTO efi_config (empresa_id, client_id, client_secret, chave_pix, ambiente, certificado_nome) VALUES (?, ?, ?, ?, ?, ?)`,
      [empresaId, client_id, client_secret, chave_pix, ambiente, certificado_nome]
    );
  }
}

module.exports = { getConfig, saveConfig };
