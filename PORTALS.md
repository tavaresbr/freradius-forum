# Arquitetura e Lógica dos Portais (Hotspot)

Este documento descreve a arquitetura, o fluxo de dados e os processos visuais envolvidos no sistema de Portais Captive (Hotspot). 

O sistema suporta múltiplos tenants (empresas), permitindo que cada provedor tenha seus próprios portais, com design customizado através de um editor visual "Elementor-Style" sem necessidade de re-build do frontend.

---

## 1. Tipos de Portais Suportados

A tabela `portais` define a aparência e o comportamento da página de captura. Existem 4 tipos principais:

1. **`login`**: Portal tradicional para clientes que já possuem usuário/senha (ou voucher) no RADIUS. 
2. **`planos`**: O fluxo de venda de internet via PIX. Redireciona o usuário para um processo de 3 etapas (Cadastro de Lead → Compra → Liberação).
3. **`lead_passivo`**: Portal no estilo "LGPD / Termos de Uso". O cliente preenche os dados (Nome, Email, Telefone, CPF/Passaporte, Nascimento) para obter acesso gratuito liberado mediante aceitação.
4. **`lead_ativo`**: Portal que exige integração com WhatsApp (disparo de OTP/Link de validação) para liberar a navegação gratuita.

---

## 2. Editor Visual (WYSIWYG)

O editor visual fica em **`PortalEditor.jsx`**.

- **Armazenamento**: O design do portal é salvo dinamicamente na coluna json `config_json` da tabela `portais`.
- **Customização**: O provedor pode alterar imagem de fundo, logotipo, cores primárias/secundárias (botões/textos), opacidade, raio de borda (arredondamento), fontes e posição dos elementos (esquerda, centro, direita).
- **Preview em Tempo Real**: Usando a mesma casca de estilização, o editor simula os componentes na tela lado-a-lado usando o hook de estado do React, antes de salvar no banco de dados.
- **Diferenciação por Tipo**: O preview reconhece o tipo do portal. Se for tipo `planos`, o preview mostrará um infográfico de "Etapa 1: Cadastro → Etapa 2: Planos → Etapa 3: PIX", permitindo visualizar as cores dos inputs sem renderizar todo o motor complexo de pagamento no editor.

---

## 3. Renderização Dinâmica (Public Portal)

A renderização pública é feita através da URL **`/p/:hash`**, processada pelo `RenderPortal.jsx`.

- O MikroTik/RADIUS intercepta conexões HTTP sem autenticação e redireciona os clientes para `/p/:hash?mac=XX:XX&ip=YY.YY&mikrotik_id=ZZ`.
- O hash mapeia diretamente para o ID do portal do banco de dados (escondendo URLs incrementais).
- A página `RenderPortal.jsx` consome o `config_json` salvo para aquele portal específico e aplica as **variáveis CSS dinâmicas** (ex: `--primary-color`, `--bg-opacity`) via tag `style` in-line, injetando o logotipo e background corretos.
- Com base no `tipo` do portal carregado, botões de ação e formulários diferentes (Login, Formulário LGPD ou Botão de Compra) são renderizados no frontend, injetados dinamicamente na UI configurada.

---

## 4. O Fluxo de Planos e Pagamento PIX

Este é o workflow crítico para venda de internet (`tipo: planos`). 
O portal base serve apenas como ancoragem estética e redireciona (de forma transparente para o usuário) para as rotas funcionais mantendo os parâmetros na URL (`mac`, `ip`, `mikrotik_id`, `empresa_id`).

### Etapa 1: Captura Obrigatória (`CadastroCliente.jsx`)
Para evitar vendas anônimas e para identificar o usuário no RADIUS:
- Todos são obrigados a informar: **Nome, E-mail, Celular e CPF**.
- O sistema valida o CPF. Uma vez enviado, a API grava o "lead" na tabela associando-o ao `empresa_id` do provedor dono daquele hotspot.
- **[NOVO] Auto-Login de Clientes Retornantes**: 
  - Se o CPF já existir na base, a API vai no servidor FreeRADIUS (tabelas `radcheck` e `radacct`) verificar se há um "username" igual àquele CPF.
  - Se o usuário já possuir sessão e limite de tempo (plano ativo), a etapa cancela o fluxo de compra e **redireciona automaticamente o usuário para a página de login do MikroTik local** injetando usário/senha na URL, conectando-o sem atritos.

