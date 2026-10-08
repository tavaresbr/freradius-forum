/**
 * One-off: deduplica connection_logs mantendo 1 linha por sessao.
 *
 * Contexto: por anos o watermark de sync ficou em 0 e o job re-inseriu as MESMAS
 * sessoes a cada 5 min. Resultado: ~250k linhas para ~14 sessoes reais. Este script
 * colapsa por chave natural de sessao (username + inicio_conexao + mac), mantendo o
 * menor id de cada grupo.
 *
 * DEVE rodar ANTES da migration 017 (que cria o indice UNIQUE em acctuniqueid).
 * Faca backup da tabela antes:
 *   mysqldump ... connection_logs | gzip > connection_logs-pre.sql.gz
 *
 * Uso: node scripts/dedup_connection_logs.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function dedup() {
  const conn = await db.getConnection();
  try {
    const [[antes]] = await conn.query('SELECT COUNT(*) AS total FROM connection_logs');
    const [[distintas]] = await conn.query(
      'SELECT COUNT(*) AS uniq FROM (SELECT 1 FROM connection_logs GROUP BY username, inicio_conexao, mac) t'
    );
    console.log(`[dedup] Antes: ${antes.total} linhas, ${distintas.uniq} sessoes distintas.`);

    if (antes.total === distintas.uniq) {
      console.log('[dedup] Nada a fazer (sem duplicatas).');
      return;
    }

    // Ids a manter: menor id de cada sessao (username + inicio + mac)
    await conn.query('DROP TEMPORARY TABLE IF EXISTS keep_ids');
    await conn.query(
      `CREATE TEMPORARY TABLE keep_ids AS
         SELECT MIN(id) AS id
           FROM connection_logs
          GROUP BY username, inicio_conexao, mac`
    );
    const [[keep]] = await conn.query('SELECT COUNT(*) AS c FROM keep_ids');
    console.log(`[dedup] Mantendo ${keep.c} linhas.`);

    // Deleta em lotes para nao segurar o lock por muito tempo
    let totalDeletado = 0;
    let deletados;
    do {
      const [res] = await conn.query(
        'DELETE FROM connection_logs WHERE id NOT IN (SELECT id FROM keep_ids) LIMIT 10000'
      );
      deletados = res.affectedRows;
      totalDeletado += deletados;
      if (deletados > 0) console.log(`[dedup] ...removidas ${totalDeletado} linhas`);
    } while (deletados > 0);

    await conn.query('DROP TEMPORARY TABLE IF EXISTS keep_ids');

    const [[depois]] = await conn.query('SELECT COUNT(*) AS total FROM connection_logs');
    console.log(`[dedup] Concluido. Removidas ${totalDeletado}. Restam ${depois.total} linhas.`);
  } catch (err) {
    console.error('[dedup] Erro:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

dedup();
