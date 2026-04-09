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
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Smartphone
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppContact {
  number: string;
  label: string;
}

interface Client {
  id: string;
  name: string;
  cnpj: string;
  registro_ans?: string;
  endereco?: string;
  url_sistema?: string;
  total_abis?: number;
  ultima_importacao?: string;
  api_status?: string;
  api_last_check?: any;
  whatsapp_numbers?: (string | WhatsAppContact)[];
  group_id?: string;
  group_name?: string;
}

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states...
  const [formData, setFormData] = useState<{
    name: string;
    cnpj: string;
    registro_ans: string;
    endereco: string;
    url_sistema: string;
    whatsapp_numbers: WhatsAppContact[];
  }>({
    name: "",
    cnpj: "",
    registro_ans: "",
    endereco: "",
    url_sistema: "",
    whatsapp_numbers: []
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/clients?limit=1000`);
      const data = await res.json();
      setClients(data.clients || []);
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
  }, []);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedClients(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedClients.size === paginatedClients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(paginatedClients.map(c => c.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedClients.size === 0) return;
    if (!confirm(`Deseja realmente excluir ${selectedClients.size} clientes selecionados? Esta ação é irreversível.`)) return;

    setIsDeleting(true);
    try {
      const res = await fetch('/api/clients/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: Array.from(selectedClients) })
      });

      if (res.ok) {
        setSuccessMessage(`${selectedClients.size} clientes excluídos com sucesso.`);
        setSelectedClients(new Set());
        fetchClients();
      } else {
        const data = await res.json();
        setErrorMessage(data.detail || "Erro ao excluir clientes.");
      }
    } catch (err) {
      setErrorMessage("Erro de conexão com o servidor.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir o cliente "${name}"?`)) return;

    setIsDeleting(true);
    try {
      const res = await fetch('/api/clients/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: [id] })
      });

      if (res.ok) {
        setSuccessMessage("Cliente excluído com sucesso.");
        fetchClients();
      } else {
        const data = await res.json();
        setErrorMessage(data.detail || "Erro ao excluir cliente.");
      }
    } catch (err) {
      setErrorMessage("Erro de conexão com o servidor.");
    } finally {
      setIsDeleting(false);
    }
  };

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
      url_sistema: client.url_sistema || "",
      whatsapp_numbers: (client.whatsapp_numbers || []).map((n: any) => 
        typeof n === 'string' ? { number: n, label: "" } : n
      )
    });
    setIsEditModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

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

  const filteredClients = clients.filter((client: Client) => 
    (client.name && client.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (client.cnpj && client.cnpj.includes(searchTerm)) ||
    (client.group_name && client.group_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalFiltered = filteredClients.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedClients(new Set());
  }, [searchTerm]);

  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      {/* Floating Action Bar for Selected Items */}
      {selectedClients.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 rounded-2xl bg-slate-900 px-6 py-4 shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
          <span className="text-sm font-bold text-white">
            {selectedClients.size} {selectedClients.size === 1 ? 'cliente selecionado' : 'clientes selecionados'}
          </span>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedClients(new Set())}
              className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-600 transition-all disabled:opacity-50 shadow-lg shadow-rose-500/20 active:scale-95"
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Excluir Selecionados
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between animate-in fade-in duration-500">
        <div className="relative group max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome, CNPJ ou grupo..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-200/60 bg-white px-12 py-3.5 text-xs text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium placeholder:text-slate-300 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-4">
           {successMessage && (
            <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 animate-in fade-in slide-in-from-right-2 duration-300">
              {successMessage}
            </div>
           )}
           {errorMessage && (
            <div className="text-[11px] font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100 animate-in fade-in slide-in-from-right-2 duration-300">
              {errorMessage}
            </div>
           )}

          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white p-1.5 shadow-sm">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition-all font-sans",
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
                "flex h-9 w-9 items-center justify-center rounded-xl transition-all font-sans",
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
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="animate-spin text-gax-blue" size={48} />
          <p className="text-sm font-medium text-slate-400">Carregando base de clientes...</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {paginatedClients.map((client: Client, idx: number) => (
            <div 
              key={client.id} 
              className={cn(
                "group relative flex flex-col rounded-3xl border p-6 shadow-sm backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-4 duration-500",
                selectedClients.has(client.id) 
                  ? "border-gax-blue bg-gax-blue-light/30 shadow-gax-blue/10" 
                  : "border-slate-200/60 bg-white/70 hover:border-gax-blue/30 hover:shadow-xl hover:shadow-slate-200/50"
              )}
              style={{ animationDelay: `${(idx % 5) * 50}ms`, animationFillMode: 'both' }}
            >
              <div className="mb-6 flex items-start justify-between">
                <div 
                  className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-gax-blue/20 to-gax-blue/5 text-gax-blue shadow-inner group-hover:scale-110 transition-transform duration-500"
                  onClick={() => toggleSelect(client.id)}
                >
                  {selectedClients.has(client.id) ? (
                    <div className="h-5 w-5 rounded-md bg-gax-blue flex items-center justify-center text-white">
                      <Plus className="rotate-45" size={14} />
                    </div>
                  ) : (
                    <Building2 size={24} aria-hidden="true" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 border border-emerald-100/50">Ativo</span>
                    {client.group_name && (
                      <span className="rounded-full bg-gax-blue/10 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-gax-blue border border-gax-blue/20 shadow-sm animate-in fade-in duration-300">
                        {client.group_name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button 
                      onClick={() => handleEditClick(client)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-gax-blue hover:text-white transition-all shadow-sm"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteSingle(client.id, client.name)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-rose-400 opacity-0 group-hover:opacity-100 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
                  <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shadow-sm border border-slate-200/50">
                    <CreditCard size={12} />
                  </div>
                  <span className="font-bold text-slate-600">{client.cnpj || "CNPJ não informado"}</span>
                </div>
                {client.registro_ans && (
                  <div className="flex items-center gap-2.5 text-xs text-slate-500">
                    <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shadow-sm border border-slate-200/50">
                      <FileCheck size={12} />
                    </div>
                    <span className="font-medium">ANS: {client.registro_ans}</span>
                  </div>
                )}
                {client.endereco && (
                  <div className="flex items-center gap-2.5 text-xs text-slate-500">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shadow-sm border border-slate-200/50">
                      <MapPin size={12} />
                    </div>
                    <span className="font-medium truncate leading-tight" title={client.endereco}>{client.endereco}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 border-t border-slate-100/50 pt-5 mt-auto">
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <Calendar size={10} aria-hidden="true" />
                    Última Importação
                  </p>
                  <p className="text-xs font-bold text-slate-600">{client.ultima_importacao || "-"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-xl shadow-slate-200/20 backdrop-blur-sm animate-in fade-in duration-500">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 w-12">
                    <input 
                      type="checkbox" 
                      checked={selectedClients.size === paginatedClients.length && paginatedClients.length > 0} 
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue/20"
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Grupo</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">CNPJ / ANS</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Atividade</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedClients.map((client: Client, idx: number) => (
                  <tr 
                    key={client.id} 
                    className={cn(
                      "group transition-all duration-200",
                      selectedClients.has(client.id) ? "bg-gax-blue/[0.04]" : "hover:bg-gax-blue/[0.02]"
                    )}
                  >
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        checked={selectedClients.has(client.id)} 
                        onChange={() => toggleSelect(client.id)}
                        className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue/20"
                      />
                    </td>
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
                          <span className="text-[10px] font-medium text-slate-400 truncate max-w-[150px]">{client.cnpj}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       {client.group_name ? (
                         <span className="inline-flex items-center rounded-full bg-gax-blue/5 px-2.5 py-0.5 text-[10px] font-bold text-gax-blue border border-gax-blue/10">
                           {client.group_name}
                         </span>
                       ) : (
                         <span className="text-[10px] italic text-slate-400">Sem grupo</span>
                       )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-bold text-slate-600">{client.cnpj || "-"}</span>
                        {client.registro_ans && <span className="text-[10px] font-medium text-slate-400 italic">ANS: {client.registro_ans}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-slate-600">{client.ultima_importacao || "Sem registros"}</span>
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full w-fit border border-emerald-100/50">{client.total_abis} XMLs</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleEditClick(client)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-gax-blue hover:text-white transition-all shadow-sm active:scale-95"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteSingle(client.id, client.name)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-95"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Controles de Paginação (Logs Reference Style) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="text-xs font-medium text-slate-500">
            Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, totalFiltered)} de {totalFiltered} clientes
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
            >
              Primeira
            </button>
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-slate-700 px-2 font-sans">
              {currentPage} / {totalPages || 1}
            </span>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalFiltered === 0}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
              aria-label="Próxima"
            >
              <ChevronRight size={16} />
            </button>
            <button 
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
            >
              Última
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Editar Cliente</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Razão Social</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">CNPJ</label>
                <input 
                  type="text" 
                  value={formData.cnpj}
                  onChange={(e) => setFormData({...formData, cnpj: formatCNPJ(e.target.value)})}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registro ANS</label>
                <input 
                  type="text" 
                  value={formData.registro_ans}
                  onChange={(e) => setFormData({...formData, registro_ans: formatANS(e.target.value)})}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Endereço</label>
                <textarea 
                  value={formData.endereco}
                  onChange={(e) => setFormData({...formData, endereco: e.target.value})}
                  className="w-full min-h-[80px] rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">URL Portal</label>
                <input 
                  type="url" 
                  value={formData.url_sistema}
                  onChange={(e) => setFormData({...formData, url_sistema: e.target.value})}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-gax-blue font-bold italic"
                />
              </div>

              {/* WhatsApp Numbers Dynamic List */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contatos de WhatsApp / Grupos</label>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, whatsapp_numbers: [...formData.whatsapp_numbers, { number: "", label: "" }]})}
                    className="flex items-center gap-1 text-[10px] font-bold text-gax-blue hover:text-gax-blue-hover transition-colors"
                  >
                    <Plus size={12} />
                    Adicionar
                  </button>
                </div>

                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                  {formData.whatsapp_numbers.map((item: any, i: number) => (
                    <div key={i} className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-100 animate-in slide-in-from-right-2">
                      <div className="flex gap-2">
                        <div className="relative flex-[2]">
                          <Users size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                          <input 
                            type="text" 
                            value={item.label}
                            onChange={(e) => {
                              const newNums = [...formData.whatsapp_numbers];
                              newNums[i] = { ...newNums[i], label: e.target.value };
                              setFormData({...formData, whatsapp_numbers: newNums});
                            }}
                            className="w-full rounded-xl border border-slate-200 pl-8 pr-4 py-1.5 text-[10px] outline-none focus:border-gax-blue transition-all font-sans text-slate-700"
                            placeholder="Nome/Grupo"
                          />
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const newNums = formData.whatsapp_numbers.filter((_: any, idx: number) => idx !== i);
                            setFormData({...formData, whatsapp_numbers: newNums});
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="relative flex-1">
                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
                        <input 
                          type="text" 
                          value={item.number}
                          onChange={(e) => {
                            const newNums = [...formData.whatsapp_numbers];
                            newNums[i] = { ...newNums[i], number: e.target.value };
                            setFormData({...formData, whatsapp_numbers: newNums});
                          }}
                          className="w-full rounded-xl border border-slate-200 pl-8 pr-4 py-1.5 text-[10px] outline-none focus:border-gax-blue transition-all font-sans text-slate-700 font-bold"
                          placeholder="Número (Ex: 5527...)"
                        />
                      </div>
                    </div>
                  ))}
                  {formData.whatsapp_numbers.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic text-center py-2">Nenhum número configurado.</p>
                  )}
                </div>
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
