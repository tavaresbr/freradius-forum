require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    console.log('=== Migration 010: Update Publish (Servidor Mestre) ===\n');

    console.log('Criando tabela updates...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS updates (
        id VARCHAR(20) PRIMARY KEY,
        descricao TEXT,
        changelog TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Criando tabela update_files...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS update_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        update_id VARCHAR(20),
        file_path VARCHAR(500),
        file_content LONGTEXT,
        action ENUM('create','update','delete') DEFAULT 'update',
        FOREIGN KEY (update_id) REFERENCES updates(id) ON DELETE CASCADE
      )
    `);

    console.log('Criando tabela update_migrations...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS update_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        update_id VARCHAR(20),
        sql_content TEXT,
        ordem INT DEFAULT 1,
        FOREIGN KEY (update_id) REFERENCES updates(id) ON DELETE CASCADE
      )
    `);

    console.log('Criando tabela file_snapshots...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS file_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_path VARCHAR(500),
        md5_hash VARCHAR(32),
        snapshot_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_file_path (file_path)
      )
    `);

    await conn.commit();
    console.log('\nMigration 010 concluida com sucesso!');
  } catch (err) {
    await conn.rollback();
    console.error('Erro na migration 010:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
