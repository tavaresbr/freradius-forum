const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/loginPortalController');

router.post('/auth', ctrl.login);

module.exports = router;
