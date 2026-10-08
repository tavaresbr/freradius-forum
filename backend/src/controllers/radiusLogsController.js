// src/controllers/radiusLogsController.js
const db = require("../../db");
const { parseCalledStationId } = require("../utils/apInfo");

/**
 * Anexa ap_mac/ssid (parse do calledstationid) e ap_nome (access_points) nas
 * linhas do radacct. Parse em JS evita dor de collation no JOIN por expressao.
 */
async function anexarApInfo(rows, empresaId) {
  const macs = new Set();
  for (const r of rows) {
    const { apMac, ssid } = parseCalledStationId(r.calledstationid);
    r.ap_mac = apMac;
    r.ssid = ssid;
    r.ap_nome = null;
    if (apMac) macs.add(apMac);
  }
  if (macs.size > 0) {
    const lista = [...macs];
    const [aps] = await db.query(
      `SELECT mac, nome FROM access_points WHERE empresa_id = ? AND mac IN (${lista.map(() => "?").join(",")})`,
      [empresaId, ...lista]
    );
    const nomePorMac = Object.fromEntries(aps.map((a) => [a.mac, a.nome]));
    for (const r of rows) {
      if (r.ap_mac && nomePorMac[r.ap_mac]) r.ap_nome = nomePorMac[r.ap_mac];
    }
  }
  return rows;
}

exports.listarLogs = async (req, res) => {
  try {
    const { username, mac, ip, data_inicio, data_fim } = req.query;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const per_page = Math.min(Math.max(parseInt(req.query.per_page || "50", 10), 1), 500);
    const offset = (page - 1) * per_page;

    const where = ["ru.empresa_id = ?"];
    const params = [req.empresa_id];

    if (username) {
      where.push("ra.username LIKE ?");
      params.push(`%${username}%`);
    }
    if (mac) {
      where.push("ra.callingstationid LIKE ?");
      params.push(`%${mac}%`);
    }
    if (ip) {
      where.push("ra.framedipaddress LIKE ?");
      params.push(`%${ip}%`);
    }
    if (data_inicio) {
      where.push("ra.acctstarttime >= ?");
      params.push(`${data_inicio} 00:00:00`);
    }
    if (data_fim) {
      where.push("ra.acctstarttime <= ?");
      params.push(`${data_fim} 23:59:59`);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    // Count total
    const [countResult] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM radacct ra
      INNER JOIN radius_users ru ON ru.username = ra.username
      ${whereClause}
      `,
      params
    );
    const total = countResult[0].total;

    // Fetch paginated data
    const [rows] = await db.query(
      `
      SELECT
        ra.username,
        ra.callingstationid   AS mac,
        ra.calledstationid,
        ra.framedipaddress    AS ip,
        ra.nasipaddress       AS nas_ip,
        COALESCE(m.nome, n.shortname, n.description, 'NAS') AS nas_nome,
        ra.acctstarttime      AS conectado_em,
        ra.acctstoptime       AS desconectado_em,
        ra.acctsessiontime    AS segundos_conectado,
        ra.acctinputoctets    AS bytes_entrada,
        ra.acctoutputoctets   AS bytes_saida,
        ra.acctterminatecause AS motivo_desconexao
      FROM radacct ra
      INNER JOIN radius_users ru ON ru.username = ra.username
      LEFT JOIN mikrotiks m ON m.ip = ra.nasipaddress
      LEFT JOIN nas n       ON n.nasname = ra.nasipaddress
      ${whereClause}
      ORDER BY COALESCE(ra.acctstoptime, ra.acctstarttime) DESC
      LIMIT ? OFFSET ?
      `,
      [...params, per_page, offset]
    );

    await anexarApInfo(rows, req.empresa_id);

    res.json({ data: rows, total, page, per_page });
  } catch (err) {
    console.error("Erro ao buscar logs do RADIUS:", err);
    res.status(500).json({ message: "Erro ao buscar logs do RADIUS." });
  }
};

exports.exportarCSV = async (req, res) => {
  try {
    const { username, mac, ip, data_inicio, data_fim } = req.query;

    const where = ["ru.empresa_id = ?"];
    const params = [req.empresa_id];

    if (username) {
      where.push("ra.username LIKE ?");
      params.push(`%${username}%`);
    }
    if (mac) {
      where.push("ra.callingstationid LIKE ?");
      params.push(`%${mac}%`);
    }
    if (ip) {
      where.push("ra.framedipaddress LIKE ?");
      params.push(`%${ip}%`);
    }
    if (data_inicio) {
      where.push("ra.acctstarttime >= ?");
      params.push(`${data_inicio} 00:00:00`);
    }
    if (data_fim) {
      where.push("ra.acctstarttime <= ?");
      params.push(`${data_fim} 23:59:59`);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    const [rows] = await db.query(
      `
      SELECT
        ra.username,
        ra.callingstationid   AS mac,
        ra.calledstationid,
        ra.framedipaddress    AS ip,
        ra.nasipaddress       AS nas_ip,
        COALESCE(m.nome, n.shortname, n.description, 'NAS') AS nas_nome,
        ra.acctstarttime      AS conectado_em,
        ra.acctstoptime       AS desconectado_em,
        ra.acctsessiontime    AS segundos_conectado,
        ra.acctinputoctets    AS bytes_entrada,
        ra.acctoutputoctets   AS bytes_saida,
        ra.acctterminatecause AS motivo_desconexao
      FROM radacct ra
      INNER JOIN radius_users ru ON ru.username = ra.username
      LEFT JOIN mikrotiks m ON m.ip = ra.nasipaddress
      LEFT JOIN nas n       ON n.nasname = ra.nasipaddress
      ${whereClause}
      ORDER BY COALESCE(ra.acctstoptime, ra.acctstarttime) DESC
      `,
      params
    );

    await anexarApInfo(rows, req.empresa_id);

    // Build CSV
    const header = "Username,MAC,IP,NAS IP,NAS Nome,AP Nome,AP MAC,SSID,Conectado em,Desconectado em,Duracao (s),Bytes Entrada,Bytes Saida,Motivo\n";
    const csvRows = rows.map((r) => {
      const fields = [
        r.username || "",
        r.mac || "",
        r.ip || "",
        r.nas_ip || "",
        (r.nas_nome || "").replace(/,/g, " "),
        r.ap_nome || "",
        r.ap_mac || "",
        r.ssid || "",
        r.conectado_em || "",
        r.desconectado_em || "",
        r.segundos_conectado ?? "",
        r.bytes_entrada ?? 0,
        r.bytes_saida ?? 0,
        (r.motivo_desconexao || "").replace(/,/g, " "),
      ];
      return fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",");
    });

    const csv = header + csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="radius-logs.csv"');
    res.send(csv);
  } catch (err) {
    console.error("Erro ao exportar CSV:", err);
    res.status(500).json({ message: "Erro ao exportar CSV." });
  }
};
