// src/utils/apInfo.js
//
// Chamada de AP (Called-Station-Id) e tabela access_points.
//
// Omada e UniFi mandam Called-Station-Id no accounting como "MAC-DO-AP:SSID"
// (ex.: "10-5A-95-7B-DD-E6:BRT_TESTE"). MikroTik hotspot manda o nome do
// server hotspot (ex.: "hotspot1") — sem MAC. O parse abaixo cobre os dois:
// quando ha MAC no inicio, separa MAC + SSID; senao, guarda o valor bruto no
// campo ssid (ainda identifica a rede/servico de origem).
//
// O NOME amigavel do AP nao vem no RADIUS — e resolvido pela tabela
// access_points (auto-aprendida pelo syncConnectionLogs; o admin da nome na
// tela Marco Civil).

// MAC no inicio da string, separador '-' ou ':' consistente, seguido de
// ":SSID" opcional (o SSID pode conter ':').
const CALLED_RE = /^([0-9A-Fa-f]{2}([-:])(?:[0-9A-Fa-f]{2}\2){4}[0-9A-Fa-f]{2})(?::(.*))?$/;

function parseCalledStationId(raw) {
  const valor = String(raw || "").trim();
  if (!valor) return { apMac: null, ssid: null };

  const m = valor.match(CALLED_RE);
  if (m) {
    return {
      apMac: m[1].toUpperCase().replace(/:/g, "-"),
      ssid: m[3] ? m[3].slice(0, 64) : null,
    };
  }
  // Sem MAC (MikroTik): valor bruto identifica o server/rede.
  return { apMac: null, ssid: valor.slice(0, 64) };
}

// Normaliza MAC vindo do redirect do portal (apMac do Omada ja vem "AA-BB-...").
function normalizeApMac(mac) {
  const valor = String(mac || "").trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  if (valor.length !== 12) return null;
  return valor.match(/.{2}/g).join("-");
}

/**
 * Upsert em access_points (auto-aprendizado). Nunca sobrescreve o nome dado
 * pelo admin — so atualiza ultimo_ssid/visto_em.
 * @param conn conexao/pool com .execute
 */
async function aprenderAccessPoint(conn, empresaId, apMac, ssid) {
  if (!empresaId || !apMac) return;
  await conn.execute(
    `INSERT INTO access_points (empresa_id, mac, ultimo_ssid, visto_em)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       ultimo_ssid = COALESCE(VALUES(ultimo_ssid), ultimo_ssid),
       visto_em = NOW()`,
    [empresaId, apMac, ssid || null]
  );
}

/**
 * AP/SSID de origem no momento do cadastro: o redirect do portal (Omada/UniFi)
 * persiste apMac e ssid em portal_contexts — recupera pra gravar no lead
 * (relatorio LGPD). MikroTik nao tem contexto -> { null, null }.
 */
async function resolverApDoContexto(mikrotikId, mac) {
  if (!mac) return { apMac: null, ssid: null };
  try {
    // require tardio evita ciclo (gatewayLiberacao nao depende deste modulo,
    // mas mantem o topo do arquivo livre de dependencia de gateways).
    const { carregarContextoPortal } = require("../gateways/gatewayLiberacao");
    const ctx = await carregarContextoPortal(mikrotikId, mac);
    return {
      apMac: normalizeApMac(ctx?.apMac) || null,
      ssid: ctx?.ssid ? String(ctx.ssid).slice(0, 64) : null,
    };
  } catch (_) {
    return { apMac: null, ssid: null };
  }
}

module.exports = { parseCalledStationId, normalizeApMac, aprenderAccessPoint, resolverApDoContexto };
