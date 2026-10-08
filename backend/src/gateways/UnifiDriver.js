/**
 * UnifiDriver — driver do gateway UniFi (Ubiquiti).
 *
 * ===========================================================================
 * POR QUE API + POLLING (e NAO RADIUS)
 * ===========================================================================
 * O guest portal do UniFi com RADIUS tem accounting instavel/nao confiavel
 * (varios relatos na comunidade Ubiquiti). Portanto:
 *   - NAO construimos compliance (Marco Civil) sobre o radacct do UniFi.
 *   - Autorizacao e' feita via API do controller (authorize-guest).
 *   - O corte por TEMPO e' responsabilidade do DRIVER (passamos `minutes` =
 *     saldo restante calculado aqui), NAO do sqlcounter do FreeRADIUS.
 *   - A compliance vem de POLLING das sessoes (job syncUnifiSessions.js):
 *     GET stat/sta (ativos) + stat/session (historico) -> connection_logs.
 *
 * Ainda escrevemos a bookkeeping RADIUS local (radcheck/radreply/radius_users)
 * reusando `liberarUsuario` porque e' dali que sai:
 *   - o mapa username<->CPF (username = CPF do cliente),
 *   - o saldo total (Max-All-Session), base do calculo de `minutes`,
 *   - o `radius_users.liberado_em` (reset do saldo na nova compra),
 *   - a notificacao WhatsApp (notificarLiberacao).
 * O que muda: o UniFi ignora esses atributos RADIUS — quem autoriza e corta e'
 * o controller, com os `minutes`/`up`/`down` que passamos na API.
 *
 * Biblioteca: `node-unifi` (madura, cobre login/authorize-guest/stat/*). O
 * require e' LAZY (dentro dos metodos) pra que importar este arquivo nao quebre
 * o boot quando a dependencia ainda nao foi instalada (npm i node-unifi).
 *
 * Config do gateway (linha da tabela `mikrotiks`, migration 019):
 *   controller_url (host[:porta]), controller_site, api_user, api_pass, verify_tls
 * ===========================================================================
 */
const db = require("../../db");
const GatewayDriver = require("./GatewayDriver");
const { liberarUsuario } = require("../controllers/mikrotikAPIController");

// 1 Mbps -> kbps (rate limit do authorize-guest e' em kbps)
const KBPS_POR_MBPS = 1000;

class UnifiDriver extends GatewayDriver {
  /**
   * Instancia (lazy) um controller node-unifi ja logado.
   * @returns {Promise<Object>} controller node-unifi autenticado
   */
  async _controller() {
    let Unifi;
    try {
      // eslint-disable-next-line global-require
      Unifi = require("node-unifi");
    } catch (e) {
      throw new Error("Dependencia 'node-unifi' nao instalada. Rode: npm i node-unifi");
    }

    const { host, port } = this._hostPort();
    const verifyTls = this.gateway.verify_tls === undefined ? true : !!Number(this.gateway.verify_tls);

    const controller = new Unifi.Controller({
      host,
      port,
      sslverify: verifyTls, // controller UniFi e' tipicamente self-signed -> verify_tls=0
      site: this.gateway.controller_site || "default",
    });

    // node-unifi v2: login(username, password) retorna Promise.
    await controller.login(this.gateway.api_user, this.gateway.api_pass);
    return controller;
  }

  /** Extrai host e porta do controller_url (aceita "host", "host:porta" ou URL). */
  _hostPort() {
    let raw = String(this.gateway.controller_url || "").trim();
    raw = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const [host, portStr] = raw.split(":");
    // UniFi OS usa 443; controller standalone usa 8443. Default 8443.
    const port = portStr ? Number(portStr) : 8443;
    return { host, port };
  }

