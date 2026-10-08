/**
 * Service de notificacao WhatsApp pos-liberacao de acesso.
 *
 * Responsabilidades:
 *  - Buscar template + toggle do portal
 *  - Resolver telefone (prioridades estaveis, sem mac/ip)
 *  - Renderizar template Mustache {{var}} com fallbacks seguros
 *  - Enviar via Evolution API
 *  - Registrar log em whatsapp_logs (ok/erro/skipped)
 *
 * NUNCA bloqueia o fluxo principal: erros sao capturados e gravados em log.
 */

const db = require("../../db");
const { enviarMensagemDireta } = require("../controllers/whatsappController");

/**
 * Normaliza telefone brasileiro para o formato exigido pela Evolution API: 13 digitos (55 + DDD + numero).
 *
 * Regras:
 *   - Remove tudo que nao e digito.
 *   - 10 ou 11 digitos  -> assume DDD + numero, prefixa 55 (ex: "41999999999" -> "5541999999999")
 *   - 12 ou 13 digitos  -> assume ja tem 55 DDI, retorna como esta.
 *   - Outros tamanhos   -> retorna null (telefone invalido, nao envia).
 *
 * IMPORTANTE: a detecao DEVE ser por comprimento, NAO por `startsWith("55")`.
 * Telefones de Santa Maria/RS tem DDD 55 e sem DDI ficam "55999999999" (11 digitos),
 * que o algoritmo errado confundia com "ja tem DDI".
 */
function normalizarTelefone(telefone) {
  if (!telefone) return null;
  const digits = String(telefone).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return null;
}

/**
 * Renderiza template Mustache-like com variaveis.
 * Substitui {{var}} e {{ var }} por vars[var] || ''.
 * Nunca deixa variavel nao-resolvida no resultado (evita mostrar {{foo}} pro usuario final).
 */
