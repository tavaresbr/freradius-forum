require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const DEFAULT_TEMPLATE = `✅ *Acesso liberado!*

Olá {{nome}}! Seu plano *{{plano}}* foi ativado.

👤 Usuário: {{username}}
🔑 Senha: {{password}}
⏱ Duração: {{duracao}} min

Caso não tenha conectado automaticamente, clique no link abaixo:
{{login_url}}`;

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
    console.log('=== Migration 012: WhatsApp notification per portal ===\n');

    // 1. portais.whatsapp_enabled + whatsapp_template
    console.log('1. Colunas whatsapp em portais...');
    if (!(await colExists(conn, 'portais', 'whatsapp_enabled'))) {
      await conn.execute(`ALTER TABLE portais ADD COLUMN whatsapp_enabled TINYINT(1) DEFAULT 0`);
      console.log('   -> whatsapp_enabled adicionada');
    } else console.log('   -> whatsapp_enabled ja existe');

    if (!(await colExists(conn, 'portais', 'whatsapp_template'))) {
      await conn.execute(`ALTER TABLE portais ADD COLUMN whatsapp_template TEXT NULL`);
      console.log('   -> whatsapp_template adicionada');
    } else console.log('   -> whatsapp_template ja existe');

    // 2. pagamentos.portal_id + telefone
    console.log('\n2. Colunas em pagamentos...');
    if (!(await colExists(conn, 'pagamentos', 'portal_id'))) {
      await conn.execute(`ALTER TABLE pagamentos ADD COLUMN portal_id INT NULL`);
      console.log('   -> portal_id adicionada');
    } else console.log('   -> portal_id ja existe');

    if (!(await colExists(conn, 'pagamentos', 'telefone'))) {
      await conn.execute(`ALTER TABLE pagamentos ADD COLUMN telefone VARCHAR(20) NULL`);
      console.log('   -> telefone adicionada');
    } else console.log('   -> telefone ja existe');

    // 3. whatsapp_logs
    console.log('\n3. Tabela whatsapp_logs...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NOT NULL,
        portal_id INT NULL,
        telefone VARCHAR(20) NULL,
        mensagem TEXT NULL,
        contexto_tipo VARCHAR(50) NULL,
        referencia_id INT NULL,
        status ENUM('ok','erro','skipped') NOT NULL,
        erro_msg TEXT NULL,
        skip_motivo VARCHAR(50) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wa_logs_empresa_data (empresa_id, criado_em),
        INDEX idx_wa_logs_status (status),
        INDEX idx_wa_logs_portal (portal_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   -> whatsapp_logs criada (ou ja existia)');

    // 4. Seed template default nos portais existentes que estao null
    console.log('\n4. Seed template default em portais existentes...');
    const [upd] = await conn.execute(
      `UPDATE portais SET whatsapp_template = ? WHERE whatsapp_template IS NULL OR whatsapp_template = ''`,
      [DEFAULT_TEMPLATE]
    );
    console.log(`   -> ${upd.affectedRows} portais atualizados`);

    await conn.commit();
    console.log('\n=== Migration 012 concluida com sucesso! ===');
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
