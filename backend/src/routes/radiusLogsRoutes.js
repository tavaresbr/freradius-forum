// src/routes/radiusLogsRoutes.js
const express = require("express");
const router = express.Router();
const { listarLogs, exportarCSV } = require("../controllers/radiusLogsController");

// Protegido por JWT do admin
router.get("/export", exportarCSV);
router.get("/", listarLogs);

module.exports = router;