  /**
   * Autoriza um cliente no controller (authorize-guest).
   * `minutes` = saldo restante (Max-All-Session - consumido em connection_logs).
   * @param {Object} params - { mac, ip, plano, empresa_id, cpf, ... }
   */
  async authorize(params = {}) {
    // 1) Bookkeeping RADIUS local (username<->CPF, saldo, liberado_em, WhatsApp).
    await liberarUsuario(params);

    // 2) Resolve username (CPF ou MAC), banda do plano e saldo restante.
    const cpfNumeros = params.cpf ? String(params.cpf).replace(/\D/g, "") : null;
    const username = cpfNumeros || params.mac;
    const { upKbps, downKbps } = await this._bandaKbps(params.plano, params.empresa_id);
    const minutes = await this._saldoMinutos(username);

    // 3) authorize-guest via controller.
    const r = await this.authorizeApiOnly({ mac: params.mac, username, minutes, upKbps, downKbps });
    return { ok: true, username, minutes, unifi: r.unifi };
  }

  /**
   * SO a chamada authorize-guest — sem bookkeeping RADIUS/WhatsApp.
   * Usado por gatewayLiberacao.montarGatewayInfo quando o controller de negocio
   * ja provisionou o RADIUS. Se a banda nao vier, tenta resolver do radreply
   * (Mikrotik-Rate-Limit "upM/downM") do proprio username.
   * @param {Object} p - { mac, username, minutes, upKbps, downKbps }
   */
  async authorizeApiOnly(p = {}) {
    let { upKbps, downKbps } = p;
    if ((upKbps == null || downKbps == null) && (p.username || p.mac)) {
      try {
        const [[rr]] = await db.query(
          "SELECT value FROM radreply WHERE username = ? AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1",
          [p.username || p.mac]
        );
        const m = rr ? String(rr.value).match(/^(\d+)M\/(\d+)M$/i) : null;
        if (m) {
          upKbps = Number(m[1]) * KBPS_POR_MBPS;
          downKbps = Number(m[2]) * KBPS_POR_MBPS;
        }
      } catch (_) { /* banda opcional */ }
    }

    const minutes = Math.max(1, Math.round(Number(p.minutes) || 1));
    const controller = await this._controller();
    try {
      // TODO(hardware): assinatura authorizeGuest(mac, minutes, up, down, MBytes, apMac)
      // pode variar por versao do node-unifi — validar em bancada.
      const r = await controller.authorizeGuest(p.mac, minutes, upKbps, downKbps);
      return { ok: true, minutes, unifi: r };
    } finally {
      try { await controller.logout(); } catch (_) { /* noop */ }
    }
  }

  /**
   * Upgrade sem reconexao (Fase 1.7). No UniFi e' NATIVO: basta re-chamar
   * authorize-guest com os novos limites (funciona como "re-authorize-guest").
   * @param {Object} p - { mac, username, minutes, upKbps, downKbps, plano, empresa_id }
   */
  async reauthorize(p = {}) {
    const banda = (p.upKbps != null && p.downKbps != null)
      ? { upKbps: p.upKbps, downKbps: p.downKbps }
      : await this._bandaKbps(p.plano, p.empresa_id);
    const minutes = p.minutes != null ? Number(p.minutes) : await this._saldoMinutos(p.username || p.mac);

    const controller = await this._controller();
    try {
      const r = await controller.authorizeGuest(p.mac, Math.max(1, Math.round(minutes)), banda.upKbps, banda.downKbps);
      return { ok: true, minutes, unifi: r };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      try { await controller.logout(); } catch (_) { /* noop */ }
    }
  }

  /**
   * Revoga o cliente (unauthorize-guest) + limpa RADIUS local (zera saldo).
   * @param {Object} p - { mac, username, limparRadius }
   */
  async revoke(p = {}) {
    const controller = await this._controller();
    try {
      await controller.unauthorizeGuest(p.mac);
    } catch (err) {
      console.warn(`[UnifiDriver] unauthorizeGuest falhou para ${p.mac}: ${err.message}`);
    } finally {
      try { await controller.logout(); } catch (_) { /* noop */ }
    }

    if (p.limparRadius !== false && p.username) {
      await db.query("DELETE FROM radcheck WHERE username = ?", [p.username]);
      await db.query("DELETE FROM radreply WHERE username = ?", [p.username]);
      await db.query("DELETE FROM radusergroup WHERE username = ?", [p.username]);
    }
    return { success: true };
  }

