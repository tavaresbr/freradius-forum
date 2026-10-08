/**
 * Migration 025 — Gateway Grandstream GWN.
 *
 * - mikrotiks.tipo: a migration 019 criou ENUM('mikrotik','omada','unifi').
 *   Aqui fazemos MODIFY pra incluir 'grandstream' (ADD nao serve — a coluna ja
 *   existe; sem o MODIFY, INSERT com tipo='grandstream' trunca em strict mode).
 * - Colunas GWN Cloud (gwn_api_key/gwn_api_secret/gwn_network_id): usadas SO
 *   pelo monitoramento opcional (botao "Testar" / getStatus). O fluxo de
 *   liberacao e' External RADIUS puro e nao depende delas.
 *
 * Idempotente: detecta se o ENUM ja inclui grandstream e se as colunas ja
 * existem antes de alterar.
 */
const db = require("../db");

async function colExists(tabela, coluna) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return rows[0].n > 0;
}

async function enumInclui(tabela, coluna, valor) {
  const [rows] = await db.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return rows.length > 0 && String(rows[0].t).includes(`'${valor}'`);
}

async function up() {
  // 1. ENUM tipo: incluir 'grandstream'
  if (await enumInclui("mikrotiks", "tipo", "grandstream")) {
    console.log("025: tipo ja inclui 'grandstream'.");
  } else {
    await db.query(
      "ALTER TABLE mikrotiks MODIFY COLUMN tipo " +
      "ENUM('mikrotik','omada','unifi','grandstream') NOT NULL DEFAULT 'mikrotik'"
    );
    console.log("025: ENUM tipo atualizado com 'grandstream'.");
  }

  // 2. Colunas GWN Cloud (monitoramento opcional)
  const COLUNAS = [
    ["gwn_api_key", "VARCHAR(255) NULL DEFAULT NULL"],
    ["gwn_api_secret", "VARCHAR(255) NULL DEFAULT NULL"],
    ["gwn_network_id", "VARCHAR(100) NULL DEFAULT NULL"],
  ];
  for (const [col, ddl] of COLUNAS) {
    if (await colExists("mikrotiks", col)) {
      console.log(`025: ${col} ja existe.`);
      continue;
    }
    await db.query(`ALTER TABLE mikrotiks ADD COLUMN ${col} ${ddl}`);
    console.log(`025: ${col} adicionada.`);
  }

  console.log("025: concluida.");
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("025 falhou:", err);
    process.exit(1);
  });
