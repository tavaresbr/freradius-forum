// Defaults centralizados pra criacao de portais em empresas novas e em portais manuais.
// Usados em:
//  - migrations/012_whatsapp_notif.js  (backfill de portais existentes)
//  - empresaController.criarEmpresa     (auto-criacao de portais da empresa nova)
//  - portalController.criarPortal       (criacao manual de novo portal)

// Template padrao da notificacao WhatsApp enviada ao liberar acesso do cliente.
// Variaveis Mustache suportadas (renderizadas pelo service whatsappNotify):
//   {{nome}} {{username}} {{password}} {{plano}} {{duracao}} {{velocidade}}
//   {{valor}} {{empresa}} {{login_url}} {{expira_em}} {{cpf}}
const DEFAULT_WHATSAPP_TEMPLATE = `✅ *Acesso liberado!*

Olá {{nome}}! Seu plano *{{plano}}* foi ativado.

👤 Usuário: {{username}}
🔑 Senha: {{password}}
⏱ Duração: {{duracao}} min

Caso não tenha conectado automaticamente, clique no link abaixo:
{{login_url}}`;

// Configuracoes JSON padrao pro portal tipo 'planos' em empresas novas.
// E' gravado em portais.configuracoes (TEXT) como JSON stringificado.
// Habilita por default:
//   - PIX e Cartao como metodos de pagamento
//   - Acesso free 5min ao clicar em "Copiar PIX" (pix_trial)
// O admin pode desligar/ajustar depois via PortalEditor.
const DEFAULT_PORTAL_PLANOS_CONFIG = {
  pagamento_pix_ativo: true,
  pagamento_cartao_ativo: true,
  pix_trial_enabled: true,
  pix_trial_duracao_minutos: 5,
};

module.exports = {
  DEFAULT_WHATSAPP_TEMPLATE,
  DEFAULT_PORTAL_PLANOS_CONFIG,
};
