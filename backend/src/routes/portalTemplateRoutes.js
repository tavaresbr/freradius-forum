const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/portalTemplateController");

router.get("/", ctrl.listarTemplates);
router.get("/:id", ctrl.obterTemplate);

module.exports = router;
