// src/services/omadaApNames.js
//
// Captura de DADOS do controller Omada via API — decisão de 21/08/2026:
// a liberação do portal é SEMPRE via External RADIUS (modelo homologado);
// a API do controller é opcional e serve SOMENTE para capturar informações
// que não trafegam no RADIUS/redirect — hoje, os NOMES dos access points
// (tabela access_points, exibidos nos relatórios LGPD/Marco Civil).
//
// Config no gateway (mikrotiks): controller_url + api_user + api_pass
// (admin LOCAL do controller, papel Viewer basta) + verify_tls.
// O omadac_id é auto-descoberto via GET {url}/api/info.
//
// Endpoints usados (controller v5/v6, apiVer 3 — validado no OC300 6.2.14):
//   GET  {url}/api/info                                  -> omadacId
//   POST {url}/{cid}/api/v2/login {username,password}    -> result.token (+cookie)
//   GET  {url}/{cid}/api/v2/sites?currentPage=1&...      -> lista de sites
//   GET  {url}/{cid}/api/v2/sites/{siteId}/devices       -> devices (type: "ap")
// Chamadas autenticadas levam header Csrf-Token + cookie de sessão.

const https = require("https");
const axios = require("axios");
const db = require("../../db");

function agentFor(gw) {
  const verify = gw.verify_tls === undefined ? false : !!Number(gw.verify_tls);
  return new https.Agent({ rejectUnauthorized: verify });
}

function baseUrl(gw) {
  return String(gw.controller_url || "").trim().replace(/\/+$/, "");
}

/** GET {url}/api/info — descobre o omadacId (não precisa de login). */
async function descobrirInfo(controllerUrl, verifyTls) {
  const agent = new https.Agent({ rejectUnauthorized: !!Number(verifyTls) });
  const url = String(controllerUrl || "").trim().replace(/\/+$/, "");
  const resp = await axios.get(`${url}/api/info`, {
    httpsAgent: agent, timeout: 10000, validateStatus: () => true,
  });
  const body = resp.data || {};
  if (body.errorCode !== 0 || !body.result?.omadacId) {
    throw new Error(`Controller não respondeu em ${url}/api/info (HTTP ${resp.status})`);
  }
  return body.result; // { omadacId, controllerVer, apiVer, ... }
}

/** Login de admin local -> sessão { token, cookie }. */
async function loginAdmin(gw) {
  const url = baseUrl(gw);
  const cid = gw.omadac_id;
  const resp = await axios.post(
    `${url}/${cid}/api/v2/login`,
    { username: gw.api_user, password: gw.api_pass },
    { httpsAgent: agentFor(gw), timeout: 15000, validateStatus: () => true }
  );
  const body = resp.data || {};
  if (body.errorCode !== 0 || !body.result?.token) {
    throw new Error(`Login na API do Omada falhou: ${body.msg || `HTTP ${resp.status}`} (verifique usuário/senha do admin local)`);
  }
  const setCookie = resp.headers?.["set-cookie"] || [];
  const cookie = Array.isArray(setCookie) ? setCookie.map((c) => c.split(";")[0]).join("; ") : null;
  return { url, cid, token: body.result.token, cookie, agent: agentFor(gw) };
}

async function apiGet(sess, path) {
  const resp = await axios.get(`${sess.url}/${sess.cid}/api/v2/${path}`, {
    httpsAgent: sess.agent,
    timeout: 15000,
    validateStatus: () => true,
    headers: { "Csrf-Token": sess.token, ...(sess.cookie ? { Cookie: sess.cookie } : {}) },
  });
  const body = resp.data || {};
  if (body.errorCode !== 0) {
    throw new Error(`Omada API GET ${path} falhou: ${body.msg || `HTTP ${resp.status}`}`);
  }
  return body.result;
}

