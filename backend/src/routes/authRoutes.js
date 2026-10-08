const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const authController = require('../controllers/authController')

router.post('/login', authController.login)
router.post('/switch-empresa', auth, authController.switchEmpresa)
router.get('/me/empresas', auth, async (req, res) => {
  const Admin = require('../models/Admin');
  const empresas = await Admin.getEmpresas(req.user.id, req.user.role);
  res.json(empresas);
})

module.exports = router
