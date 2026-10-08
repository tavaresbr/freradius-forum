# Compliance: Relatorios Marco Civil e LGPD (alinhados e multi-gateway)

> Documento tecnico dos dois relatorios legais do sistema — logs de conexao (Marco Civil)
> e consentimentos (LGPD) — e das protecoes contra perda dessas provas.
> Decisao de produto (2026-08-11): os relatorios ficam **separados** (finalidades e prazos
> legais diferentes), mas 100% alinhados entre tela e CSV e cobrindo todos os gateways.
>
> **Criado em:** 2026-08-11
> **Migration relacionada:** `backend/migrations/021_lgpd_termo.js`

---

## 1. Objetivo

### O que a lei exige (resumo da pesquisa de 2026-08-11)

**Marco Civil (Lei 12.965/2014, art. 13):** guarda por **1 ano**, sob sigilo, dos registros
de conexao: data/hora de inicio e fim, duracao e IP do terminal. STJ: o provedor deve
conseguir **identificar o usuario a partir de IP + periodo** (em NAT/hotspot, dado que
individualize o usuario — aqui resolvido por username=CPF + MAC).

**LGPD (Lei 13.709/2018):** prova do consentimento — quem, quando, como e **qual termo**
foi aceito; base legal documentada; atendimento a direitos do titular (revogacao,
eliminacao). ANPD avalia trilha de auditoria real, nao so documento formal.

### O que o sistema garante

- `connection_logs` cobre todos os campos do art. 13 + identificacao (username/CPF/MAC) e **nada apaga essa tabela automaticamente** (guarda >= 1 ano ok)
- Consentimento em `leads` com aceite, timestamp (`lgpd_aceite_em`), MAC, IP, origem e **snapshot do texto do termo aceito** (`lgpd_termo`)
- Relatorio LGPD inclui **todo** consentimento, de qualquer portal (nao so origem='lgpd')
- Tela e CSV identicos nos dois relatorios; coluna Equipamento resolvida pra MikroTik/Omada/UniFi
- Botoes de limpeza com dupla confirmacao (aviso legal + digitar LIMPAR)

---

## 2. Arquitetura — fonte dos logs por gateway

```
MikroTik ────────────── radacct (FreeRADIUS accounting)──┐
Omada External RADIUS ── radacct (controller faz acct) ──┼─▶ syncConnectionLogs (cron 5min)
                                                         │        │
Omada modo API ───────── (SEM accounting — gap conhecido)│        ▼
UniFi ────────────────── API stat/session ─▶ syncUnifiSessions ─▶ connection_logs
                                              (cron 5min)              │
                                                                       ▼
                                              Tela Compliance + CSV (JOIN mikrotiks
                                              por nas_ip = m.ip → nome do equipamento)

Aceites (portal LGPD / cadastro / portal lead)
  └─▶ resolverTextoLgpd(portal) ─▶ leads (lgpd_aceite, lgpd_aceite_em, lgpd_termo)
        └─▶ Tela Cadastros LGPD + CSV (/api/lgpd/export com download-token)
```

### Pontos importantes

1. Todos os jobs gravam `nas_ip` = **IP do equipamento cadastrado** (`mikrotiks.ip`) — e' isso que faz o JOIN do relatorio funcionar pros 3 vendors.
2. O snapshot do termo e' resolvido **server-side** (`resolverTextoLgpd`), nunca confiado do client.
3. Captura do termo nunca bloqueia a liberacao (helper nao lanca erro; fallback pro texto default).

---

## 3. Schema do Banco

### Migration 021 (`backend/migrations/021_lgpd_termo.js`)

```sql
ALTER TABLE leads ADD COLUMN lgpd_termo TEXT NULL DEFAULT NULL;
```

Snapshot do texto exato exibido no portal no momento do aceite. Resolvido de
`portais.configuracoes.texto_lgpd` (ordem: portal do equipamento → portal do tipo na
empresa → texto default `TEXTO_LGPD_DEFAULT` em `backend/src/utils/leadUtils.js`).

---

## 4. Arquivos-chave

