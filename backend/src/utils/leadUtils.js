const db = require("../../db");

/**
 * Verifica se já existe um lead com o CPF informado para a empresa.
 * @param {string} cpf - CPF (pode ter máscara)
 * @param {number|null} empresaId
 * @returns {Object|null} lead existente ou null
 */
async function verificarLeadExistente(cpf, empresaId) {
  if (!cpf) return null;
  const cpfLimpo = cpf.replace(/\D/g, "");
  if (cpfLimpo.length < 11) return null;

  let query = "SELECT id, nome, email, telefone, cpf, origem, criado_em FROM leads WHERE REPLACE(REPLACE(cpf, '.', ''), '-', '') = ?";
  const params = [cpfLimpo];

  if (empresaId) {
    query += " AND empresa_id = ?";
    params.push(empresaId);
  }

  query += " ORDER BY criado_em DESC LIMIT 1";
  const [[existing]] = await db.execute(query, params);
  return existing || null;
}

/**
 * Calcula o saldo de tempo RADIUS de um usuario (modelo cumulativo).
 * Soma o tempo consumido (acctsessiontime + tempo vivo se sessao aberta)
 * de TODO o historico do radacct e compara com Max-All-Session do radcheck.
 * Bate com o sqlcounter 'totalcounter' do FreeRADIUS (reset=never).
 * @param {string} username - username RADIUS (tipicamente CPF limpo)
 * @returns {Object} { existe, temSaldo, password, maxSession, tempoUsado, tempoRestante }
 */
async function verificarSaldoRadius(username) {
  if (!username) return { existe: false, temSaldo: false, tempoRestante: 0 };

  const [radcheckRows] = await db.query(
    "SELECT attribute, value FROM radcheck WHERE username = ?",
    [username]
  );

  if (radcheckRows.length === 0) {
    return { existe: false, temSaldo: false, tempoRestante: 0 };
  }

  const maxSessionRow = radcheckRows.find(r => r.attribute === "Max-All-Session");
  const passwordRow = radcheckRows.find(r => r.attribute === "Cleartext-Password");
  const maxSession = maxSessionRow ? parseInt(maxSessionRow.value) : 0;
  const password = passwordRow ? passwordRow.value : username;

  // IMPORTANTE: espelha o sqlcounter 'totalcounter' do FreeRADIUS, que soma apenas
  // sessoes com acctstarttime >= liberado_em (reset por timestamp da Fase 1.1).
  // Sem esse filtro, o backend somaria TODO o historico do radacct (que nao e mais
  // apagado nas liberacoes) e reportaria "sem saldo" pra clientes que o FreeRADIUS
  // ainda considera com tempo — bloqueando reconexao de quem tem saldo.
  const [[acctResult]] = await db.query(
    `SELECT COALESCE(SUM(
       IF(acctstoptime IS NULL,
          UNIX_TIMESTAMP() - UNIX_TIMESTAMP(acctstarttime),
          acctsessiontime)
     ), 0) AS usado
     FROM radacct
     WHERE username = ?
       AND acctstarttime >= COALESCE(
         (SELECT MAX(liberado_em) FROM radius_users WHERE username = ?),
         '1970-01-01 00:00:00')`,
    [username, username]
  );
  const tempoUsado = acctResult.usado || 0;
  const temSaldo = maxSession > 0 && tempoUsado < maxSession;

  return {
    existe: true,
    temSaldo,
    password,
    maxSession,
    tempoUsado,
    tempoRestante: temSaldo ? maxSession - tempoUsado : 0,
  };
}

/**
 * Atualiza (re-registra) um lead existente com novos dados e, opcionalmente,
 * um novo aceite LGPD. Cada reconexao gera um novo consentimento LGPD valido
 * (timestamp atualizado). Preserva isolamento multi-tenant filtrando por empresa_id.
 * @param {number} leadId
 * @param {number|null} empresaId
 * @param {Object} dados - { nome, email, telefone, mac, ip, aceite, termo }
 */
