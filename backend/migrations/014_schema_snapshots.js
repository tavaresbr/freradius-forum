require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 014: Schema Snapshots ===\n');

    console.log('Criando tabela schema_snapshots...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_snapshots (
        table_name VARCHAR(128) PRIMARY KEY,
        columns_json LONGTEXT NOT NULL,
        indexes_json LONGTEXT NOT NULL,
        create_sql LONGTEXT NULL,
        snapshot_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('\nMigration 014 concluida com sucesso!');
  } catch (err) {
    console.error('Erro na migration 014:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
