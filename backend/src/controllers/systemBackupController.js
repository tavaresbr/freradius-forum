"use strict";

const db = require("../../db");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { criarBackupInterno } = require("./systemBackupController.internal");

const PROJECT_ROOT = "/var/www/hotspot";
const BACKUPS_DIR = path.join(PROJECT_ROOT, "backups");

// ---------------------------------------------------------------------------
// GET /api/system/backups
// ---------------------------------------------------------------------------
async function listarBackups(req, res) {
  try {
    const [rows] = await db.query(
      "SELECT * FROM system_backups ORDER BY criado_em DESC"
    );

    const backups = rows.map((row) => {
      const dbExists = row.db_dump_path
        ? fs.existsSync(row.db_dump_path)
        : false;
      const filesExists = row.files_zip_path
        ? fs.existsSync(row.files_zip_path)
        : false;

      return {
        ...row,
        db_exists: dbExists,
        files_exists: filesExists,
      };
    });

    res.json(backups);
  } catch (err) {
    console.error("Erro ao listar backups:", err);
    res.status(500).json({ message: "Erro ao listar backups" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/system/backups
// Body: { update_id?, tipo? }
// ---------------------------------------------------------------------------
async function criarBackup(req, res) {
  try {
    const { update_id, tipo } = req.body || {};

    const result = await criarBackupInterno(update_id || null, tipo || "manual");

    res.status(201).json({
      message: "Backup criado com sucesso",
      backup_id: result.backupId,
      backup_dir: result.backupDir,
      db_dump_path: result.dbDumpPath,
      files_zip_path: result.filesZipPath,
    });
  } catch (err) {
    console.error("Erro ao criar backup:", err);
    res.status(500).json({ message: "Erro ao criar backup: " + err.message });
  }
}

// ---------------------------------------------------------------------------
// POST /api/system/backups/:id/restaurar
// ---------------------------------------------------------------------------
async function restaurarBackup(req, res) {
  try {
    const { id } = req.params;

    const [[backup]] = await db.execute(
      "SELECT * FROM system_backups WHERE id = ?",
      [id]
    );

    if (!backup) {
      return res.status(404).json({ message: "Backup não encontrado" });
    }

    // Verify files exist
    const dbExists = backup.db_dump_path && fs.existsSync(backup.db_dump_path);
    const filesExists =
      backup.files_zip_path && fs.existsSync(backup.files_zip_path);

    if (!dbExists) {
      return res
        .status(400)
        .json({ message: "Arquivo de dump do banco não encontrado em disco" });
    }
    if (!filesExists) {
      return res
        .status(400)
        .json({ message: "Arquivo zip de arquivos não encontrado em disco" });
    }

    // --- Restore MySQL ---
    const host = process.env.DB_HOST || "127.0.0.1";
    const port = process.env.DB_PORT || "3306";
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME;

    execSync(
      `mysql -h ${host} -P ${port} -u ${user} --password=${password} ${dbName} < "${backup.db_dump_path}"`,
      { stdio: "pipe" }
    );

    // --- Restore files ---
    if (backup.files_zip_path.endsWith(".tar.gz")) {
      execSync(`tar xzf "${backup.files_zip_path}" -C "${PROJECT_ROOT}"`, {
        stdio: "pipe",
      });
    } else {
      execSync(`unzip -o "${backup.files_zip_path}" -d "${PROJECT_ROOT}"`, {
        stdio: "pipe",
      });
    }

    // --- Rebuild frontend ---
    execSync("npm run build", {
      cwd: path.join(PROJECT_ROOT, "frontend"),
      stdio: "pipe",
    });

    // Respond before restarting
    res.json({
      message:
        "Backup restaurado com sucesso. O servidor será reiniciado em instantes.",
    });

    // Restart PM2 after response is sent
    setTimeout(() => {
      try {
        execSync("pm2 restart all", { stdio: "pipe" });
      } catch (restartErr) {
        console.error("Erro ao reiniciar PM2:", restartErr);
      }
    }, 1500);
  } catch (err) {
    console.error("Erro ao restaurar backup:", err);
    res.status(500).json({ message: "Erro ao restaurar backup: " + err.message });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/system/backups/:id
// ---------------------------------------------------------------------------
async function deletarBackup(req, res) {
  try {
    const { id } = req.params;

    const [[backup]] = await db.execute(
      "SELECT * FROM system_backups WHERE id = ?",
      [id]
    );

    if (!backup) {
      return res.status(404).json({ message: "Backup não encontrado" });
    }

    // Remove directory from disk (derive from db_dump_path)
    const backupDir = backup.db_dump_path ? path.dirname(backup.db_dump_path) : null;
    if (backupDir && fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }

    // Delete from DB
    await db.execute("DELETE FROM system_backups WHERE id = ?", [id]);

    res.json({ message: "Backup deletado com sucesso" });
  } catch (err) {
    console.error("Erro ao deletar backup:", err);
    res.status(500).json({ message: "Erro ao deletar backup: " + err.message });
  }
}

module.exports = {
  listarBackups,
  criarBackup,
  restaurarBackup,
  deletarBackup,
};
