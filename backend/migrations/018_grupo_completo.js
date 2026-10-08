require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

// Modulos do sistema (espelha grupoPermissaoController.MODULOS).
const MODULOS = [
  'dashboard', 'mikrotiks', 'vpn', 'portais', 'planos',
  'clientes', 'leads', 'radius', 'pagamentos', 'sessoes',
  'sessoeslog', 'compliance', 'configuracoes', 'usuarios'
];

const GRUPO_NOME = 'Acesso Completo';

// Migration idempotente: com o checkPermissao agora negando por padrao (sem
// grupo = 403), garantimos que os admins ja existentes NAO fiquem travados.
// Cria um grupo "Acesso Completo" (todos os modulos, todas as acoes) e vincula
// a ele todo admin que hoje nao pertence a nenhum grupo.
async function migrate() {
  const conn = await db.getConnection();
  try {
    console.log('=== Migration 018: grupo "Acesso Completo" para admins sem grupo ===\n');

    // 1. Garantir o grupo (por nome, idempotente)
    let [[grupo]] = await conn.execute('SELECT id FROM grupos_permissao WHERE nome = ? LIMIT 1', [GRUPO_NOME]);
    let grupoId;
    if (grupo) {
      grupoId = grupo.id;
      console.log(`1. Grupo "${GRUPO_NOME}" ja existe (id=${grupoId})`);
    } else {
      const [r] = await conn.execute(
        'INSERT INTO grupos_permissao (nome, descricao) VALUES (?, ?)',
        [GRUPO_NOME, 'Acesso total a todos os modulos (atribuido automaticamente)']
      );
      grupoId = r.insertId;
      console.log(`1. Grupo "${GRUPO_NOME}" criado (id=${grupoId})`);
    }

    // 2. Garantir permissoes full em todos os modulos (idempotente)
    console.log('2. Garantindo permissoes de todos os modulos...');
    for (const modulo of MODULOS) {
      const [[perm]] = await conn.execute(
        'SELECT id FROM grupo_permissoes WHERE grupo_id = ? AND modulo = ? LIMIT 1',
        [grupoId, modulo]
      );
      if (perm) {
        await conn.execute(
          'UPDATE grupo_permissoes SET ver = 1, criar = 1, editar = 1, excluir = 1 WHERE id = ?',
          [perm.id]
        );
      } else {
        await conn.execute(
          'INSERT INTO grupo_permissoes (grupo_id, modulo, ver, criar, editar, excluir) VALUES (?, ?, 1, 1, 1, 1)',
          [grupoId, modulo]
        );
      }
    }
    console.log(`   -> ${MODULOS.length} modulos garantidos`);

    // 3. Vincular todo admin sem NENHUM grupo a este grupo
    console.log('3. Vinculando admins sem grupo...');
    const [semGrupo] = await conn.execute(
      `SELECT a.id FROM admins a
       LEFT JOIN admin_grupos ag ON ag.admin_id = a.id
       WHERE ag.admin_id IS NULL`
    );
    let vinculados = 0;
    for (const a of semGrupo) {
      const [r] = await conn.execute(
        'INSERT IGNORE INTO admin_grupos (admin_id, grupo_id) VALUES (?, ?)',
        [a.id, grupoId]
      );
      if (r.affectedRows > 0) vinculados++;
    }
    console.log(`   -> ${vinculados} admin(s) vinculado(s) (de ${semGrupo.length} sem grupo)`);

    console.log('\n=== Migration 018 concluida com sucesso! ===');
  } catch (err) {
    console.error('Erro na migration 018:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
