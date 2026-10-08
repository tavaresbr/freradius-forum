// src/controllers/complianceController.js
const db = require("../../db");

exports.buscarLogs = async (req, res) => {
  try {
    const {
      cpf,
      mac,
      ip,
      data_inicio,
      data_fim,
      username,
      page = 1,
      per_page = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(per_page, 10) || 50));
    const offset = (pageNum - 1) * perPage;

    const where = ["cl.empresa_id = ?"];
    const params = [req.empresa_id];

    if (cpf) {
      where.push("cl.cpf = ?");
      params.push(cpf);
    }
    if (mac) {
      where.push("cl.mac LIKE ?");
      params.push(`%${mac}%`);
    }
    if (ip) {
      where.push("cl.ip_atribuido = ?");
      params.push(ip);
    }
    if (username) {
      where.push("cl.username LIKE ?");
      params.push(`%${username}%`);
    }
    // Filtro por SOBREPOSICAO de periodo: retorna quem estava conectado em
    // qualquer momento do intervalo. Sessao ainda ABERTA (fim_conexao NULL)
    // conta como ativa ate agora — o filtro antigo (fim_conexao <= data_fim)
    // excluia toda sessao aberta.
    if (data_inicio) {
      where.push("(cl.fim_conexao IS NULL OR cl.fim_conexao >= ?)");
      params.push(data_inicio);
    }
    if (data_fim) {
      where.push("cl.inicio_conexao <= ?");
      params.push(data_fim);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    // Count total
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM connection_logs cl ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Fetch page. JOIN com mikrotiks resolve o nome do equipamento (MikroTik,
    // Omada e UniFi gravam nas_ip = IP do equipamento cadastrado); JOIN com
    // access_points resolve o nome amigavel do AP (ap_mac vem do accounting).
    const [rows] = await db.query(
      `SELECT
        cl.username, cl.cpf, cl.mac, cl.ip_atribuido, cl.nas_ip,
        cl.ap_mac, cl.ssid, ap.nome AS ap_nome,
        cl.inicio_conexao, cl.fim_conexao, cl.duracao_segundos,
        cl.bytes_entrada, cl.bytes_saida, cl.motivo_desconexao, cl.auth_result,
        m.nome AS equipamento, m.tipo AS equipamento_tipo
      FROM connection_logs cl
      LEFT JOIN mikrotiks m
        ON m.ip = cl.nas_ip AND m.empresa_id = cl.empresa_id
      LEFT JOIN access_points ap
        ON ap.mac = cl.ap_mac AND ap.empresa_id = cl.empresa_id
      ${whereClause}
      ORDER BY cl.inicio_conexao DESC
      LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    res.json({
      data: rows,
      total,
      page: pageNum,
      per_page: perPage,
    });
  } catch (err) {
    console.error("Erro ao buscar logs de compliance:", err);
    res.status(500).json({ message: "Erro ao buscar logs de compliance." });
  }
};

exports.exportarCSV = async (req, res) => {
  try {
    const { cpf, mac, ip, data_inicio, data_fim, username } = req.query;

    const where = ["cl.empresa_id = ?"];
    const params = [req.empresa_id];

    if (cpf) {
      where.push("cl.cpf = ?");
      params.push(cpf);
    }
    if (mac) {
      where.push("cl.mac LIKE ?");
      params.push(`%${mac}%`);
    }
    if (ip) {
      where.push("cl.ip_atribuido = ?");
      params.push(ip);
    }
    if (username) {
      where.push("cl.username LIKE ?");
      params.push(`%${username}%`);
    }
    // Filtro por SOBREPOSICAO de periodo: retorna quem estava conectado em
    // qualquer momento do intervalo. Sessao ainda ABERTA (fim_conexao NULL)
    // conta como ativa ate agora — o filtro antigo (fim_conexao <= data_fim)
    // excluia toda sessao aberta.
    if (data_inicio) {
      where.push("(cl.fim_conexao IS NULL OR cl.fim_conexao >= ?)");
      params.push(data_inicio);
    }
    if (data_fim) {
      where.push("cl.inicio_conexao <= ?");
      params.push(data_fim);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    const [rows] = await db.query(
      `SELECT
        cl.username, cl.cpf, cl.mac, cl.ip_atribuido, cl.nas_ip,
        cl.ap_mac, cl.ssid, ap.nome AS ap_nome,
        cl.inicio_conexao, cl.fim_conexao, cl.duracao_segundos,
        cl.bytes_entrada, cl.bytes_saida, cl.motivo_desconexao, cl.auth_result,
        m.nome AS equipamento, m.tipo AS equipamento_tipo
      FROM connection_logs cl
      LEFT JOIN mikrotiks m
        ON m.ip = cl.nas_ip AND m.empresa_id = cl.empresa_id
      LEFT JOIN access_points ap
        ON ap.mac = cl.ap_mac AND ap.empresa_id = cl.empresa_id
      ${whereClause}
      ORDER BY cl.inicio_conexao DESC
      LIMIT 50000`,
      params
    );

    // Build CSV — alinhado com a tela (mesmos campos + equipamento + AP)
    const header = "Username,CPF,MAC,IP,NAS,Equipamento,Tipo Equipamento,AP MAC,AP Nome,SSID,Inicio,Fim,Duracao,Bytes Entrada,Bytes Saida,Motivo Desconexao,Origem Registro";
    const csvRows = rows.map((r) => {
      const inicio = r.inicio_conexao ? new Date(r.inicio_conexao).toISOString().replace("T", " ").slice(0, 19) : "";
      const fim = r.fim_conexao ? new Date(r.fim_conexao).toISOString().replace("T", " ").slice(0, 19) : "";
      const duracao = formatDuracao(r.duracao_segundos || 0);
      return [
        r.username || "",
        r.cpf || "",
        r.mac || "",
        r.ip_atribuido || "",
        r.nas_ip || "",
        r.equipamento || "",
        r.equipamento_tipo || "",
        r.ap_mac || "",
        r.ap_nome || "",
        r.ssid || "",
        inicio,
        fim,
        duracao,
        r.bytes_entrada || 0,
        r.bytes_saida || 0,
        r.motivo_desconexao || "",
        r.auth_result || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });

    const csv = [header, ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=compliance_logs.csv");
    res.send(csv);
  } catch (err) {
    console.error("Erro ao exportar CSV de compliance:", err);
    res.status(500).json({ message: "Erro ao exportar CSV." });
  }
};

function formatDuracao(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return `${h}h ${m}m`;
}

// --- Access Points (catalogo MAC -> nome amigavel usado nos relatorios) ---
// Auto-aprendidos pelo syncConnectionLogs; aqui o admin so lista e nomeia.

exports.listarAccessPoints = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, mac, nome, ultimo_ssid, visto_em
       FROM access_points
       WHERE empresa_id = ?
       ORDER BY COALESCE(nome, mac)`,
      [req.empresa_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro ao listar access points:", err);
    res.status(500).json({ message: "Erro ao listar access points." });
  }
};

exports.renomearAccessPoint = async (req, res) => {
  try {
    const { nome } = req.body;
    const [result] = await db.execute(
      "UPDATE access_points SET nome = ? WHERE id = ? AND empresa_id = ?",
      [nome ? String(nome).trim().slice(0, 100) : null, req.params.id, req.empresa_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Access point não encontrado." });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao renomear access point:", err);
    res.status(500).json({ message: "Erro ao renomear access point." });
  }
};
