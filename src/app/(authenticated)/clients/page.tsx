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
  CreditCard 
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    cnpj: "",
    registro_ans: "",
    endereco: ""
  });

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      setClients(data);
    } catch (error) {
      console.error("Erro ao buscar clientes:", error);
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

  const handleEditClick = (client: any) => {
    setEditingClient(client);
    setFormData({
      cnpj: client.cnpj || "",
      registro_ans: client.registro_ans || "",
      endereco: client.endereco || ""
    });
    setIsEditModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsEditModalOpen(false);
        fetchClients();
      } else {
        alert("Erro ao salvar alterações.");
      }
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro de conexão.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredClients = clients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.cnpj?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clientes Identificados</h1>
          <p className="text-sm text-slate-500">Lista de clientes detectados nos XMLs processados</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou CNPJ..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 sm:w-80"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-gax-blue" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <div key={client.id} className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-gax-blue/30 hover:shadow-md">
              <button 
                onClick={() => handleEditClick(client)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 opacity-0 transition-all hover:bg-gax-blue-light hover:text-gax-blue group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                title="Editar Cliente"
                aria-label={`Editar ${client.name}`}
              >
                <Pencil size={14} />
              </button>

              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gax-blue-light text-gax-blue">
                  <Building2 size={24} aria-hidden="true" />
                </div>
                <span className="rounded-full bg-green-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-green-600">Ativo</span>
              </div>

              <h3 className="mb-1 text-lg font-bold text-slate-800 group-hover:text-gax-blue">{client.name}</h3>
              <div className="mb-6 space-y-1">
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <CreditCard size={12} aria-hidden="true" />
                  <span className="sr-only">CNPJ:</span> {client.cnpj || "Não informado"}
                </p>
                {client.registro_ans && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <FileCheck size={12} aria-hidden="true" />
                    <span className="sr-only">ANS:</span> {client.registro_ans}
                  </p>
                )}
                {client.endereco && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate" title={client.endereco}>
                    <MapPin size={12} aria-hidden="true" />
                    <span className="sr-only">Endereço:</span> {client.endereco}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
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

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Razão Social</label>
                <div 
                  className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-500"
                  aria-readonly="true"
                >
                  {editingClient?.name}
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="client-cnpj" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CNPJ</label>
                <input 
                  id="client-cnpj"
                  type="text" 
                  value={formData.cnpj}
                  onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans"
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="client-ans" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registro ANS</label>
                <input 
                  id="client-ans"
                  type="text" 
                  value={formData.registro_ans}
                  onChange={(e) => setFormData({...formData, registro_ans: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans"
                  placeholder="Ex: 123456"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="client-endereco" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Endereço Completo</label>
                <textarea 
                  id="client-endereco"
                  value={formData.endereco}
                  onChange={(e) => setFormData({...formData, endereco: e.target.value})}
                  className="w-full min-h-[80px] rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans"
                  placeholder="Rua, Número, Bairro, Cidade - UF"
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
