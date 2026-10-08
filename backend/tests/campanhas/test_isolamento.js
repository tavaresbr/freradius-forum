/**
 * test_isolamento.js — Multi-tenant isolation tests for /api/campanhas
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
  let empresaA = null;
  let empresaB = null;

  try {
    empresaA = await criarEmpresaTeste('Isolamento Empresa A');
    empresaB = await criarEmpresaTeste('Isolamento Empresa B');
    const tokenA = tokenFor(empresaA.id);
    const tokenB = tokenFor(empresaB.id);

    // 1. Empresa A creates a campanha
    const r1 = await req('POST', '/api/campanhas', tokenA, { nome: 'Campanha de A', descricao: 'exclusiva' });
    assert(r1.status === 201, `[1] A criar campanha: esperava 201, obteve ${r1.status}: ${JSON.stringify(r1.body)}`);
    const campanhaId = r1.body.data.id;
    const nomeOriginal = r1.body.data.nome;
    console.log('OK: [1] Empresa A criou campanha id=' + campanhaId);

    // 2. Empresa B lists campanhas → expects empty
    const r2 = await req('GET', '/api/campanhas', tokenB);
    assert(r2.status === 200, `[2] B listar: esperava 200, obteve ${r2.status}`);
    assert(Array.isArray(r2.body.data) && r2.body.data.length === 0,
      `[2] B deveria ver 0 campanhas, obteve: ${JSON.stringify(r2.body)}`);
    console.log('OK: [2] Empresa B lista campanhas → vazia');

    // 3. Empresa B GETs A's campanha by id → expects 404
    const r3 = await req('GET', `/api/campanhas/${campanhaId}`, tokenB);
    assert(r3.status === 404, `[3] B GET campanha de A: esperava 404, obteve ${r3.status}: ${JSON.stringify(r3.body)}`);
    console.log('OK: [3] Empresa B GET campanha de A → 404');

    // 4. Empresa B PUTs A's campanha → expects 404
    const r4 = await req('PUT', `/api/campanhas/${campanhaId}`, tokenB, { nome: 'Invadido' });
    assert(r4.status === 404, `[4] B PUT campanha de A: esperava 404, obteve ${r4.status}: ${JSON.stringify(r4.body)}`);
    console.log('OK: [4] Empresa B PUT campanha de A → 404');

    // 5. Empresa B DELETEs A's campanha → expects 404
    const r5 = await req('DELETE', `/api/campanhas/${campanhaId}`, tokenB);
    assert(r5.status === 404, `[5] B DELETE campanha de A: esperava 404, obteve ${r5.status}: ${JSON.stringify(r5.body)}`);
    console.log('OK: [5] Empresa B DELETE campanha de A → 404');

    // 6. Empresa A gets its own campanha → expects 200 with unchanged nome
    const r6 = await req('GET', `/api/campanhas/${campanhaId}`, tokenA);
    assert(r6.status === 200, `[6] A GET própria campanha: esperava 200, obteve ${r6.status}`);
    assert(r6.body && r6.body.data && r6.body.data.nome === nomeOriginal,
      `[6] nome deveria ser '${nomeOriginal}', obteve: ${JSON.stringify(r6.body)}`);
    console.log('OK: [6] Empresa A GET própria campanha → 200, nome intacto');

    console.log('\nALL TESTS PASSED: test_isolamento.js');
  } catch (err) {
    console.error('FAIL (unexpected error):', err);
    process.exit(1);
  } finally {
    if (empresaA) await limparEmpresa(empresaA.id);
    if (empresaB) await limparEmpresa(empresaB.id);
    await db.end();
  }

  process.exit(0);
})();
