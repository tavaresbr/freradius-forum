const GatewayDriver = require("./GatewayDriver");
const grandstreamController = require("../controllers/grandstreamController");

/**
 * GrandstreamDriver — gateway Grandstream GWN.
 *
 * Grandstream opera como External Web Portal + External RADIUS (igual ao Omada
 * External RADIUS). A liberacao/RADIUS e' feita pelo liberarUsuario e o "login
 * final" e' um GET no login_url do gateway, montado em
 * gatewayLiberacao.montarGatewayInfo — este driver NAO participa desse caminho.
 *
 * Aqui ficam so:
 *   - testConnection: monitoramento opcional via GWN Cloud (botao "Testar").
 *   - authorizeApiOnly: modo API opcional (fora do fluxo recomendado).
 *   - revoke/getActiveSessions/syncSessionHistory: como Grandstream usa o nosso
 *     FreeRADIUS, sessoes/historico saem do radacct pelo caminho padrao; aqui
 *     retornam respostas honestas (sem simular sucesso de desconexao).
 */
class GrandstreamDriver extends GatewayDriver {
  constructor(gateway = {}) {
    super(gateway);
    this.config = gateway;
  }

  async testConnection() {
    // Sem chaves GWN => External RADIUS puro, nao ha o que testar via API.
    if (!this.config.gwn_api_key || !this.config.gwn_api_secret) {
      return { sucesso: true, mensagem: "Conexao RADIUS ativa (sem monitoramento GWN)" };
    }
    try {
      const res = await grandstreamController.getStatus(this.config.id);
      return res && res.status === "online"
        ? { sucesso: true, mensagem: "Conexao bem-sucedida com a GWN Cloud" }
        : { sucesso: false, erro: "Equipamento offline na GWN Cloud ou chaves invalidas." };
    } catch (err) {
      return { sucesso: false, erro: err.message };
    }
  }

  /** Modo API opcional (fora do fluxo External RADIUS recomendado). */
  async authorizeApiOnly({ mac, portalContext, duracaoSegundos }) {
    if (!portalContext || !portalContext.apMac) {
      throw new Error("MAC do AP ausente no contexto. Nao e' possivel autorizar via API.");
    }
    return grandstreamController.authorizeApiOnly({
      mikrotik_id: this.config.id,
      mac,
      apMac: portalContext.apMac,
      ssidName: portalContext.ssidName || portalContext.ssid || "Guest",
      duracaoSegundos,
    });
  }

  /**
   * Grandstream via External RADIUS nao expoe um disconnect simples e sem
   * ap_mac/ssid. Honesto: nao simula sucesso — a limpeza RADIUS ja corta o
   * acesso no proximo reauth.
   */
  async revoke() {
    return { success: false, message: "Grandstream: desconexao ativa nao suportada via External RADIUS (limpeza RADIUS corta no proximo reauth)." };
  }

  /** Sessoes ativas saem do radacct pelo caminho padrao (External RADIUS). */
  async getActiveSessions() {
    return [];
  }

  /** Historico (Marco Civil) sai do radacct pelo sync padrao. */
  async syncSessionHistory() {
    return { synced: 0 };
  }
}

module.exports = GrandstreamDriver;
