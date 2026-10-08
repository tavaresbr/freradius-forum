/**
 * OmadaDriver — driver do gateway Omada (TP-Link).
 *
 * ===========================================================================
 * MODO UNICO: External RADIUS Server + External Web Portal (homologado em
 * campo 17-21/08/2026). O controller Omada faz Access-Request/Accounting
 * DIRETO no FreeRADIUS deste servidor: radacct, totalcounter (Max-All-Session),
 * Simultaneous-Use e syncConnectionLogs sao a FONTE DE VERDADE.
 *   - authorize: bookkeeping RADIUS (radcheck/radreply/radius_users), identico
 *     ao MikroTik — o corte de tempo/banda e' do FreeRADIUS.
 *   - a autorizacao no controller e' feita pelo NAVEGADOR do cliente via
 *     browserauth (gatewayLiberacao.montarBrowserauthOmada).
 *
 * DECISAO 21/08/2026: o antigo "modo API" de autorizacao de portal
 * (hotspot/extPortal/auth, nunca validado em hardware) foi DESCONTINUADO.
 * Os campos controller_url/omadac_id/api_user/api_pass do gateway agora
 * servem SOMENTE pra captura de dados do controller — hoje, os nomes dos
 * access points pros relatorios (src/services/omadaApNames.js, endpoints
 * /api/mikrotiks/:id/omada-api). Preenche-los NAO muda o fluxo do portal.
 *
 * Setup no controller: RADIUS Profile (auth 1812 / acct 1813 + secret),
 * SSID em External Web Portal -> https://<dominio>/hotspot/redirect/<id>,
 * Pre-Authentication Access liberando o servidor. Tutorial: menu Documentacao.
 * ===========================================================================
 */
const db = require("../../db");
const GatewayDriver = require("./GatewayDriver");
const { liberarUsuario, removerUsuarioPorMac } = require("../controllers/mikrotikAPIController");
const syncConnectionLogs = require("../jobs/syncConnectionLogs");

class OmadaDriver extends GatewayDriver {
  constructor(gateway = {}) {
    super(gateway);
  }

  /**
   * Modo API: autoriza um cliente no portal externo do Omada.
   *
   * Persiste primeiro a bookkeeping RADIUS (mapa username<->CPF, saldo
   * Max-All-Session) reusando `liberarUsuario`, depois chama extPortal/auth.
   * No modo External RADIUS isso ja basta (a chamada de API vira no-op) — por
   * isso a chamada de API so acontece se houver controller_url configurado.
   *
   * @param {Object} params - { mac, ip, plano, empresa_id, cpf, telefone,
   *   cliente_id, portal_id, contexto_tipo, referencia_id, portalContext }
   *   portalContext (do buildPortalContext): { apMac, ssidName, radioId, site }
   */
  async authorize(params = {}) {
    // Bookkeeping RADIUS (fonte de verdade do saldo/compliance) — mesmo do MikroTik.
    // DECISAO 21/08/2026: Omada e' SEMPRE External RADIUS (modelo homologado).
    // controller_url preenchido NAO muda o fluxo do portal — a API do controller
    // e' usada somente pra captura de dados (nomes de APs, services/omadaApNames).
    await liberarUsuario(params);
    return { mode: "external-radius" };
  }

  /**
   * Upgrade sem reconexao (Fase 1.7): no External RADIUS o corte/upgrade e'
   * inteiramente do FreeRADIUS — nada a fazer no controller.
   */
  async reauthorize() {
    // Sempre External RADIUS: o corte/upgrade e' do FreeRADIUS (ver authorize).
    return { ok: true, mode: "external-radius", note: "corte pelo FreeRADIUS" };
  }

  /**
   * Revoga o cliente: limpeza RADIUS (mesma do MikroTik) — sempre External RADIUS.
   * @param {Object} p - { mac, username, limparRadius }
   */
  async revoke(p = {}) {
    return removerUsuarioPorMac(p.mac, p.limparRadius !== false);
  }

