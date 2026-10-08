const { RouterOSAPI } = require("node-routeros");

async function testarConexao({ ip, usuario, senha, porta }) {
  const conn = new RouterOSAPI({
    host: ip,
    user: usuario,
    password: senha,
    port: porta || 8728,
  });

  try {
    await conn.connect();
    await conn.close();
    return { sucesso: true };
  } catch (error) {
    return { sucesso: false, erro: error.message };
  }
}

module.exports = { testarConexao };