/** Lista sites visíveis pro admin logado -> [{ id, name }]. */
async function listarSites(sess) {
  const result = await apiGet(sess, "sites?currentPage=1&currentPageSize=1000");
  const lista = result?.data || result || [];
  return (Array.isArray(lista) ? lista : []).map((s) => ({
    id: s.id || s.siteId || s.key,
    name: s.name || s.siteName,
  })).filter((s) => s.id);
}

/** Lista devices do site -> só APs, com { mac normalizado, nome }. */
async function listarAps(sess, siteId) {
  const result = await apiGet(sess, `sites/${siteId}/devices`);
  const lista = Array.isArray(result) ? result : (result?.data || []);
  return lista
    .filter((d) => String(d.type || "").toLowerCase() === "ap")
    .map((d) => ({
      mac: String(d.mac || "").toUpperCase().replace(/[^0-9A-F]/g, "").match(/.{2}/g)?.join("-") || null,
      nome: d.name || null,
      modelo: d.model || d.showModel || null,
      status: d.status,
    }))
    .filter((d) => d.mac);
}

/**
 * Sincroniza os nomes dos APs do controller pra tabela access_points da
 * empresa do gateway. A API é a fonte do NOME (sobrescreve o nome manual);
 * ultimo_ssid/visto_em continuam vindo do accounting RADIUS.
 * @param {Object} gw - linha de mikrotiks (tipo omada, controller_url set)
 * @returns {Promise<{site:string, total:number, aps:Array}>}
 */
async function sincronizarApsOmada(gw) {
  if (!gw || gw.tipo !== "omada") throw new Error("Gateway não é Omada.");
  if (!gw.controller_url || !gw.api_user || !gw.api_pass) {
    throw new Error("API do controller não configurada neste gateway.");
  }
  if (!gw.omadac_id) {
    const info = await descobrirInfo(gw.controller_url, gw.verify_tls);
    gw.omadac_id = info.omadacId;
    await db.query("UPDATE mikrotiks SET omadac_id = ? WHERE id = ?", [gw.omadac_id, gw.id]);
  }

  const sess = await loginAdmin(gw);
  const sites = await listarSites(sess);
  if (!sites.length) throw new Error("Nenhum site visível pro admin da API (confira os privilégios do usuário).");

  // Resolve o site: controller_site cadastrado (por nome) > site único.
  let site = null;
  if (gw.controller_site) {
    site = sites.find((s) => String(s.name).toLowerCase() === String(gw.controller_site).toLowerCase());
  }
  if (!site && sites.length === 1) site = sites[0];
  if (!site) {
    throw new Error(`Site "${gw.controller_site || "?"}" não encontrado no controller. Sites disponíveis: ${sites.map((s) => s.name).join(", ")}`);
  }

  const aps = await listarAps(sess, site.id);
  for (const ap of aps) {
    await db.query(
      `INSERT INTO access_points (empresa_id, mac, nome)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
      [gw.empresa_id, ap.mac, ap.nome]
    );
  }
  console.log(`[omadaApNames] Gateway ${gw.id} (${gw.nome}): ${aps.length} APs sincronizados do site "${site.name}".`);
  return { site: site.name, total: aps.length, aps };
}

/** Sincroniza todos os gateways Omada com API configurada (cron). */
async function sincronizarTodosOmada() {
  const [gws] = await db.query(
    `SELECT * FROM mikrotiks
     WHERE tipo = 'omada' AND controller_url IS NOT NULL AND controller_url <> ''
       AND api_user IS NOT NULL AND api_pass IS NOT NULL`
  );
  const resultados = [];
  for (const gw of gws) {
    try {
      resultados.push({ gateway: gw.id, ...(await sincronizarApsOmada(gw)) });
    } catch (err) {
      console.warn(`[omadaApNames] Gateway ${gw.id} (${gw.nome}) falhou: ${err.message}`);
      resultados.push({ gateway: gw.id, erro: err.message });
    }
  }
  return resultados;
}

module.exports = { descobrirInfo, loginAdmin, sincronizarApsOmada, sincronizarTodosOmada };
