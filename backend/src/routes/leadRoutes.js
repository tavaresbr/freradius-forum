const express = require("express");
const router = express.Router();
const leadController = require("../controllers/leadController");

router.get("/export", leadController.exportarLeadsCSV);
router.get("/", leadController.listarLeads);
router.post("/", leadController.criarLead);
router.put("/:id", leadController.atualizarLead);
router.delete("/:id", leadController.deletarLead);

module.exports = router;
