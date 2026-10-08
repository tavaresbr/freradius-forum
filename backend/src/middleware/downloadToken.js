const jwt = require('jsonwebtoken')

// Token de curta duracao para downloads/previews abertos via window.open, onde
// nao da pra enviar o header Authorization. E' escopado (purpose='download') e
// expira em 120s, entao mesmo vazando em log/historico nao serve como sessao.

// Emitido por uma rota protegida (auth + tenant ja resolveram req.user/empresa).
function issueDownloadToken(req, res) {
  const payload = {
    id: req.user.id,
    empresa_id: req.empresa_id ?? req.user.empresa_id ?? null,
    role: req.user.role,
    purpose: 'download',
  }
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '120s',
  })
  return res.json({ token })
}

// Valida o token vindo por ?token= apenas para rotas de download/preview.
function verifyDownloadToken(req, res, next) {
  const token = req.query.token
  if (!token) return res.status(401).json({ error: 'Token de download nao fornecido' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (decoded.purpose !== 'download') {
      return res.status(403).json({ error: 'Token invalido para download' })
    }
    req.user = decoded
    req.empresa_id = decoded.empresa_id
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Token de download invalido ou expirado' })
  }
}

module.exports = { issueDownloadToken, verifyDownloadToken }
