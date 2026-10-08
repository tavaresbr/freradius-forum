const db = require("../../db");

const Mikrotik = {
  create: async ({ nome, ip, usuario, senha, porta, end_hotspot, empresa_id }) => {
    const [result] = await db.execute(
      "INSERT INTO mikrotiks (empresa_id, nome, ip, usuario, senha, porta, end_hotspot) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [empresa_id, nome, ip, usuario, senha, porta, end_hotspot || null]
    );
    return result;
  },

  findAll: async (empresa_id) => {
    if (!empresa_id) {
      const [rows] = await db.execute("SELECT * FROM mikrotiks");
      return rows;
    }
    const [rows] = await db.execute("SELECT * FROM mikrotiks WHERE empresa_id = ?", [empresa_id]);
    return rows;
  },

  findById: async (id, empresa_id) => {
    const [rows] = await db.execute(
      "SELECT * FROM mikrotiks WHERE id = ? AND empresa_id = ?",
      [id, empresa_id]
    );
    return rows[0];
  }
};

module.exports = Mikrotik;
