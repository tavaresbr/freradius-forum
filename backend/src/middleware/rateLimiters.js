// Rate limiters compartilhados (express-rate-limit v8).
// Protegem endpoints publicos sensiveis contra brute-force / abuso.
// Atras do nginx: server.js define app.set('trust proxy', 1) pra keying por IP real.
const { rateLimit } = require('express-rate-limit');

const jsonHandler = (mensagem) => (req, res /*, next, options */) => {
  res.status(429).json({ error: mensagem });
};

// Logins admin/portal: agressivo (brute-force de credenciais).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 min
  limit: 30,                     // 30 FALHAS de login por IP por janela
  skipSuccessfulRequests: true,  // login OK (2xx) nao consome cota: quem acerta a senha nunca trava
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Muitas tentativas de login. Tente novamente em alguns minutos.'),
});

// Registro de empresa: evita criacao em massa.
const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Muitas solicitacoes de registro. Tente novamente mais tarde.'),
});

// Endpoints publicos do captive portal (pagamentos, acesso temporario, etc).
// Limite mais folgado por causa de polling de status, mas ainda limita abuso/enumeracao.
const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Muitas requisicoes. Aguarde alguns instantes.'),
});

// Check de atualizacao dos alunos (valida email Hotmart) - anti-enumeracao.
const updateCheckLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Muitas verificacoes de atualizacao. Aguarde.'),
});

module.exports = { loginLimiter, registroLimiter, publicApiLimiter, updateCheckLimiter };
