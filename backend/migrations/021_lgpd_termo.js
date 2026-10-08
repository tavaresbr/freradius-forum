require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

/**
 * Migration 021: snapshot do termo LGPD aceito.
 *
 * A LGPD exige prova de QUAL termo o titular aceitou (nao so o "sim").
 * `leads.lgpd_termo` guarda o texto exato exibido no portal no momento do
 * aceite (portais.configuracoes.texto_lgpd ou o texto default).
 *
 * Idempotente: so adiciona se a coluna nao existe.
 */
async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 021: coluna lgpd_termo em leads ===\n');

    const [rows] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'lgpd_termo'"
    );
    if (rows[0].cnt > 0) {
      console.log('   -> lgpd_termo ja existe');
    } else {
      await conn.execute("ALTER TABLE leads ADD COLUMN lgpd_termo TEXT NULL DEFAULT NULL");
      console.log('   -> lgpd_termo adicionada');
    }

    console.log('\n=== Migration 021 concluida com sucesso! ===');
  } catch (err) {
    console.error('Erro na migration 021:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
