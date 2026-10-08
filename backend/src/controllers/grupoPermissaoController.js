const db = require("../../db");

// Lista de módulos do sistema
const MODULOS = [
  'dashboard', 'mikrotiks', 'vpn', 'portais', 'planos',
  'clientes', 'leads', 'radius', 'pagamentos', 'sessoes',
  'sessoeslog', 'compliance', 'configuracoes', 'usuarios'
];

exports.MODULOS = MODULOS;

exports.listarGrupos = async (req, res) => {
  try {
    const [grupos] = await db.query(`
      SELECT g.*, 
        (SELECT COUNT(*) FROM admin_grupos ag WHERE ag.grupo_id = g.id) AS total_admins
      FROM grupos_permissao g ORDER BY g.nome
    `);
    res.json(grupos);
  } catch (err) {
    console.error("Erro ao listar grupos:", err);
    res.status(500).json({ message: "Erro ao listar grupos" });
  }
};

exports.obterGrupo = async (req, res) => {
  try {
    const { id } = req.params;
    const [[grupo]] = await db.execute('SELECT * FROM grupos_permissao WHERE id = ?', [id]);
    if (!grupo) return res.status(404).json({ message: "Grupo não encontrado" });

    const [permissoes] = await db.execute(
      'SELECT modulo, ver, criar, editar, excluir FROM grupo_permissoes WHERE grupo_id = ?', [id]
    );
    grupo.permissoes = permissoes;
    res.json(grupo);
  } catch (err) {
    console.error("Erro ao obter grupo:", err);
    res.status(500).json({ message: "Erro ao obter grupo" });
  }
};

exports.criarGrupo = async (req, res) => {
  try {
    const { nome, descricao, permissoes } = req.body;
    if (!nome) return res.status(400).json({ message: "Nome é obrigatório" });

    const [result] = await db.execute(
      'INSERT INTO grupos_permissao (nome, descricao) VALUES (?, ?)',
      [nome, descricao || null]
    );
    const grupoId = result.insertId;

    if (permissoes && permissoes.length > 0) {
      for (const p of permissoes) {
        if (!MODULOS.includes(p.modulo)) continue;
        await db.execute(
          'INSERT INTO grupo_permissoes (grupo_id, modulo, ver, criar, editar, excluir) VALUES (?, ?, ?, ?, ?, ?)',
          [grupoId, p.modulo, p.ver ? 1 : 0, p.criar ? 1 : 0, p.editar ? 1 : 0, p.excluir ? 1 : 0]
        );
      }
    }

    res.status(201).json({ id: grupoId, nome });
  } catch (err) {
    console.error("Erro ao criar grupo:", err);
    res.status(500).json({ message: "Erro ao criar grupo" });
  }
};

exports.atualizarGrupo = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, permissoes } = req.body;

    await db.execute('UPDATE grupos_permissao SET nome = ?, descricao = ? WHERE id = ?',
      [nome, descricao || null, id]
    );

    // Reconstruct permissions
    await db.execute('DELETE FROM grupo_permissoes WHERE grupo_id = ?', [id]);
    if (permissoes && permissoes.length > 0) {
      for (const p of permissoes) {
        if (!MODULOS.includes(p.modulo)) continue;
        await db.execute(
          'INSERT INTO grupo_permissoes (grupo_id, modulo, ver, criar, editar, excluir) VALUES (?, ?, ?, ?, ?, ?)',
          [id, p.modulo, p.ver ? 1 : 0, p.criar ? 1 : 0, p.editar ? 1 : 0, p.excluir ? 1 : 0]
        );
      }
    }

    res.json({ message: "Grupo atualizado" });
  } catch (err) {
    console.error("Erro ao atualizar grupo:", err);
    res.status(500).json({ message: "Erro ao atualizar grupo" });
  }
};

exports.deletarGrupo = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM grupos_permissao WHERE id = ?', [id]);
    res.json({ message: "Grupo deletado" });
  } catch (err) {
    console.error("Erro ao deletar grupo:", err);
    res.status(500).json({ message: "Erro ao deletar grupo" });
  }
};

// Admins vinculados a um grupo
exports.listarAdminsGrupo = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(`
      SELECT a.id, a.email, a.nome, a.role
      FROM admin_grupos ag JOIN admins a ON ag.admin_id = a.id
      WHERE ag.grupo_id = ? ORDER BY a.nome
    `, [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Erro ao listar admins" });
  }
};

exports.vincularAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_id } = req.body;
    if (!admin_id) return res.status(400).json({ message: "admin_id obrigatório" });
    await db.execute(
      'INSERT IGNORE INTO admin_grupos (admin_id, grupo_id) VALUES (?, ?)', [admin_id, id]
    );
    res.json({ message: "Admin vinculado" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao vincular" });
  }
};

exports.desvincularAdmin = async (req, res) => {
  try {
    const { id, adminId } = req.params;
    await db.execute('DELETE FROM admin_grupos WHERE admin_id = ? AND grupo_id = ?', [adminId, id]);
    res.json({ message: "Admin desvinculado" });
  } catch (err) {
    res.status(500).json({ message: "Erro ao desvincular" });
  }
};

// Permissões consolidadas de um admin (unifica múltiplos grupos com OR)
exports.obterPermissoesAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const [rows] = await db.execute(`
      SELECT gp.modulo,
        MAX(gp.ver) AS ver, MAX(gp.criar) AS criar,
        MAX(gp.editar) AS editar, MAX(gp.excluir) AS excluir
      FROM admin_grupos ag
      JOIN grupo_permissoes gp ON ag.grupo_id = gp.grupo_id
      WHERE ag.admin_id = ?
      GROUP BY gp.modulo
    `, [adminId]);

    const permissoes = {};
    for (const r of rows) {
      permissoes[r.modulo] = { ver: !!r.ver, criar: !!r.criar, editar: !!r.editar, excluir: !!r.excluir };
    }
    res.json(permissoes);
  } catch (err) {
    res.status(500).json({ message: "Erro ao obter permissões" });
  }
};

// Helper interno: buscar permissões consolidadas (para uso no middleware)
exports.getPermissoesConsolidadas = async (adminId) => {
  const [rows] = await db.execute(`
    SELECT gp.modulo,
      MAX(gp.ver) AS ver, MAX(gp.criar) AS criar,
      MAX(gp.editar) AS editar, MAX(gp.excluir) AS excluir
    FROM admin_grupos ag
    JOIN grupo_permissoes gp ON ag.grupo_id = gp.grupo_id
    WHERE ag.admin_id = ?
    GROUP BY gp.modulo
  `, [adminId]);

  const permissoes = {};
  for (const r of rows) {
    permissoes[r.modulo] = { ver: !!r.ver, criar: !!r.criar, editar: !!r.editar, excluir: !!r.excluir };
  }
  return permissoes;
};

exports.listarModulos = (req, res) => {
  res.json(MODULOS);
};
