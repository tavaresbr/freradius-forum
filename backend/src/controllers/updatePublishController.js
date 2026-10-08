const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../db');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Assets externos (fora do PROJECT_ROOT) a versionar no update (ex.: configs
// do FreeRADIUS). Gravados com prefixo 'external:' + caminho absoluto.
// Vazio por enquanto — constantes existiam só em referência (fix 21/08).
const EXTERNAL_PREFIX = 'external:';
const EXTERNAL_ASSETS = [];

const SCAN_TARGETS = [
  'backend/src',
  'backend/server.js',
  'backend/package.json',
  'backend/routes',
  'backend/migrations',
  'frontend/src',
  'frontend/package.json',
  'frontend/vite.config.js',
];

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist/',
  'backups/',
  '.env',
  'package-lock.json',
  '.log',
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function md5File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

function scanFiles() {
  const results = [];

  for (const target of SCAN_TARGETS) {
    const absTarget = path.join(PROJECT_ROOT, target);

    if (!fs.existsSync(absTarget)) continue;

    const stat = fs.statSync(absTarget);

    if (stat.isFile()) {
      const relPath = path.relative(PROJECT_ROOT, absTarget);
      if (!shouldIgnore(relPath)) {
        results.push({ path: relPath, absPath: absTarget });
      }
    } else if (stat.isDirectory()) {
      const files = walkDir(absTarget);
      for (const f of files) {
        const relPath = path.relative(PROJECT_ROOT, f);
        if (!shouldIgnore(relPath)) {
          results.push({ path: relPath, absPath: f });
        }
      }
    }
  }

  // Assets externos (FreeRADIUS configs etc.). Resolve symlinks pro arquivo real.
  for (const abs of EXTERNAL_ASSETS) {
    try {
      if (!fs.existsSync(abs)) continue;
      const real = fs.realpathSync(abs);
      if (!fs.statSync(real).isFile()) continue;
      results.push({ path: EXTERNAL_PREFIX + abs, absPath: real });
    } catch {
      // arquivo externo inacessivel — ignora
    }
  }

  return results;
}

function walkDir(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldIgnore(fullPath)) continue;
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── SCHEMA DETECTION ──────────────────────────────────────────────────────

// Tabelas internas do sistema de updates que nao devem ser diffadas
// (sao criadas pelas migrations 009/010/014 e existem dos dois lados).
// Se um super admin por acaso alterar estas tabelas, o diff ainda vai
// pegar, mas em snapshot inicial nao polui.
const SCHEMA_IGNORE_TABLES = new Set([]);

async function getDatabaseSchema() {
  const dbName = process.env.DB_NAME;
  if (!dbName) throw new Error('DB_NAME nao configurado no .env');

  const [tables] = await db.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [dbName]
  );

  const schema = {};
  for (const t of tables) {
    const tn = t.TABLE_NAME;
    if (SCHEMA_IGNORE_TABLES.has(tn)) continue;

    const [cols] = await db.execute(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [dbName, tn]
    );

    const [idxRows] = await db.execute(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [dbName, tn]
    );

    const idxMap = {};
    for (const r of idxRows) {
      if (!idxMap[r.INDEX_NAME]) {
        idxMap[r.INDEX_NAME] = {
          name: r.INDEX_NAME,
          unique: r.NON_UNIQUE === 0,
          columns: [],
        };
      }
      idxMap[r.INDEX_NAME].columns.push(r.COLUMN_NAME);
    }

    schema[tn] = {
      columns: cols.map(c => ({
        name: c.COLUMN_NAME,
        type: c.COLUMN_TYPE,
        nullable: c.IS_NULLABLE === 'YES',
        default: c.COLUMN_DEFAULT,
        extra: c.EXTRA || '',
      })),
      indexes: Object.values(idxMap),
    };
  }
  return schema;
}

async function getCreateTableSql(tableName) {
  try {
    const [rows] = await db.query(`SHOW CREATE TABLE \`${tableName}\``);
    if (!rows || rows.length === 0) return null;
    let sql = rows[0]['Create Table'] || rows[0]['Create View'] || null;
    if (!sql) return null;
    // Tornar idempotente na reaplicacao
    sql = sql.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ');
    return sql;
  } catch {
    return null;
  }
}

