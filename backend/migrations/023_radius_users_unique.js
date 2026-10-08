/**
 * Migration 023 — dedup + UNIQUE em radius_users.username.
 *
 * Os controllers de liberacao fazem INSERT INTO radius_users ... ON DUPLICATE
 * KEY UPDATE liberado_em = NOW(), mas a tabela nunca teve indice UNIQUE em
 * username — o upsert nunca disparava e cada liberacao acumulava uma linha nova
 * (5 duplicatas pro mesmo CPF em producao). Alem do lixo, o totalcounter do
 * FreeRADIUS le MAX(liberado_em) dessa tabela; manter uma linha so por username
 * e' o que o modelo cumulativo assume.
 *
 * Passos (idempotente):
 *   1. Dedup: mantem por username a linha de maior id, herdando o maior
 *      liberado_em entre as duplicatas (pra nao regredir o reset do contador).
 *   2. ADD UNIQUE KEY uk_radius_users_username (username) se nao existir.
 */
const db = require("../db");

async function up() {
  // 1. Propaga o maior liberado_em pra linha sobrevivente (maior id)
  await db.query(`
    UPDATE radius_users ru
    JOIN (
      SELECT username, MAX(id) AS keep_id, MAX(liberado_em) AS max_lib
      FROM radius_users GROUP BY username HAVING COUNT(*) > 1
    ) d ON d.username = ru.username AND ru.id = d.keep_id
    SET ru.liberado_em = d.max_lib
  `);

  // 2. Remove as duplicatas (tudo que nao e' a linha de maior id)
  const [del] = await db.query(`
    DELETE ru FROM radius_users ru
    JOIN (
      SELECT username, MAX(id) AS keep_id
      FROM radius_users GROUP BY username HAVING COUNT(*) > 1
    ) d ON d.username = ru.username AND ru.id <> d.keep_id
  `);
  console.log(`023: ${del.affectedRows} duplicata(s) removida(s) de radius_users.`);

  // 3. UNIQUE index (se ja existe, ignora)
  const [idx] = await db.query(`
    SELECT COUNT(*) AS n FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE() AND table_name = 'radius_users'
      AND index_name = 'uk_radius_users_username'
  `);
  if (idx[0].n === 0) {
    await db.query(
      "ALTER TABLE radius_users ADD UNIQUE KEY uk_radius_users_username (username)"
    );
    console.log("023: UNIQUE uk_radius_users_username criado.");
  } else {
    console.log("023: UNIQUE uk_radius_users_username ja existia.");
  }
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("023 falhou:", err);
    process.exit(1);
  });
