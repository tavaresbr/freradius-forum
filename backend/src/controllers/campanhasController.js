const path = require("path");
const fs   = require("fs");
const db   = require("../../db");
const { ALLOWED_MIMES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, UPLOAD_ROOT } = require("../middleware/uploadCampanha");

// ─────────────────────────────────────────────────────────────────────────────
// CRUD Campanhas
// ─────────────────────────────────────────────────────────────────────────────

exports.listar = async (req, res) => {
  try {
    const [campanhas] = await db.execute(
      `SELECT c.*,
         (SELECT COUNT(*) FROM campanha_itens ci WHERE ci.campanha_id = c.id) AS total_itens
       FROM campanhas c
       WHERE c.empresa_id = ?
       ORDER BY c.criado_em DESC`,
      [req.empresa_id]
    );
    res.json({ success: true, data: campanhas });
  } catch (err) {
    console.error("Erro ao listar campanhas:", err);
    res.status(500).json({ error: "Erro ao listar campanhas" });
  }
};

exports.criar = async (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: "O campo nome é obrigatório" });
  }
  try {
    const [result] = await db.execute(
      `INSERT INTO campanhas (empresa_id, nome, descricao) VALUES (?, ?, ?)`,
      [req.empresa_id, nome.trim(), descricao || null]
    );
    const [[campanha]] = await db.execute(
      "SELECT * FROM campanhas WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({ success: true, data: campanha });
  } catch (err) {
    console.error("Erro ao criar campanha:", err);
    res.status(500).json({ error: "Erro ao criar campanha" });
  }
};

exports.obter = async (req, res) => {
  const { id } = req.params;
  try {
    const [[campanha]] = await db.execute(
      "SELECT * FROM campanhas WHERE id = ? AND empresa_id = ?",
      [id, req.empresa_id]
    );
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });

    const [itens] = await db.execute(
      "SELECT * FROM campanha_itens WHERE campanha_id = ? ORDER BY ordem ASC, id ASC",
      [id]
    );
    res.json({ success: true, data: { ...campanha, itens } });
  } catch (err) {
    console.error("Erro ao obter campanha:", err);
    res.status(500).json({ error: "Erro ao obter campanha" });
  }
};

exports.atualizar = async (req, res) => {
  const { id } = req.params;
  const { nome, descricao, ativo } = req.body;
  try {
    const [[existing]] = await db.execute(
      "SELECT * FROM campanhas WHERE id = ? AND empresa_id = ?",
      [id, req.empresa_id]
    );
    if (!existing) return res.status(404).json({ error: "Campanha não encontrada" });

    await db.execute(
      `UPDATE campanhas
         SET nome        = COALESCE(?, nome),
             descricao   = COALESCE(?, descricao),
             ativo       = COALESCE(?, ativo),
             atualizado_em = NOW()
       WHERE id = ? AND empresa_id = ?`,
      [
        nome !== undefined ? nome.trim() : null,
        descricao !== undefined ? descricao : null,
        ativo !== undefined ? (ativo ? 1 : 0) : null,
        id,
        req.empresa_id,
      ]
    );
    const [[campanha]] = await db.execute(
      "SELECT * FROM campanhas WHERE id = ?",
      [id]
    );
    res.json({ success: true, data: campanha });
  } catch (err) {
    console.error("Erro ao atualizar campanha:", err);
    res.status(500).json({ error: "Erro ao atualizar campanha" });
  }
};

