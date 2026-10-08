require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log('=== Fase 7: Adicionando Template Lead Passivo ===\n');

    console.log('1. Atualizando colunas tipo para VARCHAR para maior flexibilidade...');
    await conn.execute("ALTER TABLE portal_templates MODIFY COLUMN tipo VARCHAR(50) DEFAULT 'basico'");
    await conn.execute("ALTER TABLE portais MODIFY COLUMN tipo VARCHAR(50) DEFAULT 'basico'");

    const htmlLeadPassivo = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WiFi - Conecte-se</title>
  <style>
    body { background: #0f111a; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; }
  </style>
  <script>
    setTimeout(function() {
      window.location.href = "/lead-passivo?mac=$(mac)&ip=$(ip)&mikrotik_id=$(mikrotik_id)";
    }, 1000);
  </script>
</head>
<body>
  <div class="box">
    <h2>Redirecionando...</h2>
  </div>
</body>
</html>`;

    console.log('2. Inserindo template Lead Passivo...');
    await conn.execute(
      "INSERT INTO portal_templates (nome, descricao, html_template, css_template, tipo) VALUES (?, ?, ?, ?, ?)",
      ["Cadastro de LEAD (Sem Internet)", "Portal focado apenas na captura de contatos (nome, email, telefone). Exibe uma tela de obrigado e NÃO libera internet. Ideal para prospecção passiva.", htmlLeadPassivo, null, "lead_passivo"]
    );
    console.log('   -> Template "Lead Passivo" inserido.');

    await conn.commit();
    console.log('\n=== Migration 007 concluida com sucesso! ===');
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
