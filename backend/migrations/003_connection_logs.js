require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log('=== Fase 3: Marco Civil da Internet - Connection Logs ===\n');

    // 1. Criar tabela connection_logs
    console.log('1. Criando tabela connection_logs...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS connection_logs (
        id BIGINT NOT NULL AUTO_INCREMENT,
        empresa_id INT NOT NULL,
        username VARCHAR(64) NOT NULL,
        cpf VARCHAR(14) DEFAULT NULL,
        mac VARCHAR(50) NOT NULL,
        ip_atribuido VARCHAR(15) NOT NULL,
        nas_ip VARCHAR(15) NOT NULL,
        inicio_conexao DATETIME NOT NULL,
        fim_conexao DATETIME DEFAULT NULL,
        bytes_entrada BIGINT DEFAULT 0,
        bytes_saida BIGINT DEFAULT 0,
        duracao_segundos INT DEFAULT 0,
        motivo_desconexao VARCHAR(32) DEFAULT NULL,
        auth_result VARCHAR(32) DEFAULT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_empresa_id (empresa_id),
        INDEX idx_cpf (cpf),
        INDEX idx_mac (mac),
        INDEX idx_ip_atribuido (ip_atribuido),
        INDEX idx_periodo (inicio_conexao, fim_conexao),
        INDEX idx_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   -> Tabela connection_logs criada.');

    // 2. Criar tabela de controle de sync
    console.log('2. Criando tabela connection_logs_sync...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS connection_logs_sync (
        id INT NOT NULL AUTO_INCREMENT,
        last_synced_radacctid BIGINT DEFAULT 0,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Inserir registro inicial se não existir
    const [syncRows] = await conn.execute('SELECT COUNT(*) as cnt FROM connection_logs_sync');
    if (syncRows[0].cnt === 0) {
      await conn.execute('INSERT INTO connection_logs_sync (last_synced_radacctid) VALUES (0)');
      console.log('   -> Registro inicial inserido em connection_logs_sync.');
    }
    console.log('   -> Tabela connection_logs_sync criada.');

    await conn.commit();
    console.log('\n=== Migration concluida com sucesso! ===');
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