  /**
   * Sessoes ativas: GET stat/sta no controller (radacct do UniFi nao e' fonte).
   * Normaliza pro formato do painel; CPF resolvido por MAC na tabela leads.
   * @param {Object} p - { empresa_id }
   */
  async getActiveSessions({ empresa_id }) {
    const controller = await this._controller();
    let clients = [];
    try {
      clients = await controller.getClientDevices(); // stat/sta
    } catch (err) {
      console.warn(`[UnifiDriver] getClientDevices falhou: ${err.message}`);
      return [];
    } finally {
      try { await controller.logout(); } catch (_) { /* noop */ }
    }

    // node-unifi pode retornar array ou [array] — normaliza.
    const lista = Array.isArray(clients) && Array.isArray(clients[0]) ? clients[0] : (clients || []);

    // CPF por MAC (empresa) pra enriquecer o username exibido.
    const [leadRows] = await db.query(
      "SELECT mac, MAX(cpf) AS cpf FROM leads WHERE empresa_id = ? GROUP BY mac",
      [empresa_id]
    );
    const cpfPorMac = new Map(leadRows.map((r) => [String(r.mac || "").toLowerCase(), r.cpf]));

    // Pagamentos ativos: tempo restante por MAC/CPF (o radacct do UniFi nao e'
    // fonte confiavel, entao o tempo vem do plano pago). Fallback pro c.end da
    // autorizacao no controller quando existir.
    const [pags] = await db.query(
      `SELECT p.mac, p.cpf,
              TIMESTAMPDIFF(SECOND, NOW(), COALESCE(p.expira_em, DATE_ADD(p.liberado_em, INTERVAL pl.duracao_minutos MINUTE))) AS seg_restantes
         FROM pagamentos p
         JOIN planos pl ON pl.id = p.plano_id
        WHERE p.empresa_id = ? AND p.status = 'approved'
          AND (p.expira_em > NOW() OR (p.expira_em IS NULL AND DATE_ADD(p.liberado_em, INTERVAL pl.duracao_minutos MINUTE) > NOW()))
        ORDER BY p.id DESC`,
      [empresa_id]
    );
    const pagMap = new Map();
    for (const p of pags) {
      const k = String(p.mac || "").toLowerCase();
      if (k && !pagMap.has(k)) pagMap.set(k, p);
      if (p.cpf && !pagMap.has(p.cpf)) pagMap.set(p.cpf, p);
    }

    return lista
      .filter((c) => c && c.authorized === true) // so clientes efetivamente autorizados
      .map((c) => {
        const mac = String(c.mac || "").toLowerCase();
        const cpf = cpfPorMac.get(mac) || null;
        const pag = pagMap.get(mac) || (cpf ? pagMap.get(cpf) : null) || null;

        let tempoRestante = null;
        if (c.end && c.end > 0) {
          tempoRestante = Math.max(0, c.end - Math.floor(Date.now() / 1000));
        } else if (pag && pag.seg_restantes > 0) {
          tempoRestante = pag.seg_restantes;
        }

        return {
          username: cpf || mac,
          cpf,
          mac,
          ip: c.ip || null,
          gateway: this.gateway.nome || c.ap_mac || "UniFi AP",
          acctstarttime: c.assoc_time ? new Date(c.assoc_time * 1000) : (c.start ? new Date(c.start * 1000) : new Date()),
          segundos: c.uptime || 0,
          bytes_entrada: c.rx_bytes || 0,
          bytes_saida: c.tx_bytes || 0,
          tempo_restante_segundos: tempoRestante,
        };
      });
  }

  /**
   * Compliance: delega ao job de polling (stat/session -> connection_logs).
   */
  async syncSessionHistory({ cursor } = {}) {
    // eslint-disable-next-line global-require
    const syncUnifiSessions = require("../jobs/syncUnifiSessions");
    return syncUnifiSessions({ gateway: this.gateway, cursor });
  }

