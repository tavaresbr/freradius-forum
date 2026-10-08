require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function migrate() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log('=== Fase 8: Inserindo portal Lead Passivo para empresas existentes ===\n');

    // Buscar todas as empresas ativas
    const [empresas] = await conn.execute('SELECT id FROM empresas');
    console.log(`Encontradas ${empresas.length} empresas.`);

    let inseridos = 0;
    let ignorados = 0;

    for (const empresa of empresas) {
      const empresaId = empresa.id;

      // Verificar se a empresa já tem o portal lead_passivo
      const [[existente]] = await conn.execute(
        "SELECT id FROM portais WHERE empresa_id = ? AND tipo = 'lead_passivo'",
        [empresaId]
      );

      if (existente) {
        ignorados++;
      } else {
        await conn.execute(
          `INSERT INTO portais (empresa_id, nome, slug, tipo, url_redirect, ativo) VALUES
           (?, 'Cadastro de LEAD (Sem Internet)', 'lead-passivo', 'lead_passivo', '/lead-passivo', 1)`,
          [empresaId]
        );
        inseridos++;
      }
    }

    console.log(`\nResumo:`);
    console.log(`-> Portais inseridos: ${inseridos}`);
    console.log(`-> Empresas já configuradas (ignoradas): ${ignorados}`);

    await conn.commit();
    console.log('\n=== Migration 008 concluida com sucesso! ===');
  } catch (err) {
    await conn.rollback();
    console.error('Erro na migration 008:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
