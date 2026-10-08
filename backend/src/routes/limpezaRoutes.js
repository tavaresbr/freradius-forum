const express = require("express");
const router = express.Router();
const {
  limparRadius,
  limparPagamentos,
  limparLGPD
} = require("../controllers/limpezaController");

router.delete("/radius", limparRadius);
router.delete("/pagamentos", limparPagamentos);
router.delete("/lgpd", limparLGPD);

module.exports = router;
