const fs = require('fs');
const { execSync } = require('child_process');

const DICT_PATH = '/etc/freeradius/3.0/dictionary';
const REQUIRED_ATTRS = [
  { name: 'Max-Daily-Session', code: 3001 },
  { name: 'Max-All-Session', code: 3002 },
];

function ensureFreeradiusDict() {
  let content;
  try {
    content = fs.readFileSync(DICT_PATH, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[freeradius-dict] nao foi possivel ler ${DICT_PATH}: ${err.message}`);
    }
    return;
  }

  const missing = REQUIRED_ATTRS.filter(
    (attr) => !new RegExp(`^\\s*ATTRIBUTE\\s+${attr.name}\\b`, 'm').test(content)
  );

  if (missing.length === 0) return;

  const additions = missing
    .map((attr) => `ATTRIBUTE   ${attr.name}     ${attr.code}    integer`)
    .join('\n');
  const newContent = content.endsWith('\n')
    ? content + additions + '\n'
    : content + '\n' + additions + '\n';

  try {
    fs.writeFileSync(DICT_PATH, newContent, 'utf8');
    console.log(`[freeradius-dict] adicionados: ${missing.map((m) => m.name).join(', ')}`);
  } catch (err) {
    console.warn(`[freeradius-dict] sem permissao para escrever em ${DICT_PATH}: ${err.message}`);
    return;
  }

  try {
    execSync('systemctl restart freeradius', { stdio: 'ignore', timeout: 15000 });
    console.log('[freeradius-dict] freeradius reiniciado com sucesso');
  } catch (err) {
    try {
      execSync('service freeradius restart', { stdio: 'ignore', timeout: 15000 });
      console.log('[freeradius-dict] freeradius reiniciado via service');
    } catch (err2) {
      console.warn(
        `[freeradius-dict] falha ao reiniciar freeradius: ${err.message || err2.message}`
      );
    }
  }
}

module.exports = { ensureFreeradiusDict };