function escapeDefault(def, col) {
  if (def === null || def === undefined) return null;
  const extraLc = (col.extra || '').toLowerCase();
  // MySQL 8 marca expressoes como DEFAULT_GENERATED
  if (extraLc.includes('default_generated')) return def;
  // Funcoes conhecidas (MySQL 5.7)
  if (/^(CURRENT_TIMESTAMP|NOW\(\)|CURRENT_DATE|CURRENT_TIME)(\(\d*\))?$/i.test(def)) {
    return def;
  }
  return `'${String(def).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function buildColumnDDL(col) {
  const parts = [`\`${col.name}\``, col.type];
  parts.push(col.nullable ? 'NULL' : 'NOT NULL');

  const def = escapeDefault(col.default, col);
  if (def !== null) {
    parts.push(`DEFAULT ${def}`);
  }

  if (col.extra) {
    // Remover DEFAULT_GENERATED (nao e DDL valido)
    const e = col.extra.replace(/DEFAULT_GENERATED/gi, '').trim();
    if (e) parts.push(e);
  }
  return parts.join(' ');
}

function colsEqual(a, b) {
  return (
    a.type === b.type &&
    a.nullable === b.nullable &&
    String(a.default) === String(b.default) &&
    (a.extra || '') === (b.extra || '')
  );
}

function idxEqual(a, b) {
  return (
    a.unique === b.unique &&
    JSON.stringify(a.columns) === JSON.stringify(b.columns)
  );
}

async function diffSchemas(oldSchema, newSchema) {
  const tabelas_novas = [];
  const tabelas_removidas = [];
  const tabelas_alteradas = [];

  const oldNames = new Set(Object.keys(oldSchema));
  const newNames = new Set(Object.keys(newSchema));

  // Tabelas novas - usar SHOW CREATE TABLE
  for (const name of newNames) {
    if (!oldNames.has(name)) {
      const createSql = await getCreateTableSql(name);
      tabelas_novas.push({
        name,
        sql: createSql || `-- Nao foi possivel obter CREATE TABLE para ${name}`,
      });
    }
  }

  // Tabelas removidas
  for (const name of oldNames) {
    if (!newNames.has(name)) {
      tabelas_removidas.push({
        name,
        sql: `DROP TABLE IF EXISTS \`${name}\``,
      });
    }
  }

  // Tabelas alteradas
  for (const name of newNames) {
    if (!oldNames.has(name)) continue;
    const oldT = oldSchema[name];
    const newT = newSchema[name];
    const sqls = [];

    const oldColMap = Object.fromEntries(oldT.columns.map(c => [c.name, c]));
    const newColMap = Object.fromEntries(newT.columns.map(c => [c.name, c]));

    // Colunas adicionadas (preservando ordem, com AFTER)
    for (let i = 0; i < newT.columns.length; i++) {
      const col = newT.columns[i];
      if (!(col.name in oldColMap)) {
        const pos =
          i === 0 ? 'FIRST' : `AFTER \`${newT.columns[i - 1].name}\``;
        sqls.push(
          `ALTER TABLE \`${name}\` ADD COLUMN ${buildColumnDDL(col)} ${pos}`
        );
      }
    }

    // Colunas removidas
    for (const col of oldT.columns) {
      if (!(col.name in newColMap)) {
        sqls.push(`ALTER TABLE \`${name}\` DROP COLUMN \`${col.name}\``);
      }
    }

    // Colunas modificadas
    for (const col of newT.columns) {
      const old = oldColMap[col.name];
      if (!old) continue;
      if (!colsEqual(old, col)) {
        sqls.push(
          `ALTER TABLE \`${name}\` MODIFY COLUMN ${buildColumnDDL(col)}`
        );
      }
    }

    // Indices
    const oldIdxMap = Object.fromEntries(oldT.indexes.map(i => [i.name, i]));
    const newIdxMap = Object.fromEntries(newT.indexes.map(i => [i.name, i]));

    // Removidos
    for (const idx of oldT.indexes) {
      if (idx.name === 'PRIMARY') continue;
      if (!(idx.name in newIdxMap)) {
        sqls.push(`ALTER TABLE \`${name}\` DROP INDEX \`${idx.name}\``);
      }
    }
    // Adicionados
    for (const idx of newT.indexes) {
      if (idx.name === 'PRIMARY') continue;
      if (!(idx.name in oldIdxMap)) {
        const cols = idx.columns.map(c => `\`${c}\``).join(', ');
        const uniq = idx.unique ? 'UNIQUE ' : '';
        sqls.push(
          `CREATE ${uniq}INDEX \`${idx.name}\` ON \`${name}\` (${cols})`
        );
      }
    }
    // Modificados
    for (const idx of newT.indexes) {
      if (idx.name === 'PRIMARY') continue;
      const old = oldIdxMap[idx.name];
      if (!old) continue;
      if (!idxEqual(old, idx)) {
        sqls.push(`ALTER TABLE \`${name}\` DROP INDEX \`${idx.name}\``);
        const cols = idx.columns.map(c => `\`${c}\``).join(', ');
        const uniq = idx.unique ? 'UNIQUE ' : '';
        sqls.push(
          `CREATE ${uniq}INDEX \`${idx.name}\` ON \`${name}\` (${cols})`
        );
      }
    }

    if (sqls.length > 0) {
      tabelas_alteradas.push({ name, sqls });
    }
  }

  return { tabelas_novas, tabelas_removidas, tabelas_alteradas };
}

