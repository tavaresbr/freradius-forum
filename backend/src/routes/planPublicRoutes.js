const express = require("express");
const router = express.Router();
const {
  listarPlanosPublicos,
  buscarPlanoPublicoPorId,
} = require("../controllers/planPublicController");

router.get("/", listarPlanosPublicos);
router.get("/:id", buscarPlanoPublicoPorId);

module.exports = router;