  /**
   * Sessoes ativas. No modo External RADIUS o Omada popula o radacct, entao a
   * query e' a mesma do MikroTik (join radacct x mikrotiks por NAS-IP).
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
    // TODO(hardware): no modo API (sem External RADIUS) o radacct fica vazio pro
    // Omada; listar via GET {site}/clients do controller se necessario.
  }

  /**
   * Compliance. No modo External RADIUS o radacct do Omada e' sincronizado pelo
   * mesmo job do MikroTik. No modo API puro nao ha radacct (ver header).
   */
  async syncSessionHistory() {
    return syncConnectionLogs();
  }

  /**
   * Normaliza os params do redirect do External Web Portal do Omada.
   * O controller manda: clientMac, apMac, ssidName, radioId, site, redirectUrl.
   * @param {Object} query - req.query do redirect
   */
  buildPortalContext(query = {}) {
    return {
      vendor: "omada",
      mac: query.clientMac || query.clientmac || null,
      ip: query.ip || null,
      apMac: query.apMac || query.apmac || null,
      ssidName: query.ssidName || query.ssidname || query.ssid || null,
      radioId: query.radioId || query.radioid || null,
      site: query.site || null,
      redirectUrl: query.redirectUrl || query.redirecturl || query.url || null,
      raw: query,
    };
  }

  /**
   * Testa a conexao com o controller (login do operador Hotspot).
   * No modo External RADIUS (sem controller_url) nao ha API pra testar — quem
   * autentica e' o FreeRADIUS local, entao consideramos o gateway OK.
   * @returns {Promise<{sucesso:boolean, erro?:string}>}
   */
  async testConnection() {
    // SEMPRE External RADIUS: valida o que e validavel do fluxo do portal:
    //   1. NAS cadastrado pro IP do gateway (sem ele o FreeRADIUS ignora tudo);
    //   2. FreeRADIUS de pe;
    //   3. IP do gateway respondendo (ping) — pega IP digitado errado.
    // O SECRET nao e validavel daqui (so o controller o usa num Access-Request
    // real) — a prova definitiva e trafego em radpostauth/radacct.
    // Se a API de captura estiver configurada (controller_url), testa tambem o
    // login de admin — falha na API NAO derruba o status (portal independe dela).
    try {
      const ip = String(this.gateway.ip || "").trim();
      if (!/^[0-9a-fA-F.:]+$/.test(ip)) {
        return { sucesso: false, erro: `IP do gateway invalido: "${ip}"` };
      }
      const [[nasRow]] = await db.query("SELECT id FROM nas WHERE nasname = ?", [ip]);
      if (!nasRow) {
        return { sucesso: false, erro: `NAS ${ip} nao existe no RADIUS — reedite e salve o equipamento pra recriar` };
      }
      const { exec } = require("child_process");
      const execP = (cmd) => new Promise((resolve) => exec(cmd, (err) => resolve(!err)));
      const radiusOk = await execP("systemctl is-active --quiet freeradius");
      if (!radiusOk) {
        return { sucesso: false, erro: "FreeRADIUS parado no servidor (systemctl status freeradius)" };
      }
      const pingOk = await execP(`ping -c 1 -W 2 ${ip}`);
      if (!pingOk) {
        return { sucesso: false, erro: `IP ${ip} nao respondeu ao ping — confira o IP do local/controller (se o site bloqueia ICMP, o gateway pode estar ok mesmo assim)` };
      }

      let api;
      if (this.gateway.controller_url && this.gateway.api_user) {
        try {
          const { loginAdmin } = require("../services/omadaApNames");
          await loginAdmin(this.gateway);
          api = { ok: true };
        } catch (err) {
          api = { ok: false, erro: err.message };
        }
      }

      return {
        sucesso: true,
        modo: "external-radius",
        aviso: "NAS ok, FreeRADIUS ativo e IP respondendo. O secret so e validado com trafego real do controller (radpostauth).",
        ...(api ? { api } : {}),
      };
    } catch (err) {
      return { sucesso: false, erro: err.message };
    }
  }
}

module.exports = OmadaDriver;
