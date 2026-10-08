import React, { useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";

/*
 * Tutorial de integração UniFi (Ubiquiti).
 * External Web Portal (Guest Portal) + autorização via API do controller.
 * Mesmo layout dos tutoriais Omada/Grandstream.
 * Prints em /public/tutorial-unifi/ (sem dados do ambiente de origem).
 */

function Print({ src, alt }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <a href={src} target="_blank" rel="noreferrer" title="Clique para ampliar">
      <img
        src={src}
        alt={alt}
        onError={() => setOk(false)}
        className="rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm my-3 w-full max-w-4xl hover:shadow-md transition-shadow cursor-zoom-in"
      />
    </a>
  );
}

function Passo({ numero, titulo, children }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
          {numero}
        </span>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{titulo}</h3>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">{children}</div>
    </div>
  );
}

function Aviso({ tipo = "info", children }) {
  const estilos = {
    info: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 text-blue-800 dark:text-blue-200",
    atencao: "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 text-yellow-800 dark:text-yellow-200",
    ok: "bg-green-50 dark:bg-green-900/30 border-green-200 text-green-800 dark:text-green-200",
  };
  const icones = { info: "ℹ️", atencao: "⚠️", ok: "✅" };
  return (
    <div className={`border rounded-lg px-4 py-3 my-3 text-sm ${estilos[tipo]}`}>
      <span className="mr-2">{icones[tipo]}</span>
      {children}
    </div>
  );
}

function Campo({ nome, valor }) {
  return (
    <li className="flex flex-wrap gap-2 items-baseline">
      <span className="font-medium text-gray-700 dark:text-gray-200">{nome}:</span>
      <code className="bg-gray-100 dark:bg-slate-700 rounded px-2 py-0.5 text-xs text-gray-800 dark:text-gray-100">{valor}</code>
    </li>
  );
}

const SECOES = [
  { id: "visao-geral", titulo: "Como funciona" },
  { id: "sistema", titulo: "Parte 1 — No sistema" },
  { id: "unifi", titulo: "Parte 2 — Na UniFi" },
  { id: "teste", titulo: "Parte 3 — Testar" },
  { id: "problemas", titulo: "Problemas comuns" },
];