- `backend/src/controllers/complianceController.js` - relatorio Marco Civil (tela + CSV, JOIN mikrotiks)
- `backend/src/controllers/lgpdController.js` - `getAllLgpd` (relatorio ampliado), `exportarLgpdCSV`, captura do termo
- `backend/src/controllers/leadController.js` - `leadLogin` tambem captura o termo
- `backend/src/utils/leadUtils.js` - `resolverTextoLgpd`, `atualizarLeadExistente` (re-aceite atualiza termo)
- `backend/src/jobs/syncConnectionLogs.js` - radacct → connection_logs (MikroTik/Omada)
- `backend/src/jobs/syncUnifiSessions.js` - API UniFi → connection_logs
- `backend/src/controllers/limpezaController.js` - endpoints de limpeza (RADIUS/pagamentos/LGPD)
- `frontend/src/pages/admin/Compliance.jsx` - tela Marco Civil (coluna Equipamento)
- `frontend/src/pages/admin/LgpdCadastros.jsx` - tela LGPD (origem, aceite em, Exportar CSV)
- `frontend/src/pages/admin/Configuracoes.jsx` - limpeza com dupla confirmacao

---

## 5. Relatorio LGPD — regra de inclusao

```sql
WHERE empresa_id = ? AND (origem = 'lgpd' OR lgpd_aceite = 1)
```

Inclui consentimento capturado em **qualquer** portal (lgpd, portal_lead, etc.), nao so o
portal LGPD. Ordenado por `COALESCE(lgpd_aceite_em, criado_em) DESC`.

---

## 6. Endpoints

```
GET  /api/compliance                - logs de conexao (filtros: cpf, mac, ip, username, datas; paginacao)
GET  /api/compliance/export        - CSV Marco Civil (Bearer token, mesmos filtros)
GET  /api/lgpd                      - relatorio de consentimentos (auth + tenant)
GET  /api/lgpd/export?token=...     - CSV LGPD com termo completo (download-token curto)
GET  /api/auth/download-token       - emite token curto pro export
DELETE /api/limpeza/{radius|pagamentos|lgpd} - limpeza (frontend exige dupla confirmacao)
```

CSV Marco Civil: `Username, CPF, MAC, IP, NAS, Equipamento, Tipo Equipamento, Inicio, Fim,
Duracao, Bytes Entrada, Bytes Saida, Motivo Desconexao, Origem Registro`.

CSV LGPD: `Nome, Email, Telefone, CPF, MAC, IP, Origem, Aceite, Aceite Em, Cadastro Em,
Termo Aceito`.

---

## 7. Dupla confirmacao na limpeza

`frontend/src/pages/admin/Configuracoes.jsx`: cada acao de limpeza abre modal com **aviso
legal especifico** (o do LGPD alerta que apaga provas de consentimento e manda exportar o
CSV antes) e o botao so habilita apos digitar **LIMPAR**.

Motivacao real: em 2026-08-11 descobrimos que a exclusao da empresa 13 apagou por cascata
todo o historico de leads/consentimentos (ver Gotcha 1).

---

## 8. Gotchas

### Gotcha 1: empresa orfa 13 — aceites LGPD quebrados em producao e historico de consentimentos perdido

**O que acontecia:** todo aceite LGPD/lead retornava "Erro interno" — INSERT em `leads`
falhava com `ER_NO_REFERENCED_ROW_2` (FK `leads.empresa_id → empresas.id`).

**Causa raiz:** os dados operacionais (mikrotik, portais, planos, leads, logs) pertenciam a
`empresa_id=13`, deletada da tabela `empresas` (provavelmente num reset de admin em sessao
anterior). O `ON DELETE CASCADE` de `leads` **apagou todo o historico de consentimentos**
na hora da delecao; `connection_logs` sobreviveu por nao ter FK. Tabelas sem FK
(mikrotiks, portais, planos, radius_users...) ficaram orfas — inserts novos com
empresa 13 passaram a violar a FK de `leads`.

**Fix (2026-08-11, so neste servidor):** `UPDATE ... SET empresa_id=1 WHERE empresa_id=13`
em mikrotiks, nas, portais, planos, radius_users, leads, connection_logs, pagamentos,
whatsapp_logs + remocao do plano LGPD seed duplicado (id 4, `mikrotik_id NULL`) da
empresa 1. **Este realinhamento e' correcao local — NAO vai no pacote de atualizacao.**

**Como detectar se voltar:** `SELECT DISTINCT empresa_id FROM mikrotiks WHERE empresa_id
NOT IN (SELECT id FROM empresas);` — qualquer linha e' um orfao. Sintoma tipico: painel
"vazio" (tenant do admin nao bate com o dono dos dados) + aceites falhando no portal.

### Gotcha 2: `nas_ip` e' VARCHAR(15) — UniFi gravava controller_url e estourava/nao dava JOIN

`syncUnifiSessions` gravava `controller_url` (ex.: `10.99.99.2:8443`, ou hostname longo)
em `connection_logs.nas_ip` VARCHAR(15). Fix: grava `gateway.ip` (`.slice(0, 15)`), que e'
o que o JOIN do relatorio usa (`m.ip = cl.nas_ip`).

