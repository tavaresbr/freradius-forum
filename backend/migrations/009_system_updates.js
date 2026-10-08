require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    console.log('=== Migration 009: System Updates & Backups ===\n');

    console.log('Criando tabela applied_updates...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS applied_updates (
        id VARCHAR(20) PRIMARY KEY,
        descricao TEXT,
        aplicado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Criando tabela system_backups...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS system_backups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        update_id VARCHAR(20) NULL,
        tipo ENUM('pre_update','manual') DEFAULT 'manual',
        db_dump_path VARCHAR(500),
        files_zip_path VARCHAR(500),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.commit();
    console.log('\nMigration 009 concluida com sucesso!');
  } catch (err) {
    await conn.rollback();
    console.error('Erro na migration 009:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