export default function TutorialUnifi() {
  const [secaoAtiva, setSecaoAtiva] = useState("visao-geral");

  const irPara = (id) => {
    setSecaoAtiva(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Tutorial — Integração UniFi (Ubiquiti)</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Guia completo para configurar a controladora UniFi com portal cativo externo e autorização via API.
          </p>
        </div>

        {/* Navegação por seções */}
        <nav className="flex flex-wrap gap-2 mb-8 sticky top-0 z-10 bg-gray-50 dark:bg-slate-900 py-3 -mx-2 px-2 rounded-lg">
          {SECOES.map((s) => (
            <button
              key={s.id}
              onClick={() => irPara(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                secaoAtiva === s.id
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-600"
              }`}
            >
              {s.titulo}
            </button>
          ))}
        </nav>

        {/* ====== VISÃO GERAL ====== */}
        <section id="visao-geral" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">🌐</span> Como funciona a integração
          </h2>

          <Passo numero="⚡" titulo="Arquitetura da integração">
            <p>A integração com a UniFi usa <strong>External Web Portal + autorização via API</strong> do controller. O UniFi mostra o portal do sistema e a liberação do cliente é feita pela API do controller (authorize-guest) — <strong>não usa RADIUS</strong>.</p>
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 my-3 font-mono text-xs leading-relaxed">
              <p>📱 Cliente conecta no Wi-Fi (Guest Network)</p>
              <p className="ml-4">↓</p>
              <p>📡 UniFi redireciona → Portal Cativo (External Portal)</p>
              <p className="ml-4">↓</p>
              <p>🌐 Cliente preenche dados / paga / usa Pix Free</p>
              <p className="ml-4">↓</p>
              <p>🔐 Sistema autoriza o cliente via API do controller (authorize-guest)</p>
              <p className="ml-4">↓</p>
              <p>📡 Internet liberada; sessões e tempo restante via API (polling)</p>
            </div>
            <Aviso tipo="info">
              O corte por tempo é feito pelo sistema (não pelo controller): a cada liberação passamos o saldo restante do plano. A compliance (Marco Civil) vem do polling das sessões.
            </Aviso>
          </Passo>
        </section>

        {/* ====== PARTE 1 — SISTEMA ====== */}
        <section id="sistema" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">💻</span> Parte 1 — Cadastrar no sistema
          </h2>

          <Passo numero="1" titulo="Adicionar equipamento no painel">
            <p>Acesse <strong>Equipamentos</strong> no menu lateral e clique em <strong>Adicionar Equipamento</strong>.</p>
            <ul className="list-disc ml-5 space-y-1 mt-2">
              <Campo nome="Tipo" valor="Ubiquiti UniFi" />
              <Campo nome="Nome" valor="Nome de sua preferência (ex: AP-Loja)" />
              <Campo nome="Controller URL" valor="host:8443 (standalone) ou host:443 (UniFi OS)" />
              <Campo nome="Admin local + senha" valor="Usuário LOCAL do controller (conta cloud Ubiquiti não funciona na API)" />
              <Campo nome="Site" valor="Nome interno do site (geralmente default)" />
            </ul>
            <Aviso tipo="atencao">
              Use um usuário <strong>local</strong> do controller. Conta cloud Ubiquiti não autentica na API.
            </Aviso>
            <p className="mt-2">Após salvar, o sistema gera a URL do portal para este equipamento (formato <code className="bg-gray-100 dark:bg-slate-700 rounded px-1.5 py-0.5 text-xs">https://seudominio.com/hotspot/redirect/&#123;ID&#125;</code>).</p>
          </Passo>
        </section>

        {/* ====== PARTE 2 — UNIFI ====== */}
        <section id="unifi" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">📡</span> Parte 2 — Configurar na controladora UniFi
          </h2>

          <Passo numero="2" titulo="Configurar o Wi-Fi para visitantes">
            <p>Prepare a rede Wi-Fi que será usada pelos clientes.</p>
            <ul className="list-disc ml-5 space-y-1 mt-2">
              <li>Acesse <strong>Settings (Configurações)</strong> → <strong>WiFi</strong>.</li>
              <li>Selecione a rede do Hotspot (ou crie uma nova).</li>
              <li>Em <strong>Network</strong>, marque como <strong>Guest Network (Rede de Visitantes)</strong>.</li>
            </ul>
            <Print src="/tutorial-unifi/01-guest-network.png" alt="Guest Network" />
            <Aviso tipo="atencao">
              Marcar a rede como "Guest" é essencial para a UniFi isolar os clientes e aplicar as regras do Hotspot.
            </Aviso>
          </Passo>

          <Passo numero="3" titulo="Configurar o Guest Portal (Portal Externo)">
            <p>Diga para a UniFi que quem controla a tela de login é o sistema de Hotspot externo.</p>
            <ul className="list-disc ml-5 space-y-1 mt-2">
              <li>Vá em <strong>Settings</strong> → <strong>Profiles</strong> / <strong>Guest Control</strong>.</li>
              <li>Ative o <strong>Guest Portal (Portal de Visitantes)</strong>.</li>
              <li>Em <strong>Authentication</strong>, escolha <strong>External Portal Server (Servidor de Portal Externo)</strong>.</li>
              <li>Preencha o <strong>Custom Portal IPv4 Address</strong> com o IP do seu sistema Hotspot.</li>
              <li>(Opcional) Marque <strong>Use Secure Portal (HTTPS)</strong> se o seu sistema roda com HTTPS.</li>
            </ul>
            <Print src="/tutorial-unifi/02-profiles.png" alt="Guest Control" />
            <Print src="/tutorial-unifi/03-auth.png" alt="Métodos de autenticação" />
          </Passo>

          <Passo numero="4" titulo="Configurar o Walled Garden (acesso pré-autorização)">
            <p>Passo crítico para os pagamentos! O Walled Garden libera o cliente a acessar o gateway de pagamento <strong>antes</strong> de ter internet.</p>
            <ul className="list-disc ml-5 space-y-1 mt-2">
              <li>Na tela do <strong>Guest Portal</strong>, role até <strong>Pre-Authorization Access</strong>.</li>
              <li>Adicione o domínio do seu sistema Hotspot e os endereços dos meios de pagamento:</li>
            </ul>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">Efí (PIX):</p>
                <ul className="space-y-1 font-mono text-gray-600 dark:text-gray-300">
                  <li>pix.api.efipay.com.br</li>
                  <li>pix.sejaefi.com.br</li>
                  <li>api.efipay.com.br</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">Mercado Pago:</p>
                <ul className="space-y-1 font-mono text-gray-600 dark:text-gray-300">
                  <li>api.mercadopago.com</li>
                  <li>mercadopago.com.br</li>
                </ul>
              </div>
            </div>
            <Aviso tipo="atencao">
              Sem o domínio do sistema e esses endereços no Pre-Authorization Access, o QR Code do PIX não é gerado na tela do cliente.
            </Aviso>
          </Passo>
        </section>

        {/* ====== PARTE 3 — TESTAR ====== */}
        <section id="teste" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">🧪</span> Parte 3 — Testar a integração
          </h2>

          <Passo numero="5" titulo="Teste rápido">
            <ol className="list-decimal ml-5 space-y-2">
              <li>Conecte um celular na rede Wi-Fi (Guest) configurada.</li>
              <li>O portal de login (Captive Portal) deve abrir automaticamente.</li>
              <li>Escolha um plano pago e gere o PIX.</li>
              <li>Após o pagamento, a internet é liberada via API e a sessão aparece em <strong>Sessões</strong> com o tempo restante.</li>
            </ol>
            <Aviso tipo="ok">
              Pronto! Sua rede UniFi está integrada e automatizada com o sistema de Hotspot.
            </Aviso>
          </Passo>
        </section>

        {/* ====== PROBLEMAS COMUNS ====== */}
        <section id="problemas" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">🔧</span> Problemas comuns
          </h2>

          <Passo numero="?" titulo="Portal não abre / página em branco">
            <ul className="list-disc ml-5 space-y-1">
              <li>Confirme que a rede está marcada como <strong>Guest Network</strong>.</li>
              <li>Verifique se o <strong>Custom Portal IPv4 Address</strong> está com o IP correto do sistema.</li>
              <li>Confira o <strong>Walled Garden</strong> (domínio do sistema + endereços de pagamento).</li>
            </ul>
          </Passo>

          <Passo numero="?" titulo="Internet não libera após pagamento">
            <ul className="list-disc ml-5 space-y-1">
              <li>Confirme que o equipamento usa um <strong>admin local</strong> (não conta cloud) — a autorização é via API.</li>
              <li>Teste a conexão do equipamento na lista (status Online/Offline).</li>
              <li>Verifique se o <strong>Site</strong> cadastrado bate com o site do controller.</li>
            </ul>
          </Passo>

          <Passo numero="?" titulo="Equipamento aparece OFFLINE no painel">
            <ul className="list-disc ml-5 space-y-1">
              <li>O status depende do login na API do controller (Controller URL + admin local + senha).</li>
              <li>Confirme que a Controller URL e a porta estão corretas (8443 standalone / 443 UniFi OS).</li>
            </ul>
          </Passo>
        </section>

      </div>
    </AdminLayout>
  );
}
