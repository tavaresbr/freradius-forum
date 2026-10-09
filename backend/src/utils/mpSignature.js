const crypto = require("crypto");

// Valida x-signature do webhook MP. Se secret nao configurado, retorna true (skip).
// Doc: https://www.mercadopago.com/developers/pt/docs/your-integrations/notifications/webhooks
// Template: id:<dataId>;request-id:<reqId>;ts:<ts>; (HMAC-SHA256 com webhook_secret)
function validarAssinaturaWebhook(headers, dataId, secret) {
  if (!secret) {
    // Modo compat - sem secret cadastrado, pula validacao. Loga alerta pra nao
    // aceitar silenciosamente: sem webhook_secret o webhook e' falsificavel.
    console.warn(`[webhook MP] ALERTA: webhook_secret nao configurado (dataId=${dataId}). Assinatura NAO validada - cadastre webhook_secret em empresa_configs.config_json.mercadopago.`);
    return true;
  }

  const sigHeader = headers["x-signature"];
  const reqId = headers["x-request-id"];
  if (!sigHeader || !reqId || !dataId) {
    console.warn("webhook: headers de assinatura ausentes");
    return false;
  }

  // Parse: "ts=1234,v1=abc..." -> {ts, v1}
  const parts = sigHeader.split(",").reduce((acc, kv) => {
    const [k, v] = kv.split("=").map(s => s.trim());
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) {
    console.warn("webhook: x-signature mal formado");
    return false;
  }

  const template = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(template).digest("hex");
  let ok = false;
  try {
    ok = expected.length === v1.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch (e) {
    ok = false;
  }
  if (!ok) console.warn("webhook: assinatura invalida");
  return ok;
}

module.exports = { validarAssinaturaWebhook };
