require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function colExists(conn, table, col) {
  const [rows] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, col]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    console.log('=== Migration 013: PIX trial (acesso free 5min) ===\n');

    console.log('1. Coluna pagamentos.trial_liberado_em...');
    if (!(await colExists(conn, 'pagamentos', 'trial_liberado_em'))) {
      await conn.execute(`ALTER TABLE pagamentos ADD COLUMN trial_liberado_em TIMESTAMP NULL`);
      console.log('   -> coluna adicionada');
    } else {
      console.log('   -> ja existe');
    }

    // Indice pra acelerar a query de "ultimo trial por CPF nas ultimas 24h"
    console.log('\n2. Indice idx_pagamentos_cpf_trial...');
    const [idx] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pagamentos' AND INDEX_NAME = 'idx_pagamentos_cpf_trial'`
    );
    if (idx[0].cnt === 0) {
      await conn.execute(`CREATE INDEX idx_pagamentos_cpf_trial ON pagamentos (cpf, trial_liberado_em)`);
      console.log('   -> indice criado');
    } else {
      console.log('   -> ja existe');
    }

    await conn.commit();
    console.log('\n=== Migration 013 concluida com sucesso! ===');
  } catch (err) {
    await conn.rollback();
    console.error('Erro na migration:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