async function loadSchemaSnapshot() {
  const [rows] = await db.execute(
    'SELECT table_name, columns_json, indexes_json FROM schema_snapshots'
  );
  const schema = {};
  for (const r of rows) {
    try {
      schema[r.table_name] = {
        columns: JSON.parse(r.columns_json),
        indexes: JSON.parse(r.indexes_json),
      };
    } catch {
      // ignora entradas corrompidas
    }
  }
  return schema;
}

async function saveSchemaSnapshot() {
  const current = await getDatabaseSchema();
  const currentNames = new Set(Object.keys(current));

  for (const [tn, t] of Object.entries(current)) {
    const createSql = await getCreateTableSql(tn);
    await db.execute(
      `INSERT INTO schema_snapshots (table_name, columns_json, indexes_json, create_sql)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         columns_json = VALUES(columns_json),
         indexes_json = VALUES(indexes_json),
         create_sql = VALUES(create_sql)`,
      [tn, JSON.stringify(t.columns), JSON.stringify(t.indexes), createSql]
    );
  }

  // Limpar tabelas que nao existem mais
  const [existing] = await db.execute(
    'SELECT table_name FROM schema_snapshots'
  );
  for (const row of existing) {
    if (!currentNames.has(row.table_name)) {
      await db.execute(
        'DELETE FROM schema_snapshots WHERE table_name = ?',
        [row.table_name]
      );
    }
  }
}

function flattenSchemaChangesToSql(schemaChanges) {
  const blocks = [];
  for (const t of schemaChanges.tabelas_novas) {
    blocks.push(`-- NOVA TABELA: ${t.name}\n${t.sql};`);
  }
  for (const t of schemaChanges.tabelas_alteradas) {
    blocks.push(
      `-- ALTERACOES EM: ${t.name}\n${t.sqls.map(s => s + ';').join('\n')}`
    );
  }
  for (const t of schemaChanges.tabelas_removidas) {
    blocks.push(`-- REMOVER TABELA: ${t.name}\n${t.sql};`);
  }
  return blocks.join('\n---\n');
}

// ─── ENDPOINTS ─────────────────────────────────────────────────────────────

// GET /api/update-publish
const listarUpdates = async (req, res) => {
  try {
    const [updates] = await db.execute(`
      SELECT u.id, u.descricao, u.changelog, u.criado_em,
        (SELECT COUNT(*) FROM update_files uf WHERE uf.update_id = u.id) AS total_files,
        (SELECT COUNT(*) FROM update_migrations um WHERE um.update_id = u.id) AS total_migrations
      FROM updates u
      ORDER BY u.id DESC
    `);
    res.json(updates);
  } catch (err) {
    console.error('listarUpdates error:', err);
    res.status(500).json({ message: 'Erro ao listar updates: ' + err.message });
  }
};

