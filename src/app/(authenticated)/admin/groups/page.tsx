"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Building2, 
  Plus, 
  Pencil, 
  Trash2, 
  X, 
  Loader2, 
  LayoutDashboard,
  ChevronRight,
  ShieldCheck,
  Building,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  cnpj: string;
  group_id?: string;
  group_name?: string;
}

interface Group {
  id: string;
  name: string;
  client_ids: string[];
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Form states
  const [groupName, setGroupName] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [groupsRes, clientsRes] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/clients?limit=1000")
      ]);
      const groupsData = await groupsRes.json();
      const clientsData = await clientsRes.json();
      
      setGroups(groupsData || []);
      setAllClients(clientsData.clients || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateNew = () => {
    setEditingGroup(null);
    setGroupName("");
    setSelectedClientIds(new Set());
    setIsModalOpen(true);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setSelectedClientIds(new Set(group.client_ids));
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setIsSaving(true);
    try {
      const payload = {
        name: groupName,
        client_ids: Array.from(selectedClientIds)
      };

      const url = editingGroup ? `/api/groups/${editingGroup.id}` : "/api/groups";
      const method = "POST"; // Backend handles both create and update via POST logic (standard for this API)

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error("Erro ao salvar grupo:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir o grupo "${name}"? Os clientes não serão excluídos, apenas perderão o vínculo com o grupo.`)) return;

    try {
      const res = await fetch(`/api/groups/${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Erro ao excluir grupo:", err);
    }
  };

  const toggleClientSelection = (clientId: string) => {
    const newSelection = new Set(selectedClientIds);
    if (newSelection.has(clientId)) newSelection.delete(clientId);
    else newSelection.add(clientId);
    setSelectedClientIds(newSelection);
  };

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 p-8 max-w-7xl mx-auto animate-in fade-in duration-500">

      <div className="flex items-center justify-end gap-4">
        <div className="relative group max-w-xs w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Buscar grupo..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-200/60 bg-white px-12 py-3 text-xs text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium placeholder:text-slate-300 shadow-sm"
          />
        </div>
        <button 
          onClick={handleCreateNew}
          className="flex items-center gap-2 rounded-2xl bg-gax-blue px-6 py-3 text-xs font-bold text-white shadow-xl shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover active:scale-95 shrink-0"
        >
          <Plus size={18} />
          Novo Grupo
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="animate-spin text-gax-blue" size={48} />
          <p className="text-sm font-medium text-slate-400">Carregando grupos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group, idx) => (
            <div 
              key={group.id}
              className="group relative flex flex-col rounded-[2rem] border border-slate-200/60 bg-white/70 p-7 shadow-sm backdrop-blur-sm transition-all hover:border-gax-blue/30 hover:shadow-2xl hover:shadow-slate-200/50 animate-in fade-in slide-in-from-bottom-4"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="mb-6 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gax-blue/20 to-gax-blue/5 text-gax-blue shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <ShieldCheck size={24} />
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <button 
                    onClick={() => handleEditGroup(group)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-gax-blue hover:text-white transition-all shadow-sm"
                  >
                    <Pencil size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteGroup(group.id, group.name)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-2 leading-tight group-hover:text-gax-blue transition-colors">
                {group.name}
              </h3>
              
              <div className="flex items-center gap-2 mb-6">
                <Users size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-500">
                  {group.client_ids.length} {group.client_ids.length === 1 ? 'cliente associado' : 'clientes associados'}
                </span>
              </div>

              <div className="mt-auto space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Membros Recentes</p>
                <div className="flex flex-wrap gap-2">
                  {group.client_ids.slice(0, 4).map(cid => {
                    const client = allClients.find(c => c.id === cid);
                    return client ? (
                      <span key={cid} className="inline-flex items-center rounded-xl bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-700 border border-slate-200 shadow-sm">
                        {client.name.split(' ')[0]} {client.name.split(' ')[1] || ""}
                      </span>
                    ) : null;
                  })}
                  {group.client_ids.length > 4 && (
                    <span className="inline-flex items-center rounded-xl bg-gax-blue/5 px-3 py-1.5 text-[10px] font-bold text-gax-blue border border-gax-blue/10 italic">
                      + {group.client_ids.length - 4} outros
                    </span>
                  )}
                  {group.client_ids.length === 0 && (
                    <p className="text-[11px] italic text-slate-350 px-1 py-1">Nenhum cliente neste grupo.</p>
                  )}
                </div>
              </div>
              
            </div>
          ))}
        </div>
      )}

      {/* Group Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white p-10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">
                  {editingGroup ? "Editar Grupo" : "Novo Grupo"}
                </h3>
                <p className="text-[11px] font-medium text-slate-400">Configure o nome e os membros do grupo.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6 flex-1 flex flex-col overflow-hidden">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome do Grupo</label>
                <input 
                  type="text" 
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ex: Unimed Federação Paraná"
                  className="w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all placeholder:text-slate-200"
                  required
                />
              </div>

              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center justify-between mb-2 px-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Selecionar Clientes ({selectedClientIds.size})</label>
                  <p className="text-[9px] font-bold text-slate-300 italic">Pesquise para encontrar operadoras</p>
                </div>
                
                <div className="mb-4 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  <input 
                    type="text" 
                    placeholder="Filtrar clientes..." 
                    className="w-full rounded-xl border border-slate-100 bg-slate-50/50 px-10 py-2.5 text-xs outline-none focus:border-gax-blue focus:bg-white transition-all"
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase();
                      const items = document.querySelectorAll('.client-select-item');
                      items.forEach((item: any) => {
                        const name = item.getAttribute('data-name')?.toLowerCase() || "";
                        if (name.includes(val)) item.style.display = 'flex';
                        else item.style.display = 'none';
                      });
                    }}
                  />
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar lg:max-h-60">
                  {allClients.map(client => (
                    <div 
                      key={client.id}
                      data-name={client.name}
                      onClick={() => toggleClientSelection(client.id)}
                      className={cn(
                        "client-select-item flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all active:scale-[0.98]",
                        selectedClientIds.has(client.id)
                          ? "border-gax-blue bg-gax-blue/5 shadow-sm"
                          : "border-slate-100 bg-white hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                          selectedClientIds.has(client.id) ? "bg-gax-blue text-white" : "bg-slate-100 text-slate-400"
                        )}>
                          <Building size={16} />
                        </div>
                        <div className="flex flex-col">
                          <span className={cn(
                            "text-xs font-bold transition-all leading-tight",
                            selectedClientIds.has(client.id) ? "text-gax-blue" : "text-slate-700"
                          )}>{client.name}</span>
                          <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">{client.cnpj}</span>
                        </div>
                      </div>
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all scale-90",
                        selectedClientIds.has(client.id) ? "bg-gax-blue border-gax-blue shadow-lg shadow-gax-blue/40" : "border-slate-200 bg-white shadow-inner"
                      )}>
                        {selectedClientIds.has(client.id) && <ArrowRight size={10} className="text-white rotate-[-45deg]" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-xl bg-slate-50 py-3 text-[11px] font-bold text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 text-[11px] font-bold text-white shadow-xl shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50 active:scale-95 translate-y-[-1px]"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isSaving ? "Salvando..." : editingGroup ? "Salvar Alterações" : "Criar Grupo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
