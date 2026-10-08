require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require("../db");
const { removerUsuarioPorMac } = require("../src/controllers/mikrotikAPIController");

async function verificarExpiracoes() {
  try {
    // Busca pagamentos expirados com dados do plano e empresa
    const [expirados] = await db.query(`
      SELECT p.mac, p.ip, p.empresa_id, p.nome_plano, p.cpf
      FROM pagamentos p
      WHERE p.expira_em IS NOT NULL
        AND p.expira_em <= NOW()
        AND p.status = 'approved'
    `);

    console.log(`Expirados encontrados: ${expirados.length}`);

    for (const { mac, ip, empresa_id, nome_plano } of expirados) {
      console.log(`Expirado: ${mac} - ${ip} (empresa: ${empresa_id})`);

      // Remove do MikroTik E limpa RADIUS (limparRadius=true)
      await removerUsuarioPorMac(mac, true);

      // Atualiza status do pagamento
      await db.query(
        `UPDATE pagamentos SET status = 'expirado' WHERE mac = ? AND ip = ? AND status = 'approved'`,
        [mac, ip]
      );

      console.log(`Status atualizado para expirado: ${mac}`);
    }

    // Limpar acessos temporarios PIX expirados (mais de 10 min)
    const [pixAntigos] = await db.query(`
      SELECT DISTINCT rc.username FROM radcheck rc
      WHERE rc.username LIKE 'pix_%'
        AND NOT EXISTS (
          SELECT 1 FROM radacct ra
          WHERE ra.username = rc.username AND ra.acctstoptime IS NULL
        )
    `);

    if (pixAntigos.length > 0) {
      console.log(`PIX temporarios para limpar: ${pixAntigos.length}`);
      for (const { username } of pixAntigos) {
        await db.query("DELETE FROM radcheck WHERE username = ?", [username]);
        await db.query("DELETE FROM radreply WHERE username = ?", [username]);
        await db.query("DELETE FROM radusergroup WHERE username = ?", [username]);
        await db.query("DELETE FROM radius_users WHERE username = ?", [username]);
      }
    }

  } catch (err) {
    console.error("Erro ao verificar expiracoes:", err);
  }
}

// Se executado diretamente
if (require.main === module) {
  verificarExpiracoes().finally(() => process.exit(0));
}

module.exports = verificarExpiracoes;
