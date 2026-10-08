const express = require("express");
const router = express.Router();
const controller = require("../controllers/empresaConfigController");

// Testar conexão MP (deve vir antes de /:tipo para não conflitar)
router.post("/mercadopago/testar", controller.testarConexaoMercadoPago);

// CRUD genérico por tipo
router.get("/:tipo", controller.obterConfig);
router.post("/:tipo", controller.salvarConfig);

module.exports = router;
