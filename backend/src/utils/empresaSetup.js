/**
 * empresaSetup — setup padrao de uma empresa nova.
 *
 * Os 5 portais padrao (lgpd, planos, lead, lead_passivo, login) TEM que existir
 * em toda empresa: os fluxos publicos resolvem portal por tipo
 * (SELECT ... WHERE tipo = ? AND empresa_id = ?) e falham em silencio sem eles
 * (aceite LGPD sem prova, lead sem portal_id, WhatsApp nunca dispara).
 *
 * Este helper e' a UNICA fonte desses INSERTs — usado por:
 *   - empresaController.criarEmpresa (painel super admin)
 *   - registroController.registrarEmpresa (registro publico /api/registro)
 * Nao duplicar o INSERT em outros lugares.
 */
const { DEFAULT_WHATSAPP_TEMPLATE, DEFAULT_PORTAL_PLANOS_CONFIG } = require("../constants/whatsappDefaults");

/**
 * Cria os 5 portais padrao da empresa.
 * O portal 'planos' ja vem com configuracoes padrao (PIX + Cartao ativos +
 * trial de 5min habilitado). Todos vem com template WhatsApp preenchido.
 *
 * @param {Object} executor - pool `db` ou uma connection de transacao (ambos tem .execute)
 * @param {number} empresaId
 */
async function criarPortaisPadrao(executor, empresaId) {
  const planosConfigJson = JSON.stringify(DEFAULT_PORTAL_PLANOS_CONFIG);
  await executor.execute(
    `INSERT INTO portais (empresa_id, nome, slug, tipo, url_redirect, ativo, whatsapp_template, configuracoes) VALUES
     (?, 'LGPD - Coleta de Dados', 'lgpd', 'lgpd', '/cadastro', 1, ?, NULL),
     (?, 'Planos - Pagamento', 'planos', 'planos', '/planos-cliente', 1, ?, ?),
     (?, 'Cadastro de LEAD', 'lead', 'lead', '/lead', 1, ?, NULL),
     (?, 'Cadastro de LEAD (Sem Internet)', 'lead-passivo', 'lead_passivo', '/lead-passivo', 1, ?, NULL),
     (?, 'Acesso Wi-Fi', 'login', 'login', '/login-hotspot', 1, ?, NULL)`,
    [
      empresaId, DEFAULT_WHATSAPP_TEMPLATE,
      empresaId, DEFAULT_WHATSAPP_TEMPLATE, planosConfigJson,
      empresaId, DEFAULT_WHATSAPP_TEMPLATE,
      empresaId, DEFAULT_WHATSAPP_TEMPLATE,
      empresaId, DEFAULT_WHATSAPP_TEMPLATE,
    ]
  );
}

module.exports = { criarPortaisPadrao };
