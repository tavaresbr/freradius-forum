import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";

export default function CampanhaEditor() {
  const { empresaSlug, id } = useParams();
  const [campanha, setCampanha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const token = localStorage.getItem("admin_token");

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campanhas/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar campanha");
      setCampanha(data.data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, [id]);

  const handleToggleAtivo = async () => {
    if (!campanha) return;
    try {
      const res = await fetch(`/api/campanhas/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ativo: !campanha.ativo }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar campanha");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset input so the same file can be re-uploaded if needed
    e.target.value = "";

    const formData = new FormData();
    formData.append("arquivo", file);

    setUploading(true);
    try {
      const res = await fetch(`/api/campanhas/${id}/itens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Do NOT set Content-Type here — browser sets it with boundary automatically
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar arquivo");
      carregar();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletarItem = async (itemId) => {
    if (!confirm("Deseja remover este item?")) return;
    try {
      const res = await fetch(`/api/campanhas/${id}/itens/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao remover item");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReordenar = async (itens) => {
    const ordens = itens.map((item, idx) => ({ id: item.id, ordem: idx + 1 }));
    try {
      const res = await fetch(`/api/campanhas/${id}/itens/reordenar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ordens }),
      });
      if (!res.ok) throw new Error("Erro ao reordenar itens");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  };

  const moverItem = (index, direcao) => {
    if (!campanha) return;
    const itens = [...campanha.itens];
    const novoIndex = index + direcao;
    if (novoIndex < 0 || novoIndex >= itens.length) return;
    // Swap
    [itens[index], itens[novoIndex]] = [itens[novoIndex], itens[index]];
    handleReordenar(itens);
  };

  const formatarDuracao = (segundos) => {
    if (!segundos) return "—";
    if (segundos < 60) return `${segundos}s`;
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  if (loading) {
    return (
      <AdminLayout>
        <p className="text-gray-400">Carregando...</p>
      </AdminLayout>
    );
  }

  if (!campanha) {
    return (
      <AdminLayout>
        <p className="text-red-400">Campanha não encontrada.</p>
      </AdminLayout>
    );
  }

  const itens = campanha.itens || [];

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to={`/admin/${empresaSlug}/campanhas`}
          className="text-gray-400 hover:text-white text-sm border border-gray-700 px-3 py-1 rounded hover:bg-[#252b3b]"
        >
          ← Voltar
        </Link>
        <h1 className="text-3xl font-bold text-white flex-1">{campanha.nome}</h1>
        <span className="text-gray-400 text-sm">{campanha.views ?? 0} views</span>
        <button
          onClick={handleToggleAtivo}
          className={`text-xs px-3 py-1 rounded-full cursor-pointer ${
            campanha.ativo
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400"
          }`}
          title="Clique para alternar"
        >
          {campanha.ativo ? "Ativo" : "Inativo"}
        </button>
      </div>

      {campanha.descricao && (
        <p className="text-gray-400 text-sm mb-6">{campanha.descricao}</p>
      )}

      {/* Upload zone */}
      <div className="bg-[#1a1d27] border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">Itens da Campanha</h2>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={uploading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-neutral-800 disabled:opacity-50 text-sm"
            >
              {uploading ? "Enviando..." : "+ Adicionar item"}
            </button>
          </div>
        </div>
        <p className="text-gray-500 text-xs mb-4">
          Imagens: JPG, PNG, WEBP até 10MB. Vídeos: MP4, WEBM até 50MB.
        </p>

        {itens.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum item adicionado. Clique em "+ Adicionar item" para começar.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {itens.map((item, index) => (
              <div
                key={item.id}
                className="bg-[#0d1117] border border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Thumbnail */}
                <div className="w-full h-40 bg-gray-900 flex items-center justify-center overflow-hidden">
                  {item.tipo === "video" ? (
                    <video
                      src={item.arquivo_url}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={item.arquivo_url}
                      alt={item.titulo || `Item ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 capitalize">{item.tipo}</span>
                    <span className="text-xs text-gray-500">{formatarDuracao(item.duracao_segundos)}</span>
                  </div>
                  {item.titulo && (
                    <p className="text-sm text-gray-300 truncate mb-1">{item.titulo}</p>
                  )}
                  {item.link_destino && (
                    <p className="text-xs text-blue-400 truncate mb-2">{item.link_destino}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => moverItem(index, -1)}
                      disabled={index === 0}
                      className="border border-gray-700 text-gray-300 px-2 py-1 rounded text-xs hover:bg-[#252b3b] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover para cima"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moverItem(index, 1)}
                      disabled={index === itens.length - 1}
                      className="border border-gray-700 text-gray-300 px-2 py-1 rounded text-xs hover:bg-[#252b3b] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover para baixo"
                    >
                      ↓
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => handleDeletarItem(item.id)}
                      className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                      title="Remover item"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
