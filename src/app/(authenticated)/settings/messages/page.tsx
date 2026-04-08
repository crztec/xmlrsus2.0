"use client";

import React, { useState, useEffect } from "react";
import { 
  Send, 
  History, 
  Plus, 
  Trash2, 
  Save, 
  Users as UsersIcon, 
  ShieldAlert, 
  FileWarning, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  RefreshCw,
  Copy,
  MessageSquare,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  content: string;
}

interface MessageLog {
  id?: string;
  created_at: string;
  client_name: string;
  recipient: string;
  message: string;
  status: "SUCCESS" | "ERROR";
  error_details?: string;
}

interface ClientSummary {
  id: string;
  name: string;
  api_status: string;
  abi_status: string;
  whatsapp_numbers: string[];
}

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  
  // New Message State
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({
    client_id: "",
    api_offline: false,
    abi_pending: false,
    abi_missing: false,
    abi_failed: false
  });
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{success: boolean, message: string} | null>(null);

  // Template Management
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template>>({ name: "", content: "" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const logsPerPage = 10;

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [templRes, clientRes] = await Promise.all([
        fetch("/api/messages/templates"),
        fetch("/api/clients?limit=1000")
      ]);
      
      const templData = await templRes.json();
      const clientData = await clientRes.json();
      
      setTemplates(Array.isArray(templData) ? templData : []);
      setClients(clientData.clients || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async (page: number) => {
    setIsLogsLoading(true);
    try {
      const res = await fetch(`/api/messages/logs?page=${page}&limit=${logsPerPage}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotalLogs(data.total || 0);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      fetchLogs(currentPage);
    }
  }, [activeTab, currentPage]);

  // Filtering Logic
  const targetClients = clients.filter(c => {
    // Se selecionou cliente específico, ignora outros filtros
    if (filters.client_id) return c.id === filters.client_id;
    
    // Se nenhum filtro especial, retorna falso por padrão (ou true se "Todos os Clientes" for o default)
    // Vamos considerar que se nenhum checkbox está marcado, retorna TODOS SE o dropdown não tiver selecionado.
    // Mas o usuário quer filtros cruzados.
    
    const matchesApi = filters.api_offline ? c.api_status === "offline" : true;
    const s = c.abi_status?.toLowerCase() || "";
    const matchesPending = filters.abi_pending ? s.includes("pendente") : true;
    const matchesMissing = filters.abi_missing ? s.includes("falta") : true;
    const matchesFailed = filters.abi_failed ? s.includes("falha") : true;
    
    // Se o usuário não marcou nenhum filtro de checkbox, desconsideramos os filtros parciais
    const hasAnyCheckbox = filters.api_offline || filters.abi_pending || filters.abi_missing || filters.abi_failed;
    
    if (!hasAnyCheckbox) return true; // Retorna todos
    
    return (filters.api_offline ? c.api_status === "offline" : false) ||
           (filters.abi_pending ? s.includes("pendente") : false) ||
           (filters.abi_missing ? s.includes("falta") : false) ||
           (filters.abi_failed ? s.includes("falha") : false);
  });

  const totalNumbers = targetClients.reduce((acc, c) => acc + (c.whatsapp_numbers?.length || 0), 0);

  const handleSendBroadcast = async () => {
    if (!message || totalNumbers === 0) return;
    
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/messages/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, message })
      });
      const data = await res.json();
      
      if (res.ok) {
        setSendResult({ success: true, message: data.message });
        setMessage("");
      } else {
        setSendResult({ success: false, message: data.detail || "Erro ao disparar mensagens." });
      }
    } catch (err) {
      setSendResult({ success: false, message: "Erro de conexão com o servidor." });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate.name || !editingTemplate.content) return;
    
    try {
      const res = await fetch("/api/messages/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingTemplate)
      });
      if (res.ok) {
        fetchData();
        setIsTemplateModalOpen(false);
        setEditingTemplate({ name: "", content: "" });
      }
    } catch (err) {
      console.error("Erro ao salvar template:", err);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Excluir este template?")) return;
    try {
      const res = await fetch(`/api/messages/templates/${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Erro ao deletar:", err);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      {/* Tab Switcher */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white p-1.5 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab("new")}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-bold text-xs",
            activeTab === "new" 
              ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" 
              : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          )}
        >
          <Send size={16} />
          Nova Mensagem
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-bold text-xs",
            activeTab === "history" 
              ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" 
              : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          )}
        >
          <History size={16} />
          Histórico de Envios
        </button>
      </div>

      {activeTab === "new" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Filters and Target Summary */}
          <div className="lg:col-span-1 space-y-6">
            <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Filter size={16} className="text-gax-blue" />
                Filtros Inteligentes
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Cliente Específico</label>
                  <select 
                    value={filters.client_id}
                    onChange={(e) => setFilters({...filters, client_id: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 outline-none transition-all"
                  >
                    <option value="">-- Todos os Clientes --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className={cn("space-y-3", filters.client_id ? "opacity-30 pointer-events-none" : "")}>
                   <div className="flex items-center gap-3">
                    <input 
                      id="f-api" 
                      type="checkbox" 
                      checked={filters.api_offline} 
                      onChange={(e) => setFilters({...filters, api_offline: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-api" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <ShieldAlert size={14} className="text-rose-500" />
                      API Offline (Erro)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      id="f-pending" 
                      type="checkbox" 
                      checked={filters.abi_pending} 
                      onChange={(e) => setFilters({...filters, abi_pending: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-pending" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <Loader2 size={14} className="text-amber-500" />
                      ABI: Pendente Importação
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      id="f-missing" 
                      type="checkbox" 
                      checked={filters.abi_missing} 
                      onChange={(e) => setFilters({...filters, abi_missing: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-missing" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <FileWarning size={14} className="text-orange-500" />
                      ABI: Falta Analisar
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      id="f-failed" 
                      type="checkbox" 
                      checked={filters.abi_failed} 
                      onChange={(e) => setFilters({...filters, abi_failed: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-failed" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <XCircle size={14} className="text-red-500" />
                      ABI: Falha na Análise
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200/60 bg-gax-blue/5 p-6 shadow-sm border-dashed">
              <h3 className="text-xs font-bold text-gax-blue mb-2">Resumo do Destinatário</h3>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-black text-gax-blue">{targetClients.length}</span>
                <span className="text-xs font-bold text-slate-500 mb-1">Clientes selecionados</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gax-blue/70 font-medium">
                <UsersIcon size={14} />
                {totalNumbers} contatos encontrados
              </div>
            </section>
          </div>

          {/* Right Column: Templates and Composer */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Template Manager */}
            <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <LayoutGrid size={16} className="text-gax-blue" />
                  Templates Salvos
                </h3>
                <button 
                  onClick={() => {
                    setEditingTemplate({ name: "", content: "" });
                    setIsTemplateModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-gax-blue hover:text-gax-blue-hover transition-colors"
                >
                  <Plus size={14} />
                  Novo Template
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {templates.map(t => (
                  <div key={t.id} className="group relative flex shrink-0 flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:border-gax-blue/30 hover:bg-white w-[180px]">
                    <div className="flex items-center justify-between">
                       <span className="truncate text-xs font-bold text-slate-800 pr-4">{t.name}</span>
                       <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button 
                            onClick={() => {
                              setEditingTemplate(t);
                              setIsTemplateModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-gax-blue"
                          ><Save size={12} /></button>
                          <button 
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="p-1 text-slate-400 hover:text-red-500"
                          ><Trash2 size={12} /></button>
                       </div>
                    </div>
                    <p className="line-clamp-2 text-[10px] text-slate-500">{t.content}</p>
                    <button 
                      onClick={() => setMessage(t.content)}
                      className="mt-2 w-full rouded-lg bg-white border border-slate-200 py-1.5 text-[10px] font-bold text-gax-blue hover:bg-gax-blue hover:text-white transition-all rounded-lg"
                    >
                      Selecionar
                    </button>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-xs text-slate-300 italic py-4">Nenhum template cadastrado.</p>
                )}
              </div>
            </section>

            {/* Composer */}
            <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <MessageSquare size={16} className="text-gax-blue" />
                Compor Mensagem
              </h3>
              
              <div className="relative">
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full min-h-[220px] rounded-2xl border border-slate-200 bg-slate-50/30 p-5 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 resize-none"
                  placeholder="Digite sua mensagem de broadcast aqui..."
                  maxLength={4000}
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-4">
                  <span className={cn(
                    "text-[10px] font-bold",
                    message.length > 3900 ? "text-rose-500" : "text-slate-400"
                  )}>
                    {message.length} / 4000
                  </span>
                </div>
              </div>

              {sendResult && (
                <div className={cn(
                  "mt-4 rounded-xl p-3 text-xs font-bold border flex items-center gap-2 animate-in slide-in-from-top-2",
                  sendResult.success ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                )}>
                  {sendResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {sendResult.message}
                </div>
              )}

              <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
                 <button 
                  onClick={handleSendBroadcast}
                  disabled={isSending || !message || totalNumbers === 0}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gax-blue py-3.5 text-sm font-bold text-white shadow-xl shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover active:scale-[0.98] disabled:opacity-50"
                >
                  {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  {isSending ? "Iniciando Disparo..." : "Enviar Broadcast Agora"}
                </button>
                <div className="text-[10px] text-slate-400 italic text-center sm:text-left leading-tight hidden sm:block">
                  Atenção: O disparo será realizado em lote respeitando intervalos para evitar o bloqueio da conta.
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
           {/* Summary Stats for History - Optional but looks premium */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-3xl border border-slate-200/60 bg-white p-4 shadow-sm flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gax-blue/10 text-gax-blue">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total de Envios</p>
                  <p className="text-xl font-bold text-slate-800">{totalLogs}</p>
                </div>
              </div>
              {/* More stats could go here */}
           </div>

           <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-sm">
             <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data / Hora</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Destinatário</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Mensagem (Resumo)</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {isLogsLoading ? (
                     <tr><td colSpan={4} className="px-6 py-20 text-center"><Loader2 className="animate-spin inline text-gax-blue" size={32} /></td></tr>
                   ) : logs.map((log, idx) => (
                      <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs font-medium text-slate-500">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{log.client_name}</span>
                            <span className="text-[10px] font-medium text-slate-400 tracking-tight">{log.recipient}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="max-w-[300px] truncate text-xs text-slate-600 font-medium" title={log.message}>
                            {log.message}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                             <span className={cn(
                               "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border",
                               log.status === "SUCCESS" 
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100/50" 
                                : "bg-rose-50 text-rose-600 border-rose-100/50"
                             )}>
                               {log.status === "SUCCESS" ? "Enviado" : "Erro"}
                             </span>
                             {log.error_details && (
                               <span title={log.error_details}>
                                 <ShieldAlert size={14} className="text-rose-400" />
                               </span>
                             )}
                          </div>
                        </td>
                      </tr>
                   ))}
                   {!isLogsLoading && logs.length === 0 && (
                     <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-400 italic">Nenhum disparo registrado ainda.</td></tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>

           {/* Paginação */}
           {totalLogs > logsPerPage && (
             <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="text-xs font-medium text-slate-500">
                  Mostrando {(currentPage - 1) * logsPerPage + 1} a {Math.min(currentPage * logsPerPage, totalLogs)} de {totalLogs} registros
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-xs font-bold text-slate-700 px-2">{currentPage} / {Math.ceil(totalLogs / logsPerPage)}</span>
                  <button 
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    disabled={currentPage >= Math.ceil(totalLogs / logsPerPage)}
                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
             </div>
           )}
        </div>
      )}

      {/* Template Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Template de Mensagem</h3>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Nome do Template</label>
                <input 
                  type="text" 
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all"
                  placeholder="Ex: Aviso de Manutenção"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Conteúdo da Mensagem</label>
                <textarea 
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})}
                  className="w-full min-h-[200px] rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 resize-none"
                  placeholder="Olá, viemos informar que..."
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >Cancelar</button>
                <button 
                  onClick={handleSaveTemplate}
                  className="flex-[2] rounded-xl bg-gax-blue py-3 text-sm font-bold text-white shadow-lg shadow-gax-blue/20 hover:bg-gax-blue-hover transition-all"
                >Salvar Template</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