  /**
   * Normaliza os params do redirect do guest portal do UniFi.
   * O controller manda: id (=MAC do cliente), ap (=MAC do AP), ssid, t, url.
   * @param {Object} query - req.query do redirect
   */
  buildPortalContext(query = {}) {
    return {
      vendor: "unifi",
      mac: query.id || query.mac || null,
      apMac: query.ap || null,
      ssid: query.ssid || null,
      t: query.t || null, // timestamp assinado do UniFi
      redirectUrl: query.url || query.redirectUrl || null,
      raw: query,
    };
  }

  /**
   * Testa a conexao com o controller (login).
   * @returns {Promise<{sucesso:boolean, erro?:string}>}
   */
  async testConnection() {
    try {
      const controller = await this._controller();
      try { await controller.logout(); } catch (_) { /* noop */ }
      return { sucesso: true };
    } catch (err) {
      return { sucesso: false, erro: err.message };
    }
  }

  // ---- helpers ----

  /** Banda do plano em kbps (up/down) para o authorize-guest. */
  async _bandaKbps(planoNome, empresaId) {
    if (!planoNome) return { upKbps: null, downKbps: null };
    let q = "SELECT velocidade_up, velocidade_down FROM planos WHERE nome = ?";
    const params = [planoNome];
    if (empresaId) { q += " AND empresa_id = ?"; params.push(empresaId); }
    q += " LIMIT 1";
    const [rows] = await db.query(q, params);
    if (!rows[0]) return { upKbps: null, downKbps: null };
    return {
      upKbps: Math.round(Number(rows[0].velocidade_up) * KBPS_POR_MBPS),
      downKbps: Math.round(Number(rows[0].velocidade_down) * KBPS_POR_MBPS),
    };
  }

  /**
   * Saldo restante em minutos = (Max-All-Session - consumido) / 60.
   * Max-All-Session vem do radcheck; consumido = SUM(duracao_segundos) das
   * sessoes em connection_logs desde a ultima liberacao (radius_users.liberado_em).
   * No UniFi o corte por tempo e' do driver, entao isto e' a fonte de verdade.
   * @param {string} username
   * @returns {Promise<number>} minutos restantes (>= 0)
   */
  async _saldoMinutos(username) {
    if (!username) return 0;
    // Planos de tempo CORRIDO gravam 'Expiration' (data de expiracao); planos
    // CUMULATIVOS gravam 'Max-All-Session' (segundos de uso). Se houver
    // Expiration, o saldo e' pelo relogio.
    const [chks] = await db.query(
      "SELECT attribute, value FROM radcheck WHERE username = ? AND attribute IN ('Max-All-Session', 'Expiration')",
      [username]
    );
    const expAttr = chks.find((c) => c.attribute === "Expiration");
    if (expAttr && expAttr.value) {
      const expireTime = Date.parse(expAttr.value);
      if (isNaN(expireTime)) return 0;
      return Math.max(0, (expireTime - Date.now()) / 60000);
    }
    const maxAttr = chks.find((c) => c.attribute === "Max-All-Session");
    const maxSeg = maxAttr ? Number(maxAttr.value) : 0;
    if (!maxSeg) return 0;

    const [[lib]] = await db.query(
      "SELECT liberado_em FROM radius_users WHERE username = ? ORDER BY liberado_em DESC LIMIT 1",
      [username]
    );
    const liberadoEm = lib?.liberado_em || null;

    const [[cons]] = await db.query(
      `SELECT COALESCE(SUM(duracao_segundos), 0) AS usado
         FROM connection_logs
        WHERE username = ?
          AND (? IS NULL OR inicio_conexao >= ?)`,
      [username, liberadoEm, liberadoEm]
    );
    const usadoSeg = Number(cons?.usado || 0);
    const restanteSeg = Math.max(0, maxSeg - usadoSeg);
    return restanteSeg / 60;
  }
}

module.exports = UnifiDriver;