// POST /api/update-publish/detect-changes
const detectarAlteracoes = async (req, res) => {
  try {
    // ─ Arquivos ─
    const [snapshots] = await db.execute(
      'SELECT file_path, md5_hash FROM file_snapshots'
    );
    const snapshotMap = {};
    for (const s of snapshots) {
      snapshotMap[s.file_path] = s.md5_hash;
    }

    const hasFileSnapshot = snapshots.length > 0;
    const currentFiles = scanFiles();

    const alterados = [];
    const novos = [];
    const removidos = [];
    const currentPaths = new Set();

    for (const file of currentFiles) {
      currentPaths.add(file.path);
      const currentMd5 = md5File(file.absPath);
      if (snapshotMap[file.path] === undefined) {
        novos.push(file.path);
      } else if (snapshotMap[file.path] !== currentMd5) {
        alterados.push(file.path);
      }
    }
    for (const snapshotPath of Object.keys(snapshotMap)) {
      if (!currentPaths.has(snapshotPath)) {
        removidos.push(snapshotPath);
      }
    }

    // ─ Schema ─
    const [[schemaCount]] = await db.execute(
      'SELECT COUNT(*) AS c FROM schema_snapshots'
    );
    const hasSchemaSnapshot = schemaCount.c > 0;

    const oldSchema = await loadSchemaSnapshot();
    const newSchema = await getDatabaseSchema();
    const schema_changes = hasSchemaSnapshot
      ? await diffSchemas(oldSchema, newSchema)
      : { tabelas_novas: [], tabelas_alteradas: [], tabelas_removidas: [] };

    const suggested_migrations_sql = hasSchemaSnapshot
      ? flattenSchemaChangesToSql(schema_changes)
      : '';

    const schemaTotal =
      schema_changes.tabelas_novas.length +
      schema_changes.tabelas_alteradas.length +
      schema_changes.tabelas_removidas.length;

    res.json({
      has_snapshot: hasFileSnapshot,
      has_schema_snapshot: hasSchemaSnapshot,
      alterados,
      novos,
      removidos,
      schema_changes,
      suggested_migrations_sql,
      total: alterados.length + novos.length + removidos.length,
      schema_total: schemaTotal,
    });
  } catch (err) {
    console.error('detectarAlteracoes error:', err);
    res
      .status(500)
      .json({ message: 'Erro ao detectar alteracoes: ' + err.message });
  }
};

// POST /api/update-publish/snapshot
const tirarSnapshot = async (req, res) => {
  try {
    // Arquivos
    const currentFiles = scanFiles();
    const currentPaths = new Set();

    for (const file of currentFiles) {
      currentPaths.add(file.path);
      const md5 = md5File(file.absPath);
      await db.execute(
        `
        INSERT INTO file_snapshots (file_path, md5_hash, snapshot_date)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE md5_hash = VALUES(md5_hash), snapshot_date = NOW()
      `,
        [file.path, md5]
      );
    }

    const [existingSnapshots] = await db.execute(
      'SELECT file_path FROM file_snapshots'
    );
    for (const snap of existingSnapshots) {
      if (!currentPaths.has(snap.file_path)) {
        await db.execute(
          'DELETE FROM file_snapshots WHERE file_path = ?',
          [snap.file_path]
        );
      }
    }

    // Schema
    await saveSchemaSnapshot();
    const [[schemaCount]] = await db.execute(
      'SELECT COUNT(*) AS c FROM schema_snapshots'
    );

    res.json({
      message: 'Snapshot tirado com sucesso',
      total: currentFiles.length,
      total_tables: schemaCount.c,
    });
  } catch (err) {
    console.error('tirarSnapshot error:', err);
    res
      .status(500)
      .json({ message: 'Erro ao tirar snapshot: ' + err.message });
  }
};

