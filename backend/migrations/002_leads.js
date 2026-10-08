require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NOT NULL,
        nome VARCHAR(255),
        email VARCHAR(255),
        telefone VARCHAR(50),
        cpf VARCHAR(20),
        mac VARCHAR(50),
        ip VARCHAR(50),
        status ENUM('novo','contactado','convertido','descartado') DEFAULT 'novo',
        origem ENUM('portal','lgpd','manual') DEFAULT 'portal',
        observacoes TEXT,
        lgpd_aceite TINYINT(1) DEFAULT 0,
        lgpd_aceite_em TIMESTAMP NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Migration 002_leads: tabela leads criada com sucesso');
    process.exit(0);
  } catch (err) {
    console.error('Erro na migration 002_leads:', err);
    process.exit(1);
  }
}

migrate();
