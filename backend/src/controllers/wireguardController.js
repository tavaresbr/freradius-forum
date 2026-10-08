const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../../db');

const WG_URL = `http://127.0.0.1:${process.env.WG_PANEL_PORT || '51821'}`;
const WG_PASS = process.env.WG_PASS || '';
const COMPOSE_PATH = path.resolve(__dirname, '../../../infra/wireguard/docker-compose.yml');

let wgCookie = null;

const authenticate = async () => {
  try {
    const res = await axios.post(`${WG_URL}/api/session`, { password: WG_PASS });
    const setCookieHeader = res.headers['set-cookie'];
    if (Array.isArray(setCookieHeader)) {
      wgCookie = setCookieHeader[0].split(';')[0];
    } else if (setCookieHeader) {
      wgCookie = setCookieHeader.split(';')[0];
    }
    return true;
  } catch (error) {
    console.error('Erro ao autenticar no wg-easy:', error.message);
    return false;
  }
};

const makeRequest = async (method, path, data = null) => {
  if (!wgCookie) await authenticate();
  try {
    const res = await axios({
      method,
      url: `${WG_URL}${path}`,
      data,
      headers: { Cookie: wgCookie }
    });
    return res.data;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      await authenticate();
      const res = await axios({
        method,
        url: `${WG_URL}${path}`,
        data,
        headers: { Cookie: wgCookie }
      });
      return res.data;
    }
    throw error;
  }
};

// Read current server settings from docker-compose.yml
const readComposeSettings = () => {
  const content = fs.readFileSync(COMPOSE_PATH, 'utf8');
  const wgPortMatch = content.match(/WG_PORT=(\d+)/);
  const wgHostMatch = content.match(/WG_HOST=([\d.]+)/);
  const panelPortMatch = content.match(/PORT=(\d+)/);
  return {
    wgPort: wgPortMatch ? wgPortMatch[1] : '51820',
    wgHost: wgHostMatch ? wgHostMatch[1] : (process.env.WG_HOST || ''),
    panelPort: panelPortMatch ? panelPortMatch[1] : '51821'
  };
};

exports.getServerSettings = async (req, res) => {
  try {
    const settings = readComposeSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: "Erro ao ler configurações", error: err.message });
  }
};

exports.updateServerSettings = async (req, res) => {
  try {
    const { wgPort, wgHost } = req.body;
    let content = fs.readFileSync(COMPOSE_PATH, 'utf8');

    if (wgPort) {
      content = content.replace(/WG_PORT=\d+/, `WG_PORT=${wgPort}`);
    }
    if (wgHost) {
      content = content.replace(/WG_HOST=[\d.]+/, `WG_HOST=${wgHost}`);
    }

    fs.writeFileSync(COMPOSE_PATH, content, 'utf8');

    // Restart Docker container with new settings
    const composeDir = path.dirname(COMPOSE_PATH);
    execSync('docker compose down && docker compose up -d', { cwd: composeDir, timeout: 30000 });

    // Wait for wg-easy to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    wgCookie = null; // Reset session

    const settings = readComposeSettings();
    res.json({ success: true, settings });
  } catch (err) {
    console.error("Erro ao atualizar configurações:", err.message);
    res.status(500).json({ message: "Erro ao atualizar configurações", error: err.message });
  }
};

exports.getVpnStatus = async (req, res) => {
  try {
    const allClients = await makeRequest('GET', '/api/wireguard/client');
    const settings = readComposeSettings();
    let serverPublicKey = "Carregando (adicione um peer para ver)";
    let serverAddress = "10.8.0.1";
    let endpoint = `${settings.wgHost}:${settings.wgPort}`;

    // Filter clients to only show those mapped to this empresa
    const [peerRows] = await db.execute(
      "SELECT wg_client_id FROM empresa_vpn_peers WHERE empresa_id = ?",
      [req.empresa_id]
    );
    const allowedIds = new Set(peerRows.map(r => r.wg_client_id));
    const clients = allClients.filter(c => allowedIds.has(c.id));

    if (allClients.length > 0) {
      const conf = await makeRequest('GET', `/api/wireguard/client/${allClients[0].id}/configuration`);
      const pkMatch = conf.match(/PublicKey\s*=\s*(.*)/);
      if (pkMatch) serverPublicKey = pkMatch[1];
      const epMatch = conf.match(/Endpoint\s*=\s*(.*)/);
      if (epMatch) endpoint = epMatch[1];
    }

    res.json({
       clients,
       server: {
         publicKey: serverPublicKey,
         address: serverAddress,
         endpoint: endpoint,
         subNet: "10.8.0.0/24"
       }
    });

  } catch (err) {
    console.error("Erro no getVpnStatus:", err.stack);
    res.status(500).json({ message: "Erro ao comunicar com WG", error: err.message });
  }
};

exports.createClient = async (req, res) => {
  try {
    const { name } = req.body;
    const client = await makeRequest('POST', '/api/wireguard/client', { name });

    // Map the new peer to this empresa
    // wg-easy returns the client list after creation; find the new one by name
    const clients = await makeRequest('GET', '/api/wireguard/client');
    const newClient = clients.find(c => c.name === name);
    if (newClient) {
      await db.execute(
        "INSERT INTO empresa_vpn_peers (empresa_id, wg_client_id, nome) VALUES (?, ?, ?)",
        [req.empresa_id, newClient.id, name]
      );
    }

    res.json(client);
  } catch (err) {
    res.status(500).json({ message: "Erro ao criar peer", error: err.message });
  }
};

exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership before deleting
    const [[peer]] = await db.execute(
      "SELECT id FROM empresa_vpn_peers WHERE wg_client_id = ? AND empresa_id = ?",
      [id, req.empresa_id]
    );
    if (!peer) {
      return res.status(403).json({ message: "Peer não pertence a esta empresa" });
    }

    await makeRequest('DELETE', `/api/wireguard/client/${id}`);
    await db.execute(
      "DELETE FROM empresa_vpn_peers WHERE wg_client_id = ? AND empresa_id = ?",
      [id, req.empresa_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Erro ao deletar peer", error: err.message });
  }
};

exports.getClientConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const settings = readComposeSettings();
    const conf = await makeRequest('GET', `/api/wireguard/client/${id}/configuration`);
    
    const privKey = conf.match(/PrivateKey\s*=\s*(.*)/)[1].trim();
    const addressMatch = conf.match(/Address\s*=\s*(.*)/);
    const address = addressMatch ? addressMatch[1].trim() : "10.8.0.2/24";
    const pubKey = conf.match(/PublicKey\s*=\s*(.*)/)[1].trim();
    const pskMatch = conf.match(/PresharedKey\s*=\s*(.*)/);
    const presharedKey = pskMatch ? pskMatch[1].trim() : null;

    const pskLine = presharedKey ? ` preshared-key="${presharedKey}"` : '';

    const routerOsScript = `/interface wireguard add listen-port=13231 mtu=1420 name=wg-hotspot private-key="${privKey}"
/interface wireguard peers add allowed-address=10.8.0.0/24 endpoint-address=${settings.wgHost} endpoint-port=${settings.wgPort} interface=wg-hotspot public-key="${pubKey}"${pskLine} persistent-keepalive=25s
/ip address add address=${address} interface=wg-hotspot`;

    res.json({ conf, routerOsScript });
  } catch (err) {
    res.status(500).json({ message: "Erro ao obter config", error: err.message });
  }
};

