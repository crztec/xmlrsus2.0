"use client";

import React, { useState, useEffect } from "react";
import { 
  Shield, 
  Play, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Search, 
  Filter, 
  Clock, 
  MessageSquare,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientStatus {
  id: string;
  name: string;
  api_status: 'online' | 'offline' | 'unknown' | 'error';
  api_last_check: string;
  api_last_message: string;
}

export default function APIChecksPage() {
  const [clients, setClients] = useState<ClientStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      setClients(data);
    } catch (error) {
      console.error("Erro ao buscar status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh a cada 30 segundos se estiver na tela
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRunCheck = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    try {
      const res = await fetch("/api/check-integrations", { method: "POST" });
      if (res.ok) {
        alert("Automação iniciada! Os status serão atualizados gradualmente nos próximos minutos.");
      }
    } catch (error) {
      alert("Erro ao disparar checagem.");
    } finally {
      // Pequeno delay para o botão não piscar
      setTimeout(() => setIsExecuting(false), 2000);
    }
  };

  const filteredClients = clients.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || c.api_status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    online: clients.filter(c => c.api_status === 'online').length,
    offline: clients.filter(c => c.api_status === 'offline').length,
    total: clients.length
  };

  if (isLoading && clients.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gax-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Integrações</p>
          <p className="mt-1 text-4xl font-display font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={16} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Online Agora</p>
          </div>
          <p className="mt-1 text-4xl font-display font-black text-emerald-700">{stats.online}</p>
        </div>
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-2">
            <XCircle className="text-rose-500" size={16} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Offline / Erro</p>
          </div>
          <p className="mt-1 text-4xl font-display font-black text-rose-700">{stats.offline}</p>
        </div>
      </div>

      {/* Ações e Filtros */}
      <div className="flex flex-col gap-6 rounded-3xl border border-slate-200/60 bg-white/70 p-6 md:flex-row md:items-center justify-between backdrop-blur-sm">
        <div className="flex flex-1 flex-wrap items-center gap-4">
          <div className="relative min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar cliente..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium text-slate-700"
            />
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 shadow-xs">
            <Filter size={16} className="text-slate-400" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-600 outline-none"
            >
              <option value="all">Todos os Status</option>
              <option value="online">Somente Online</option>
              <option value="offline">Somente Offline</option>
              <option value="unknown">Desconhecido</option>
            </select>
          </div>
        </div>

        <button 
          onClick={handleRunCheck}
          disabled={isExecuting}
          className="flex h-12 items-center justify-center gap-3 rounded-2xl bg-slate-900 px-8 text-sm font-bold text-white shadow-xl shadow-slate-900/10 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
        >
          {isExecuting ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} className="fill-current" />}
          Executar Checagem Geral
        </button>
      </div>

      {/* Tabela de Resultados */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-xl hover:shadow-2xl transition-shadow duration-500">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Cliente</th>
              <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Status API</th>
              <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Última Verificação</th>
              <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Detalhes do Retorno</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredClients.map((client) => (
              <tr key={client.id} className="group hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-5">
                  <p className="text-sm font-bold text-slate-800 leading-tight group-hover:text-gax-blue transition-colors">{client.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium">ID: {client.id.slice(0, 8)}</p>
                </td>
                <td className="px-6 py-5">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm border",
                    client.api_status === 'online' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    client.api_status === 'offline' ? "bg-rose-50 text-rose-600 border-rose-100" :
                    "bg-slate-100 text-slate-500 border-slate-200"
                  )}>
                    {client.api_status === 'online' && <CheckCircle2 size={10} />}
                    {client.api_status === 'offline' && <AlertTriangle size={10} />}
                    {client.api_status === 'online' ? 'Online' : client.api_status === 'offline' ? 'Offline' : 'Desconhecido'}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Clock size={14} className="text-slate-300" />
                    <span className="text-xs font-medium">{client.api_last_check || "-"}</span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-start gap-2 max-w-sm">
                    <MessageSquare size={14} className="mt-0.5 text-slate-300 shrink-0" />
                    <p className="text-[11px] text-slate-600 leading-relaxed font-medium italic">
                      {client.api_last_message || "Sem histórico recente."}
                    </p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredClients.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50/20">
            <Shield size={48} className="text-slate-200 mb-4" />
            <p className="text-sm font-bold text-slate-400">Nenhum cliente encontrado para os filtros atuais.</p>
          </div>
        )}
      </div>
    </div>
  );
}