exports.deletar = async (req, res) => {
  const { id } = req.params;
  try {
    const [[campanha]] = await db.execute(
      "SELECT * FROM campanhas WHERE id = ? AND empresa_id = ?",
      [id, req.empresa_id]
    );
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });

    // Remove physical files before deleting from DB
    const dir = path.join(UPLOAD_ROOT, String(req.empresa_id), String(id));
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    await db.execute(
      "DELETE FROM campanhas WHERE id = ? AND empresa_id = ?",
      [id, req.empresa_id]
    );
    res.json({ success: true, message: "Campanha removida com sucesso" });
  } catch (err) {
    console.error("Erro ao deletar campanha:", err);
    res.status(500).json({ error: "Erro ao deletar campanha" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Itens
// ─────────────────────────────────────────────────────────────────────────────

async function getCampanhaOuFalha(req, res) {
  const campanhaId = req.params.id;
  const [[campanha]] = await db.execute(
    "SELECT * FROM campanhas WHERE id = ? AND empresa_id = ?",
    [campanhaId, req.empresa_id]
  );
  if (!campanha) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return null;
  }
  return campanha;
}

exports.uploadItem = async (req, res) => {
  try {
    const campanha = await getCampanhaOuFalha(req, res);
    if (!campanha) return;

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    const meta = ALLOWED_MIMES[req.file.mimetype];
    if (!meta) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Tipo de arquivo não permitido" });
    }

    // Per-type size validation
    if (meta.tipo === "imagem" && req.file.size > MAX_IMAGE_BYTES) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Imagem excede o limite de 10 MB" });
    }
    if (meta.tipo === "video" && req.file.size > MAX_VIDEO_BYTES) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Vídeo excede o limite de 50 MB" });
    }

    // Compute next ordem
    const [[ordemRow]] = await db.execute(
      "SELECT IFNULL(MAX(ordem), -1) + 1 AS proxima FROM campanha_itens WHERE campanha_id = ?",
      [campanha.id]
    );
    const ordem = ordemRow.proxima;

    const { duracao_segundos, titulo, link_destino } = req.body;
    const arquivo_url = `/uploads/campanhas/${req.empresa_id}/${campanha.id}/${req.file.filename}`;

    const [result] = await db.execute(
      `INSERT INTO campanha_itens
         (campanha_id, empresa_id, tipo, arquivo_url, ordem, duracao_segundos, titulo, link_destino)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        campanha.id,
        req.empresa_id,
        meta.tipo,
        arquivo_url,
        ordem,
        duracao_segundos ? parseInt(duracao_segundos, 10) : 5,
        titulo || null,
        link_destino || null,
      ]
    );
    const [[item]] = await db.execute(
      "SELECT * FROM campanha_itens WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error("Erro ao fazer upload de item:", err);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ error: "Erro ao fazer upload de item" });
  }
};

exports.atualizarItem = async (req, res) => {
  const { itemId } = req.params;
  const campanhaId = req.params.id;
  const { titulo, duracao_segundos, link_destino } = req.body;
  try {
    const [result] = await db.execute(
      `UPDATE campanha_itens ci
         JOIN campanhas c ON c.id = ci.campanha_id
         SET ci.titulo            = COALESCE(?, ci.titulo),
             ci.duracao_segundos  = COALESCE(?, ci.duracao_segundos),
             ci.link_destino      = COALESCE(?, ci.link_destino)
       WHERE ci.id = ? AND ci.campanha_id = ? AND c.empresa_id = ?`,
      [
        titulo !== undefined ? titulo : null,
        duracao_segundos !== undefined ? parseInt(duracao_segundos, 10) : null,
        link_destino !== undefined ? link_destino : null,
        itemId,
        campanhaId,
        req.empresa_id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Item não encontrado" });
    }
    const [[item]] = await db.execute(
      "SELECT * FROM campanha_itens WHERE id = ?",
      [itemId]
    );
    res.json({ success: true, data: item });
  } catch (err) {
    console.error("Erro ao atualizar item:", err);
    res.status(500).json({ error: "Erro ao atualizar item" });
  }
};

exports.deletarItem = async (req, res) => {
  const { itemId } = req.params;
  const campanhaId = req.params.id;
  try {
    const [[item]] = await db.execute(
      `SELECT ci.*
         FROM campanha_itens ci
         JOIN campanhas c ON c.id = ci.campanha_id
       WHERE ci.id = ? AND ci.campanha_id = ? AND c.empresa_id = ?`,
      [itemId, campanhaId, req.empresa_id]
    );
    if (!item) return res.status(404).json({ error: "Item não encontrado" });

    // Remove physical file
    const filePath = path.join(__dirname, "../.." + item.arquivo_url);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {
        console.error("Erro ao remover arquivo físico:", e);
      }
    }

    await db.execute("DELETE FROM campanha_itens WHERE id = ?", [itemId]);
    res.json({ success: true, message: "Item removido com sucesso" });
  } catch (err) {
    console.error("Erro ao deletar item:", err);
    res.status(500).json({ error: "Erro ao deletar item" });
  }
};

exports.reordenar = async (req, res) => {
  const campanhaId = req.params.id;
  const { ordens } = req.body; // [{id, ordem}, ...]

  if (!Array.isArray(ordens) || ordens.length === 0) {
    return res.status(400).json({ error: "Campo ordens deve ser um array não vazio" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verify campanha belongs to this empresa
    const [[campanha]] = await conn.execute(
      "SELECT id FROM campanhas WHERE id = ? AND empresa_id = ?",
      [campanhaId, req.empresa_id]
    );
    if (!campanha) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: "Campanha não encontrada" });
    }

    for (const { id, ordem } of ordens) {
      await conn.execute(
        "UPDATE campanha_itens SET ordem = ? WHERE id = ? AND campanha_id = ?",
        [ordem, id, campanhaId]
      );
    }

    await conn.commit();
    conn.release();
    res.json({ success: true, message: "Itens reordenados com sucesso" });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("Erro ao reordenar itens:", err);
    res.status(500).json({ error: "Erro ao reordenar itens" });
  }
};
