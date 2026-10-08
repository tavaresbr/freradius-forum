import React, { useState, useEffect } from "react";
import axios from "axios";

const STEPS = [
  "Selecionar MikroTik",
  "Escanear Rede",
  "Interface e IP",
  "Configurar RADIUS",
  "Deploy",
];

export default function HotspotWizard({ isOpen, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [mikrotiks, setMikrotiks] = useState([]);
  const [selectedMikrotik, setSelectedMikrotik] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [config, setConfig] = useState({
    interface: "",
    localAddress: "10.5.50.1/24",
    poolName: "hs-pool",
    poolRange: "10.5.50.2-10.5.50.254",
    radiusServerIp: "10.8.0.1",
    radiusPort: 1812,
    radiusSecret: "",
    dnsName: "",
  });

  useEffect(() => {
    if (isOpen) {
      axios.get("/api/mikrotiks").then(res => {
        setMikrotiks(Array.isArray(res.data) ? res.data : res.data.mikrotiks || []);
      }).catch(() => {});
    }
  }, [isOpen]);

  const handleScan = async () => {
    if (!selectedMikrotik) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await axios.get(`/api/mikrotiks/${selectedMikrotik.id}/scan`);
      setScanResult(res.data);
      if (res.data.interfaces?.length > 0) {
        setConfig(c => ({ ...c, interface: res.data.interfaces[0].name || res.data.interfaces[0].defaultName || "ether2" }));
      }
      if (res.data.pools?.length > 0) {
        setConfig(c => ({ ...c, poolName: res.data.pools[0].name, poolRange: res.data.pools[0].ranges }));
      }
    } catch (err) {
      setScanResult({ error: err.response?.data?.message || err.message });
    }
    setScanning(false);
  };

  const handleDeploy = async () => {
    if (!selectedMikrotik) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const res = await axios.post(`/api/mikrotiks/${selectedMikrotik.id}/enviar-hotspot`, config);
      setDeployResult(res.data);
    } catch (err) {
      setDeployResult({ success: false, error: err.response?.data?.message || err.message });
    }
    setDeploying(false);
  };

  if (!isOpen) return null;

  const canNext = () => {
    if (currentStep === 0) return !!selectedMikrotik;
    if (currentStep === 1) return !!scanResult && !scanResult.error;
    if (currentStep === 2) return !!config.interface;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1d27] border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Wizard de Hotspot</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center px-6 pt-4 gap-2 overflow-x-auto">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${
                i === currentStep ? "bg-blue-600 text-white" :
                i < currentStep ? "bg-green-600 text-white" :
                "bg-gray-700 text-gray-400"
              }`}>
                {i < currentStep ? "\u2713" : i + 1}
              </div>
              <span className={`ml-1 text-xs whitespace-nowrap ${i === currentStep ? "text-white" : "text-gray-500"}`}>
                {step}
              </span>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-gray-600 mx-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Step 0: Select MikroTik */}
          {currentStep === 0 && (
            <div>
              <label className="block text-gray-300 mb-2">Selecione o MikroTik</label>
              <select
                value={selectedMikrotik?.id || ""}
                onChange={(e) => {
                  const mk = mikrotiks.find(m => m.id === Number(e.target.value));
                  setSelectedMikrotik(mk || null);
                  setConfig(c => ({ ...c, radiusSecret: mk?.senha || "" }));
                }}
                className="w-full p-2 bg-[#0d1117] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Selecione --</option>
                {mikrotiks.map(mk => (
                  <option key={mk.id} value={mk.id}>{mk.nome || mk.ip} ({mk.ip})</option>
                ))}
              </select>
              {selectedMikrotik && (
                <div className="mt-3 p-3 bg-[#0d1117] rounded border border-gray-700 text-sm text-gray-300">
                  <p>IP: {selectedMikrotik.ip}</p>
                  <p>Porta: {selectedMikrotik.porta || 8728}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Scan Network */}
          {currentStep === 1 && (
            <div>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {scanning ? "Escaneando..." : "Escanear Rede"}
              </button>
              {scanResult && scanResult.error && (
                <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                  {scanResult.error}
                </div>
              )}
              {scanResult && !scanResult.error && (
                <div className="mt-3 space-y-3">
                  <div>
                    <h4 className="text-gray-300 font-medium mb-1">Interfaces ({scanResult.interfaces?.length || 0})</h4>
                    <div className="bg-[#0d1117] rounded border border-gray-700 max-h-40 overflow-y-auto">
                      {(scanResult.interfaces || []).map((iface, i) => (
                        <div key={i} className="px-3 py-1 text-sm text-gray-300 border-b border-gray-800 last:border-0">
                          {iface.name || iface.defaultName} {iface.type ? `(${iface.type})` : ""} {iface.running === "true" ? " - UP" : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-gray-300 font-medium mb-1">Pools ({scanResult.pools?.length || 0})</h4>
                    <div className="bg-[#0d1117] rounded border border-gray-700 max-h-40 overflow-y-auto">
                      {(scanResult.pools || []).map((pool, i) => (
                        <div key={i} className="px-3 py-1 text-sm text-gray-300 border-b border-gray-800 last:border-0">
                          {pool.name}: {pool.ranges}
                        </div>
                      ))}
                      {(!scanResult.pools || scanResult.pools.length === 0) && (
                        <div className="px-3 py-1 text-sm text-gray-500">Nenhum pool encontrado</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Interface and IP Settings */}
          {currentStep === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-gray-300 mb-1">Interface</label>
                <select
                  value={config.interface}
                  onChange={(e) => setConfig({ ...config, interface: e.target.value })}
                  className="w-full p-2 bg-[#0d1117] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                >
                  {(scanResult?.interfaces || []).map((iface, i) => (
                    <option key={i} value={iface.name || iface.defaultName}>
                      {iface.name || iface.defaultName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Endereço Local (CIDR)</label>
                <input
                  type="text"
                  value={config.localAddress}
                  onChange={(e) => setConfig({ ...config, localAddress: e.target.value })}
                  className="w-full p-2 bg-[#0d1117] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Nome do Pool</label>
                <input
                  type="text"
                  value={config.poolName}
                  onChange={(e) => setConfig({ ...config, poolName: e.target.value })}
                  className="w-full p-2 bg-[#0d1117] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Range do Pool</label>
                <input
                  type="text"
                  value={config.poolRange}
                  onChange={(e) => setConfig({ ...config, poolRange: e.target.value })}
                  className="w-full p-2 bg-[#0d1117] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">DNS Name (opcional)</label>
                <input
                  type="text"
                  value={config.dnsName}
                  onChange={(e) => setConfig({ ...config, dnsName: e.target.value })}
                  className="w-full p-2 bg-[#0d1117] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                  placeholder="hotspot.meudominio.com"
                />
              </div>
            </div>
          )}

          {/* Step 3: RADIUS Configuration */}
          {currentStep === 3 && (
            <div className="space-y-3">
              <div className="p-4 bg-[#0d1117] rounded border border-gray-700">
                <h4 className="text-gray-300 font-medium mb-3">Configuração RADIUS</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Servidor RADIUS IP</label>
                    <input
                      type="text"
                      value={config.radiusServerIp}
                      onChange={(e) => setConfig({ ...config, radiusServerIp: e.target.value })}
                      className="w-full p-2 bg-[#161b22] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Porta</label>
                    <input
                      type="number"
                      value={config.radiusPort}
                      onChange={(e) => setConfig({ ...config, radiusPort: parseInt(e.target.value) || 1812 })}
                      className="w-full p-2 bg-[#161b22] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Secret</label>
                    <input
                      type="text"
                      value={config.radiusSecret}
                      onChange={(e) => setConfig({ ...config, radiusSecret: e.target.value })}
                      className="w-full p-2 bg-[#161b22] border border-gray-700 text-white rounded focus:outline-none focus:border-blue-500"
                      placeholder="Senha do MikroTik"
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-500 text-sm">
                O RADIUS sera configurado no MikroTik para apontar para o servidor acima.
                Para VPN, use o IP do tunnel (ex: 10.8.0.1).
              </p>
            </div>
          )}

          {/* Step 4: Deploy */}
          {currentStep === 4 && (
            <div>
              <div className="mb-4 p-4 bg-[#0d1117] rounded border border-gray-700 text-sm text-gray-300 space-y-1">
                <p><strong>MikroTik:</strong> {selectedMikrotik?.nome || selectedMikrotik?.ip}</p>
                <p><strong>Interface:</strong> {config.interface}</p>
                <p><strong>IP:</strong> {config.localAddress}</p>
                <p><strong>Pool:</strong> {config.poolName} ({config.poolRange})</p>
                <p><strong>RADIUS:</strong> {config.radiusServerIp}:{config.radiusPort}</p>
              </div>

              {!deployResult && (
                <button
                  onClick={handleDeploy}
                  disabled={deploying}
                  className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-500 disabled:opacity-50 font-medium"
                >
                  {deploying ? "Deployando..." : "Iniciar Deploy"}
                </button>
              )}

              {deployResult && (
                <div className="mt-3">
                  <div className={`p-3 rounded border mb-3 ${
                    deployResult.success
                      ? "bg-green-900/30 border-green-700 text-green-300"
                      : "bg-red-900/30 border-red-700 text-red-300"
                  }`}>
                    {deployResult.success ? "Deploy concluido com sucesso!" : `Erro: ${deployResult.error || "Falha no deploy"}`}
                  </div>
                  {(deployResult.steps || deployResult.log || []).map((item, i) => {
                    const step = typeof item === "string" ? { message: item, status: "ok" } : item;
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm py-1">
                        <span className={step.status === "ok" ? "text-green-400" : "text-red-400"}>
                          {step.status === "ok" ? "\u2713" : "\u2717"}
                        </span>
                        <span className="text-gray-300">{step.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700">
          <button
            onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-30"
          >
            Voltar
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white"
            >
              Fechar
            </button>
            {currentStep < STEPS.length - 1 && (
              <button
                onClick={() => setCurrentStep(s => s + 1)}
                disabled={!canNext()}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500 disabled:opacity-50"
              >
                Proximo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
