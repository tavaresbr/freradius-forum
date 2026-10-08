require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log('=== Fase 4: Enhanced Portal System - Templates ===\n');

    // 1. ALTER TABLE portais - add new columns if not exist
    console.log('1. Adicionando colunas ao portais...');
    const [columns] = await conn.execute("SHOW COLUMNS FROM portais");
    const existingCols = columns.map(c => c.Field);

    const newCols = [
      { name: 'template_id', sql: "ADD COLUMN template_id INT DEFAULT NULL" },
      { name: 'custom_css', sql: "ADD COLUMN custom_css TEXT DEFAULT NULL" },
      { name: 'logo_url', sql: "ADD COLUMN logo_url VARCHAR(500) DEFAULT NULL" },
      { name: 'cor_primaria', sql: "ADD COLUMN cor_primaria VARCHAR(7) DEFAULT '#3B82F6'" },
      { name: 'cor_fundo', sql: "ADD COLUMN cor_fundo VARCHAR(7) DEFAULT '#0f111a'" },
      { name: 'campos_cadastro', sql: "ADD COLUMN campos_cadastro JSON DEFAULT NULL" },
      { name: 'mostrar_planos', sql: "ADD COLUMN mostrar_planos TINYINT(1) DEFAULT 0" },
      { name: 'mostrar_lgpd', sql: "ADD COLUMN mostrar_lgpd TINYINT(1) DEFAULT 1" },
    ];

    for (const col of newCols) {
      if (!existingCols.includes(col.name)) {
        await conn.execute(`ALTER TABLE portais ${col.sql}`);
        console.log(`   -> Coluna ${col.name} adicionada.`);
      } else {
        console.log(`   -> Coluna ${col.name} ja existe, pulando.`);
      }
    }

    // 2. CREATE TABLE portal_templates
    console.log('\n2. Criando tabela portal_templates...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS portal_templates (
        id INT NOT NULL AUTO_INCREMENT,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        thumbnail_url VARCHAR(500) DEFAULT NULL,
        html_template LONGTEXT NOT NULL,
        css_template TEXT DEFAULT NULL,
        tipo ENUM('basico','planos','lgpd','completo') DEFAULT 'basico',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   -> Tabela portal_templates criada.');

    // 3. Insert default templates
    console.log('\n3. Inserindo templates padrão...');

    const [existingTemplates] = await conn.execute('SELECT COUNT(*) as cnt FROM portal_templates');
    if (existingTemplates[0].cnt === 0) {

      // Template 1: Portal Básico
      const htmlBasico = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WiFi Gratuito</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f111a 0%, #1a1d2e 50%, #0f111a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
    }
    .container {
      background: rgba(26, 29, 39, 0.95);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 20px;
      padding: 40px;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .logo-area { margin-bottom: 24px; }
    .logo-area .icon {
      width: 64px; height: 64px;
      background: linear-gradient(135deg, #3B82F6, #8B5CF6);
      border-radius: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 16px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 32px; }
    .btn-connect {
      display: block;
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      text-decoration: none;
    }
    .btn-connect:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(59,130,246,0.4); }
    .info { margin-top: 20px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-area">
      <div class="icon">&#x1F4F6;</div>
      <h1>WiFi Gratuito</h1>
      <p class="subtitle">Conecte-se a internet de forma rapida e segura</p>
    </div>
    <a href="/hotspot/auth?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)" class="btn-connect">
      Conectar Agora
    </a>
    <p class="info">MAC: $(mac) | IP: $(ip)</p>
  </div>
</body>
</html>`;

      // Template 2: Portal com Planos
      const htmlPlanos = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WiFi - Escolha seu Plano</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f111a 0%, #1a1d2e 50%, #0f111a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      width: 100%;
      text-align: center;
    }
    .header { margin-bottom: 40px; }
    .header .icon {
      width: 64px; height: 64px;
      background: linear-gradient(135deg, #3B82F6, #8B5CF6);
      border-radius: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 16px;
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: #94a3b8; font-size: 15px; }
    .plans {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .plan-card {
      background: rgba(26, 29, 39, 0.95);
      border: 1px solid rgba(59, 130, 246, 0.15);
      border-radius: 16px;
      padding: 30px 24px;
      transition: all 0.3s;
    }
    .plan-card:hover { border-color: #3B82F6; transform: translateY(-4px); box-shadow: 0 12px 30px rgba(59,130,246,0.2); }
    .plan-card.featured { border-color: #3B82F6; background: rgba(59,130,246,0.08); }
    .plan-card .badge {
      display: inline-block;
      background: #3B82F6;
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 12px;
    }
    .plan-name { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .plan-speed { font-size: 32px; font-weight: 800; color: #3B82F6; margin-bottom: 4px; }
    .plan-unit { font-size: 14px; color: #64748b; }
    .plan-price { font-size: 14px; color: #94a3b8; margin: 16px 0; }
    .plan-price strong { font-size: 24px; color: white; }
    .btn-plan {
      display: block;
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.3s;
    }
    .btn-plan:hover { box-shadow: 0 6px 20px rgba(59,130,246,0.4); }
    .free-access {
      background: rgba(26, 29, 39, 0.8);
      border: 1px solid rgba(100,116,139,0.2);
      border-radius: 12px;
      padding: 16px;
    }
    .free-access a {
      color: #94a3b8;
      text-decoration: underline;
      font-size: 14px;
    }
    .info { margin-top: 16px; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">&#x1F4F6;</div>
      <h1>Escolha seu Plano</h1>
      <p class="subtitle">Selecione o plano ideal para voce e navegue com velocidade</p>
    </div>
    <div class="plans">
      <div class="plan-card">
        <div class="plan-name">Basico</div>
        <div class="plan-speed">5</div>
        <div class="plan-unit">Mbps</div>
        <div class="plan-price"><strong>R$ 9,90</strong>/mes</div>
        <a href="/planos-cliente?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)" class="btn-plan">Assinar</a>
      </div>
      <div class="plan-card featured">
        <span class="badge">POPULAR</span>
        <div class="plan-name">Turbo</div>
        <div class="plan-speed">20</div>
        <div class="plan-unit">Mbps</div>
        <div class="plan-price"><strong>R$ 29,90</strong>/mes</div>
        <a href="/planos-cliente?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)" class="btn-plan">Assinar</a>
      </div>
      <div class="plan-card">
        <div class="plan-name">Ultra</div>
        <div class="plan-speed">50</div>
        <div class="plan-unit">Mbps</div>
        <div class="plan-price"><strong>R$ 49,90</strong>/mes</div>
        <a href="/planos-cliente?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)" class="btn-plan">Assinar</a>
      </div>
    </div>
    <div class="free-access">
      <a href="/hotspot/auth?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)&free=1">Acessar gratis com velocidade limitada</a>
    </div>
    <p class="info">MAC: $(mac) | IP: $(ip)</p>
  </div>
</body>
</html>`;

      // Template 3: Portal LGPD + Planos
      const htmlCompleto = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WiFi - Cadastro e Planos</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f111a 0%, #1a1d2e 50%, #0f111a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
      padding: 20px;
    }
    .container {
      max-width: 500px;
      width: 100%;
    }
    .card {
      background: rgba(26, 29, 39, 0.95);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 20px;
      padding: 36px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .header { text-align: center; margin-bottom: 28px; }
    .header .icon {
      width: 64px; height: 64px;
      background: linear-gradient(135deg, #3B82F6, #8B5CF6);
      border-radius: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 16px;
    }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { color: #94a3b8; font-size: 14px; }
    .step { display: none; }
    .step.active { display: block; }
    label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px; font-weight: 500; }
    input[type="text"], input[type="email"], input[type="tel"] {
      width: 100%;
      padding: 12px 14px;
      background: #0d1117;
      border: 1px solid rgba(100,116,139,0.3);
      border-radius: 10px;
      color: white;
      font-size: 14px;
      margin-bottom: 16px;
      outline: none;
      transition: border-color 0.3s;
    }
    input:focus { border-color: #3B82F6; }
    .lgpd-box {
      background: rgba(13, 17, 23, 0.8);
      border: 1px solid rgba(100,116,139,0.2);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 20px;
      font-size: 12px;
      color: #94a3b8;
      max-height: 120px;
      overflow-y: auto;
      line-height: 1.6;
    }
    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 20px;
    }
    .checkbox-row input[type="checkbox"] {
      margin-top: 2px;
      accent-color: #3B82F6;
    }
    .checkbox-row span { font-size: 13px; color: #94a3b8; }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #3B82F6, #2563EB);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      text-decoration: none;
      text-align: center;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(59,130,246,0.4); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-secondary {
      background: transparent;
      border: 1px solid rgba(100,116,139,0.3);
      color: #94a3b8;
      margin-top: 10px;
    }
    .btn-secondary:hover { background: rgba(100,116,139,0.1); box-shadow: none; }
    .plans-grid { display: grid; gap: 12px; margin-bottom: 20px; }
    .plan-option {
      background: #0d1117;
      border: 2px solid rgba(100,116,139,0.2);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .plan-option:hover, .plan-option.selected { border-color: #3B82F6; }
    .plan-option .left .name { font-weight: 600; font-size: 15px; }
    .plan-option .left .speed { color: #64748b; font-size: 13px; }
    .plan-option .price { font-size: 18px; font-weight: 700; color: #3B82F6; }
    .info { text-align: center; margin-top: 16px; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="icon">&#x1F4F6;</div>
        <h1>WiFi Gratuito</h1>
        <p class="subtitle">Cadastre-se para acessar a internet</p>
      </div>

      <!-- Step 1: LGPD Consent -->
      <div class="step active" id="step1">
        <label>Termos de Uso e Privacidade (LGPD)</label>
        <div class="lgpd-box">
          Em conformidade com a Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018), informamos que os dados pessoais coletados neste cadastro serao utilizados exclusivamente para fins de autenticacao na rede WiFi e cumprimento das obrigacoes legais previstas no Marco Civil da Internet (Lei 12.965/2014). Seus dados serao armazenados de forma segura e nao serao compartilhados com terceiros sem seu consentimento expresso. Voce tem direito de solicitar acesso, correcao ou exclusao dos seus dados a qualquer momento.
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="lgpd-consent" onchange="document.getElementById('btn-next').disabled = !this.checked">
          <span>Li e concordo com os termos de uso e politica de privacidade</span>
        </div>
        <button class="btn" id="btn-next" disabled onclick="document.getElementById('step1').classList.remove('active');document.getElementById('step2').classList.add('active');">
          Continuar
        </button>
      </div>

      <!-- Step 2: Registration -->
      <div class="step" id="step2">
        <label>Nome completo</label>
        <input type="text" id="nome" placeholder="Seu nome">
        <label>CPF</label>
        <input type="text" id="cpf" placeholder="000.000.000-00">
        <label>E-mail</label>
        <input type="email" id="email" placeholder="seu@email.com">
        <label>Telefone</label>
        <input type="tel" id="telefone" placeholder="(00) 00000-0000">
        <button class="btn" onclick="document.getElementById('step2').classList.remove('active');document.getElementById('step3').classList.add('active');">
          Prosseguir
        </button>
      </div>

      <!-- Step 3: Plans -->
      <div class="step" id="step3">
        <label style="margin-bottom:14px;">Escolha um plano</label>
        <div class="plans-grid">
          <div class="plan-option" onclick="this.parentElement.querySelectorAll('.plan-option').forEach(e=>e.classList.remove('selected'));this.classList.add('selected');">
            <div class="left"><div class="name">Basico</div><div class="speed">5 Mbps</div></div>
            <div class="price">R$ 9,90</div>
          </div>
          <div class="plan-option" onclick="this.parentElement.querySelectorAll('.plan-option').forEach(e=>e.classList.remove('selected'));this.classList.add('selected');">
            <div class="left"><div class="name">Turbo</div><div class="speed">20 Mbps</div></div>
            <div class="price">R$ 29,90</div>
          </div>
          <div class="plan-option" onclick="this.parentElement.querySelectorAll('.plan-option').forEach(e=>e.classList.remove('selected'));this.classList.add('selected');">
            <div class="left"><div class="name">Ultra</div><div class="speed">50 Mbps</div></div>
            <div class="price">R$ 49,90</div>
          </div>
        </div>
        <a href="/planos-cliente?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)" class="btn">
          Assinar Plano
        </a>
        <a href="/hotspot/auth?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)&free=1" class="btn btn-secondary">
          Acesso gratuito limitado
        </a>
      </div>

      <p class="info">MAC: $(mac) | IP: $(ip)</p>
    </div>
  </div>
</body>
</html>`;

      await conn.execute(
        "INSERT INTO portal_templates (nome, descricao, html_template, css_template, tipo) VALUES (?, ?, ?, ?, ?)",
        ["Portal Basico", "Portal simples de login WiFi com botao de conexao. Ideal para hotspots que precisam apenas autenticar o usuario.", htmlBasico, null, "basico"]
      );
      console.log('   -> Template "Portal Basico" inserido.');

      await conn.execute(
        "INSERT INTO portal_templates (nome, descricao, html_template, css_template, tipo) VALUES (?, ?, ?, ?, ?)",
        ["Portal com Planos", "Portal que exibe planos com precos e links para pagamento. Ideal para monetizar o acesso WiFi.", htmlPlanos, null, "planos"]
      );
      console.log('   -> Template "Portal com Planos" inserido.');

      await conn.execute(
        "INSERT INTO portal_templates (nome, descricao, html_template, css_template, tipo) VALUES (?, ?, ?, ?, ?)",
        ["Portal LGPD + Planos", "Portal completo com consentimento LGPD, formulario de cadastro e exibicao de planos. Conformidade total com a legislacao brasileira.", htmlCompleto, null, "completo"]
      );
      console.log('   -> Template "Portal LGPD + Planos" inserido.');

    } else {
      console.log('   -> Templates ja existem, pulando insercao.');
    }

    await conn.commit();
    console.log('\n=== Migration 004 concluida com sucesso! ===');
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
