require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

/**
 * Migration 019 (Fase 4A): da' semantica de "gateways" a tabela `mikrotiks`.
 *
 * Adiciona colunas para suportar Omada (TP-Link) e UniFi (Ubiquiti) alem do
 * MikroTik. A tabela mantem o nome (renomear e' arriscado) — no codigo tratamos
 * como gateways. Registros existentes ficam com tipo='mikrotik' (default), sem
 * mudanca de comportamento.
 *
 * Idempotente: so adiciona coluna que ainda nao existe.
 */

async function colExists(conn, table, col) {
  const [rows] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, col]
  );
  return rows[0].cnt > 0;
}

// coluna -> DDL (sem o "ADD COLUMN", montado no loop)
const COLUNAS = [
  ["tipo", "ENUM('mikrotik','omada','unifi') NOT NULL DEFAULT 'mikrotik'"],
  ["controller_url", "VARCHAR(255) NULL DEFAULT NULL"],
  ["controller_site", "VARCHAR(120) NULL DEFAULT NULL"],
  ["omadac_id", "VARCHAR(120) NULL DEFAULT NULL"],
  ["api_user", "VARCHAR(191) NULL DEFAULT NULL"],
  ["api_pass", "VARCHAR(255) NULL DEFAULT NULL"],
  ["api_key", "VARCHAR(255) NULL DEFAULT NULL"],
  ["verify_tls", "TINYINT(1) NOT NULL DEFAULT 1"],
];

async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 019: colunas de gateway em mikrotiks ===\n');

    for (const [col, ddl] of COLUNAS) {
      if (await colExists(conn, 'mikrotiks', col)) {
        console.log(`   -> ${col} ja existe`);
        continue;
      }
      await conn.execute(`ALTER TABLE mikrotiks ADD COLUMN ${col} ${ddl}`);
      console.log(`   -> ${col} adicionada`);
    }

    console.log('\n=== Migration 019 concluida com sucesso! ===');
  } catch (err) {
    console.error('Erro na migration 019:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
