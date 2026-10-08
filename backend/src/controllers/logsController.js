const { execFile } = require("child_process");
const fs = require("fs");

// Whitelist de arquivos permitidos. NUNCA aceite path do usuario direto.
const PM2_OUT = "/root/.pm2/logs/hotspot-api-out.log";
const PM2_ERR = "/root/.pm2/logs/hotspot-api-error.log";
const RADIUS_LOG = "/var/log/freeradius/radius.log";

const MAX_LINES = 5000;
const DEFAULT_LINES = 500;

function parseLines(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LINES;
  if (n > MAX_LINES) return MAX_LINES;
  return n;
}

function tailFile(filePath, lines) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return resolve({ exists: false, content: "", size: 0 });
    }
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (e) {
      stat = { size: 0 };
    }
    execFile(
      "tail",
      ["-n", String(lines), filePath],
      { maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve({ exists: true, content: stdout, size: stat.size });
      }
    );
  });
}

exports.getPm2Logs = async (req, res) => {
  try {
    const lines = parseLines(req.query.lines);
    const tipo = req.query.tipo === "error" ? "error" : "out";
    const filePath = tipo === "error" ? PM2_ERR : PM2_OUT;
    const { exists, content, size } = await tailFile(filePath, lines);
    res.json({
      success: true,
      tipo,
      lines,
      path: filePath,
      exists,
      size,
      content,
    });
  } catch (err) {
    console.error("[logs] pm2 error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getRadiusLogs = async (req, res) => {
  try {
    const lines = parseLines(req.query.lines);
    const { exists, content, size } = await tailFile(RADIUS_LOG, lines);
    res.json({
      success: true,
      lines,
      path: RADIUS_LOG,
      exists,
      size,
      content,
    });
  } catch (err) {
    console.error("[logs] radius error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.clearPm2Logs = async (req, res) => {
  execFile("pm2", ["flush", "hotspot-api"], (err, stdout, stderr) => {
    if (err) {
      console.error("[logs] pm2 flush falhou:", stderr || err.message);
      return res
        .status(500)
        .json({ success: false, error: stderr || err.message });
    }
    res.json({ success: true, output: stdout });
  });
};

exports.clearRadiusLogs = async (req, res) => {
  // Trunca o arquivo (precisa permissao de escrita - roda como root no PM2)
  fs.truncate(RADIUS_LOG, 0, (err) => {
    if (err) {
      console.error("[logs] radius truncate falhou:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true });
  });
};

exports.getServicosStatus = async (req, res) => {
  const getPm2 = () =>
    new Promise((resolve) => {
      execFile("pm2", ["jlist"], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve({ ok: false, error: err.message });
        try {
          const list = JSON.parse(stdout);
          const app = list.find((a) => a.name === "hotspot-api");
          if (!app) return resolve({ ok: false, error: "app nao encontrado" });
          resolve({
            ok: true,
            status: app.pm2_env?.status,
            uptime: app.pm2_env?.pm_uptime,
            restarts: app.pm2_env?.restart_time,
            pid: app.pid,
            mem: app.monit?.memory,
            cpu: app.monit?.cpu,
          });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });

  const getFreeradius = () =>
    new Promise((resolve) => {
      execFile(
        "systemctl",
        ["is-active", "freeradius"],
        (err, stdout) => {
          resolve({
            ok: !err,
            status: (stdout || "").trim() || (err ? "inactive" : "unknown"),
          });
        }
      );
    });

  try {
    const [pm2, radius] = await Promise.all([getPm2(), getFreeradius()]);
    res.json({ success: true, pm2, radius });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
