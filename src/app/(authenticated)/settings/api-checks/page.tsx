"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Search, Filter, CheckCircle, XCircle, Clock, Terminal, X, Info, ChevronRight, Activity } from "lucide-react";

interface ClientConfig {
  id: string;
  name: string;
  url_sistema: string;
  api_status: 'online' | 'offline' | 'error' | 'pending';
  last_check_message: string;
  last_check_at: string;
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
  
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTaskId) {
      interval = setInterval(fetchTaskStatus, 2000);
      fetchTaskLogs(); // Busca inicial
    }
    return () => clearInterval(interval);
  }, [activeTaskId]);

  useEffect(() => {
    if (showLogs && activeTaskId) {
      const logInterval = setInterval(fetchTaskLogs, 3000);
      return () => clearInterval(logInterval);
    }
  }, [showLogs, activeTaskId]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [taskLogs, showLogs]);

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      // Para esta tela de configuração, buscamos os primeiros 100 para garantir visibilidade, 
      // ou suportamos busca se necessário.
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
        fetchTaskLogs(); // Busca final dos logs
      }
    } catch (error) {
      console.error("Erro ao buscar status da tarefa:", error);
    }
  };

  const fetchTaskLogs = async () => {
    if (!activeTaskId) return;
    try {
      const res = await fetch(`/api/task/${activeTaskId}/logs`);
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
    // NÃO abre o log automaticamente agora
    
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

  const handleRunSingleCheck = async (clientId: string) => {
    if (isExecuting) return;
    setIsExecuting(true);
    setActiveTask(null);
    setTaskLogs([]);
    // NÃO abre o log automaticamente agora
    
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

  // Cálculo de progresso
  const progressPercent = activeTask?.total && activeTask.total > 0 
    ? Math.round((activeTask.current || 0) / activeTask.total * 100) 
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Monitoramento de APIs</h1>
          <p className="text-slate-500 mt-1">Verificação automática de conexões com os portais RSUS</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchClients}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
          >
            Atualizar Lista
          </button>
          <button 
            onClick={handleRunBatchCheck}
            disabled={isExecuting}
            className={`px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 font-medium ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Zap className={`w-4 h-4 ${isExecuting ? 'animate-pulse' : ''}`} />
            Executar Checagem Geral
          </button>
        </div>
      </div>

      {/* Progress Section (Condicional) */}
      {isExecuting && activeTask && (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-indigo-100 overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 w-full space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      {activeTask.total && activeTask.total > 1 ? 'Processando Lote...' : 'Processando Cliente...'}
                      <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded">ID: {activeTaskId?.substring(0,8)}</span>
                    </h4>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5 font-medium">
                      Atual: <span className="text-indigo-600 font-bold">{activeTask.current_client || 'Iniciando...'}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-slate-900">{progressPercent}%</span>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{activeTask.current} de {activeTask.total} concluídos</p>
                </div>
              </div>

              {/* Enhanced Progress Bar */}
              <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.3)] transition-all duration-700 cubic-bezier(0.4, 0, 0.2, 1)"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress_1s_linear_infinite]" />
                </div>
              </div>

              {/* Summary Log View */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                 <span className="text-[13px] text-slate-600 font-medium truncate italic h-5">
                    {activeTask.last_log || "Aguardando primeira resposta do robô..."}
                 </span>
              </div>
            </div>

            <div className="shrink-0">
               <button 
                 onClick={() => setShowLogs(true)}
                 className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 group/btn"
               >
                 <Terminal className="w-4 h-4 group-hover/btn:rotate-12 transition-transform" />
                 Ver Log Detalhado
                 <ChevronRight className="w-4 h-4 opacity-50 group-hover/btn:translate-x-1 transition-transform" />
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
            <Filter className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total de Clientes</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-emerald-100 rounded-lg text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Conexões Ativas</p>
            <p className="text-2xl font-bold text-slate-900">{stats.online}</p>
          </div>
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
              placeholder="Pesquisar cliente..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-sm"
            >
              <option value="all">Todos os Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="error">Erro</option>
              <option value="pending">Pendente</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 border-b border-slate-100">Cliente</th>
                <th className="px-6 py-4 border-b border-slate-100">Status API</th>
                <th className="px-6 py-4 border-b border-slate-100">Última Verificação</th>
                <th className="px-6 py-4 border-b border-slate-100">Mensagem de Retorno</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin"></div>
                      <p className="text-sm font-medium">Carregando conexões...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    Nenhum cliente encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : filteredClients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800">{client.name}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[200px]">{client.url_sistema}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {client.api_status === 'online' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold ring-1 ring-inset ring-emerald-600/20">
                        <CheckCircle className="w-3.5 h-3.5" /> ONLINE
                      </span>
                    ) : client.api_status === 'offline' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold ring-1 ring-inset ring-rose-600/20">
                        <XCircle className="w-3.5 h-3.5" /> OFFLINE
                      </span>
                    ) : client.api_status === 'error' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold ring-1 ring-inset ring-amber-600/20">
                        <Clock className="w-3.5 h-3.5" /> ERRO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold ring-1 ring-inset ring-slate-400/20 lowercase first-letter:uppercase">
                        <Terminal className="w-3.5 h-3.5" /> Desconhecido
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {client.last_check_at ? new Date(client.last_check_at).toLocaleString('pt-BR') : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-600 italic block truncate max-w-[250px]" title={client.last_check_message}>
                      {client.last_check_message || "Aguardando primeira checagem."}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleRunSingleCheck(client.id)}
                      disabled={isExecuting}
                      title="Testar API Agora"
                      className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-30"
                    >
                      <Zap className={`w-5 h-5 ${isExecuting && activeTaskId?.includes(client.id) ? 'animate-bounce' : ''}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILED LOG MODAL */}
      {showLogs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-lg shadow-indigo-200">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Console Técnico</h3>
                  <p className="text-xs text-slate-500">Logs detalhados do robô [Playwright Engine]</p>
                </div>
              </div>
              <button 
                onClick={() => setShowLogs(false)}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Logs Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-white scrollbar-thin scrollbar-thumb-slate-200">
              {taskLogs.length > 0 ? (
                taskLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                        log.level === 'ERROR' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                        log.level === 'SUCCESS' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                        'bg-indigo-400'
                      }`} />
                      {idx < taskLogs.length - 1 && (
                        <div className="w-px flex-1 bg-slate-100 my-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                       <span className="text-[10px] text-indigo-400 font-bold font-mono mr-2 uppercase tracking-tighter bg-indigo-50 px-1.5 py-0.5 rounded">
                           {log.level || 'INFO'}
                       </span>
                      <div className="flex items-baseline justify-between gap-2 mt-1">
                        <span className={`text-[13.5px] font-medium leading-relaxed ${
                          log.level === 'ERROR' ? 'text-rose-700' :
                          log.level === 'SUCCESS' ? 'text-emerald-700' :
                          'text-slate-700'
                        }`}>
                          {log.message}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                          {log.timestamp}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p className="text-sm italic">Sincronizando logs...</p>
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50 gap-3">
              <button 
                onClick={() => setShowLogs(false)}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-xl transition-all"
              >
                Minimizar Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles for progress animation */}
      <style jsx global>{`
        @keyframes progress {
          0% { background-position: 0 0; }
          100% { background-position: 40px 0; }
        }
      `}</style>
    </div>
  );
}
