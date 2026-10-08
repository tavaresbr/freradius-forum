const MikroNode = require("mikronode-ng");

async function enviarProfileParaMikrotik(plano) {
  const { ip, usuario, senha, nome, velocidade_down, velocidade_up, duracao_minutos } = plano;

  const client = MikroNode.getConnection(ip, usuario, senha);

  return new Promise((resolve, reject) => {
    client.connect().then(([login]) => {
      login.closeOnDone(true);
      return login.write('/ppp/profile/add', [
        `=name=${nome}`,
        `=rate-limit=${velocidade_down}M/${velocidade_up}M`,
        `=only-one=yes`,
        `=idle-timeout=none`,
        `=session-timeout=${duracao_minutos}m`,
        `=shared-users=1`
      ]);
    }).then(() => {
      console.log(`Perfil '${nome}' criado com sucesso no Mikrotik ${ip}`);
      resolve();
    }).catch((err) => {
      console.error("Erro ao enviar para Mikrotik:", err);
      reject(err);
    });
  });
}

module.exports = { enviarProfileParaMikrotik };

