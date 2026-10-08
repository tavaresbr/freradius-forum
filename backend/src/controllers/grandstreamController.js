const db = require("../../db");
const axios = require("axios");

/**
 * grandstreamController — integracao opcional com a GWN Cloud (Grandstream).
 *
 * O fluxo de liberacao do portal NAO passa por aqui: Grandstream opera como
 * External Web Portal + External RADIUS, entao quem provisiona o acesso e' o
 * liberarUsuario (RADIUS no nosso padrao cumulativo) e o "login final" e' um
 * GET no login_url do gateway (montado em gatewayLiberacao.montarGatewayInfo).
 *
 * Este controller cobre SO o monitoramento opcional (botao "Testar" na lista
 * de equipamentos) e deixa disponivel o authorize via API do GWN Cloud pra
 * evolucao futura — hoje nao e' o caminho recomendado.
 */
class GrandstreamController {
  /**
   * Bearer token da GWN Cloud (OAuth client_credentials).
   * URL-encode das credenciais (secret com +/&/= quebraria concatenado cru).
   */
  async getAccessToken(gw) {
    if (!gw.gwn_api_key || !gw.gwn_api_secret) {
      throw new Error("GWN Cloud API Keys nao configuradas para este gateway");
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: gw.gwn_api_key,
      client_secret: gw.gwn_api_secret,
    }).toString();
    const { data } = await axios.post("https://www.gwn.cloud/oauth/token", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });
    if (data && data.access_token) return data.access_token;
    throw new Error("Falha ao obter token da GWN Cloud");
  }

  /**
   * Status online/offline (== consegue OAuth). Usado pelo botao "Testar".
   * @param {number} mikrotik_id
   * @returns {Promise<{status:'online'|'offline'}>}
   */
  async getStatus(mikrotik_id) {
    try {
      const [[gw]] = await db.query(
        "SELECT gwn_api_key, gwn_api_secret FROM mikrotiks WHERE id = ?",
        [mikrotik_id]
      );
      if (!gw) return { status: "offline" };
      await this.getAccessToken(gw);
      return { status: "online" };
    } catch {
      return { status: "offline" };
    }
  }

  /**
   * Autoriza um cliente via API GWN Cloud (modo API — OPCIONAL, fora do fluxo
   * External RADIUS recomendado). Mantido pra evolucao futura.
   */
  async authorizeApiOnly({ mikrotik_id, mac, apMac, ssidName, duracaoSegundos }) {
    if (!mac || !apMac || !ssidName) {
      throw new Error("mac, apMac e ssidName sao obrigatorios para autorizar via API.");
    }
    const [[gw]] = await db.query(
      "SELECT gwn_api_key, gwn_api_secret, gwn_network_id FROM mikrotiks WHERE id = ?",
      [mikrotik_id]
    );
    if (!gw) throw new Error("Gateway nao encontrado.");
    const token = await this.getAccessToken(gw);

    const payload = {
      mac: apMac.replace(/-/g, ":").toUpperCase(),
      client_mac: mac.replace(/-/g, ":").toUpperCase(),
      ssid_name: ssidName,
      end_use_time: duracaoSegundos ? String(Date.now() + duracaoSegundos * 1000) : "",
      auth_type: "",
    };
    const { data } = await axios.post(
      "https://www.gwn.cloud/oapi/v1.0.0/portal/pass",
      payload,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 10000 }
    );
    if (data && data.retCode !== 0) {
      throw new Error(`Erro na API GWN: ${data.msg || data.retCode}`);
    }
    return true;
  }
}

module.exports = new GrandstreamController();
