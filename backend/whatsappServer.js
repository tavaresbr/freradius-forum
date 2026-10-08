const express = require("express");
const cors = require("cors");
const wppconnect = require("@wppconnect-team/wppconnect");
const { setClient } = require("./src/controllers/whatsappController");

const app = express();
const PORT = 3030;

app.use(express.json());
app.use(cors());

let client = null;
let isClientReady = false;

async function iniciarWhatsapp() {
  console.log("🟡 Iniciando sessão WhatsApp...");

  try {
    client = await wppconnect.create({
      session: "hotspot-wpp",
      catchQR: (base64Qr, asciiQR) => {
        console.clear();
        console.log("📲 Escaneie o QR Code abaixo:");
        console.log(asciiQR);
      },
      statusFind: (statusSession) => {
        console.log("📶 Status:", statusSession);
      },
      puppeteerOptions: {
        headless: true,
        executablePath: "/usr/bin/google-chrome-stable",
        args: [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-zygote",
  "--disable-gpu",
  "--disable-features=TranslateUI",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--window-size=1280,720",
],
      }
    });

    isClientReady = true;
    setClient(client); // 🔄 Exporta para o sistema principal
    console.log("✅ WhatsApp conectado!");
  } catch (err) {
    console.error("❌ Erro ao iniciar WhatsApp:", err);
  }
}

iniciarWhatsapp();

app.get("/status", (req, res) => {
  if (!isClientReady) return res.status(503).json({ status: "AGUARDANDO_CONEXAO" });
  res.json({ status: "CONECTADO" });
});

app.post("/send", async (req, res) => {
  const { telefone, mensagem } = req.body;

  if (!telefone || !mensagem) {
    return res.status(400).json({ error: "Telefone e mensagem são obrigatórios." });
  }

  if (!isClientReady) {
    return res.status(503).json({ error: "WhatsApp ainda não está pronto." });
  }

  try {
    await client.sendText(`${telefone}@c.us`, mensagem);
    res.json({ sucesso: true, mensagem: "Enviado com sucesso." });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res.status(500).json({ error: "Falha ao enviar mensagem." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor WhatsApp rodando na porta ${PORT}`);
});
