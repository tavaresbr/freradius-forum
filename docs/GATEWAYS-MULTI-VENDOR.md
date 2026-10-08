# Gateways Multi-Vendor (MikroTik / Omada / UniFi) via Frontend

> Documento tecnico da camada de gateways multi-vendor e do wizard de cadastro de equipamentos.
> Toda configuracao de equipamento (MikroTik, TP-Link Omada, Ubiquiti UniFi) e do lado RADIUS
> (tabela `nas`) e feita 100% pelo painel admin — zero SQL manual.
>
> **Criado em:** 2026-08-11
> **Migrations relacionadas:** `backend/migrations/019_gateways.js`, `backend/migrations/020_gateway_credenciais_opcionais.js`

---

## 1. Objetivo

Permitir que o admin cadastre e gerencie qualquer tipo de gateway suportado pelo painel, com:

- **Wizard de 3 passos** na tela Equipamentos (antiga "Mikrotiks"): Tipo → Conexao → Portal
- **Validacao condicional por vendor** no backend (campos obrigatorios diferem por tipo)
- **NAS/FreeRADIUS gerenciado automaticamente** (criado/atualizado/removido conforme o tipo usa RADIUS ou nao, com restart do FreeRADIUS)
- **Compatibilidade total** com MikroTiks ja cadastrados (linhas antigas viram `tipo='mikrotik'` pelo default da migration 019)
- **Acoes RouterOS protegidas**: scan/enviar-hotspot/login/status/info retornam erro claro em gateways nao-MikroTik

---

## 2. Arquitetura

```
Frontend                         Backend                        Infra
────────                         ───────                        ─────
Mikrotiks.jsx ("Equipamentos")   mikrotikRoutes.js
  └── GatewayWizard.jsx  ──POST/PUT──▶ validarGateway(body)
        passo 0: tipo                    │ (regras por tipo)
        passo 1: conexao                 ▼
        passo 2: portal          INSERT/UPDATE mikrotiks ──▶ tabela mikrotiks
                                         │                    (colunas migration 019)
                                 usaRadius(dados)?
                                   sim ─▶ upsert nas + restart freeradius
                                   nao ─▶ remove nas orfao

Acoes por linha da tabela        getDriver(gatewayRow)  ──▶ src/gateways/
  Testar (todos)                   ├─ MikrotikDriver          (RouterOS API)
  Hotspot/Login/Status/Info        ├─ OmadaDriver             (External RADIUS ou API v2)
  (so mikrotik — guard)            └─ UnifiDriver             (node-unifi + polling)
```

### Pontos importantes da arquitetura

