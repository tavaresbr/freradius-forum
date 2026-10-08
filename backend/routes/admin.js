const express = require("express")
const router = express.Router()
const db = require("../db")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const [rows] = await db.execute(
      `SELECT a.*, e.slug AS empresa_slug, e.nome AS empresa_nome
       FROM admins a
       LEFT JOIN empresas e ON a.empresa_id = e.id
       WHERE a.email = ?`,
      [email]
    );
    const admin = rows[0];

    if (!admin) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    if (!senha || !admin.password) {
      return res.status(500).json({ message: 'Erro interno: dados incompletos' });
    }

    const isSenhaValida = await bcrypt.compare(senha, admin.password);
    if (!isSenhaValida) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        empresa_id: admin.empresa_id,
        empresa_slug: admin.empresa_slug || 'default',
        role: admin.role || 'operator'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        nome: admin.nome,
        role: admin.role || 'operator',
        empresa_id: admin.empresa_id,
        empresa_slug: admin.empresa_slug || 'default',
        empresa_nome: admin.empresa_nome || 'Empresa Padrão'
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
});

module.exports = router
