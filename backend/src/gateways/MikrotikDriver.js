/**
 * MikrotikDriver — driver do gateway MikroTik (RouterOS + FreeRADIUS).
 *
 * NAO reimplementa a logica: DELEGA para os modulos existentes, ja testados em
 * producao, para garantir "mesmo comportamento" (Fase 4A):
 *   - authorize        -> mikrotikAPIController.liberarUsuario
 *   - reauthorize      -> coa.upgradeSessaoCoA (CoA da Fase 1.7)
 *   - revoke           -> mikrotikAPIController.removerUsuarioPorMac
 *   - getActiveSessions-> query radacct (mesma da radiusController.listarSessoesAtivas)
 *   - syncSessionHistory-> jobs/syncConnectionLogs
 *   - buildPortalContext-> normaliza $(mac)/$(ip) do redirect MikroTik
 *   - testConnection   -> utils/mikrotikClient.testarConexao
 *
 * Direcao das dependencias: o driver requer os controllers/utils; os controllers
 * NAO requerem o driver (evita ciclo de require).
 */
const db = require("../../db");
const GatewayDriver = require("./GatewayDriver");
const { liberarUsuario, removerUsuarioPorMac } = require("../controllers/mikrotikAPIController");
const { upgradeSessaoCoA } = require("../utils/coa");
const { testarConexao } = require("../utils/mikrotikClient");
const syncConnectionLogs = require("../jobs/syncConnectionLogs");

class MikrotikDriver extends GatewayDriver {
  /**
   * Libera usuario no RADIUS (comportamento identico a liberarUsuario).
   * @param {Object} params - { mac, ip, plano, empresa_id, cpf, telefone,
   *   cliente_id, portal_id, contexto_tipo, referencia_id }
   */
  async authorize(params) {
    return liberarUsuario(params);
  }

  /**
   * Upgrade sem reconexao via CoA (Fase 1.7). Aceita rateLimit ja formatado
   * ("5M/10M") ou upKbps/downKbps (converte para o formato Mikrotik-Rate-Limit).
   * @param {Object} p - { username, sessionTimeout|minutes, rateLimit|upKbps, downKbps }
   */
  async reauthorize({ username, sessionTimeout, minutes, rateLimit, upKbps, downKbps }) {
    const timeout = sessionTimeout != null
      ? Number(sessionTimeout)
      : (minutes != null ? Number(minutes) * 60 : undefined);

    let rate = rateLimit;
    if (!rate && upKbps != null && downKbps != null) {
      // Mikrotik-Rate-Limit = "{up}k/{down}k"
      rate = `${Math.round(Number(upKbps))}k/${Math.round(Number(downKbps))}k`;
    }

    return upgradeSessaoCoA({ username, sessionTimeout: timeout, rateLimit: rate });
  }

  /**
   * Remove o usuario do MikroTik e limpa RADIUS.
   * @param {Object} p - { mac, limparRadius }
   */
  async revoke({ mac, limparRadius = true }) {
    return removerUsuarioPorMac(mac, limparRadius);
  }

  /**
   * Lista sessoes ativas da empresa (mesma query da radiusController).
   * @param {Object} p - { empresa_id }
   */
  async getActiveSessions({ empresa_id }) {
    const [sessoes] = await db.query(`
      SELECT
        ra.username,
        ll.cpf,
        ra.callingstationid AS mac,
        ra.framedipaddress AS ip,
        ra.nasipaddress AS gateway,
        ra.acctstarttime,
        ra.acctsessiontime AS segundos,
        ra.acctinputoctets AS bytes_entrada,
        ra.acctoutputoctets AS bytes_saida
      FROM radacct ra
      INNER JOIN mikrotiks m ON m.ip COLLATE utf8mb4_unicode_ci = ra.nasipaddress COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
         SELECT mac, empresa_id, MAX(cpf) as cpf
         FROM leads
         GROUP BY mac, empresa_id
      ) ll ON ll.mac COLLATE utf8mb4_unicode_ci = ra.callingstationid COLLATE utf8mb4_unicode_ci AND ll.empresa_id = m.empresa_id
      WHERE ra.acctstoptime IS NULL
        AND m.empresa_id = ?
      ORDER BY ra.acctstarttime DESC
    `, [empresa_id]);
    return sessoes;
  }

  /**
   * Sincroniza radacct -> connection_logs (Marco Civil). Cursor interno do job.
   */
  async syncSessionHistory() {
    return syncConnectionLogs();
  }

  /**
   * Normaliza os parametros do redirect do MikroTik ($(mac), $(ip), ...).
   * @param {Object} query - req.query do redirect do captive portal
   */
  buildPortalContext(query = {}) {
    return {
      vendor: "mikrotik",
      mac: query.mac || query.callingstationid || null,
      ip: query.ip || null,
      username: query.username || null,
      ssid: query.ssid || null,
      apMac: query["ap-mac"] || query.apMac || null,
      redirectUrl: query["link-orig"] || query.linkorig || query.redirectUrl || null,
      raw: query,
    };
  }

  /**
   * Testa a conexao RouterOS API. Usa a config passada ou a do proprio gateway.
   * @param {Object} [cfg] - { ip, usuario, senha, porta }
   */
  async testConnection(cfg) {
    return testarConexao(cfg || this.gateway);
  }
}

module.exports = MikrotikDriver;