### Etapa 2: Seleção de Plano (`PlanosCliente.jsx`)
- Se o usuário for novo ou já esgotou a franquia de tempo, ele será redirecionado para `/planos-cliente` enviando o seu novo identificador interno (`cliente_id`) na URL.
- Esta página lista apenas os pacotes da tabela `planos` do `mikrotik_id` atrelado no redirecionamento. (ex: Plano de 30 minutos, 60 minutos, etc).

### Etapa 3: Pagamento e Liberação (`Pagamento.jsx`)
- O usuário escolhe o plano. A API (`gerarPagamento` em `pagamentoController`) faz interface com o Mercado Pago usando a token (Access Token) configurada na tabela `empresa_configs` (multi-tenant) e usando o CPF/Email obtidos pelo `cliente_id`.
- Ao criar a cobrança, o retorno do QR Code (Base64) e do Pix Copia e Cola é mostrado ao cliente. 
- A página executa um _polling_ (`setInterval` de 5 segundos) no endpoint `/api/pagamentos/status?pagamento_id=X` verificando especificamente aquela cobrança.

#### Webhook e Provisão RADIUS
- Assim que o pagamento cai no Mercado Pago (alguns segundos), um POST via Webhook atinge nossa API, atualizando o status do pagamento para `approved`.
- Imediatamente a API cria credenciais fixas (CPF do cliente como Username e Password) na base do **FreeRADIUS** (`radcheck` e `radusergroup`), definindo a expiração baseada no tipo de plano.
- O polling no frontend lê este status em tempo real, exibe o check verde ✅ e redireciona (`window.location.href = http://<gateway-do-mikrotik>/login?username=<cpf>&password=<cpf>`), autenticando o equipamento na rede e liberando o MAC na antena para navegação externa.

---

## 5. Endpoints Principais

Abaixo estão as principais rotas Node/Express alimentando esta lógica:

*   `GET /api/portais/hash/:hash`
    *   **Uso:** Visualização de portal público pelo cliente. Traz JSON com confs visuais (`config_json`).
*   `GET /api/portais/:id` \ `PUT /api/portais/:id`
    *   **Uso:** Admin obtém e salva a edição visual e a configuração de campos no PortalEditor.
*   `POST /api/clientes/cadastro`
    *   **Uso:** Injeta Lead no banco, e valida auto-login contra o FreeRADIUS. Retorna `{ planoAtivo: true/false }`.
*   `POST /api/pagamentos/gerar`
    *   **Uso:** Cadastra na tabela `pagamentos`, bate na API V1 do Mercado Pago, gerando PIX vinculado ou em fallback `comprador@pagamento.com` se o email fornecido no lead for inválido. Retorna JSON com QR Base64, chave Copia e Cola e ID gerado.
*   `GET /api/pagamentos/status?pagamento_id=X`
    *   **Uso:** Polling de aprovação. Previne bugs de sessões anteriores testando via ID estrito.
*   `POST /api/mercadopago/webhook`
    *   **Uso:** Recebe notificação assíncrona do MP, marca como pago e dispara integração `liberarUsuario()`.

---

## 6. Diretivas de Tratamentos do App

- **Problemas de CORS / Cache**: Sempre que houver edição de páginas públicas Vite (`frontend/src/pages/public/`), é obrigatório destruir o diretório temporário (`rm -rf dist`) e executar um `npx vite build --max-old-space-size=4096`. Do contrário, o cache forte servirá componentes antigos mesmo com o backend funcional.
- **Gerenciamento Unificado**: O painel multi-empresas (Super Admin) enxerga tudo, mas os logins limitados (`empresa_id`) só conseguem ver no frontend as informações contidas naquele escopo, garantido via query string do React alimentando as rotas da API.
