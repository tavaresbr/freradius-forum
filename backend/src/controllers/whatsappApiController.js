const { getClient } = require("./whatsappController");

exports.enviarMensagem = async (req, res) => {
  const { telefone, mensagem } = req.body;

  if (!telefone || !mensagem) {
    return res.status(400).json({ error: "Telefone e mensagem são obrigatórios." });
  }

  const client = getClient();
  if (!client) {
    return res.status(503).json({ error: "WhatsApp não conectado." });
  }

  try {
    await client.sendText(`${telefone}@c.us`, mensagem);
    return res.json({ sucesso: true, mensagem: "Mensagem enviada com sucesso." });
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error.message);
    return res.status(500).json({ error: "Erro ao enviar mensagem." });
  }
};
