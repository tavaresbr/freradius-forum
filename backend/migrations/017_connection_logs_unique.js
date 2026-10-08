require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function colExists(conn, table, col) {
  const [rows] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, col]
  );
  return rows[0].cnt > 0;
}

async function idxExists(conn, table, idx) {
  const [rows] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    [table, idx]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 017: connection_logs idempotente (acctuniqueid UNIQUE) ===\n');

    // ATENCAO: rodar scripts/dedup_connection_logs.js ANTES desta migration.

    console.log('1. Coluna connection_logs.acctuniqueid...');
    if (!(await colExists(conn, 'connection_logs', 'acctuniqueid'))) {
      await conn.execute(`ALTER TABLE connection_logs ADD COLUMN acctuniqueid VARCHAR(32) NULL AFTER username`);
      console.log('   -> coluna adicionada');
    } else {
      console.log('   -> ja existe');
    }

    console.log('\n2. Backfill acctuniqueid a partir do radacct (match por username + inicio)...');
    const [bf] = await conn.execute(
      `UPDATE connection_logs cl
         JOIN radacct ra
           ON ra.username = cl.username
          AND ra.acctstarttime = cl.inicio_conexao
        SET cl.acctuniqueid = ra.acctuniqueid
       WHERE cl.acctuniqueid IS NULL`
    );
    console.log(`   -> ${bf.affectedRows} linha(s) atualizada(s)`);

    console.log('\n3. Removendo duplicatas remanescentes por acctuniqueid (mantem menor id)...');
    await conn.execute(
      `DELETE cl FROM connection_logs cl
         JOIN (
           SELECT acctuniqueid, MIN(id) AS keep_id
             FROM connection_logs
            WHERE acctuniqueid IS NOT NULL
            GROUP BY acctuniqueid
           HAVING COUNT(*) > 1
         ) d ON d.acctuniqueid = cl.acctuniqueid
        WHERE cl.id <> d.keep_id`
    );
    console.log('   -> ok');

    console.log('\n4. Indice UNIQUE uniq_acctuniqueid...');
    // MySQL permite multiplos NULL num indice UNIQUE, entao linhas historicas sem
    // acctuniqueid (sessoes cujo radacct ja nao existe) nao conflitam entre si.
    if (!(await idxExists(conn, 'connection_logs', 'uniq_acctuniqueid'))) {
      await conn.execute(`CREATE UNIQUE INDEX uniq_acctuniqueid ON connection_logs (acctuniqueid)`);
      console.log('   -> indice criado');
    } else {
      console.log('   -> ja existe');
    }

    console.log('\n5. Coluna connection_logs_sync.last_synced_at (cursor por datetime)...');
    if (!(await colExists(conn, 'connection_logs_sync', 'last_synced_at'))) {
      await conn.execute(`ALTER TABLE connection_logs_sync ADD COLUMN last_synced_at DATETIME NULL DEFAULT NULL`);
      console.log('   -> coluna adicionada');
    } else {
      console.log('   -> ja existe');
    }

    console.log('\n=== Migration 017 concluida com sucesso! ===');
  } catch (err) {
    console.error('Erro na migration:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