// POST /api/update-publish/create
const criarUpdate = async (req, res) => {
  const { descricao, changelog, files = [], migrations = [] } = req.body;

  if (!descricao) {
    return res.status(400).json({ message: 'descricao e obrigatoria' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Gerar ID YYYY-MM-DD-NNN
    const today = new Date().toISOString().slice(0, 10);
    const prefix = `${today}-`;

    const [existing] = await conn.execute(
      'SELECT id FROM updates WHERE id LIKE ? ORDER BY id DESC LIMIT 1',
      [`${prefix}%`]
    );

    let nnn = 1;
    if (existing.length > 0) {
      const lastId = existing[0].id;
      const lastNnn = parseInt(lastId.split('-').pop(), 10);
      if (!isNaN(lastNnn)) nnn = lastNnn + 1;
    }

    const updateId = `${prefix}${String(nnn).padStart(3, '0')}`;

    await conn.execute(
      'INSERT INTO updates (id, descricao, changelog, criado_em) VALUES (?, ?, ?, NOW())',
      [updateId, descricao, changelog || null]
    );

    // Arquivos - le conteudo do disco. Paths com prefixo "external:" sao
    // resolvidos como absolutos (configs fora de PROJECT_ROOT).
    for (const file of files) {
      let content = null;
      if (file.action !== 'delete') {
        let absPath;
        if (file.path.startsWith(EXTERNAL_PREFIX)) {
          const externalAbs = file.path.slice(EXTERNAL_PREFIX.length);
          absPath = fs.existsSync(externalAbs) ? fs.realpathSync(externalAbs) : null;
        } else {
          absPath = path.join(PROJECT_ROOT, file.path);
        }
        if (absPath && fs.existsSync(absPath)) {
          content = fs.readFileSync(absPath, 'utf8');
        }
      }
      await conn.execute(
        'INSERT INTO update_files (update_id, file_path, action, file_content) VALUES (?, ?, ?, ?)',
        [updateId, file.path, file.action || 'update', content]
      );
    }

    // Migrations
    let ordem = 1;
    for (const migration of migrations) {
      const sql =
        typeof migration === 'string' ? migration : migration.sql;
      if (!sql || !sql.trim()) continue;
      await conn.execute(
        'INSERT INTO update_migrations (update_id, sql_content, ordem) VALUES (?, ?, ?)',
        [updateId, sql, ordem]
      );
      ordem++;
    }

    await conn.commit();

    // Atualizar snapshots (arquivos + schema) depois de publicar
    try {
      const currentFiles = scanFiles();
      for (const file of currentFiles) {
        const md5 = md5File(file.absPath);
        await db.execute(
          `
          INSERT INTO file_snapshots (file_path, md5_hash, snapshot_date)
          VALUES (?, ?, NOW())
          ON DUPLICATE KEY UPDATE md5_hash = VALUES(md5_hash), snapshot_date = NOW()
        `,
          [file.path, md5]
        );
      }
      await saveSchemaSnapshot();
    } catch (snapErr) {
      console.warn(
        'Erro ao atualizar snapshots apos criar update:',
        snapErr.message
      );
    }

    res.json({ message: 'Update criado com sucesso', id: updateId });
  } catch (err) {
    await conn.rollback();
    console.error('criarUpdate error:', err);
    res.status(500).json({ message: 'Erro ao criar update: ' + err.message });
  } finally {
    conn.release();
  }
};

// GET /api/update-publish/:id
const obterUpdate = async (req, res) => {
  const { id } = req.params;
  try {
    const [[update]] = await db.execute(
      'SELECT * FROM updates WHERE id = ?',
      [id]
    );
    if (!update)
      return res.status(404).json({ message: 'Update nao encontrado' });

    const [files] = await db.execute(
      'SELECT file_path, action, file_content FROM update_files WHERE update_id = ? ORDER BY id ASC',
      [id]
    );
    const [migrations] = await db.execute(
      'SELECT sql_content, ordem FROM update_migrations WHERE update_id = ? ORDER BY ordem ASC',
      [id]
    );

    res.json({ ...update, files, migrations });
  } catch (err) {
    console.error('obterUpdate error:', err);
    res.status(500).json({ message: 'Erro ao obter update: ' + err.message });
  }
};

// DELETE /api/update-publish/:id
const deletarUpdate = async (req, res) => {
  const { id } = req.params;
  try {
    const [[update]] = await db.execute(
      'SELECT id FROM updates WHERE id = ?',
      [id]
    );
    if (!update)
      return res.status(404).json({ message: 'Update nao encontrado' });

    await db.execute('DELETE FROM updates WHERE id = ?', [id]);
    res.json({ message: 'Update deletado com sucesso' });
  } catch (err) {
    console.error('deletarUpdate error:', err);
    res
      .status(500)
      .json({ message: 'Erro ao deletar update: ' + err.message });
  }
};

module.exports = {
  listarUpdates,
  detectarAlteracoes,
  tirarSnapshot,
  criarUpdate,
  obterUpdate,
  deletarUpdate,
};
