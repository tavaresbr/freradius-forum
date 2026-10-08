const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const tenant = require("../middleware/tenant");
const { lgpdLogin, getAllLgpd, lgpdCadastro } = require("../controllers/lgpdController");

// Rotas públicas (captive portal)
router.post("/login", lgpdLogin);
router.post("/cadastro", lgpdCadastro);

// Rotas protegidas (admin)
router.get("/", auth, tenant, getAllLgpd);

module.exports = router;
