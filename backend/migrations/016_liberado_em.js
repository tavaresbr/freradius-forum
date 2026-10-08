require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function colExists(conn, table, col) {
  const [rows] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, col]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 016: radius_users.liberado_em (reset de contador por timestamp) ===\n');

    console.log('1. Coluna radius_users.liberado_em...');
    if (!(await colExists(conn, 'radius_users', 'liberado_em'))) {
      // Marca o instante da ultima liberacao. O sqlcounter 'totalcounter' soma
      // apenas radacct com acctstarttime >= liberado_em, zerando o contador na
      // nova compra SEM apagar o historico (compliance Marco Civil na fonte).
      await conn.execute(`ALTER TABLE radius_users ADD COLUMN liberado_em TIMESTAMP NULL DEFAULT NULL`);
      console.log('   -> coluna adicionada');
    } else {
      console.log('   -> ja existe');
    }

    console.log('\n2. Indice idx_radius_users_username...');
    const [idx] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radius_users' AND INDEX_NAME = 'idx_radius_users_username'`
    );
    if (idx[0].cnt === 0) {
      // Acelera o subquery do totalcounter (SELECT MAX(liberado_em) ... WHERE username = ?)
      await conn.execute(`CREATE INDEX idx_radius_users_username ON radius_users (username)`);
      console.log('   -> indice criado');
    } else {
      console.log('   -> ja existe');
    }

    console.log('\n=== Migration 016 concluida com sucesso! ===');
  } catch (err) {
    console.error('Erro na migration:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
