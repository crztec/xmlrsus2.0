"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Building2, 
  Calendar, 
  FileCheck, 
  Loader2, 
  Pencil, 
  X,
  MapPin, 
  CreditCard,
  ExternalLink,
  LayoutGrid,
  List
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    cnpj: "",
    registro_ans: "",
    endereco: "",
    url_sistema: ""
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const itemsPerPage = 10;

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      // Debounce ou busca direta no servidor
      const res = await fetch(`/api/clients?page=${currentPage}&limit=${itemsPerPage}&search=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      setClients(data.clients || []);
      setTotalClients(data.total || 0);
    } catch (_err) {
      console.error("Erro ao buscar clientes:", _err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    fetchClients();
  }, [currentPage, searchTerm]);

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const formatANS = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  const handleEditClick = (client: any) => {
    setEditingClient(client);
    setSuccessMessage("");
    setErrorMessage("");
    setFormData({
      name: client.name || "",
      cnpj: client.cnpj || "",
      registro_ans: client.registro_ans || "",
      endereco: client.endereco || "",
      url_sistema: client.url_sistema || ""
    });
    setIsEditModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    // Validation
    const cleanCNPJ = formData.cnpj.replace(/\D/g, "");
    if (cleanCNPJ && cleanCNPJ.length !== 14) {
      setErrorMessage("CNPJ deve conter 14 dígitos.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    
    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSuccessMessage("Alterações salvas com sucesso!");
        fetchClients();
        setTimeout(() => setSuccessMessage(""), 5000);
      } else {
        const errorData = await res.json();
        setErrorMessage(errorData.detail || "Erro ao salvar alterações.");
      }
    } catch (_err) {
      console.error("Erro ao salvar:", _err);
      setErrorMessage("Erro de conexão com o servidor.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredClients = clients; // Agora filtrado no servidor

  const totalPages = Math.ceil(totalClients / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between animate-in fade-in duration-500">
        <div className="relative group max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou CNPJ..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-200/60 bg-white px-12 py-3.5 text-xs text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium placeholder:text-slate-300"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white p-1.5 shadow-sm">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
              viewMode === "grid" 
                ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" 
                : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            )}
            title="Visualização em Grade"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
              viewMode === "list" 
                ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" 
                : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            )}
            title="Visualização em Lista"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="animate-spin text-gax-blue" size={48} />
          <p className="text-sm font-medium text-slate-400">Carregando base de clientes...</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client, idx) => (
            <div 
              key={client.id} 
              className="group relative flex flex-col rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all hover:border-gax-blue/30 hover:shadow-xl hover:shadow-slate-200/50 animate-in fade-in slide-in-from-bottom-4 duration-500"
              style={{ animationDelay: `${(idx % 5) * 50}ms`, animationFillMode: 'both' }}
            >
              {/* Card Content (Manter original) */}
              <div className="mb-6 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gax-blue/10 to-gax-blue/5 text-gax-blue shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <Building2 size={24} aria-hidden="true" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 border border-emerald-100/50">Ativo</span>
                  <button 
                    onClick={() => handleEditClick(client)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-gax-blue hover:text-white transition-all shadow-sm"
                    title="Editar Cliente"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>

              {client.url_sistema ? (
                <a 
                  href={client.url_sistema} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group/link mb-2 flex items-center gap-2 text-lg font-bold text-slate-800 transition-colors hover:text-gax-blue leading-tight"
                >
                  {client.name}
                  <ExternalLink size={16} className="opacity-0 group-hover/link:opacity-100 transition-all -translate-x-2 group-hover/link:translate-x-0" />
                </a>
              ) : (
                <h3 className="mb-2 text-lg font-bold text-slate-800 transition-colors group-hover:text-gax-blue leading-tight">{client.name}</h3>
              )}
              <div className="mb-6 space-y-2">
                <div className="flex items-center gap-2.5 text-xs text-slate-500">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-400">
                    <CreditCard size={12} />
                  </div>
                  <span className="font-medium">{client.cnpj || "CNPJ não informado"}</span>
                </div>
                {client.registro_ans && (
                  <div className="flex items-center gap-2.5 text-xs text-slate-500">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-400">
                      <FileCheck size={12} />
                    </div>
                    <span className="font-medium">ANS: {client.registro_ans}</span>
                  </div>
                )}
                {client.endereco && (
                  <div className="flex items-center gap-2.5 text-xs text-slate-500">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400">
                      <MapPin size={12} />
                    </div>
                    <span className="font-medium truncate" title={client.endereco}>{client.endereco}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100/50 pt-5 mt-auto">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Calendar size={12} aria-hidden="true" />
                    Última Importação
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">{client.ultima_importacao || "-"}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <FileCheck size={12} aria-hidden="true" />
                    Total de ABIs
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">{client.total_abis} XMLs</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-sm animate-in fade-in duration-500">
            <div className="overflow-x-auto">
              {/* Tabela aqui */}
              <table className="w-full text-left border-collapse">
                {/* ... (manter o thead original) */}
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">CNPJ / ANS</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden lg:table-cell">Endereço</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Atividade</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client, idx) => (
                    <tr key={client.id} className="group hover:bg-gax-blue/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gax-blue/10 to-gax-blue/5 text-gax-blue shadow-inner group-hover:scale-105 transition-transform">
                            <Building2 size={16} />
                          </div>
                          <div className="flex flex-col">
                            {client.url_sistema ? (
                              <a 
                                href={client.url_sistema} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm font-bold text-slate-700 hover:text-gax-blue transition-colors"
                              >
                                {client.name}
                                <ExternalLink size={12} className="text-slate-300" />
                              </a>
                            ) : (
                              <span className="text-sm font-bold text-slate-700">{client.name}</span>
                            )}
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">ID: {client.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold text-slate-600">{client.cnpj || "-"}</span>
                          {client.registro_ans && <span className="text-[10px] font-medium text-slate-400 italic">ANS: {client.registro_ans}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <span className="block max-w-[200px] truncate text-xs text-slate-500 font-medium" title={client.endereco}>
                          {client.endereco || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-slate-600">{client.ultima_importacao || "Sem registros"}</span>
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full w-fit border border-emerald-100/50">{client.total_abis} XMLs</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleEditClick(client)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-gax-blue hover:text-white transition-all shadow-sm active:scale-95"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Controles de Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
              <span className="text-xs font-medium text-slate-500">
                Mostrando {clients.length} de {totalClients} clientes
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-30"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={cn(
                        "h-8 w-8 rounded-lg text-xs font-bold transition-all",
                        currentPage === i + 1
                          ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20"
                          : "text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-30"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between">
              <h3 id="modal-title" className="text-xl font-bold text-slate-800">Editar Cliente</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {successMessage && (
              <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-600 border border-emerald-100 flex items-center gap-2 animate-in slide-in-from-top-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 border border-rose-100 flex items-center gap-2 animate-in shake duration-500">
                <X size={14} className="text-rose-400" />
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="client-name" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Razão Social</label>
                <input 
                  id="client-name"
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-bold"
                  placeholder="Nome da Operadora"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="client-cnpj" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CNPJ</label>
                <input 
                  id="client-cnpj"
                  type="text" 
                  value={formData.cnpj}
                  onChange={(e) => setFormData({...formData, cnpj: formatCNPJ(e.target.value)})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="client-ans" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registro ANS</label>
                <input 
                  id="client-ans"
                  type="text" 
                  value={formData.registro_ans}
                  onChange={(e) => setFormData({...formData, registro_ans: formatANS(e.target.value)})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                  placeholder="Ex: 123456 (Somente números)"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="client-endereco" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Endereço Completo</label>
                <textarea 
                  id="client-endereco"
                  value={formData.endereco}
                  onChange={(e) => setFormData({...formData, endereco: e.target.value})}
                  className="w-full min-h-[80px] rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="client-url" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">URL do Portal RSUS</label>
                <input 
                  id="client-url"
                  type="url" 
                  value={formData.url_sistema}
                  onChange={(e) => setFormData({...formData, url_sistema: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium italic text-gax-blue"
                  placeholder="https://exemplo.cubeti.com.br"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  aria-busy={isSaving}
                  className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 text-sm font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
                  {isSaving ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