### Gotcha 3: relatorio LGPD so mostrava `origem='lgpd'`

Consentimentos capturados pelo portal Lead (`origem='portal_lead'`, `lgpd_aceite=1`) nao
apareciam no relatorio. Fix: `WHERE (origem = 'lgpd' OR lgpd_aceite = 1)`.

### Gotcha 4: aceite sem prova de QUAL termo foi aceito

So se gravava `lgpd_aceite=1` — insuficiente como prova LGPD se o texto do termo mudar.
Fix: migration 021 + `resolverTextoLgpd` chamado nos 3 fluxos de aceite (lgpdLogin,
lgpdCadastro, leadLogin) e no re-aceite (`atualizarLeadExistente` com `termo`).
**Regra pra novos fluxos de aceite:** sempre resolver e gravar o termo.

### Gotcha 5: tabela `lgpd_logins` nao existe mais

O relatorio LGPD le de `leads`. So existe `lgpd_logins_backup` (historico). Codigo novo
nao deve referenciar `lgpd_logins`.

---

## 9. Troubleshooting

| Sintoma | Causa provavel | Fix |
|---|---|---|
| Coluna Equipamento vazia no Compliance | `nas_ip` nao bate com `mikrotiks.ip` (equipamento recadastrado com outro IP) | conferir `SELECT DISTINCT nas_ip FROM connection_logs` vs `SELECT ip FROM mikrotiks` |
| UniFi sem logs Marco Civil | job `syncUnifiSessions` com erro (credencial/porta) | `pm2 logs hotspot-api \| grep syncUnifi` |
| Aceite LGPD com "Erro interno" | empresa orfa (ver Gotcha 1) ou plano LGPD ausente | query de deteccao do Gotcha 1 |
| CSV LGPD vazio mas tela cheia | token de download expirado/ausente | refazer export (emite token novo) |
| `lgpd_termo` NULL em aceites novos | portal sem `texto_lgpd` na config e fallback falhou | conferir `portais.configuracoes` e logs `[resolverTextoLgpd]` |

---

## 10. Onde mexer se...

| Situacao | Arquivo |
|---|---|
| Adicionar campo no relatorio Marco Civil | `complianceController.js` (buscarLogs + exportarCSV) e `Compliance.jsx` — manter tela e CSV identicos |
| Adicionar campo no relatorio LGPD | `lgpdController.js` (getAllLgpd + exportarLgpdCSV) e `LgpdCadastros.jsx` |
| Novo fluxo que registra aceite | chamar `resolverTextoLgpd` + gravar `lgpd_termo` (ver Gotcha 4) |
| Novo gateway/fonte de log | gravar `nas_ip = mikrotiks.ip` (ver Gotcha 2) |
| Mudar texto default do termo | `TEXTO_LGPD_DEFAULT` em `backend/src/utils/leadUtils.js` (manter igual ao default do `PortalEditor.jsx`) |
| Adicionar acao de limpeza | `limpezaController.js` + entrada em `acoes` no `Configuracoes.jsx` (com `aviso` — a dupla confirmacao vem de graca) |

---

## 11. Limitacoes conhecidas

- **Omada modo API nao gera logs de conexao** (sem accounting). External RADIUS resolve.
- **Revogacao de consentimento LGPD nao tem fluxo** (titular nao consegue revogar pelo portal; seria manual via banco).
- **Retencao nao automatizada**: nada apaga `connection_logs` (bom pra guarda minima de 1 ano), mas tambem nao ha expurgo apos o prazo — decisao pendente.
- Os avisos de dupla confirmacao sao protecao de UI; a API `/api/limpeza/*` continua aceitando DELETE direto com JWT valido.
- `leads` historicos da empresa 13 foram perdidos pela cascata antes do fix — irrecuperaveis (nao havia backup da tabela).

---

## 12. Changelog

### 2026-08-11
- Versao inicial.
- Migration 021 (`leads.lgpd_termo`) + captura do termo nos 3 fluxos de aceite.
- Relatorio LGPD ampliado (qualquer origem com aceite) + colunas origem/aceite_em + export CSV com download-token.
- Compliance: JOIN com `mikrotiks` (coluna Equipamento na tela e no CSV) + `auth_result` no CSV.
- `syncUnifiSessions`: `nas_ip` = IP do equipamento (fix VARCHAR(15)/JOIN).
- Dupla confirmacao (aviso legal + digitar LIMPAR) nos 3 botoes de limpeza.
- Realinhamento local empresa 13 → 1 (incidente documentado no Gotcha 1).
