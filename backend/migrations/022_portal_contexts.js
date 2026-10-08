/**
 * Migration 022 — tabela portal_contexts.
 *
 * Guarda o contexto do redirect do captive portal por gateway nao-MikroTik
 * (Omada/UniFi). Esses vendors mandam parametros no redirect (apMac, ssidName,
 * radioId, site, target/targetPort, redirectUrl...) que sao OBRIGATORIOS na
 * hora de autorizar o cliente no controller — mas o redirect acontece minutos
 * antes da liberacao (o cliente ainda preenche cadastro/paga). Sem persistir,
 * o contexto se perde no primeiro hop e o authorize fica impossivel.
 *
 * Chave: (mikrotik_id, mac normalizado). Upsert a cada redirect; linhas com
 * mais de 48h sao podadas oportunisticamente pelo proprio salvarContextoPortal.
 */
const db = require("../db");

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS portal_contexts (
      id INT NOT NULL AUTO_INCREMENT,
      mikrotik_id INT NOT NULL,
      empresa_id INT DEFAULT NULL,
      mac VARCHAR(32) NOT NULL,
      vendor VARCHAR(20) NOT NULL DEFAULT 'mikrotik',
      contexto TEXT NOT NULL,
      criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_ctx_mikrotik_mac (mikrotik_id, mac),
      KEY idx_ctx_mac (mac)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("022: tabela portal_contexts criada (ou ja existia).");
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("022 falhou:", err);
    process.exit(1);
  });
