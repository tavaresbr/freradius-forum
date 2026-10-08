const express = require("express");
const router = express.Router();
const {
  criarPlano,
  listarPlanos,
  atualizarPlano,
  deletarPlano,
  enviarParaMikrotik,
} = require("../controllers/planController");

router.get("/", listarPlanos);
router.post("/", criarPlano);
router.put("/:id", atualizarPlano);
router.delete("/:id", deletarPlano);
router.post("/:id/enviar", enviarParaMikrotik);

module.exports = router;
