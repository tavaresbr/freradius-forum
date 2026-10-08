"use strict";

const db = require("../../db");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PROJECT_ROOT = "/var/www/hotspot";
const BACKUPS_DIR = path.join(PROJECT_ROOT, "backups");

/**
 * Internal helper — creates a backup without req/res.
 * Returns { backupId, backupDir, dbDumpPath, filesZipPath }
 */
async function criarBackupInterno(updateId, tipo) {
  // Ensure backups directory exists
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  // Build backup directory name
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const dirName = updateId ? String(updateId) : `manual-${timestamp}`;
  const backupDir = path.join(BACKUPS_DIR, dirName);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Paths
  const dbDumpPath = path.join(backupDir, "database.sql");
  const filesZipPath = path.join(backupDir, "files.tar.gz");

  // --- MySQL dump ---
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = process.env.DB_PORT || "3306";
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME;

  const dumpCmd = `mysqldump -h ${host} -P ${port} -u ${user} --password=${password} ${dbName} > "${dbDumpPath}"`;
  execSync(dumpCmd, { stdio: "pipe" });

  // --- Zip project files ---
  // Files/dirs to include (relative to PROJECT_ROOT), excluding node_modules
  const includeTargets = [
    "backend/src",
    "backend/server.js",
    "backend/package.json",
    "backend/routes",
    "frontend/src",
    "frontend/package.json",
    "frontend/vite.config.js",
  ]
    .filter((t) => fs.existsSync(path.join(PROJECT_ROOT, t)))
    .map((t) => `"${t}"`)
    .join(" ");

  const tarCmd = `cd "${PROJECT_ROOT}" && tar czf "${filesZipPath}" --exclude="*/node_modules/*" ${includeTargets}`;
  execSync(tarCmd, { stdio: "pipe" });

  // --- Record in DB ---
  const tipoFinal = tipo || (updateId ? "pre_update" : "manual");
  const [result] = await db.execute(
    `INSERT INTO system_backups (update_id, tipo, db_dump_path, files_zip_path) VALUES (?, ?, ?, ?)`,
    [updateId || null, tipoFinal, dbDumpPath, filesZipPath]
  );

  return {
    backupId: result.insertId,
    backupDir,
    dbDumpPath,
    filesZipPath,
  };
}

module.exports = { criarBackupInterno };