async function atualizarLeadExistente(leadId, empresaId, dados = {}) {
  const { nome, email, telefone, mac, ip, aceite, termo, ap_mac, ssid } = dados;

  const sets = [
    "nome = COALESCE(?, nome)",
    "email = COALESCE(?, email)",
    "telefone = COALESCE(?, telefone)",
    "mac = COALESCE(?, mac)",
    "ip = COALESCE(?, ip)",
    "ap_mac = COALESCE(?, ap_mac)",
    "ssid = COALESCE(?, ssid)",
  ];
  const params = [nome || null, email || null, telefone || null, mac || null, ip || null, ap_mac || null, ssid || null];

  // Novo aceite LGPD registrado (novo consentimento com timestamp valido).
  // O snapshot do termo acompanha o aceite (prova de QUAL texto foi aceito).
  if (aceite !== undefined) {
    sets.push("lgpd_aceite = ?", "lgpd_aceite_em = NOW()");
    params.push(aceite ? 1 : 0);
    if (termo) {
      sets.push("lgpd_termo = ?");
      params.push(termo);
    }
  }

  let query = `UPDATE leads SET ${sets.join(", ")} WHERE id = ?`;
  params.push(leadId);
  if (empresaId) {
    query += " AND empresa_id = ?";
    params.push(empresaId);
  }

  await db.execute(query, params);
}

// Mesmo default exibido no portal quando o admin nao customizou (PortalEditor/CadastroLGPD)
const TEXTO_LGPD_DEFAULT = "Aceito os termos da Lei Geral de Proteção de Dados (LGPD) e autorizo o tratamento dos meus dados pessoais. *";

/**
 * Resolve o texto do termo LGPD exibido no portal, pra guardar como snapshot
 * no aceite (leads.lgpd_termo). Ordem: portal_id explicito -> portal vinculado
 * ao equipamento (mikrotiks.portal_id) -> portal do tipo na empresa -> default.
 * Nunca lanca erro (prova de consentimento nao pode bloquear a liberacao).
 * @param {Object} p - { portalId, mikrotikId, empresaId, tipoPortal }
 * @returns {Promise<string>}
 */
async function resolverTextoLgpd({ portalId, mikrotikId, empresaId, tipoPortal = "lgpd" } = {}) {
  try {
    let portal = null;
    if (portalId) {
      // portal_id pode vir de request publica: filtra por empresa quando
      // conhecida, senao o snapshot do termo (prova LGPD) poderia ser o texto
      // de OUTRA empresa. Sem match, cai nos fallbacks abaixo.
      if (empresaId) {
        [[portal]] = await db.execute(
          "SELECT configuracoes FROM portais WHERE id = ? AND empresa_id = ?",
          [portalId, empresaId]
        );
      } else {
        [[portal]] = await db.execute("SELECT configuracoes FROM portais WHERE id = ?", [portalId]);
      }
    }
    if (!portal && mikrotikId) {
      [[portal]] = await db.execute(
        "SELECT p.configuracoes FROM portais p JOIN mikrotiks m ON m.portal_id = p.id WHERE m.id = ?",
        [mikrotikId]
      );
    }
    if (!portal && empresaId) {
      [[portal]] = await db.execute(
        "SELECT configuracoes FROM portais WHERE tipo = ? AND empresa_id = ? LIMIT 1",
        [tipoPortal, empresaId]
      );
    }
    if (portal?.configuracoes) {
      const cfg = typeof portal.configuracoes === "string" ? JSON.parse(portal.configuracoes) : portal.configuracoes;
      if (cfg?.texto_lgpd) return String(cfg.texto_lgpd);
    }
  } catch (err) {
    console.warn("[resolverTextoLgpd] fallback pro texto default:", err.message);
  }
  return TEXTO_LGPD_DEFAULT;
}

module.exports = { verificarLeadExistente, verificarSaldoRadius, atualizarLeadExistente, resolverTextoLgpd, TEXTO_LGPD_DEFAULT };
