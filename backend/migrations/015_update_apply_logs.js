require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 015: Update Apply Logs ===\n');

    console.log('Criando tabela update_apply_logs...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS update_apply_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        update_id VARCHAR(20) NOT NULL,
        step VARCHAR(50) NOT NULL,
        status ENUM('info','ok','erro') NOT NULL DEFAULT 'info',
        message TEXT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_update_id (update_id),
        INDEX idx_criado_em (criado_em)
      )
    `);

    console.log('\nMigration 015 concluida com sucesso!');
  } catch (err) {
    console.error('Erro na migration 015:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
