const db = require("../../db");
const { montarGatewayInfo } = require("../gateways/gatewayLiberacao");

exports.login = async (req, res) => {
  const { username: usernameRaw, password: passwordRaw, mikrotik_id } = req.body;

  if (!usernameRaw || !passwordRaw || !mikrotik_id) {
    return res.status(400).json({ message: "Usuário, senha ou mikrotik não informados" });
  }

  // Tolerancia a formatacao: usuario digita o CPF com pontos/traco ou cola a
  // credencial do WhatsApp com espaco, mas o radcheck guarda o CPF limpo.
  const usernameTrim = String(usernameRaw).trim();
  const passwordTrim = String(passwordRaw).trim();
  const userDigits = usernameTrim.replace(/\D/g, "");
  const passDigits = passwordTrim.replace(/\D/g, "");
  const candidatos = [usernameTrim];
  if (userDigits.length === 11 && userDigits !== usernameTrim) candidatos.push(userDigits);

  try {
    // Busca a senha do usuário na tabela radcheck (aceita CPF formatado ou limpo)
    let user = null;
    let username = usernameTrim;
    for (const cand of candidatos) {
      const [[row]] = await db.execute(
        "SELECT value FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password'",
        [cand]
      );
      if (row) { user = row; username = cand; break; }
    }

    if (!user) {
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    const senhaConfere =
      user.value === passwordTrim ||
      (passDigits.length === 11 && user.value === passDigits);
    if (!senhaConfere) {
      return res.status(401).json({ message: "Senha incorreta" });
    }

    // Nao limpar radacct aqui: o FreeRADIUS ja tem delete_stale_sessions=yes,
    // e apagar radacct reduziria o contador 'totalcounter' (reset=never),
    // permitindo reuso infinito do mesmo plano. Sessoes travadas sao
    // resolvidas pelo proprio FreeRADIUS ou pela re-autenticacao.

    // Pega o dominio do gateway (MikroTik) para redirecionamento
    const [[mk]] = await db.query(
      "SELECT ip, end_hotspot FROM mikrotiks WHERE id = ?",
      [mikrotik_id]
    );

    if (!mk || !mk.ip) {
      return res.status(404).json({ message: "Gateway não encontrado" });
    }

    const gateway = mk.end_hotspot || mk.ip;

    // mac vem do body quando o portal login foi aberto via captive redirect
    const gatewayInfo = await montarGatewayInfo({
      mikrotik_id: parseInt(mikrotik_id, 10), mac: req.body.mac || null, username,
    });

    // password canonico do radcheck: o digitado pode estar formatado (CPF com
    // pontos/traco) e o MikroTik/RADIUS compara com o valor limpo do banco.
    res.json({ message: "Autenticado com sucesso", gateway, username, password: user.value, gateway_info: gatewayInfo });

  } catch (err) {
    console.error("Erro no login-portal:", err);
    res.status(500).json({ message: "Erro interno no servidor" });
  }
};
