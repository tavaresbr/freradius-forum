require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log('=== Migration 011: Campanhas (campanha_itens + portais.campanha_ativa_id) ===\n');

    // 1. CREATE TABLE campanhas
    console.log('1. Criando tabela campanhas...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS campanhas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NOT NULL,
        nome VARCHAR(150) NOT NULL,
        descricao TEXT NULL,
        ativo TINYINT(1) DEFAULT 1,
        views INT DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_campanhas_empresa
          FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
        INDEX idx_campanhas_empresa (empresa_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   -> Tabela campanhas criada (ou ja existia).');

    // 2. CREATE TABLE campanha_itens
    console.log('\n2. Criando tabela campanha_itens...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS campanha_itens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campanha_id INT NOT NULL,
        empresa_id INT NOT NULL,
        tipo ENUM('imagem','video') NOT NULL,
        ordem INT DEFAULT 0,
        arquivo_url VARCHAR(500) NOT NULL,
        duracao_segundos INT DEFAULT 5,
        titulo VARCHAR(200) NULL,
        link_destino VARCHAR(500) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_itens_campanha
          FOREIGN KEY (campanha_id) REFERENCES campanhas(id) ON DELETE CASCADE,
        CONSTRAINT fk_itens_empresa
          FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
        INDEX idx_itens_campanha_ordem (campanha_id, ordem),
        INDEX idx_itens_empresa (empresa_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   -> Tabela campanha_itens criada (ou ja existia).');

    // 3. ALTER TABLE portais - add campanha_ativa_id if not exists
    console.log('\n3. Verificando coluna campanha_ativa_id em portais...');
    const [columns] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portais' AND COLUMN_NAME = 'campanha_ativa_id'"
    );

    if (columns[0].cnt === 0) {
      await conn.execute(`
        ALTER TABLE portais
          ADD COLUMN campanha_ativa_id INT NULL,
          ADD CONSTRAINT fk_portal_campanha
            FOREIGN KEY (campanha_ativa_id) REFERENCES campanhas(id) ON DELETE SET NULL
      `);
      console.log('   -> Coluna campanha_ativa_id adicionada a portais.');
    } else {
      console.log('   -> Coluna campanha_ativa_id ja existe em portais, pulando.');
    }

    await conn.commit();
    console.log('\n=== Migration 011 concluida com sucesso! ===');
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
