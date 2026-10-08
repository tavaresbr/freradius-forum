require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log('=== Fase 1: Multi-Tenant Migration ===\n');

    // 1. Criar tabela empresas
    console.log('1. Criando tabela empresas...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS empresas (
        id INT NOT NULL AUTO_INCREMENT,
        nome VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        cnpj VARCHAR(20) DEFAULT NULL,
        email VARCHAR(255) NOT NULL,
        telefone VARCHAR(20) DEFAULT NULL,
        logo_url VARCHAR(500) DEFAULT NULL,
        ativo TINYINT(1) DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_slug (slug),
        KEY idx_ativo (ativo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 2. Criar tabela empresa_configs
    console.log('2. Criando tabela empresa_configs...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS empresa_configs (
        id INT NOT NULL AUTO_INCREMENT,
        empresa_id INT NOT NULL,
        config_type ENUM('mercadopago','efi','whatsapp') NOT NULL,
        config_json JSON NOT NULL,
        ativo TINYINT(1) DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_empresa_tipo (empresa_id, config_type),
        CONSTRAINT fk_empresa_configs FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 3. Inserir empresa padrão para dados existentes
    console.log('3. Inserindo empresa padrão...');
    const [[existingEmpresa]] = await conn.execute('SELECT id FROM empresas WHERE slug = ?', ['default']);
    if (!existingEmpresa) {
      await conn.execute(
        `INSERT INTO empresas (nome, slug, email) VALUES (?, ?, ?)`,
        ['Empresa Padrão', 'default', 'admin@empresa.com']
      );
    }
    const [[empresa]] = await conn.execute('SELECT id FROM empresas WHERE slug = ?', ['default']);
    const empresaId = empresa.id;
    console.log(`   Empresa padrão ID: ${empresaId}`);

    // 4. Adicionar empresa_id e role em admins
    console.log('4. Alterando tabela admins...');
    const [adminCols] = await conn.execute(`SHOW COLUMNS FROM admins LIKE 'empresa_id'`);
    if (adminCols.length === 0) {
      await conn.execute(`ALTER TABLE admins ADD COLUMN empresa_id INT DEFAULT NULL AFTER id`);
      await conn.execute(`ALTER TABLE admins ADD COLUMN nome VARCHAR(255) DEFAULT NULL AFTER email`);
      await conn.execute(`ALTER TABLE admins ADD COLUMN role ENUM('super_admin','owner','manager','operator') DEFAULT 'operator' AFTER nome`);
      await conn.execute(`ALTER TABLE admins ADD KEY idx_admins_empresa (empresa_id)`);
      await conn.execute(`UPDATE admins SET empresa_id = ?, role = 'owner' LIMIT 1`, [empresaId]);
      await conn.execute(`UPDATE admins SET empresa_id = ? WHERE empresa_id IS NULL`, [empresaId]);
    }

    // 5. Adicionar empresa_id em mikrotiks
    console.log('5. Alterando tabela mikrotiks...');
    const [mtkCols] = await conn.execute(`SHOW COLUMNS FROM mikrotiks LIKE 'empresa_id'`);
    if (mtkCols.length === 0) {
      await conn.execute(`ALTER TABLE mikrotiks ADD COLUMN empresa_id INT NOT NULL DEFAULT ${empresaId} AFTER id`);
      await conn.execute(`ALTER TABLE mikrotiks ADD KEY idx_mikrotik_empresa (empresa_id)`);
      await conn.execute(`UPDATE mikrotiks SET empresa_id = ?`, [empresaId]);
    }

    // 6. Adicionar empresa_id em planos
    console.log('6. Alterando tabela planos...');
    const [planCols] = await conn.execute(`SHOW COLUMNS FROM planos LIKE 'empresa_id'`);
    if (planCols.length === 0) {
      await conn.execute(`ALTER TABLE planos ADD COLUMN empresa_id INT NOT NULL DEFAULT ${empresaId} AFTER id`);
      await conn.execute(`ALTER TABLE planos ADD KEY idx_planos_empresa (empresa_id)`);
      await conn.execute(`UPDATE planos SET empresa_id = ?`, [empresaId]);
    }

    // 7. Adicionar empresa_id em pagamentos
    console.log('7. Alterando tabela pagamentos...');
    const [pagCols] = await conn.execute(`SHOW COLUMNS FROM pagamentos LIKE 'empresa_id'`);
    if (pagCols.length === 0) {
      await conn.execute(`ALTER TABLE pagamentos ADD COLUMN empresa_id INT DEFAULT NULL AFTER id`);
      await conn.execute(`ALTER TABLE pagamentos ADD KEY idx_pagamentos_empresa (empresa_id)`);
      await conn.execute(`UPDATE pagamentos SET empresa_id = ?`, [empresaId]);
    }

    // 8. Adicionar empresa_id em portais
    console.log('8. Alterando tabela portais...');
    const [portalCols] = await conn.execute(`SHOW COLUMNS FROM portais LIKE 'empresa_id'`);
    if (portalCols.length === 0) {
      await conn.execute(`ALTER TABLE portais ADD COLUMN empresa_id INT DEFAULT NULL`);
      await conn.execute(`ALTER TABLE portais ADD KEY idx_portais_empresa (empresa_id)`);
      await conn.execute(`UPDATE portais SET empresa_id = ?`, [empresaId]);
    }

    // 9. Adicionar empresa_id em lgpd_logins
    console.log('9. Alterando tabela lgpd_logins...');
    const [lgpdCols] = await conn.execute(`SHOW COLUMNS FROM lgpd_logins LIKE 'empresa_id'`);
    if (lgpdCols.length === 0) {
      await conn.execute(`ALTER TABLE lgpd_logins ADD COLUMN empresa_id INT DEFAULT NULL AFTER id`);
      await conn.execute(`ALTER TABLE lgpd_logins ADD KEY idx_lgpd_empresa (empresa_id)`);
      await conn.execute(`UPDATE lgpd_logins SET empresa_id = ?`, [empresaId]);
    }

    // 10. Adicionar empresa_id em radius_users
    console.log('10. Alterando tabela radius_users...');
    const [ruCols] = await conn.execute(`SHOW COLUMNS FROM radius_users LIKE 'empresa_id'`);
    if (ruCols.length === 0) {
      await conn.execute(`ALTER TABLE radius_users ADD COLUMN empresa_id INT DEFAULT NULL AFTER id`);
      await conn.execute(`ALTER TABLE radius_users ADD KEY idx_radius_users_empresa (empresa_id)`);
      await conn.execute(`UPDATE radius_users SET empresa_id = ?`, [empresaId]);
    }

    // 11. Adicionar empresa_id em nas
    console.log('11. Alterando tabela nas...');
    const [nasCols] = await conn.execute(`SHOW COLUMNS FROM nas LIKE 'empresa_id'`);
    if (nasCols.length === 0) {
      await conn.execute(`ALTER TABLE nas ADD COLUMN empresa_id INT DEFAULT NULL`);
      await conn.execute(`ALTER TABLE nas ADD KEY idx_nas_empresa (empresa_id)`);
      await conn.execute(`UPDATE nas SET empresa_id = ?`, [empresaId]);
    }

    // 12. Migrar config_mercadopago para empresa_configs
    console.log('12. Migrando config_mercadopago...');
    const [mpConfigs] = await conn.execute('SELECT * FROM config_mercadopago ORDER BY id DESC LIMIT 1');
    if (mpConfigs.length > 0) {
      const mp = mpConfigs[0];
      const configJson = JSON.stringify({
        public_key: mp.public_key || '',
        access_token: mp.access_token || '',
        client_id: mp.client_id || '',
        client_secret: mp.client_secret || '',
        webhook_secret: mp.webhook_secret || ''
      });
      await conn.execute(
        `INSERT INTO empresa_configs (empresa_id, config_type, config_json) VALUES (?, 'mercadopago', ?)
         ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)`,
        [empresaId, configJson]
      );
    }

    // 13. Migrar efi_config para empresa_configs
    console.log('13. Migrando efi_config...');
    const [efiConfigs] = await conn.execute('SELECT * FROM efi_config ORDER BY id DESC LIMIT 1');
    if (efiConfigs.length > 0) {
      const efi = efiConfigs[0];
      const configJson = JSON.stringify({
        client_id: efi.client_id || '',
        client_secret: efi.client_secret || '',
        chave_pix: efi.chave_pix || '',
        ambiente: efi.ambiente || 'sandbox',
        certificado_nome: efi.certificado_nome || ''
      });
      await conn.execute(
        `INSERT INTO empresa_configs (empresa_id, config_type, config_json) VALUES (?, 'efi', ?)
         ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)`,
        [empresaId, configJson]
      );
    }

    await conn.commit();
    console.log('\n=== Migração concluída com sucesso! ===');

  } catch (err) {
    await conn.rollback();
    console.error('Erro na migração:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
