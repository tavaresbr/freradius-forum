const db = require("../../db");

exports.getDashboard = async (req, res) => {
  try {
    const empresaId = req.empresa_id;

    // Pagamentos
    const [[{ total_pagamentos }]] = await db.query(
      "SELECT COUNT(*) as total_pagamentos FROM pagamentos WHERE empresa_id = ?",
      [empresaId]
    );
    const [[{ pagamentos_24h }]] = await db.query(
      "SELECT COUNT(*) as pagamentos_24h FROM pagamentos WHERE empresa_id = ? AND criado_em >= NOW() - INTERVAL 1 DAY",
      [empresaId]
    );

    // Usuários Radius (via radius_users para filtrar por empresa)
    const [[{ total_usuarios }]] = await db.query(
      "SELECT COUNT(*) as total_usuarios FROM radius_users WHERE empresa_id = ?",
      [empresaId]
    );

    // Mikrotiks
    const [[{ total_mikrotiks }]] = await db.query(
      "SELECT COUNT(*) as total_mikrotiks FROM mikrotiks WHERE empresa_id = ?",
      [empresaId]
    );

    // Sessões por Mikrotik via radius_users
    const [sessoes] = await db.query(`
      SELECT m.nome, COUNT(r.username) AS conectados
      FROM mikrotiks m
      LEFT JOIN radius_users r ON r.nas_id = m.id
      WHERE m.empresa_id = ?
      GROUP BY m.id
    `, [empresaId]);

    res.json({
      pagamentos: {
        total: total_pagamentos,
        ultimas_24h: pagamentos_24h,
      },
      radius: {
        total_usuarios,
      },
      mikrotiks: {
        total: total_mikrotiks,
        online: total_mikrotiks
      },
      sessoes,
    });
  } catch (err) {
    console.error("Erro no dashboard:", err);
    res.status(500).json({ message: "Erro ao buscar dados do dashboard" });
  }
};
