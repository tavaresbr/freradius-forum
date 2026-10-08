const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/campanhasPublicController');

router.get('/:portalId', ctrl.obterPorPortal);
router.post('/:portalId/view', ctrl.registrarView);

module.exports = router;
