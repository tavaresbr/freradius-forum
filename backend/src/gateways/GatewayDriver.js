/**
 * GatewayDriver — contrato da camada de gateways (Fase 4).
 *
 * Um "gateway" e' um controlador de rede que autentica/autoriza clientes do
 * hotspot. Hoje so existe o MikroTik (RADIUS + redirect end_hotspot); a Fase 4
 * adiciona Omada (TP-Link) e UniFi (Ubiquiti). Toda a variacao por vendor fica
 * nesta camada de LIBERACAO/REVOGACAO/SESSOES — NAO na camada RADIUS.
 *
 * A abstracao permite que os controllers de negocio (pagamento, LGPD, lead,
 * radius) chamem sempre o mesmo contrato (`getDriver(gateway.tipo).authorize(...)`)
 * sem saber qual vendor esta por tras.
 *
 * Cada driver concreto (MikrotikDriver, OmadaDriver, UnifiDriver) estende esta
 * classe e implementa os metodos abaixo. A classe base apenas documenta o
 * contrato e lanca "nao implementado" para forcar o override.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO
 * ---------------------------------------------------------------------------
 *
 * authorize(params) => Promise<void|Object>
 *   Libera/autoriza um cliente. No MikroTik: escreve radcheck/radreply/
 *   radusergroup/radius_users e (se ja houver sessao ativa) faz upgrade via CoA.
 *   No Omada (variante RADIUS) o comportamento e' equivalente; no UniFi e' uma
 *   chamada authorize-guest na API do controller.
 *   params: {
 *     mac, ip, plano, empresa_id, cpf, telefone, cliente_id,
 *     portal_id, contexto_tipo, referencia_id
 *   }
 *   (assinatura espelha `liberarUsuario` do MikroTik para nao quebrar callers)
 *
 * reauthorize(params) => Promise<{ok:boolean, ...}>
 *   Upgrade SEM reconexao (Fase 1.7): muda tempo/velocidade da sessao ativa no
 *   ar. MikroTik usa CoA (porta 3799); Omada/UniFi re-chamam a API de
 *   autorizacao com os novos limites.
 *   params: { username, sessionTimeout|minutes, rateLimit|upKbps, downKbps }
 *
 * revoke(params) => Promise<{success:boolean, ...}>
 *   Desconecta/remove o cliente. MikroTik: remove hotspot user/active/host +
 *   limpa RADIUS. UniFi: unauthorize-guest. Omada: revogacao via API.
 *   params: { mac, username, limparRadius }
 *
 * getActiveSessions(params) => Promise<Array>
 *   Lista sessoes ativas no formato atual do painel (username, cpf, mac, ip,
 *   gateway, acctstarttime, segundos, bytes_entrada, bytes_saida).
 *   MikroTik/Omada: query em radacct. UniFi: GET stat/sta.
 *   params: { empresa_id }
 *
 * syncSessionHistory(params) => Promise<any>
 *   Alimenta connection_logs (Marco Civil). MikroTik/Omada: sync incremental de
 *   radacct. UniFi: polling de stat/session (radacct nao e' confiavel no UniFi).
 *   params: { cursor }
 *
 * buildPortalContext(query) => Object
 *   Normaliza os parametros que o vendor manda no redirect do captive portal
 *   para um formato unico { mac, ip, ssid, apMac, redirectUrl, ... }.
 *   MikroTik: $(mac)/$(ip). Omada: clientMac/apMac/ssidName. UniFi: id/ap/ssid.
 *
 * testConnection(cfg) => Promise<{sucesso:boolean, erro?:string}>
 *   Testa a conectividade/credenciais com o gateway. MikroTik: RouterOS API.
 *   Omada/UniFi: login na API do controller.
 * ---------------------------------------------------------------------------
 */
class GatewayDriver {
  /**
   * @param {Object} [gateway] - linha da tabela `mikrotiks` (config do gateway)
   */
  constructor(gateway = {}) {
    this.gateway = gateway;
    this.tipo = gateway.tipo || "mikrotik";
  }

  /** @abstract */
  async authorize() {
    throw new Error(`authorize() nao implementado para o gateway '${this.tipo}'`);
  }

  /** @abstract */
  async reauthorize() {
    throw new Error(`reauthorize() nao implementado para o gateway '${this.tipo}'`);
  }

  /** @abstract */
  async revoke() {
    throw new Error(`revoke() nao implementado para o gateway '${this.tipo}'`);
  }

  /** @abstract */
  async getActiveSessions() {
    throw new Error(`getActiveSessions() nao implementado para o gateway '${this.tipo}'`);
  }

  /** @abstract */
  async syncSessionHistory() {
    throw new Error(`syncSessionHistory() nao implementado para o gateway '${this.tipo}'`);
  }

  /** @abstract */
  buildPortalContext() {
    throw new Error(`buildPortalContext() nao implementado para o gateway '${this.tipo}'`);
  }

  /** @abstract */
  async testConnection() {
    throw new Error(`testConnection() nao implementado para o gateway '${this.tipo}'`);
  }
}

module.exports = GatewayDriver;