function renderTemplate(template, vars) {
  if (!template) return "";
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

/**
 * Grava entrada em whatsapp_logs. Silencioso em caso de erro (nao propaga).
 */
async function gravarLog({ empresa_id, portal_id, telefone, mensagem, contexto_tipo, referencia_id, status, erro_msg, skip_motivo }) {
  try {
    await db.query(
      `INSERT INTO whatsapp_logs
         (empresa_id, portal_id, telefone, mensagem, contexto_tipo, referencia_id, status, erro_msg, skip_motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        empresa_id || null,
        portal_id || null,
        telefone || null,
        mensagem || null,
        contexto_tipo || null,
        referencia_id || null,
        status,
        erro_msg ? String(erro_msg).slice(0, 500) : null,
        skip_motivo || null,
      ]
    );
  } catch (logErr) {
    console.warn("[whatsappNotify] falha ao gravar log:", logErr.message);
  }
}

/**
 * Busca config de notificacao do portal.
 * Retorna { enabled, template } ou null se portal nao existe.
 */
async function getPortalNotifConfig(portalId, empresaId) {
  if (!portalId) return null;
  try {
    // Filtro por empresa quando conhecido: portal_id pode ter vindo de request
    // publica — sem isso um portal de OUTRA empresa forneceria template/toggle.
    const params = [portalId];
    let sql = "SELECT whatsapp_enabled AS enabled, whatsapp_template AS template FROM portais WHERE id = ?";
    if (empresaId) {
      sql += " AND empresa_id = ?";
      params.push(empresaId);
    }
    sql += " LIMIT 1";
    const [[row]] = await db.query(sql, params);
    if (!row) return null;
    return { enabled: !!row.enabled, template: row.template || "" };
  } catch (e) {
    console.warn("[whatsappNotify] erro ao buscar portal config:", e.message);
    return null;
  }
}

/**
 * Resolve portal_id a partir do mikrotik_id, quando o caller nao informou.
 * Pega o portal ativo mais recente associado ao MikroTik.
 */
async function resolvePortalByMikrotik(mikrotikId, empresaId) {
  if (!mikrotikId) return null;
  try {
    const params = [mikrotikId];
    let sql = "SELECT portal_id FROM mikrotiks WHERE id = ?";
    if (empresaId) {
      sql += " AND empresa_id = ?";
      params.push(empresaId);
    }
    sql += " LIMIT 1";
    const [[row]] = await db.query(sql, params);
    return row?.portal_id || null;
  } catch (e) {
    return null;
  }
}

/**
 * Funcao principal chamada pelo liberarUsuario.
 *
 * @param {object} ctx
 * @param {number} ctx.empresa_id
 * @param {number} [ctx.portal_id] - se nao vier, tenta resolver por mikrotik_id
 * @param {number} [ctx.mikrotik_id]
 * @param {string} [ctx.telefone] - se ja tiver em maos, passa direto
 * @param {number} [ctx.cliente_id] - id do lead (fonte mais confiavel do telefone)
 * @param {string} [ctx.cpf] - fallback: busca lead por CPF
 * @param {string} [ctx.mac] - fallback final: lgpd_logins por mac
 * @param {string} ctx.contexto_tipo - 'pagamento_aprovado'|'lgpd'|'manual'|'acesso_temporario'
 * @param {number} [ctx.referencia_id] - id do pagamento/lead/etc
 * @param {object} ctx.vars - variaveis para o template: { nome, username, password, plano, duracao, ... }
 */
async function notificarLiberacao(ctx) {
  const {
    empresa_id,
    portal_id: portalIdInput,
    mikrotik_id,
    telefone: telefoneInput,
    cliente_id,
    cpf,
    mac,
    contexto_tipo = "liberacao",
    referencia_id = null,
    vars = {},
  } = ctx || {};

  try {
    // 1. Resolver portal_id
    let portalId = portalIdInput || null;
    if (!portalId && mikrotik_id) {
      portalId = await resolvePortalByMikrotik(mikrotik_id, empresa_id);
    }

    // 2. Buscar config do portal
    const config = await getPortalNotifConfig(portalId, empresa_id);

    if (!config) {
      await gravarLog({
        empresa_id, portal_id: portalId, telefone: telefoneInput,
        contexto_tipo, referencia_id,
        status: "skipped", skip_motivo: "sem_portal",
      });
      return { ok: false, skipped: "sem_portal" };
    }

    if (!config.enabled) {
      await gravarLog({
        empresa_id, portal_id: portalId, telefone: telefoneInput,
        contexto_tipo, referencia_id,
        status: "skipped", skip_motivo: "disabled",
      });
      return { ok: false, skipped: "disabled" };
    }

    if (!config.template || !config.template.trim()) {
      await gravarLog({
        empresa_id, portal_id: portalId, telefone: telefoneInput,
        contexto_tipo, referencia_id,
        status: "skipped", skip_motivo: "sem_template",
      });
      return { ok: false, skipped: "sem_template" };
    }

    // 3. Resolver telefone e nome (cliente_id > telefone explicito > cpf > mac)
    let telefone = telefoneInput || null;
    let nomeCliente = vars.nome || null;

    if ((!telefone || !nomeCliente) && cliente_id) {
      try {
        const [[lead]] = await db.query(
          "SELECT nome, telefone FROM leads WHERE id = ? LIMIT 1",
          [cliente_id]
        );
        if (lead) {
          telefone = telefone || lead.telefone || null;
          nomeCliente = nomeCliente || lead.nome || null;
        }
      } catch (e) { /* silencioso */ }
    }

    if ((!telefone || !nomeCliente) && cpf) {
      try {
        const cpfLimpo = String(cpf).replace(/\D/g, "");
        if (cpfLimpo) {
          const params = [cpfLimpo];
          let sql = `SELECT nome, telefone FROM leads
                     WHERE REPLACE(REPLACE(REPLACE(cpf,'.',''),'-',''),' ','') = ?
                       AND telefone IS NOT NULL`;
          if (empresa_id) {
            sql += " AND empresa_id = ?";
            params.push(empresa_id);
          }
          sql += " ORDER BY criado_em DESC, id DESC LIMIT 1";
          const [[lead]] = await db.query(sql, params);
          if (lead) {
            telefone = telefone || lead.telefone || null;
            nomeCliente = nomeCliente || lead.nome || null;
          }
        }
      } catch (e) { /* silencioso */ }
    }

    if (!telefone && mac) {
      try {
        // A tabela lgpd_logins nao existe: o consentimento LGPD e' gravado em
        // leads com origem='lgpd'. Busca por MAC (escopo de empresa quando houver).
        const paramsMac = [mac];
        let sqlMac = `SELECT nome, telefone FROM leads
                      WHERE mac = ? AND origem = 'lgpd' AND telefone IS NOT NULL`;
        if (empresa_id) {
          sqlMac += " AND empresa_id = ?";
          paramsMac.push(empresa_id);
        }
        sqlMac += " ORDER BY criado_em DESC, id DESC LIMIT 1";
        const [[lgpd]] = await db.query(sqlMac, paramsMac);
        if (lgpd) {
          telefone = lgpd.telefone || null;
          nomeCliente = nomeCliente || lgpd.nome || null;
        }
      } catch (e) { /* silencioso */ }
    }

    if (!telefone) {
      await gravarLog({
        empresa_id, portal_id: portalId, telefone: null,
        contexto_tipo, referencia_id,
        status: "skipped", skip_motivo: "sem_telefone",
      });
      return { ok: false, skipped: "sem_telefone" };
    }

    // 4. Montar variaveis e renderizar template
    const mergedVars = {
      nome: nomeCliente || "Cliente",
      ...vars,
    };

    const mensagemFinal = renderTemplate(config.template, mergedVars).trim();

    if (!mensagemFinal) {
      await gravarLog({
        empresa_id, portal_id: portalId, telefone,
        contexto_tipo, referencia_id,
        status: "skipped", skip_motivo: "mensagem_vazia",
      });
      return { ok: false, skipped: "mensagem_vazia" };
    }

    // 5. Normalizar telefone e enviar
    const telefoneComDDI = normalizarTelefone(telefone);
    if (!telefoneComDDI) {
      await gravarLog({
        empresa_id, portal_id: portalId, telefone,
        contexto_tipo, referencia_id,
        status: "skipped", skip_motivo: "telefone_invalido",
      });
      return { ok: false, skipped: "telefone_invalido" };
    }

    try {
      await enviarMensagemDireta(telefoneComDDI, mensagemFinal, empresa_id);
      await gravarLog({
        empresa_id, portal_id: portalId, telefone: telefoneComDDI,
        mensagem: mensagemFinal, contexto_tipo, referencia_id,
        status: "ok",
      });
      return { ok: true, mensagem: mensagemFinal };
    } catch (sendErr) {
      const erroMsg = sendErr?.response?.data?.message || sendErr?.message || "erro desconhecido";
      await gravarLog({
        empresa_id, portal_id: portalId, telefone: telefoneComDDI,
        mensagem: mensagemFinal, contexto_tipo, referencia_id,
        status: "erro", erro_msg: erroMsg,
      });
      return { ok: false, erro: erroMsg };
    }
  } catch (fatal) {
    // Nunca propagar - o fluxo de liberacao segue
    console.error("[whatsappNotify] erro fatal:", fatal.message);
    try {
      await gravarLog({
        empresa_id, portal_id: null, telefone: telefoneInput,
        contexto_tipo, referencia_id,
        status: "erro", erro_msg: `fatal: ${fatal.message}`,
      });
    } catch (_) {}
    return { ok: false, erro: fatal.message };
  }
}

module.exports = {
  notificarLiberacao,
  renderTemplate,
  resolvePortalByMikrotik,
  getPortalNotifConfig,
};
