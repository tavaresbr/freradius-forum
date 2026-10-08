/**
 * syncUnifiSessions — poll de sessoes UniFi -> connection_logs (Marco Civil).
 *
 * O accounting RADIUS do guest portal do UniFi NAO e' confiavel, entao a
 * compliance vem de POLLING da API do controller (mesmo cron de 5 min do
 * server.js). Para cada gateway `tipo='unifi'`:
 *   1. login no controller (node-unifi)
 *   2. GET stat/session (historico) + stat/sta (ativos)
 *   3. upsert em connection_logs por acctuniqueid (indice UNIQUE) -> idempotente
 *
 * A retencao de sessoes do controller e' curta; por isso o poll frequente.
 *
 * `node-unifi` e' require LAZY: se nao estiver instalado, o job apenas loga e
 * retorna (nao derruba o cron nem o boot).
 *
 * Uso:
 *   node src/jobs/syncUnifiSessions.js            # todos os gateways unifi
 *   syncUnifiSessions({ gateway })                # um gateway especifico
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const db = require("../../db");

/** acctuniqueid tem 32 chars; deriva um id estavel da sessao UniFi. */
function sessionUid(empresaId, s) {
  const base = String(s._id || s.session_id || `${s.mac}-${s.assoc_time || s.start || ""}`);
  return `u${empresaId}_${base}`.slice(0, 32);
}

function _hostPort(controllerUrl) {
  let raw = String(controllerUrl || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const [host, portStr] = raw.split(":");
  return { host, port: portStr ? Number(portStr) : 8443 };
}

/**
 * Sincroniza um gateway UniFi.
 * @param {Object} gateway - linha da tabela mikrotiks (tipo='unifi')
 * @returns {Promise<{synced:number, ignored:number}>}
 */
async function syncGatewayUnifi(gateway) {
  let Unifi;
  try {
    // eslint-disable-next-line global-require
    Unifi = require("node-unifi");
  } catch (e) {
    console.warn("[syncUnifiSessions] node-unifi nao instalado — pulando. (npm i node-unifi)");
    return { synced: 0, ignored: 0, skipped: true };
  }

  const { host, port } = _hostPort(gateway.controller_url);
  const verifyTls = gateway.verify_tls === undefined ? true : !!Number(gateway.verify_tls);
  const controller = new Unifi.Controller({
    host, port, sslverify: verifyTls, site: gateway.controller_site || "default",
  });

  let sessions = [];
  try {
    await controller.login(gateway.api_user, gateway.api_pass);
    // Janela: ultimas 24h (a retencao do controller e' curta; o upsert dedup).
    const end = Math.floor(Date.now() / 1000);
    const start = end - 24 * 3600;
    // TODO(hardware): assinatura getSessions(start, end, mac, type) pode variar
    // por versao do node-unifi — validar em bancada.
    sessions = await controller.getSessions(start, end);
  } catch (err) {
    console.warn(`[syncUnifiSessions] gateway ${gateway.id} (${host}): ${err.message}`);
    try { await controller.logout(); } catch (_) { /* noop */ }
    return { synced: 0, ignored: 0, error: err.message };
  } finally {
    try { await controller.logout(); } catch (_) { /* noop */ }
  }

  const lista = Array.isArray(sessions) && Array.isArray(sessions[0]) ? sessions[0] : (sessions || []);
  if (lista.length === 0) return { synced: 0, ignored: 0 };

  // CPF por MAC (empresa) pra derivar username/cpf.
  const [leadRows] = await db.query(
    "SELECT mac, MAX(cpf) AS cpf FROM leads WHERE empresa_id = ? GROUP BY mac",
    [gateway.empresa_id]
  );
  const cpfPorMac = new Map(leadRows.map((r) => [String(r.mac || "").toLowerCase(), r.cpf]));

  let synced = 0;
  let ignored = 0;
  for (const s of lista) {
    const mac = String(s.mac || "").toLowerCase();
    if (!mac) { ignored++; continue; }
    const cpf = cpfPorMac.get(mac) || null;
    const username = cpf || mac;

    const inicio = s.assoc_time || s.start || null;
    const fim = s.disconnect_time || s.end || null;
    const inicioDt = inicio ? new Date(inicio * 1000) : null;
    const fimDt = fim ? new Date(fim * 1000) : null;
    const dur = (inicio && fim) ? Math.max(0, fim - inicio) : (s.duration || 0);

    if (!inicioDt) { ignored++; continue; }

    await db.query(
      `INSERT INTO connection_logs
        (empresa_id, username, acctuniqueid, cpf, mac, ip_atribuido, nas_ip,
         inicio_conexao, fim_conexao, bytes_entrada, bytes_saida, duracao_segundos,
         motivo_desconexao, auth_result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
         fim_conexao = VALUES(fim_conexao),
         bytes_entrada = VALUES(bytes_entrada),
         bytes_saida = VALUES(bytes_saida),
         duracao_segundos = VALUES(duracao_segundos),
         ip_atribuido = VALUES(ip_atribuido)`,
      [
        gateway.empresa_id,
        username,
        sessionUid(gateway.empresa_id, s),
        cpf,
        mac,
        s.ip || "",
        // nas_ip = IP do equipamento cadastrado (VARCHAR(15); controller_url
        // estoura o campo e quebra o JOIN com mikrotiks no relatorio)
        String(gateway.ip || "").slice(0, 15),
        inicioDt,
        fimDt,
        s.rx_bytes || s.bytes_r || 0,
        s.tx_bytes || s.bytes_t || 0,
        dur,
        null,
        "unifi",
      ]
    );
    synced++;
  }

  console.log(`[syncUnifiSessions] gateway ${gateway.id}: ${synced} sincronizadas, ${ignored} ignoradas.`);
  return { synced, ignored };
}

/**
 * Roda o sync. Sem `gateway` -> percorre todos os gateways tipo='unifi'.
 * @param {Object} [opts] - { gateway, cursor }
 */
async function syncUnifiSessions(opts = {}) {
  if (opts.gateway) {
    return syncGatewayUnifi(opts.gateway);
  }
  const [gateways] = await db.query(
    "SELECT * FROM mikrotiks WHERE tipo = 'unifi'"
  );
  const totais = { synced: 0, ignored: 0, gateways: gateways.length };
  for (const g of gateways) {
    try {
      const r = await syncGatewayUnifi(g);
      totais.synced += r.synced || 0;
      totais.ignored += r.ignored || 0;
    } catch (err) {
      console.error(`[syncUnifiSessions] falha no gateway ${g.id}:`, err.message);
    }
  }
  return totais;
}

module.exports = syncUnifiSessions;

// Run directly
if (require.main === module) {
  syncUnifiSessions()
    .then((r) => {
      console.log("[syncUnifiSessions] Concluido:", r);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[syncUnifiSessions] Falha:", err);
      process.exit(1);
    });
}
