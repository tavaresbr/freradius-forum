/**
 * test_publico.js — Integration tests for public campanha routes + view counter
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
    empresa = await criarEmpresaTeste('Publico Test Empresa');
    const empresaId = empresa.id;

    // 2. Insert a portal directly via db
    const portalSlug = 'test-portal-' + Math.random().toString(36).slice(2, 8);
    const [portalResult] = await db.execute(
      `INSERT INTO portais (nome, slug, tipo, empresa_id) VALUES (?, ?, 'lgpd', ?)`,
      ['Portal Teste', portalSlug, empresaId]
    );
    const portalId = portalResult.insertId;

    // 3. GET /api/public/campanha/:portalId → 404 (no campanha bound)
    const r3 = await req('GET', `/api/public/campanha/${portalId}`);
    assert(r3.status === 404, `[3] Esperava 404 sem campanha, obteve ${r3.status}: ${JSON.stringify(r3.body)}`);
    console.log('OK: [3] GET sem campanha → 404');

    // 4. Insert a campanha and one item directly via db
    const [campResult] = await db.execute(
      `INSERT INTO campanhas (empresa_id, nome, descricao, ativo) VALUES (?, ?, ?, 1)`,
      [empresaId, 'Campanha Publica', 'teste publico']
    );
    const campanhaId = campResult.insertId;

    await db.execute(
      `INSERT INTO campanha_itens (campanha_id, empresa_id, tipo, arquivo_url, ordem, duracao_segundos)
       VALUES (?, ?, 'imagem', '/uploads/campanhas/x/y/z.jpg', 0, 5)`,
      [campanhaId, empresaId]
    );

    // 5. UPDATE portal SET campanha_ativa_id = campanhaId
    await db.execute(
      'UPDATE portais SET campanha_ativa_id = ? WHERE id = ?',
      [campanhaId, portalId]
    );

    // 6. GET /api/public/campanha/:portalId → 200 with one item
    const r6 = await req('GET', `/api/public/campanha/${portalId}`);
    assert(r6.status === 200, `[6] Esperava 200, obteve ${r6.status}: ${JSON.stringify(r6.body)}`);
    assert(r6.body && r6.body.data && Array.isArray(r6.body.data.itens) && r6.body.data.itens.length === 1,
      `[6] Esperava 1 item, obteve: ${JSON.stringify(r6.body)}`);
    console.log('OK: [6] GET campanha publica → 200 com 1 item');

    // 7. Check views counter increment
    const [[before]] = await db.execute('SELECT views FROM campanhas WHERE id = ?', [campanhaId]);
    const viewsBefore = before.views;

    const r7 = await req('POST', `/api/public/campanha/${portalId}/view`);
    assert(r7.status === 200, `[7] POST view: esperava 200, obteve ${r7.status}`);

    const [[after]] = await db.execute('SELECT views FROM campanhas WHERE id = ?', [campanhaId]);
    assert(after.views === viewsBefore + 1,
      `[7] Views deveria ser ${viewsBefore + 1}, obteve ${after.views}`);
    console.log(`OK: [7] POST view → views incrementou de ${viewsBefore} para ${after.views}`);

    // 8. UPDATE campanha SET ativo = 0 → GET returns 404
    await db.execute('UPDATE campanhas SET ativo = 0 WHERE id = ?', [campanhaId]);

    const r8 = await req('GET', `/api/public/campanha/${portalId}`);
    assert(r8.status === 404, `[8] Campanha inativa deveria retornar 404, obteve ${r8.status}: ${JSON.stringify(r8.body)}`);
    console.log('OK: [8] Campanha inativa → 404');

    console.log('\nALL TESTS PASSED: test_publico.js');
  } catch (err) {
    console.error('FAIL (unexpected error):', err);
    process.exit(1);
  } finally {
    if (empresa) await limparEmpresa(empresa.id);
    await db.end();
  }

  process.exit(0);
})();
