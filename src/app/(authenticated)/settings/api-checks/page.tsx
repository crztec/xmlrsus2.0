"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Search, Filter, CheckCircle, XCircle, Clock, Terminal, X, Info, ChevronRight, Activity, Camera, MoreHorizontal, RotateCcw, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientConfig {
  id: string;
  name: string;
  url_sistema: string;
  api_status: 'online' | 'offline' | 'error' | 'pending';
  api_last_message: string;
  api_last_check: string;
  api_status_history?: string[];
  api_last_task_id?: string;
  api_last_screenshot_url?: string;
}

interface TaskLog {
  timestamp: string;
  message: string;
  level?: string;
}

interface Task {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current?: number;
  total?: number;
  current_client?: string;
  last_log?: string;
  created_at: string;
  completed_at?: string;
}

export default function ApiChecksPage() {
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Advanced States
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const [selectedClientMessage, setSelectedClientMessage] = useState<string | null>(null);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchClients();
    
    // Auto-close dropdown on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTaskId) {
      interval = setInterval(fetchTaskStatus, 2000);
      fetchTaskLogs(activeTaskId); // Initial fetch
    }
    return () => clearInterval(interval);
  }, [activeTaskId]);

  useEffect(() => {
    if (showLogs && (activeTaskId || viewingTaskId)) {
      const targetId = viewingTaskId || activeTaskId;
      if (!targetId) return;
      const logInterval = setInterval(() => fetchTaskLogs(targetId), 3000);
      return () => clearInterval(logInterval);
    }
  }, [showLogs, activeTaskId, viewingTaskId]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [taskLogs, showLogs]);

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/clients?limit=100&search=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch (error) {
      console.error("Erro ao buscar clientes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTaskStatus = async () => {
    if (!activeTaskId) return;
    try {
      const res = await fetch(`/api/task/${activeTaskId}`);
      const data = await res.json();
      setActiveTask(data);
      
      if (data.status === 'completed' || data.status === 'failed') {
        setActiveTaskId(null);
        setIsExecuting(false);
        fetchClients(); // Refresh statuses
        fetchTaskLogs(activeTaskId); 
      }
    } catch (error) {
      console.error("Erro ao buscar status da tarefa:", error);
    }
  };

  const fetchTaskLogs = async (taskId: string) => {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/task/${taskId}/logs`);
      const data = await res.json();
      setTaskLogs(data);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    }
  };

  const handleRunBatchCheck = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setActiveTask(null);
    setTaskLogs([]);
    
    try {
      const res = await fetch("/api/check-integrations", { method: "POST" });
      const data = await res.json();
      if (data.task_id) {
        setActiveTaskId(data.task_id);
      }
    } catch (error) {
      alert("Erro ao disparar checagem geral.");
      setIsExecuting(false);
    }
  };

  const handleRunFailedChecks = async () => {
    if (isExecuting) return;
    const failedOnes = clients.filter(c => c.api_status !== 'online').map(c => c.id);
    if (failedOnes.length === 0) {
      alert("Não há clientes com falha ou offline no momento.");
      return;
    }
    
    setIsExecuting(true);
    setActiveTask(null);
    setTaskLogs([]);
    
    try {
      // Disparamos um lote específico (ou o robot detecta se passarmos os IDs)
      // Por simplicidade aqui, dispararemos a checagem geral mas a lógica do botão foca nos falhos.
      const res = await fetch("/api/check-integrations", { 
        method: "POST",
        body: JSON.stringify({ client_ids: failedOnes }),
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.task_id) {
        setActiveTaskId(data.task_id);
      }
    } catch (error) {
      alert("Erro ao disparar checagem de falhas.");
      setIsExecuting(false);
    }
  };

  const handleRunSingleCheck = async (clientId: string) => {
    if (isExecuting) return;
    setIsExecuting(true);
    setActiveTask(null);
    setTaskLogs([]);
    setOpenMenuId(null);
    
    try {
      const res = await fetch(`/api/check-integration/${clientId}`, { method: "POST" });
      const data = await res.json();
      if (data.task_id) {
        setActiveTaskId(data.task_id);
      }
    } catch (error) {
      alert("Erro ao disparar checagem individual.");
      setIsExecuting(false);
    }
  };

  const openPastLogs = (taskId: string, message?: string) => {
    setViewingTaskId(taskId);
    setSelectedClientMessage(message || null);
    setTaskLogs([]);
    setShowLogs(true);
    setOpenMenuId(null);
    fetchTaskLogs(taskId);
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

  const progressPercent = activeTask?.total && activeTask.total > 0 
    ? Math.round((activeTask.current || 0) / activeTask.total * 100) 
    : 0;

  // Mini Component: Uptime Map (15 Squares)
  const UptimeChart = ({ history }: { history?: string[] }) => {
    // We want 15 squares. Fill with 'empty' if fewer.
    const displayHistory = Array(15).fill('empty');
    if (history) {
      history.slice(-15).forEach((status, i) => {
        displayHistory[15 - history.slice(-15).length + i] = status;
      });
    }

    return (
      <div className="flex gap-[2px]">
        {displayHistory.map((status, idx) => (
          <div 
            key={idx} 
            className={`w-1.5 h-4 rounded-[1px] transition-colors duration-300 ${
              status === 'online' ? 'bg-emerald-400' : 
              status === 'offline' || status === 'error' ? 'bg-rose-400' : 
              'bg-slate-200'
            }`}
            title={status === 'empty' ? 'Sem dados' : status.toUpperCase()}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">
        <div className="flex gap-3">
          <button 
            onClick={fetchClients}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
          >
            Atualizar
          </button>
          <button 
            onClick={handleRunFailedChecks}
            disabled={isExecuting}
            className="px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 transition-all shadow-sm flex items-center gap-2 font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Re-testar Falhas
          </button>
          <button 
            onClick={handleRunBatchCheck}
            disabled={isExecuting}
            className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 font-medium ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Zap className={`w-4 h-4 ${isExecuting ? 'animate-pulse' : ''}`} />
            Executar Lote Completo
          </button>
        </div>
      </div>

      {/* Progress Section */}
      {isExecuting && activeTask && (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-blue-100 overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 w-full space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                       {activeTask.total && activeTask.total > 1 ? 'Processando Lote...' : 'Processando Cliente...'}
                       <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded">ID: {activeTaskId?.substring(0,8)}</span>
                    </h4>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5 font-medium">
                      Atual: <span className="text-blue-600 font-bold">{activeTask.current_client || 'Iniciando...'}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-slate-900">{progressPercent}%</span>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{activeTask.current} de {activeTask.total}</p>
                </div>
              </div>

              <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                >
                   <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress_1s_linear_infinite]" />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                 <span className="text-[13px] text-slate-600 font-medium truncate italic h-5">
                    {activeTask.last_log || "Sincronizando com o robô..."}
                 </span>
              </div>
            </div>

            <div className="shrink-0">
               <button 
                 onClick={() => { setViewingTaskId(null); setShowLogs(true); }}
                 className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 group/btn"
               >
                 <Terminal className="w-4 h-4 group-hover/btn:rotate-12 transition-transform" />
                 Console Técnico
                 <ChevronRight className="w-4 h-4 opacity-50 group-hover/btn:translate-x-1 transition-transform" />
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
            <Filter className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total de Clientes</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 relative overflow-hidden group">
          <div className="p-3 bg-emerald-100 rounded-lg text-emerald-600 relative z-10">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="relative z-10">
            <p className="text-sm text-slate-500 font-medium font-bold">Conexões Ativas</p>
            <p className="text-2xl font-bold text-slate-900 flex items-center gap-2">
               {stats.online}
               <span className="flex h-3 w-3 relative">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
               </span>
            </p>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform duration-500" />
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-rose-100 rounded-lg text-rose-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Falhas Detectadas</p>
            <p className="text-2xl font-bold text-slate-900">{stats.offline + (clients.filter(c => c.api_status === 'error').length)}</p>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between bg-slate-50/50">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtro rápido (Nome ou CNPJ)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-sm font-bold text-slate-700"
            >
              <option value="all">Filtro: Todos os Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="error">Erro</option>
              <option value="pending">Pendente</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto overflow-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase tracking-wider font-extrabold">
                <th className="px-6 py-4 border-b border-slate-100">Cliente</th>
                <th className="px-6 py-4 border-b border-slate-100">Status</th>
                <th className="px-6 py-4 border-b border-slate-100">Uptime (24h)</th>
                <th className="px-6 py-4 border-b border-slate-100">Última Verificação</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Carregando painel de monitoramento...</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">Nenhum registro para o filtro selecionado.</td></tr>
              ) : filteredClients.map((client) => (
                <tr key={client.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 text-sm">{client.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono italic">{client.url_sistema}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {client.api_status === 'online' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black ring-1 ring-inset ring-emerald-600/20 uppercase">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Online
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black ring-1 ring-inset uppercase ${
                          client.api_status === 'error' || client.api_status === 'offline' ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : 'bg-slate-100 text-slate-500 ring-slate-400/20'
                        }`}>
                          {client.api_status || 'Pendente'}
                        </span>
                        {(client.api_status === 'error' || client.api_status === 'offline') && client.api_last_screenshot_url && (
                          <button onClick={() => setSelectedScreenshot(client.api_last_screenshot_url || null)} className="p-1 hover:bg-rose-100 rounded text-rose-500 transition-colors animate-pulse" title="Ver Screenshot da Falha">
                            <Camera className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                     <UptimeChart history={client.api_status_history} />
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                    {client.api_last_check && client.api_last_check !== '-' ? formatDistanceToNow(new Date(client.api_last_check), { addSuffix: true, locale: ptBR }) : "Nunca checado"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative inline-block text-left" ref={openMenuId === client.id ? dropdownRef : null}>
                      <button onClick={() => setOpenMenuId(openMenuId === client.id ? null : client.id)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      
                      {openMenuId === client.id && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-blue-50 z-50 overflow-hidden animate-in zoom-in-95 duration-100 origin-top-right">
                           <button 
                             onClick={() => handleRunSingleCheck(client.id)}
                             className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-blue-600 hover:text-white transition-colors"
                           >
                              <Zap className="w-4 h-4" /> Testar API Agora
                           </button>
                            {client.api_last_task_id && (
                              <button 
                                onClick={() => openPastLogs(client.api_last_task_id!, client.api_last_message)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-blue-600 hover:text-white transition-colors border-t border-slate-50"
                              >
                                 <FileText className="w-4 h-4" /> Visualizar Log
                              </button>
                            )}
                           {client.api_last_screenshot_url && (
                             <button 
                               onClick={() => { setSelectedScreenshot(client.api_last_screenshot_url!); setOpenMenuId(null); }}
                               className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-blue-600 hover:text-white transition-colors border-t border-slate-50"
                             >
                                <Camera className="w-4 h-4" /> Ver Screenshot
                             </button>
                           )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILED LOG MODAL */}
      {showLogs && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-blue-100 flex flex-col max-h-[85vh] overflow-hidden zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 text-white rounded-lg shadow-lg">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Console Técnico</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">{viewingTaskId ? 'Visualizando Histórico' : 'Monitoramento em Tempo Real'}</p>
                    {selectedClientMessage && (
                      <>
                        <span className="text-slate-300">|</span>
                        <p className="text-[10px] text-rose-500 font-bold uppercase truncate max-w-[300px]" title={selectedClientMessage}>{selectedClientMessage}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => { setShowLogs(false); setViewingTaskId(null); setSelectedClientMessage(null); }} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30 scrollbar-thin scrollbar-thumb-blue-200">
              {taskLogs.length > 0 ? (
                taskLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                        log.level === 'ERROR' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                        log.level === 'SUCCESS' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                        log.level === 'WARNING' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                        'bg-blue-400'
                      }`} />
                      {idx < taskLogs.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
                    </div>
                    <div className="flex-1 pb-2">
                       <span className={`text-[9px] font-black mr-2 uppercase tracking-tighter px-1.5 py-0.5 rounded ${
                         log.level === 'ERROR' ? 'bg-rose-100 text-rose-700' : 
                         log.level === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' :
                         'bg-blue-50 text-blue-700'
                       }`}>
                           {log.level || 'INFO'}
                       </span>
                      <div className="flex items-baseline justify-between gap-2 mt-1">
                        <span className={`text-[13.5px] font-medium leading-relaxed ${
                          log.level === 'ERROR' ? 'text-rose-700' : 'text-slate-700'
                        }`}>
                          {log.message}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono italic">{log.timestamp}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <p className="text-sm italic">Carregando logs do armazenamento...</p>
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50 gap-3">
              <button 
                onClick={() => { setShowLogs(false); setViewingTaskId(null); setSelectedClientMessage(null); }}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-xl transition-all"
              >
                Fechar Console
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCREENSHOT MODAL */}
      {selectedScreenshot && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="relative max-w-5xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 zoom-in-95 duration-200">
             <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button 
                  onClick={() => setSelectedScreenshot(null)}
                  className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
             </div>
             <div className="p-1">
               <img 
                 src={selectedScreenshot} 
                 alt="Screenshot de Falha" 
                 className="w-full h-auto rounded-xl object-contain max-h-[85vh]"
               />
               <div className="p-4 bg-slate-900/80 backdrop-blur text-white">
                  <div className="flex items-center gap-2 text-rose-400 font-bold uppercase text-xs">
                     <Camera className="w-4 h-4" /> Forense: Captura de Falha Detectada
                  </div>
                  <p className="text-sm text-slate-400 mt-1">Esta imagem mostra o que o robô visualizou no portal RSUS no momento em que a falha foi detectada.</p>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Global CSS for progress and pulses */}
      <style jsx global>{`
        @keyframes progress {
          0% { background-position: 0 0; }
          100% { background-position: 40px 0; }
        }
      `}</style>
    </div>
  );
}
