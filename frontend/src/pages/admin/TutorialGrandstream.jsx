import React, { useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";

/*
 * Tutorial passo a passo da integração com Grandstream GWN
 * (External Splash Page + External RADIUS — mesmo modelo do Omada).
 * Os prints (opcionais) ficam em /public/tutorial-grandstream/ — enquanto não
 * existirem, o componente Print se oculta sozinho (onError), sem quebrar a página.
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
  { id: "gwn", titulo: "Parte 2 — Na GWN Cloud" },
  { id: "teste", titulo: "Parte 3 — Testar" },
  { id: "problemas", titulo: "Problemas comuns" },
];

export default function TutorialGrandstream() {
  const [secaoAtiva, setSecaoAtiva] = useState("visao-geral");

  const irPara = (id) => {
    setSecaoAtiva(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Tutorial — Integração Grandstream (GWN)</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Guia completo para configurar antenas Grandstream com autenticação RADIUS externa e portal cativo.
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
            <p>A integração com as antenas Grandstream usa <strong>External Web Portal + RADIUS externo</strong> — o mesmo modelo do Omada. A antena mostra o portal do sistema e valida o cliente no nosso FreeRADIUS.</p>
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 my-3 font-mono text-xs leading-relaxed">
              <p>📱 Cliente conecta no Wi-Fi</p>
              <p className="ml-4">↓</p>
              <p>📡 Antena GWN redireciona → Portal Cativo (Splash Page)</p>
              <p className="ml-4">↓</p>
              <p>🌐 Cliente preenche dados / paga / usa Pix Free</p>
              <p className="ml-4">↓</p>
              <p>🔐 Sistema provisiona as credenciais no RADIUS</p>
              <p className="ml-4">↓</p>
              <p>📡 Antena autentica via RADIUS → Internet liberada!</p>
            </div>
            <Aviso tipo="info">
              A autenticação usa o protocolo RADIUS nas portas padrão <strong>1812</strong> (Auth) e <strong>1813</strong> (Accounting), garantindo liberação instantânea e compatibilidade com todos os portais (Pix Free, Pagamento, Voucher).
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
              <Campo nome="Tipo" valor="Grandstream GWN" />
              <Campo nome="Nome" valor="Nome de sua preferência (ex: AP-Loja)" />
              <Campo nome="Endereço IP" valor="IP do gateway/router GWN (origem dos pacotes RADIUS)" />
              <Campo nome="Secret RADIUS" valor="Escolha uma senha forte (ex: MinhaSenh@Forte2026)" />
            </ul>
            <Aviso tipo="info">
              Anote a senha do campo <strong>Secret RADIUS</strong> — ela será usada na configuração da GWN Cloud no próximo passo.
            </Aviso>
            <p className="mt-2">Os campos <strong>API Key</strong>, <strong>API Secret</strong> e <strong>Network ID</strong> são opcionais e servem apenas para monitorar se o equipamento está Online/Offline no painel. Não afetam a liberação de internet.</p>
          </Passo>

          <Passo numero="2" titulo="Copiar a URL do Portal">
            <p>Após salvar, o sistema gera automaticamente a <strong>URL do portal</strong> desse equipamento, no formato:</p>
            <code className="bg-gray-100 dark:bg-slate-700 rounded px-3 py-1.5 text-xs block my-2">
              https://seudominio.com/hotspot/redirect/&#123;ID&#125;
            </code>
            <Aviso tipo="atencao">
              Copie essa URL com atenção — ela será colada na configuração da GWN Cloud.
            </Aviso>
          </Passo>
        </section>

        {/* ====== PARTE 2 — GWN CLOUD ====== */}
        <section id="gwn" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">☁️</span> Parte 2 — Configurar na GWN Cloud
          </h2>

          <Passo numero="3" titulo="Criar servidor RADIUS">
            <p>No painel da GWN Cloud, clique em <strong>Configurações</strong> no menu lateral para expandir as opções.</p>
            <Print src="/tutorial-grandstream/01-menu-configuracoes.png" alt="Menu de Configurações da GWN Cloud" />
            <p className="mt-2">Acesse <strong>Perfis → RADIUS</strong> e clique em <strong>Adicionar</strong>.</p>
            <Print src="/tutorial-grandstream/04-radius-lista.png" alt="Lista de servidores RADIUS na GWN Cloud" />
            <p className="mt-3">Preencha:</p>
            <ul className="list-disc ml-5 space-y-1 mt-2">
              <Campo nome="Nome" valor="Nome de sua preferência (ex: turbonet)" />
            </ul>
            <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">Servidores de Autenticação:</p>
            <ul className="list-disc ml-5 space-y-1">
              <Campo nome="Endereço do Servidor" valor="IP do seu servidor" />
              <Campo nome="Porta" valor="1812" />
              <Campo nome="Chave secreta" valor="Mesma senha cadastrada no sistema" />
            </ul>
            <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">Servidores de contabilidade RADIUS (Accounting):</p>
            <ul className="list-disc ml-5 space-y-1">
              <Campo nome="Endereço do Servidor" valor="IP do seu servidor" />
              <Campo nome="Porta" valor="1813" />
              <Campo nome="Chave secreta" valor="Mesma senha cadastrada no sistema" />
            </ul>
            <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">Demais campos:</p>
            <ul className="list-disc ml-5 space-y-1">
              <Campo nome="Limite de tentativas" valor="1" />
              <Campo nome="Tempo limite de nova tentativa RADIUS" valor="10" />
              <Campo nome="Intervalo de atualização de contabilidade (s)" valor="300" />
            </ul>
            <Print src="/tutorial-grandstream/05-radius-config.png" alt="Configuração do servidor RADIUS" />
            <Aviso tipo="atencao">
              As <strong>Chaves secretas</strong> de Autenticação e Contabilidade devem ser <strong>idênticas</strong> à senha do campo "Secret RADIUS" no sistema (Passo 1).
            </Aviso>
          </Passo>

          <Passo numero="4" titulo="Criar Política do Portal (Captive Portal)">
            <p>Acesse <strong>Wi-Fi → Política do portal</strong> e clique em <strong>Adicionar</strong>.</p>
            <Print src="/tutorial-grandstream/02-politica-portal-lista.png" alt="Lista de Políticas de Portal" />
            <p className="mt-3">Configure:</p>
            <ul className="list-disc ml-5 space-y-1 mt-2">
              <Campo nome="Nome" valor="Nome de sua preferência" />
              <Campo nome="Página de apresentação" valor="Externas" />
              <Campo nome="Plataforma" valor="Plataforma universal" />
              <Campo nome="URL da página splash externa" valor="URL copiada do sistema no Passo 2" />
              <Campo nome="Autenticação RADIUS" valor="Selecione o servidor criado no Passo 3" />
              <Campo nome="Duração do tempo limite de clientes não autenticados" valor="5" />
            </ul>
            <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">Interruptores importantes:</p>
            <ul className="list-disc ml-5 space-y-1">
              <Campo nome="RADIUS baseado em MAC" valor="✅ Habilitado" />
              <Campo nome="Habilitar redirecionamento HTTPS" valor="❌ Desabilitado" />
              <Campo nome="Habilitar portal seguro" valor="❌ Desabilitado" />
            </ul>
            <Print src="/tutorial-grandstream/03-politica-portal-config.png" alt="Configuração da Política do Portal" />
            <Aviso tipo="atencao">
              <strong>Regras de autenticação prévia (Walled Garden)</strong> — Obrigatório! Sem elas, o cliente não consegue abrir a página de login.
            </Aviso>
            <p className="mt-2">Adicione duas regras:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>Nome de anfitrião:</strong> <code className="bg-gray-100 dark:bg-slate-700 rounded px-2 py-0.5 text-xs">seudominio.com</code> — Serviço: <code className="bg-gray-100 dark:bg-slate-700 rounded px-2 py-0.5 text-xs">Todos</code></li>
              <li><strong>Endereço IP:</strong> <code className="bg-gray-100 dark:bg-slate-700 rounded px-2 py-0.5 text-xs">IP do seu servidor</code> — Serviço: <code className="bg-gray-100 dark:bg-slate-700 rounded px-2 py-0.5 text-xs">Todos</code></li>
            </ul>
          </Passo>

          <Passo numero="5" titulo="Associar ao SSID (Rede Wi-Fi)">
            <p>Acesse <strong>Wi-Fi → LAN Sem fios</strong>, edite o SSID desejado e selecione a <strong>Política de portal</strong> criada no Passo 4.</p>
            <Aviso tipo="ok">
              Pronto! A antena está configurada e pronta para receber clientes.
            </Aviso>
          </Passo>
        </section>

        {/* ====== PARTE 3 — TESTAR ====== */}
        <section id="teste" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">🧪</span> Parte 3 — Testar a integração
          </h2>

          <Passo numero="6" titulo="Teste rápido">
            <ol className="list-decimal ml-5 space-y-2">
              <li>Conecte um celular na rede Wi-Fi da antena Grandstream.</li>
              <li>O celular deve abrir automaticamente a página do portal cativo (Splash Page).</li>
              <li>Use o <strong>Pix Free</strong> ou faça um pagamento de teste.</li>
              <li>Após a confirmação, a internet deve ser liberada em 1-2 segundos.</li>
              <li>No painel, verifique em <strong>Sessões</strong> se aparece a sessão ativa.</li>
            </ol>
            <Aviso tipo="info">
              Se o portal não abrir automaticamente, acesse um site HTTP (ex: <code className="bg-gray-100 dark:bg-slate-700 rounded px-2 py-0.5 text-xs">http://neverssl.com</code>) no navegador do celular.
            </Aviso>
          </Passo>
        </section>

        {/* ====== PROBLEMAS COMUNS ====== */}
        <section id="problemas" className="mb-12">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <span className="text-2xl">🔧</span> Problemas comuns
          </h2>

          <Passo numero="?" titulo="Portal não abre / Página em branco">
            <ul className="list-disc ml-5 space-y-1">
              <li>Verifique se as <strong>Regras de autenticação prévia</strong> (Walled Garden) incluem o domínio e o IP do servidor.</li>
              <li>Confirme que o campo <strong>"URL da página splash externa"</strong> está correto e acessível.</li>
              <li>Certifique-se de que <strong>"Habilitar redirecionamento HTTPS"</strong> está <strong>desabilitado</strong>.</li>
            </ul>
          </Passo>

          <Passo numero="?" titulo="Internet não libera após pagamento">
            <ul className="list-disc ml-5 space-y-1">
              <li>Verifique se as <strong>Chaves secretas</strong> (RADIUS) da GWN Cloud são idênticas às cadastradas no sistema.</li>
              <li>Confirme que as portas <strong>1812</strong> (Auth) e <strong>1813</strong> (Acct) estão corretas.</li>
              <li>Verifique se <strong>"RADIUS baseado em MAC"</strong> está ativado na Política do Portal.</li>
            </ul>
          </Passo>

          <Passo numero="?" titulo="Equipamento aparece OFFLINE no painel">
            <ul className="list-disc ml-5 space-y-1">
              <li>O status Online/Offline depende dos campos opcionais <strong>API Key</strong> e <strong>API Secret</strong> da GWN Cloud.</li>
              <li>Para ativar o monitoramento, vá em <strong>Editar Equipamento</strong> e preencha a API Key (APP ID) e API Secret gerados na seção <strong>"Desenvolvedor de API"</strong> da GWN Cloud.</li>
              <li>Esses campos <strong>não afetam</strong> a liberação de internet — servem apenas para monitoramento.</li>
            </ul>
          </Passo>
        </section>

      </div>
    </AdminLayout>
  );
}
