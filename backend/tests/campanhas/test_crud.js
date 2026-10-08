/**
 * test_crud.js — Integration tests for basic CRUD on /api/campanhas
 */

const http = require('http');
const { db, criarEmpresaTeste, limparEmpresa, tokenFor, assert } = require('./_helper');

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────────────────────

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      hostname: 'localhost',
      port: 3001,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  let empresa = null;

  try {
    empresa = await criarEmpresaTeste('CRUD Test Empresa');
    const token = tokenFor(empresa.id);

    // 1. POST /api/campanhas → 201, data.nome matches
    const r1 = await req('POST', '/api/campanhas', token, { nome: 'Promo Teste', descricao: 'desc' });
    assert(r1.status === 201, `[1] Esperava 201, obteve ${r1.status}: ${JSON.stringify(r1.body)}`);
    assert(r1.body && r1.body.data && r1.body.data.nome === 'Promo Teste',
      `[1] data.nome deveria ser 'Promo Teste', obteve: ${JSON.stringify(r1.body)}`);
    const campanhaId = r1.body.data.id;
    console.log('OK: [1] POST /api/campanhas → 201');

    // 2. GET /api/campanhas → 200, data.length === 1
    const r2 = await req('GET', '/api/campanhas', token);
    assert(r2.status === 200, `[2] Esperava 200, obteve ${r2.status}`);
    assert(Array.isArray(r2.body.data) && r2.body.data.length === 1,
      `[2] Esperava 1 campanha, obteve: ${JSON.stringify(r2.body)}`);
    console.log('OK: [2] GET /api/campanhas → length 1');

    // 3. GET /api/campanhas/:id → 200, data.itens is array
    const r3 = await req('GET', `/api/campanhas/${campanhaId}`, token);
    assert(r3.status === 200, `[3] Esperava 200, obteve ${r3.status}`);
    assert(r3.body && r3.body.data && Array.isArray(r3.body.data.itens),
      `[3] data.itens deveria ser array: ${JSON.stringify(r3.body)}`);
    console.log('OK: [3] GET /api/campanhas/:id → data.itens is array');

    // 4. PUT /api/campanhas/:id → 200, nome updated, ativo === 0
    const r4 = await req('PUT', `/api/campanhas/${campanhaId}`, token, { nome: 'Atualizado', ativo: false });
    assert(r4.status === 200, `[4] Esperava 200, obteve ${r4.status}: ${JSON.stringify(r4.body)}`);
    assert(r4.body && r4.body.data && r4.body.data.nome === 'Atualizado',
      `[4] data.nome deveria ser 'Atualizado': ${JSON.stringify(r4.body)}`);
    assert(r4.body.data.ativo === 0,
      `[4] data.ativo deveria ser 0: ${JSON.stringify(r4.body)}`);
    console.log('OK: [4] PUT /api/campanhas/:id → nome=Atualizado, ativo=0');

    // 5. DELETE /api/campanhas/:id → 200
    const r5 = await req('DELETE', `/api/campanhas/${campanhaId}`, token);
    assert(r5.status === 200, `[5] Esperava 200, obteve ${r5.status}`);
    console.log('OK: [5] DELETE /api/campanhas/:id → 200');

    // 6. GET /api/campanhas again → data.length === 0
    const r6 = await req('GET', '/api/campanhas', token);
    assert(r6.status === 200, `[6] Esperava 200, obteve ${r6.status}`);
    assert(Array.isArray(r6.body.data) && r6.body.data.length === 0,
      `[6] Esperava 0 campanhas, obteve: ${JSON.stringify(r6.body)}`);
    console.log('OK: [6] GET /api/campanhas after delete → length 0');

    console.log('\nALL TESTS PASSED: test_crud.js');
  } catch (err) {
    console.error('FAIL (unexpected error):', err);
    process.exit(1);
  } finally {
    if (empresa) await limparEmpresa(empresa.id);
    await db.end();
  }

  process.exit(0);
})();