1. A tabela continua chamando `mikrotiks` (renomear e' arriscado) — semanticamente e' "gateways".
2. `usaRadius()`: MikroTik e Omada modo External RADIUS usam FreeRADIUS (tem linha em `nas`); UniFi e Omada modo API **nao** (autorizacao via API do controller).
3. O modo do Omada e' inferido por `controller_url`: **NULL = External RADIUS** (recomendado), preenchido = modo API. O wizard limpa os campos de API quando o modo e' External RADIUS.
4. Tipo e' **travado na edicao** (frontend e backend) — trocar tipo deixaria NAS/portal em estado inconsistente.
5. `syncUnifiSessions` roda no cron de 5min do `server.js` (obrigatorio pra compliance UniFi — ver `docs/COMPLIANCE-LGPD.md`).

---

## 3. Schema do Banco

### Migration 019 (`backend/migrations/019_gateways.js`) — Fase 4A

```sql
ALTER TABLE mikrotiks ADD COLUMN tipo ENUM('mikrotik','omada','unifi') NOT NULL DEFAULT 'mikrotik';
ALTER TABLE mikrotiks ADD COLUMN controller_url VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE mikrotiks ADD COLUMN controller_site VARCHAR(120) NULL DEFAULT NULL;
ALTER TABLE mikrotiks ADD COLUMN omadac_id VARCHAR(120) NULL DEFAULT NULL;
ALTER TABLE mikrotiks ADD COLUMN api_user VARCHAR(191) NULL DEFAULT NULL;
ALTER TABLE mikrotiks ADD COLUMN api_pass VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE mikrotiks ADD COLUMN api_key VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE mikrotiks ADD COLUMN verify_tls TINYINT(1) NOT NULL DEFAULT 1;
```

### Migration 020 (`backend/migrations/020_gateway_credenciais_opcionais.js`)

```sql
ALTER TABLE mikrotiks MODIFY COLUMN usuario VARCHAR(100) NULL DEFAULT NULL;
ALTER TABLE mikrotiks MODIFY COLUMN senha VARCHAR(255) NULL DEFAULT NULL;
```

Gateways Omada (modo API) e UniFi nao tem credencial RouterOS — sem a 020, o INSERT falha
com `ER_BAD_NULL_ERROR`.

### Semantica do campo `senha` por tipo

| Tipo | `senha` significa | NAS criado? |
|---|---|---|
| mikrotik | senha da API RouterOS (tambem vira secret do NAS) | Sim |
| omada (External RADIUS) | **Secret RADIUS** do NAS | Sim |
| omada (API) | nao usado (credencial em `api_user`/`api_pass`) | Nao |
| unifi | nao usado (credencial em `api_user`/`api_pass`) | Nao |

---

## 4. Arquivos-chave

- `backend/src/routes/mikrotikRoutes.js` - CRUD com `validarGateway()`, `usaRadius()`, guard `somenteMikrotik`
- `backend/src/gateways/index.js` - factory `getDriver(tipo|gatewayRow)`
- `backend/src/gateways/GatewayDriver.js` - interface base
- `backend/src/gateways/MikrotikDriver.js` - RouterOS API
- `backend/src/gateways/OmadaDriver.js` - dois modos (External RADIUS / API v2 com `extPortal/auth`, tempo em MICROSSEGUNDOS)
- `backend/src/gateways/UnifiDriver.js` - node-unifi, authorize-guest com `minutes` = saldo restante
- `backend/src/jobs/syncUnifiSessions.js` - polling stat/session → connection_logs (agendado no server.js)
- `backend/src/utils/portalVendor.js` - deteccao/normalizacao de vendor no captive redirect
- `frontend/src/components/admin/GatewayWizard.jsx` - wizard de cadastro/edicao
- `frontend/src/pages/admin/Mikrotiks.jsx` - tela Equipamentos (badge de tipo, botoes condicionais)

---

## 5. Validacao por tipo (backend)

`validarGateway(body)` em `backend/src/routes/mikrotikRoutes.js`:

| Tipo | Obrigatorios | Observacao |
|---|---|---|
| mikrotik | nome, ip, usuario, senha, porta | igual ao comportamento historico |
| omada + External RADIUS | nome, ip, senha (secret RADIUS) | `controller_url` vazio define o modo |
| omada + API | nome, ip, controller_url, omadac_id, api_user, api_pass | operador Hotspot do controller |
| unifi | nome, ip, controller_url, api_user, api_pass | admin **local** (conta cloud nao funciona) |

`verify_tls` default `1`, mas o wizard manda `0` por padrao (controllers Omada/UniFi
usam certificado self-signed).

---

## 6. Configuracao (o que fazer no controller)

### Omada — External Web Portal + External RADIUS (recomendado)

1. RADIUS Profile no controller → auth 1812 / accounting 1813 apontando pro servidor, com o secret cadastrado no wizard.
2. SSID → Portal → External Web Portal → `https://<dominio>/hotspot/redirect/<id_do_gateway>`.
3. Pre-Authentication Access → liberar o dominio do servidor (e dominios MP se portal de planos).
4. Nesse modo o fluxo RADIUS e' identico ao MikroTik (radacct, totalcounter, compliance intactos).

### Omada — modo API

- Requer controller proprio (software/OC200/OC300) ou Cloud Standard. **Cloud Essentials nao suporta.**
- Criar operador Hotspot no Hotspot Manager; `omadac_id` e' o hash na URL do controller web.

### UniFi

- `controller_url` = `host:8443` (standalone) ou `host:443` (UniFi OS).
- Guest Hotspot → External Portal Server apontando pro servidor + Pre-Authorization Access.
- Corte por tempo e' do **driver** (`minutes` no authorize-guest), nao do sqlcounter.

---

## 7. Endpoints

```
POST   /api/mikrotiks               - criar gateway (validacao por tipo, NAS condicional)
PUT    /api/mikrotiks/:id           - atualizar (tipo travado; NAS upsert/remocao condicional)
DELETE /api/mikrotiks/:id           - remover gateway + NAS correspondente
POST   /api/mikrotiks/:id/testar    - testConnection() do driver (todos os tipos)
POST   /api/mikrotiks/:id/scan      - SO mikrotik (guard somenteMikrotik)
POST   /api/mikrotiks/:id/enviar-hotspot | enviar-login | enviar-status | info - SO mikrotik
```

---

## 8. Gotchas

### Gotcha 1: `usuario`/`senha` eram NOT NULL — INSERT de UniFi/Omada-API falhava

`ER_BAD_NULL_ERROR: Column 'usuario' cannot be null` ao criar gateway sem credencial
RouterOS. Fix: migration 020 tornou as colunas nullable. Reproducao: rodar POST de
gateway unifi num banco sem a 020.

### Gotcha 2: Omada External RADIUS aparecia "Offline" pra sempre

`OmadaDriver.testConnection()` tentava login na API mesmo sem `controller_url` e
falhava com "controller_url e omadac_id sao obrigatorios". Fix: short-circuit — sem
`controller_url`, retorna `{sucesso: true, modo: 'external-radius'}` (nao ha API pra
testar; quem autentica e' o FreeRADIUS local). Ver `backend/src/gateways/OmadaDriver.js`.

### Gotcha 3: endpoints RouterOS quebravam em gateways nao-MikroTik

`/scan`, `/enviar-*` e `/info` abrem conexao RouterOS API direto — num Omada/UniFi
travavam ate timeout. Fix: middleware `somenteMikrotik` (400 com mensagem clara).
O frontend tambem esconde os botoes pra tipos nao-mikrotik.

### Gotcha 4: PUT atualizava NAS pelo IP antigo sem tratar gateway sem NAS

O UPDATE do NAS por `nasname = ipAntigo` nao criava linha quando o gateway nao tinha
NAS previo (ex.: Omada alternando modo API → External RADIUS na edicao). Fix: upsert
(UPDATE, se `affectedRows === 0` INSERT) + remocao de NAS orfao quando o modo novo nao
usa RADIUS.

---

## 9. Troubleshooting

| Sintoma | Causa provavel | Fix |
|---|---|---|
| Gateway UniFi "Offline" na lista | credencial nao e' de admin local, porta errada (8443 vs 443), ou `verify_tls=1` com cert self-signed | corrigir no wizard (Editar) |
| Omada API "Offline" | Cloud Essentials (sem suporte a API), `omadac_id` errado, operador Hotspot invalido | conferir controller; `omadac_id` e' o hash da URL |
| "Esta acao esta disponivel apenas para gateways MikroTik" | tentou scan/hotspot num Omada/UniFi | comportamento esperado (guard) |
| Erro "Ja existe um NAS com este IP" | IP ja usado por outro gateway RADIUS | usar outro IP ou remover o NAS conflitante pela exclusao do gateway antigo |
| INSERT falha com ER_BAD_NULL_ERROR | migration 020 nao rodou | `node backend/migrations/020_gateway_credenciais_opcionais.js` |

Teste rapido de driver via CLI:

```bash
cd /var/www/hotspot/backend
node -e "
const db = require('./db');
const { getDriver } = require('./src/gateways');
db.query('SELECT * FROM mikrotiks WHERE id = <ID>').then(async ([[gw]]) => {
  console.log(await getDriver(gw).testConnection());
  process.exit(0);
});"
```

---

## 10. Onde mexer se...

| Situacao | Arquivo |
|---|---|
| Adicionar campo novo no cadastro de gateway | `mikrotikRoutes.js` (`validarGateway` + INSERT/UPDATE) e `GatewayWizard.jsx` |
| Adicionar vendor novo | `src/gateways/` (novo driver) + `DRIVERS` em `index.js` + migration do ENUM `tipo` + card no `GatewayWizard.jsx` |
| Mudar regra de quando cria NAS | `usaRadius()` em `mikrotikRoutes.js` |
| Ajustar payload da API Omada | `OmadaDriver.js` (`authorize`/`reauthorize` — `time` em microssegundos!) |
| Ajustar authorize-guest UniFi | `UnifiDriver.js` (`authorize` — minutes/kbps) |
| Mudar labels/textos do wizard | `GatewayWizard.jsx` (`VENDORS`, labels por tipo) |

---

## 11. Limitacoes conhecidas

- **Omada External RADIUS VALIDADO EM CAMPO em 2026-08-17** (OC300 fw 6.2.14.12 — fluxo completo homologado, ver `docs/EDIT-20260817-001.md`). O modo API do Omada e o driver UniFi seguem sem validacao em hardware real (`TODO(hardware)`).
- **Omada modo API nao gera accounting** (radacct vazio) — sem logs Marco Civil nesse modo. Usar External RADIUS sempre que possivel.
- **Revogacao no Omada modo API** esta parcial: limpa RADIUS local mas o endpoint de desconexao do controller varia por versao (TODO no `revoke`).
- **Tela Sessoes ficou vendor-neutra em 2026-08-17**: `listarSessoesAtivas` resolve a empresa por `COALESCE(m.empresa_id via NAS-IP, ru.empresa_id via radius_users.username)` — sessoes Omada (NAS-IP = IP LAN do controller) aparecem. UniFi puro-API continua fora (nao gera radacct).
- O wizard nao testa a conexao ANTES de salvar — o teste acontece na lista (status Online/Offline apos salvar).

---

## 12. Changelog

### 2026-08-17 — Validacao em campo do Omada (External RADIUS)
- Fluxo completo homologado em OC300 real (site BRT): redirect, cadastro lead, browserauth,
  Access-Accept, accounting, corte por franquia e limite de banda. Detalhes: `docs/EDIT-20260817-001.md`.
- `montarBrowserauthOmada` agora usa `http://{target}:{serverPort}` (8088) — cert self-signed do
  controller bloqueava o POST https no webview do captive portal.
- Atributos `WISPr-Bandwidth-Max-Up/Down` gravados no radreply em TODOS os caminhos de liberacao
  (lead, lgpd, radius manual, trial, pagamento/CoA) — e' o que faz Omada/UniFi aplicarem a
  velocidade do plano (MikroTik ignora e continua no Mikrotik-Rate-Limit).
- `radius_users.liberado_em` preenchido no INSERT (lead/lgpd/radius) — corrige franquia que nunca
  renovava a partir do 2o cadastro.
- Tela Sessoes vendor-neutra (ver secao 11).
- Tutorial com prints no painel: menu Documentacao -> Tutorial Omada (`/admin/<slug>/tutorial-omada`).

### 2026-08-11
- Versao inicial.
- Backend: `validarGateway`/`usaRadius`/`somenteMikrotik` em `mikrotikRoutes.js`; NAS condicional por tipo; migration 020.
- Frontend: `GatewayWizard.jsx` (3 passos), tela renomeada pra "Equipamentos" (menu, titulo, botoes), coluna Tipo com badge, botoes RouterOS so pra mikrotik.
- `OmadaDriver.testConnection` short-circuit no modo External RADIUS.
- `syncUnifiSessions` agendado no cron de 5min do `server.js`.
