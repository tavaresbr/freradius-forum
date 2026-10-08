const ConfigMercadoPago = require("../models/ConfigMercadoPago");

exports.salvarConfiguracao = async (req, res) => {
  const { publicKey, accessToken, clientId, clientSecret } = req.body;

  try {
    const existentes = await ConfigMercadoPago.findOne();

    if (existentes) {
      await existentes.update({ publicKey, accessToken, clientId, clientSecret });
    } else {
      await ConfigMercadoPago.create({ publicKey, accessToken, clientId, clientSecret });
    }

    res.json({ message: "Configurações salvas com sucesso" });
  } catch (error) {
    console.error("Erro ao salvar config Mercado Pago:", error);
    res.status(500).json({ message: "Erro ao salvar configuração" });
  }
};

exports.obterConfiguracao = async (req, res) => {
  try {
    const config = await ConfigMercadoPago.findOne();
    res.json(config || {});
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar configuração" });
  }
};

