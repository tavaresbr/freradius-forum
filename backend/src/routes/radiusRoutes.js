const express = require('express');
const router = express.Router();
const { criarUsuarioRadius, vincularPlano, listarUsuarios, deletarUsuarioRadius, listarSessoesAtivas } = require('../controllers/radiusController');
const checkPermissao = require('../middleware/checkPermissao');

// Rotas protegidas
router.post('/criar-usuario', checkPermissao('radius'), criarUsuarioRadius);
router.post('/vincular-plano', checkPermissao('radius'), vincularPlano);
router.get('/usuarios', checkPermissao('radius'), listarUsuarios);
router.delete('/usuarios/:username', checkPermissao('radius'), deletarUsuarioRadius);
router.get("/sessoes", checkPermissao('sessoes'), listarSessoesAtivas); 
module.exports = router;
