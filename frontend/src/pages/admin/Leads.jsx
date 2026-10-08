import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/admin/AdminLayout";

const API = "";

const statusColors = {
  novo: "bg-blue-900/40 text-blue-400 border-blue-800/50",
  contactado: "bg-yellow-900/40 text-yellow-400 border-yellow-800/50",
  convertido: "bg-green-900/40 text-green-400 border-green-800/50",
  descartado: "bg-red-900/40 text-red-400 border-red-800/50",
};

const statusLabels = {
  novo: "Novo",
  contactado: "Contactado",
  convertido: "Convertido",
  descartado: "Descartado",
};

const tabs = [
  { key: "todos", label: "Todos" },
  { key: "novo", label: "Novo" },
  { key: "contactado", label: "Contactado" },
  { key: "convertido", label: "Convertido" },
  { key: "descartado", label: "Descartado" },
];

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", cpf: "", observacoes: "" });

  const token = localStorage.getItem("admin_token");

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "todos") params.append("status", statusFilter);
      if (search) params.append("q", search);

      const res = await fetch(`${API}/api/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar leads:", err);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await fetch(`${API}/api/leads/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchLeads();
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Tem certeza que deseja excluir este lead?")) return;
    try {
      await fetch(`${API}/api/leads/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLeads();
    } catch (err) {
      console.error("Erro ao deletar lead:", err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await fetch(`${API}/api/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...form, origem: "manual" }),
      });
      setShowModal(false);
      setForm({ nome: "", email: "", telefone: "", cpf: "", observacoes: "" });
      fetchLeads();
    } catch (err) {
      console.error("Erro ao criar lead:", err);
    }
  };

  const handleExport = async () => {
    try {
      const r = await fetch(`${API}/api/auth/download-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("token");
      const { token: dl } = await r.json();
      window.open(`${API}/api/leads/export?token=${dl}`, "_blank");
    } catch (err) {
      console.error("Erro ao exportar leads:", err);
      alert("Nao foi possivel exportar. Faca login novamente.");
    }
  };

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Leads</h1>
            <p className="text-gray-400 text-sm mt-1">Gerencie seus leads e contatos</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-[#1a1d27] border border-gray-800 text-gray-300 rounded-lg hover:bg-[#252b3b] transition-colors text-sm cursor-pointer"
            >
              Exportar CSV
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm cursor-pointer"
            >
              + Novo Lead
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                statusFilter === tab.key
                  ? "bg-blue-900/30 text-blue-400 border border-blue-800/50"
                  : "bg-[#1a1d27] text-gray-400 border border-gray-800 hover:bg-[#252b3b]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por nome, email ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-96 px-4 py-2 pl-10 bg-[#1a1d27] border border-gray-800 rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-800 text-sm"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Table */}
        <div className="bg-[#1a1d27] border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden md:table-cell">Telefone</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden lg:table-cell">CPF</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden md:table-cell">Origem</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium hidden lg:table-cell">Data</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="text-center py-8 text-gray-500">
                      Carregando...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-8 text-gray-500">
                      Nenhum lead encontrado
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-800/50 hover:bg-[#252b3b]/30">
                      <td className="px-4 py-3 text-gray-200">{lead.nome || "-"}</td>
                      <td className="px-4 py-3 text-gray-400">{lead.email || "-"}</td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{lead.telefone || "-"}</td>
                      <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{lead.cpf || "-"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          className={`px-2 py-1 rounded-md text-xs font-medium border cursor-pointer bg-transparent ${statusColors[lead.status]}`}
                        >
                          {Object.entries(statusLabels).map(([val, label]) => (
                            <option key={val} value={val} className="bg-[#1a1d27] text-gray-300">
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell capitalize">{lead.origem}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{formatDate(lead.criado_em)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="text-red-400 hover:text-red-300 text-xs cursor-pointer"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Novo Lead */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1d27] border border-gray-800 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Novo Lead</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-200 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0f111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-blue-800 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0f111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-blue-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Telefone</label>
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0f111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-blue-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">CPF</label>
                <input
                  type="text"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0f111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-blue-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-[#0f111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-blue-800 text-sm resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-[#0f111a] border border-gray-800 text-gray-300 rounded-lg hover:bg-[#252b3b] transition-colors text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm cursor-pointer"
                >
                  Criar Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
