const db = require("../../db");

exports.listarTemplates = async (req, res) => {
  try {
    const [templates] = await db.query(
      "SELECT id, nome, descricao, thumbnail_url, tipo, criado_em FROM portal_templates ORDER BY tipo, nome"
    );
    res.json(templates);
  } catch (err) {
    console.error("Erro ao listar templates:", err);
    res.status(500).json({ message: "Erro ao listar templates" });
  }
};

exports.obterTemplate = async (req, res) => {
  const { id } = req.params;
  try {
    const [[template]] = await db.query("SELECT * FROM portal_templates WHERE id = ?", [id]);
    if (!template) return res.status(404).json({ message: "Template não encontrado" });
    res.json(template);
  } catch (err) {
    console.error("Erro ao obter template:", err);
    res.status(500).json({ message: "Erro ao obter template" });
  }
};
