require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();

  try {
    console.log('=== Migration 005: VPN Peers ===\n');

    console.log('1. Criando tabela empresa_vpn_peers...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS empresa_vpn_peers (
        id INT NOT NULL AUTO_INCREMENT,
        empresa_id INT NOT NULL,
        wg_client_id VARCHAR(100) NOT NULL,
        nome VARCHAR(100) DEFAULT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_vpn_empresa (empresa_id),
        KEY idx_vpn_client (wg_client_id),
        CONSTRAINT fk_vpn_peers_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   Tabela empresa_vpn_peers criada.');

    console.log('\n=== Migration 005 concluída! ===');
  } catch (err) {
    console.error('Erro na migração:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
