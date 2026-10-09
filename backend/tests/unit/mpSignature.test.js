const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { validarAssinaturaWebhook } = require('../../src/utils/mpSignature');

const secret = 's3cr3t';
const dataId = '999';
const reqId = 'req-1';
const ts = '1700000000';
const v1 = crypto.createHmac('sha256', secret)
  .update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest('hex');
const headers = { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId };

test('assinatura valida', () => {
  assert.strictEqual(validarAssinaturaWebhook(headers, dataId, secret), true);
});

test('assinatura adulterada e rejeitada', () => {
  const bad = { ...headers, 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}` };
  assert.strictEqual(validarAssinaturaWebhook(bad, dataId, secret), false);
});

test('dataId diferente e rejeitado', () => {
  assert.strictEqual(validarAssinaturaWebhook(headers, '1000', secret), false);
});

test('headers ausentes com secret configurado sao rejeitados', () => {
  assert.strictEqual(validarAssinaturaWebhook({}, dataId, secret), false);
});

test('sem secret: modo compat aceita', () => {
  assert.strictEqual(validarAssinaturaWebhook({}, dataId, null), true);
});
