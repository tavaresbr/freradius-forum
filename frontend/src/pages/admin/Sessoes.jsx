// frontend/src/pages/admin/Sessoes.jsx
import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";

export default function Sessoes() {
  const [sessoes, setSessoes] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregarSessoes = async () => {
    try {
      const res = await fetch("/api/radius/sessoes", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar sessões");
      setSessoes(data);
    } catch (err) {
      console.error("Erro ao carregar sessões:", err);
      setSessoes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarSessoes();
  }, []);

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Sessões RADIUS Ativas</h1>
        <div className="overflow-auto rounded-lg border border-gray-800 bg-[#1a1d27]">
          <table className="min-w-full text-sm text-white">
            <thead className="bg-[#151821] text-xs uppercase text-gray-400">
              <tr>
                <th className="p-3 text-left">Usuário</th>
                <th className="p-3 text-left">CPF</th>
                <th className="p-3 text-left">MAC</th>
                <th className="p-3 text-left">IP</th>
                <th className="p-3 text-left">NAS (Mikrotik)</th>
                <th className="p-3 text-left">Início da Sessão</th>
              </tr>
            </thead>
            <tbody>
              {sessoes.map((s, idx) => (
                <tr key={idx} className="border-t border-gray-800">
                  <td className="p-3">{s.username}</td>
                  <td className="p-3">{s.cpf || "-"}</td>
                  <td className="p-3">{s.mac || "-"}</td>
                  <td className="p-3">{s.ip || "-"}</td>
                  <td className="p-3">{s.gateway || "-"}</td>
                  <td className="p-3">{new Date(s.acctstarttime).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
              {sessoes.length === 0 && !loading && (
                <tr>
                  <td colSpan="6" className="p-3 text-center text-gray-500">
                    Nenhuma sessão ativa no momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {loading && (
            <div className="text-center p-4 text-gray-500">Carregando sessões...</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

