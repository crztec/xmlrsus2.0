"use client";

import { useState, useEffect, useRef } from "react";
import {
  Zap, Search, CheckCircle2, XCircle, Clock, Terminal, X,
  ChevronLeft, ChevronRight, Activity, Camera, MoreHorizontal,
  RotateCcw, FileText, Ban, RefreshCw, Loader2, ShieldCheck, History, Play, ExternalLink
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs, updateDoc } from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
  group_name?: string;
}

interface TaskLog {
  timestamp: string;
  message: string;
  level?: string;
}

interface Task {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  current?: number;
  total?: number;
  current_client?: string;
  progress_percent?: number;
  last_log?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export default function ApiChecksPage() {
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [modalTitle, setModalTitle] = useState("Console Técnico");
  const [isExecuting, setIsExecuting] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [selectedClientMessage, setSelectedClientMessage] = useState<string | null>(null);
  const [logFilterClient, setLogFilterClient] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchClients();

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    const checkActiveTask = async () => {
      try {
        const q = query(collection(db, "tasks"), where("status", "==", "running"), limit(10));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const validTypes = ["api_check_batch", "batch_api_check", "api_check_single", "single_api_check"];
          const now = new Date();
          const hardLimitMs = 4 * 60 * 60 * 1000;
          const activeTasks = querySnapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter(t => {
              if (!validTypes.includes(t.type)) return false;
              const createdDate = t.created_at ? new Date(t.created_at.replace(/-/g, "/")) : new Date(0);
              return (now.getTime() - createdDate.getTime()) < hardLimitMs;
            })
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
          if (activeTasks.length > 0) {
            setActiveTaskId(activeTasks[0].id);
            setActiveTask(activeTasks[0]);
            setIsExecuting(true);
          }
        }

        // Tenta também via endpoint de persistência dedicada (igual ao ABI)
        const res = await fetch("/api/active-task/api");
        if (res.ok) {
          const data = await res.json();
          if (data.id && data.status === 'running') {
            setActiveTaskId(data.id);
            setActiveTask(data);
            setIsExecuting(true);
          }
        }
      } catch (err) {
        console.error("Erro ao persistir tarefa:", err);
      }
    };
    checkActiveTask();

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Polling logs e status em tempo real (Igual ao ABI)
  useEffect(() => {
    let interval: any;
    if (activeTaskId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/task/${activeTaskId}`);
          if (res.ok) {
            const data = await res.json() as Task;
            setActiveTask(data);
            setIsExecuting(true);
            
            if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
              clearInterval(interval);
              fetchClients();
              // Não limpa imediatamente para evitar o flicker
              setTimeout(() => {
                // Só limpa se o console não estiver aberto visualizando ESTA tarefa
                if (!showLogs || viewingTaskId !== activeTaskId) {
                  setActiveTaskId(null);
                  setIsExecuting(false);
                }
              }, 5000);
            }
          }
        } catch (err) {
          console.error("Erro polling status API:", err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [activeTaskId, showLogs, viewingTaskId]);

  useEffect(() => {
    if (showLogs && (activeTaskId || viewingTaskId)) {
      const targetId = viewingTaskId || activeTaskId;
      if (!targetId) return;
      const logInterval = setInterval(() => fetchTaskLogs(targetId), 3000);
      return () => clearInterval(logInterval);
    }
  }, [showLogs, activeTaskId, viewingTaskId]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [taskLogs, showLogs]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus]);

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

  const fetchTaskLogs = async (taskId: string) => {
    if (!taskId || taskId === "history") return;
    try {
      const res = await fetch(`/api/task/${taskId}/logs`);
      const data = await res.json();
      setTaskLogs(data);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    }
  };

  const handleStopCheck = async () => {
    if (!activeTaskId) return;
    if (!confirm("Deseja realmente interromper a checagem?")) return;
    try {
      await updateDoc(doc(db, "tasks", activeTaskId), {
        status: "cancelled",
        updated_at: new Date().toISOString()
      });
      setIsExecuting(false);
      setActiveTaskId(null);
    } catch (error) {
      alert("Erro ao solicitar cancelamento.");
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
        setActiveTask({
          id: data.task_id,
          status: 'running',
          type: 'api_check_batch',
          progress_percent: 1,
          current_client: 'Iniciando lote...',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as any);
      }
    } catch {
      alert("Erro ao disparar checagem geral.");
      setIsExecuting(false);
    }
  };

  const handleRunFailedChecks = async () => {
    if (isExecuting) return;
    const failedOnes = clients.filter(c => c.api_status !== 'online').map(c => c.id);
    if (failedOnes.length === 0) { alert("Não há clientes com falha."); return; }
    setIsExecuting(true);
    setActiveTask(null);
    setTaskLogs([]);
    try {
      const res = await fetch("/api/check-integrations", {
        method: "POST",
        body: JSON.stringify({ client_ids: failedOnes }),
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.task_id) {
        setActiveTaskId(data.task_id);
        setActiveTask({
          id: data.task_id,
          status: 'running',
          type: 'api_check_batch',
          progress_percent: 1,
          current_client: 'Re-testando falhas...',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as any);
      }
    } catch {
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
        setActiveTask({
          id: data.task_id,
          status: 'running',
          type: 'api_check_single',
          progress_percent: 5,
          current_client: 'Iniciando...',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as any);
      }
    } catch {
      alert("Erro ao disparar checagem individual.");
      setIsExecuting(false);
    }
  };

  const openDetailedLogs = async (taskId: string, title: string, clientName?: string) => {
    setViewingTaskId(taskId);
    setModalTitle(title);
    setShowLogs(true);
    setTaskLogs([]);
    setLogFilterClient(clientName || null);
    setOpenMenuId(null);
    fetchTaskLogs(taskId);
  };

  const handleViewGlobalLog = async () => {
    setViewingTaskId("history");
    setModalTitle("Histórico Recente de APIs");
    setShowLogs(true);
    setTaskLogs([]);
    setLogFilterClient(null);
    setSelectedClientMessage("Log Completo do Sistema (Últimos 5)");
    
    try {
      const res = await fetch("/api/tasks/history-logs?type=api&limit=5");
      const logsData = await res.json();
      if (logsData && logsData.length > 0) {
        setTaskLogs(logsData);
      } else {
        setTaskLogs([{ timestamp: "", message: "Nenhum histórico de lote encontrado.", level: "INFO" }]);
      }
    } catch (error) {
      console.error("Erro histórico geral:", error);
    }
  };

  const filteredClients = clients.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || c.api_status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const totalFiltered = filteredClients.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = {
    online: clients.filter(c => c.api_status === 'online').length,
    offline: clients.filter(c => c.api_status !== 'online' && c.api_status).length,
    total: clients.length
  };

  const progressPercent = activeTask 
    ? (activeTask.total && activeTask.total > 1
        ? Math.min(100, Math.round(((Number(activeTask.current || 1) - 1) / Number(activeTask.total) * 100) + ((activeTask.progress_percent || 0) / Number(activeTask.total))))
        : (activeTask.progress_percent || 0))
    : 0;

  const isStale = (() => {
    if (!activeTask || !activeTask.updated_at) return false;
    const updatedAt = new Date(activeTask.updated_at.replace(/-/g, "/"));
    return (new Date().getTime() - updatedAt.getTime()) > 10 * 60 * 1000;
  })();

  const UptimeChart = ({ history }: { history?: string[] }) => {
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
            className={cn(
              "w-1.5 h-4 rounded-[2px] transition-colors duration-300",
              status === 'online' ? 'bg-emerald-400' :
                status === 'offline' || status === 'error' ? 'bg-rose-400' :
                  'bg-slate-200'
            )}
            title={status === 'empty' ? 'Sem dados' : status.toUpperCase()}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto animate-in fade-in duration-500 pt-2">
      
      {/* ── REAL-TIME STATUS BAR ── */}
      <div className={cn(
        "rounded-2xl border bg-white px-5 py-3 flex items-center justify-between gap-4 shadow-sm transition-all",
        activeTaskId ? "border-gax-blue/30 bg-gax-blue/[0.02]" : "border-slate-200"
      )}>
        {activeTaskId ? (
          <>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gax-blue opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gax-blue" />
              </div>
              {activeTask ? (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gax-blue">
                      {activeTask.total && activeTask.total > 1 ? "Lote em execução" : "Verificando API"}
                    </span>
                    {activeTask.current_client && (
                      <span className="text-[10px] text-slate-400 truncate">— {activeTask.current_client}</span>
                    )}
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gax-blue transition-all duration-700 ease-in-out shadow-[0_0_10px_rgba(14,165,233,0.4)]"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gax-blue">Iniciando checagem...</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
                    <div className="h-full bg-gax-blue/30 animate-pulse w-full" />
                  </div>
                </div>
              )}
              <span className="text-xs font-bold text-gax-blue shrink-0">{progressPercent}%</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setViewingTaskId(activeTaskId); setShowLogs(true); setModalTitle("Monitoramento em Tempo Real"); }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                title="Abrir Console"
              >
                <Terminal size={14} />
              </button>
              <button
                onClick={handleStopCheck}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-red-100 transition-all font-display"
              >
                <X size={12} />
                Parar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-slate-400 italic text-sm">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span className="text-xs font-medium text-slate-500">Sistema pronto para nova checagem</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchClients}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                title="Atualizar"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={handleViewGlobalLog}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-all font-display"
              >
                <Terminal size={12} />
                Histórico
              </button>
              <button
                onClick={handleRunFailedChecks}
                disabled={isExecuting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-all disabled:opacity-40 font-display"
              >
                <RotateCcw size={12} />
                Re-testar Falhas
              </button>
              <button
                onClick={handleRunBatchCheck}
                disabled={isExecuting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gax-blue text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-gax-blue-hover transition-all shadow-md shadow-gax-blue/20 disabled:opacity-40 font-display"
              >
                <Play size={12} className={isExecuting ? 'animate-pulse' : ''} />
                Executar Lote
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── STATS CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Total de Clientes",
            value: stats.total,
            icon: <Activity size={18} />,
            color: "text-gax-blue bg-gax-blue/10"
          },
          {
            label: "Conexões Ativas",
            value: stats.online,
            icon: <CheckCircle2 size={18} />,
            color: "text-emerald-600 bg-emerald-50",
            pulse: true
          },
          {
            label: "Falhas Detectadas",
            value: stats.offline,
            icon: <XCircle size={18} />,
            color: "text-rose-600 bg-rose-50"
          }
        ].map((card, i) => (
          <div
            key={i}
            className="rounded-2xl bg-white border border-slate-200 p-5 flex items-center gap-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
          >
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", card.color)}>
              {card.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{card.label}</p>
              <p className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                {card.value}
                {card.pulse && card.value > 0 && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── CLIENT TABLE ── */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '180ms', animationFillMode: 'both' }}>
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 justify-between items-center bg-slate-50/40">
          <div className="relative group w-full max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={15} />
            <input
              type="text"
              placeholder="Filtrar por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs font-medium text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all placeholder:text-slate-300"
            />
          </div>
          <div className="flex items-center gap-2">
            {["all", "online", "offline", "error", "pending"].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                  filterStatus === s
                    ? "bg-gax-blue text-white shadow-sm"
                    : "bg-white border border-slate-200 text-slate-500 hover:border-gax-blue/30 hover:text-gax-blue"
                )}
              >
                {s === 'all' ? 'Todos' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                {["Cliente", "Status", "Uptime (24h)", "Última Verificação", "Ações"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 font-display",
                      i === 4 ? "text-right" : ""
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={28} className="animate-spin text-gax-blue" />
                      <p className="text-xs text-slate-400 font-medium">Carregando clientes...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <p className="text-xs text-slate-400">Nenhum registro para o filtro selecionado.</p>
                  </td>
                </tr>
              ) : paginatedClients.map((client, idx) => (
                <tr
                  key={client.id}
                  className="group hover:bg-gax-blue/[0.02] transition-colors"
                >
                  {/* Cliente */}
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col">
                      {client.url_sistema ? (
                        <a 
                          href={client.url_sistema} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-bold text-slate-800 text-sm hover:text-gax-blue transition-colors flex items-center gap-1.5 group/namelink"
                        >
                          {client.name}
                          <ExternalLink size={12} className="opacity-0 group-hover/namelink:opacity-100 transition-all text-slate-400 group-hover/namelink:text-gax-blue" />
                        </a>
                      ) : (
                        <span className="font-bold text-slate-800 text-sm">{client.name}</span>
                      )}
                      {client.group_name ? (
                        <span className="inline-flex items-center rounded-full bg-gax-blue/5 px-2 py-0.5 text-[9px] font-bold text-gax-blue border border-gax-blue/10 w-fit mt-1">
                          {client.group_name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-medium italic mt-0.5">Sem grupo</span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {client.api_status === 'online' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100 uppercase">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                          </span>
                          Online
                        </span>
                      ) : (
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase",
                          client.api_status === 'error' || client.api_status === 'offline'
                            ? "bg-rose-50 text-rose-700 border-rose-100"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        )}>
                          {client.api_status || 'Pendente'}
                        </span>
                      )}
                      {(client.api_status === 'error' || client.api_status === 'offline') && client.api_last_screenshot_url && (
                        <button
                          onClick={() => setSelectedScreenshot(client.api_last_screenshot_url || null)}
                          className="p-1 hover:bg-rose-100 rounded text-rose-400 transition-colors"
                          title="Ver Screenshot da Falha"
                        >
                          <Camera size={13} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Uptime */}
                  <td className="px-5 py-3.5">
                    <UptimeChart history={client.api_status_history} />
                  </td>

                  {/* Última Verificação */}
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col">
                       <span className="text-[11px] font-bold text-slate-600">
                         {client.api_last_check && client.api_last_check !== '-'
                           ? formatDistanceToNow(new Date(client.api_last_check), { addSuffix: true, locale: ptBR })
                           : "Nunca checado"}
                       </span>
                       {client.api_last_check && client.api_last_check !== '-' && (
                         <span className="text-[9px] text-slate-400 font-medium font-display">
                           {new Date(client.api_last_check).toLocaleDateString('pt-BR')} às {new Date(client.api_last_check).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                         </span>
                       )}
                    </div>
                  </td>

                  {/* Ações */}
                  <td className="px-5 py-3.5 text-right">
                    <div className="relative inline-block text-left" ref={openMenuId === client.id ? dropdownRef : null}>
                      <button
                        onClick={() => setOpenMenuId(openMenuId === client.id ? null : client.id)}
                        className="p-2 text-slate-300 hover:text-gax-blue hover:bg-gax-blue/10 rounded-xl transition-all"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {openMenuId === client.id && (
                        <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-100 z-50 overflow-hidden animate-in zoom-in-95 duration-150 origin-top-right">
                          <button
                            onClick={() => handleRunSingleCheck(client.id)}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors"
                          >
                            <Zap size={14} /> Testar Agora
                          </button>
                          {client.api_last_task_id && (
                            <button
                              onClick={() => { openDetailedLogs(client.api_last_task_id!, `Log da API: ${client.name}`, client.name); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors border-t border-slate-50"
                            >
                              <FileText size={14} /> Ver Log Individual
                            </button>
                          )}
                          {(client.api_status === 'error' || client.api_status === 'offline') && client.api_last_screenshot_url && (
                            <button
                              onClick={() => { setSelectedScreenshot(client.api_last_screenshot_url!); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors border-t border-slate-50"
                            >
                              <Camera size={14} /> Screenshot
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

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-5 py-3.5">
            <span className="text-[10px] font-medium text-slate-400">
              {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, totalFiltered)} de {totalFiltered} clientes
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none"
              >
                Primeira
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] font-bold text-slate-600 px-2">{currentPage} / {totalPages || 1}</span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalFiltered === 0}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none"
              >
                Última
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── LOG MODAL ── */}
      {showLogs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gax-blue text-white rounded-xl shadow-lg shadow-gax-blue/20">
                  <Terminal size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{modalTitle}</h3>
                  <p className="text-[10px] text-gax-blue font-bold uppercase tracking-widest">
                    {(viewingTaskId && viewingTaskId !== activeTaskId) ? 'Visualizando Histórico' : 'Monitoramento em Tempo Real'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowLogs(false); setViewingTaskId(null); setSelectedClientMessage(null); setLogFilterClient(null); }}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/20">
              {taskLogs.length > 0 ? (
                taskLogs
                  .filter(log => !logFilterClient || log.message.includes(`[${logFilterClient}]`))
                  .map((log, idx) => (
                    <div key={idx} className="flex gap-3.5">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                        log.level === 'ERROR' ? 'bg-rose-500' :
                          log.level === 'SUCCESS' ? 'bg-emerald-500' :
                            log.level === 'WARNING' ? 'bg-amber-500' :
                              'bg-gax-blue'
                      )} />
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn(
                            "text-[12.5px] font-medium leading-relaxed",
                            log.level === 'ERROR' ? 'text-rose-700' :
                              log.level === 'WARNING' ? 'text-amber-700' :
                                'text-slate-700'
                          )}>
                            {log.message}
                          </span>
                          <span className="text-[9px] text-slate-300 font-mono italic shrink-0">{log.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center gap-3">
                  <Loader2 size={24} className="animate-spin text-gax-blue" />
                  <p className="text-xs text-slate-400 italic font-display">Carregando logs...</p>
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 flex justify-end bg-slate-50/60">
              <button
                onClick={() => { setShowLogs(false); setViewingTaskId(null); setSelectedClientMessage(null); setLogFilterClient(null); }}
                className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-xl transition-all font-display"
              >
                Fechar Console
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCREENSHOT MODAL ── */}
      {selectedScreenshot && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative max-w-5xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all"
            >
              <X size={18} />
            </button>
            <div className="p-1">
              <img
                src={selectedScreenshot}
                alt="Screenshot de Falha"
                className="w-full h-auto rounded-xl object-contain max-h-[85vh]"
              />
              <div className="p-4 bg-slate-900/80 text-white">
                <div className="flex items-center gap-2 text-rose-400 font-bold uppercase text-[10px] tracking-wider">
                  <Camera size={14} /> Captura de Falha Detectada
                </div>
                <p className="text-xs text-slate-400 mt-1">Imagem capturada pelo robô no momento em que a falha foi detectada.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
