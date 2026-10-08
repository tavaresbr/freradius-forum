const { getPermissoesConsolidadas } = require('../controllers/grupoPermissaoController');
const db = require('../../db');

/**
 * Middleware que verifica permissão baseado no módulo e no HTTP method.
 * GET → 'ver', POST → 'criar', PUT/PATCH → 'editar', DELETE → 'excluir'
 * 
 * Regras:
 * - Super admin: acesso total (bypass)
 * - Sem grupo vinculado: ACESSO NEGADO (deny-by-default) — o admin precisa
 *   estar em algum grupo. A migration 018 cria/atribui um grupo "completo"
 *   aos admins existentes sem grupo pra nao travar ninguem.
 * - Com grupo: respeita permissões do grupo
 */
module.exports = (modulo) => {
  return async (req, res, next) => {
    if (req.user && req.user.role === 'super_admin') return next();

    const methodMap = { GET: 'ver', POST: 'criar', PUT: 'editar', PATCH: 'editar', DELETE: 'excluir' };
    const acao = methodMap[req.method] || 'ver';

    try {
      // Verificar se o admin tem algum grupo vinculado
      const [[{ total }]] = await db.execute(
        'SELECT COUNT(*) as total FROM admin_grupos WHERE admin_id = ?', [req.user.id]
      );

      // Sem grupo = acesso NEGADO (deny-by-default). Admins legitimos ganham
      // um grupo via migration 018 ou pela tela de Grupos de Permissao.
      if (total === 0) {
        return res.status(403).json({ error: 'Usuario sem grupo de permissao. Contate o administrador.' });
      }

      // Com grupo = verificar permissões
      const permissoes = await getPermissoesConsolidadas(req.user.id);
      if (permissoes[modulo] && permissoes[modulo][acao]) {
        return next();
      }
      return res.status(403).json({ error: `Sem permissão para ${acao} em ${modulo}` });
    } catch (err) {
      console.error('Erro checkPermissao:', err);
      return res.status(500).json({ error: 'Erro ao verificar permissão' });
    }
  };
};
