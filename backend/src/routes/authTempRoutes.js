const express = require("express");
const router = express.Router();
const { gerarAcessoTemporarioHandler } = require("../controllers/authTempRouteController");

router.post("/temp", gerarAcessoTemporarioHandler);

module.exports = router;
