/**
 * Migration 024 — AP de origem nos relatorios LGPD e Marco Civil.
 *
 * - connection_logs.ap_mac / ssid: parseados do radacct.calledstationid
 *   (Omada/UniFi mandam "MAC-DO-AP:SSID"; MikroTik manda o nome do server
 *   hotspot, que cai no campo ssid).
 * - leads.ap_mac / ssid: capturados do portal_contexts (redirect do portal)
 *   no momento do cadastro/aceite.
 * - access_points: catalogo auto-aprendido de APs por empresa (MAC -> nome
 *   amigavel). O RADIUS nao transporta o nome do AP; o admin nomeia na tela
 *   Marco Civil e os relatorios resolvem via JOIN.
 * - Backfill: preenche ap_mac/ssid das sessoes ja sincronizadas a partir do
 *   radacct e semeia access_points.
 */
const db = require("../db");
const { parseCalledStationId } = require("../src/utils/apInfo");

async function colunaExiste(tabela, coluna) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return rows[0].n > 0;
}

async function up() {
  // Collation explicita: connection_logs e' utf8mb4_0900_ai_ci em algumas
  // instalacoes — sem fixar, o JOIN com access_points (unicode_ci) quebra
  // com "Illegal mix of collations".
  const COL_AP = "VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL";
  const COL_SSID = "VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL";

  // 1. Colunas em connection_logs
  if (!(await colunaExiste("connection_logs", "ap_mac"))) {
    await db.query(
      `ALTER TABLE connection_logs ADD COLUMN ap_mac ${COL_AP} AFTER nas_ip, ADD COLUMN ssid ${COL_SSID} AFTER ap_mac`
    );
    console.log("024: connection_logs.ap_mac/ssid criadas.");
  } else {
    await db.query(
      `ALTER TABLE connection_logs MODIFY ap_mac ${COL_AP}, MODIFY ssid ${COL_SSID}`
    );
    console.log("024: connection_logs.ap_mac ja existia (collation normalizada).");
  }

  // 2. Colunas em leads
  if (!(await colunaExiste("leads", "ap_mac"))) {
    await db.query(
      `ALTER TABLE leads ADD COLUMN ap_mac ${COL_AP} AFTER ip, ADD COLUMN ssid ${COL_SSID} AFTER ap_mac`
    );
    console.log("024: leads.ap_mac/ssid criadas.");
  } else {
    await db.query(
      `ALTER TABLE leads MODIFY ap_mac ${COL_AP}, MODIFY ssid ${COL_SSID}`
    );
    console.log("024: leads.ap_mac ja existia (collation normalizada).");
  }

  // 3. Tabela access_points
  await db.query(`
    CREATE TABLE IF NOT EXISTS access_points (
      id INT NOT NULL AUTO_INCREMENT,
      empresa_id INT NOT NULL,
      mac VARCHAR(20) NOT NULL,
      nome VARCHAR(100) DEFAULT NULL,
      ultimo_ssid VARCHAR(64) DEFAULT NULL,
      visto_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_ap_empresa_mac (empresa_id, mac)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("024: tabela access_points criada (ou ja existia).");

  // 4. Backfill de connection_logs a partir do radacct + seed de access_points
  const [rows] = await db.query(`
    SELECT cl.id, cl.empresa_id, ra.calledstationid
    FROM connection_logs cl
    JOIN radacct ra ON ra.acctuniqueid COLLATE utf8mb4_unicode_ci = cl.acctuniqueid COLLATE utf8mb4_unicode_ci
    WHERE cl.ap_mac IS NULL AND cl.ssid IS NULL
      AND ra.calledstationid IS NOT NULL AND ra.calledstationid <> ''
  `);
  let atualizadas = 0;
  const aps = new Map(); // "empresa|mac" -> ssid
  for (const row of rows) {
    const { apMac, ssid } = parseCalledStationId(row.calledstationid);
    if (!apMac && !ssid) continue;
    await db.query("UPDATE connection_logs SET ap_mac = ?, ssid = ? WHERE id = ?", [
      apMac, ssid, row.id,
    ]);
    atualizadas++;
    if (apMac && row.empresa_id) aps.set(`${row.empresa_id}|${apMac}`, ssid);
  }
  for (const [chave, ssid] of aps) {
    const [empresaId, mac] = chave.split("|");
    await db.query(
      `INSERT INTO access_points (empresa_id, mac, ultimo_ssid)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ultimo_ssid = COALESCE(VALUES(ultimo_ssid), ultimo_ssid)`,
      [empresaId, mac, ssid]
    );
  }
  console.log(`024: backfill de ${atualizadas} sessoes, ${aps.size} APs aprendidos.`);
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("024 falhou:", err);
    process.exit(1);
  });
