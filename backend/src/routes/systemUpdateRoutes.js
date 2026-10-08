const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  verificarAtualizacoes,
  aplicarAtualizacao,
  listarLogs,
} = require('../controllers/systemUpdateController');

router.use(auth, authorize('super_admin'));

router.post('/check', verificarAtualizacoes);
router.post('/apply', aplicarAtualizacao);
router.get('/logs', listarLogs);

module.exports = router;
