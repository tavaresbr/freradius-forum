/**
 * Job leve: fechar sessoes orfas no radacct.
 *
 * Sessoes com acctstoptime IS NULL cujo ultimo interim-update (acctupdatetime)
 * e mais velho que 15 min sao consideradas orfas (o NAS caiu / nao mandou o
 * Accounting-Stop). Enquanto ficam abertas, o simul_count_query do FreeRADIUS
 * as conta e, com Simultaneous-Use=1, o cliente com saldo NAO consegue
 * reconectar. Fechar as orfas destrava a reconexao.
 *
 * Usage:
 *   node src/jobs/limpaSessoesOrfas.js
 *
 * Ou importar e chamar limpaSessoesOrfas() de um cron scheduler.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../../db');

async function limpaSessoesOrfas() {
  try {
    const [result] = await db.query(
      `UPDATE radacct
         SET acctstoptime = NOW(),
             acctterminatecause = 'Stale-Session'
       WHERE acctstoptime IS NULL
         AND acctupdatetime < NOW() - INTERVAL 15 MINUTE`
    );

    const fechadas = result.affectedRows || 0;
    if (fechadas > 0) {
      console.log(`[limpaSessoesOrfas] Fechadas ${fechadas} sessoes orfas.`);
    }
    return { closed: fechadas };
  } catch (err) {
    console.error('[limpaSessoesOrfas] Erro:', err);
    throw err;
  }
}

module.exports = limpaSessoesOrfas;

// Run directly
if (require.main === module) {
  limpaSessoesOrfas()
    .then((result) => {
      console.log('[limpaSessoesOrfas] Concluido:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[limpaSessoesOrfas] Falha:', err);
      process.exit(1);
    });
}
