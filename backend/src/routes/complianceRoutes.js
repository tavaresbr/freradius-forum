// src/routes/complianceRoutes.js
const express = require("express");
const router = express.Router();
const {
  buscarLogs,
  exportarCSV,
  listarAccessPoints,
  renomearAccessPoint,
} = require("../controllers/complianceController");

router.get("/", buscarLogs);
router.get("/export", exportarCSV);
router.get("/access-points", listarAccessPoints);
router.put("/access-points/:id", renomearAccessPoint);

module.exports = router;
