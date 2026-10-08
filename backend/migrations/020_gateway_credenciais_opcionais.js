require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

/**
 * Migration 020 (Fase 4B): torna `usuario` e `senha` de mikrotiks opcionais.
 *
 * Gateways Omada (modo API) e UniFi nao usam credenciais RouterOS — as
 * credenciais deles ficam em api_user/api_pass. Com NOT NULL o INSERT desses
 * tipos falhava (ER_BAD_NULL_ERROR).
 *
 * Idempotente: MODIFY COLUMN pro mesmo estado nao da' erro.
 */
async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 020: usuario/senha opcionais em mikrotiks ===\n');

    await conn.execute("ALTER TABLE mikrotiks MODIFY COLUMN usuario VARCHAR(100) NULL DEFAULT NULL");
    console.log('   -> usuario agora aceita NULL');

    await conn.execute("ALTER TABLE mikrotiks MODIFY COLUMN senha VARCHAR(255) NULL DEFAULT NULL");
    console.log('   -> senha agora aceita NULL');

    console.log('\n=== Migration 020 concluida com sucesso! ===');
  } catch (err) {
    console.error('Erro na migration 020:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
