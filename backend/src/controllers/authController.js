const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../models/Admin')
const { getPermissoesConsolidadas, MODULOS } = require('./grupoPermissaoController')

exports.login = async (req, res) => {
  const { email, password, senha } = req.body
  const pass = password || senha
  const user = await Admin.findByEmail(email)

  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' })

  const match = await bcrypt.compare(pass, user.password)
  if (!match) return res.status(401).json({ error: 'Senha incorreta' })

  // Buscar todas as empresas do usuário
  const empresas = await Admin.getEmpresas(user.id, user.role);

  if (empresas.length === 0) {
    return res.status(403).json({ error: 'Você não possui vínculo com nenhuma empresa ativa' });
  }

  // Empresa ativa = a do JWT antigo (empresa_id do admin) ou primeira da lista
  const empresaAtiva = empresas.find(e => e.id === user.empresa_id) || empresas[0] || null;

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      empresa_id: empresaAtiva?.id || user.empresa_id,
      empresa_slug: empresaAtiva?.slug || user.empresa_slug || 'default',
      empresa_nome: empresaAtiva?.nome || user.empresa_nome || 'Empresa Padrão',
      role: user.role || 'operator'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  )

  // Buscar permissões consolidadas do admin
  let permissoes = {};
  if (user.role === 'super_admin') {
    for (const m of MODULOS) permissoes[m] = { ver: true, criar: true, editar: true, excluir: true };
  } else {
    permissoes = await getPermissoesConsolidadas(user.id);
  }

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role || 'operator',
      empresa_id: empresaAtiva?.id || user.empresa_id,
      empresa_slug: empresaAtiva?.slug || user.empresa_slug || 'default',
      empresa_nome: empresaAtiva?.nome || user.empresa_nome || 'Empresa Padrão'
    },
    empresas,
    permissoes
  })
}

exports.switchEmpresa = async (req, res) => {
  try {
    const { empresa_id } = req.body;
    const adminId = req.user.id;

    // Verificar que o admin tem acesso a essa empresa
    const empresas = await Admin.getEmpresas(adminId, req.user.role);
    const empresa = empresas.find(e => e.id === parseInt(empresa_id));

    // Super admin pode acessar qualquer empresa
    if (!empresa && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Sem acesso a esta empresa' });
    }

    // Se super_admin e empresa não está na lista, busca direto
    let empresaData = empresa;
    if (!empresaData) {
      const db = require('../../db');
      const [[emp]] = await db.execute('SELECT id, nome, slug FROM empresas WHERE id = ?', [empresa_id]);
      if (!emp) return res.status(404).json({ error: 'Empresa não encontrada' });
      empresaData = emp;
    }

    const newToken = jwt.sign(
      {
        id: adminId,
        email: req.user.email,
        empresa_id: empresaData.id,
        empresa_slug: empresaData.slug,
        empresa_nome: empresaData.nome,
        role: req.user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token: newToken,
      empresa: {
        id: empresaData.id,
        nome: empresaData.nome,
        slug: empresaData.slug
      },
      empresas
    });
  } catch (err) {
    console.error('Erro ao trocar empresa:', err);
    res.status(500).json({ error: 'Erro ao trocar empresa' });
  }
}
