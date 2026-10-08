// src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { limparRadius, limparPagamentos, limparLGPD } = require("../controllers/limpezaController");

router.delete("/limpar-radius", auth, limparRadius);
router.delete("/limpar-pagamentos", auth, limparPagamentos);
router.delete("/limpar-lgpd", auth, limparLGPD);

module.exports = router;
