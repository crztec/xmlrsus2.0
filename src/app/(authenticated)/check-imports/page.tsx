"use client";

import React from "react";
import { 
  CloudUpload, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Activity, 
  ShieldCheck,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ExternalLink,
  ClipboardList,
  Terminal,
  FileText,
  X,
  History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ABIStats {
  total_clients: number;
  imported: number;
  imported_analyzed: number;
  imported_not_analyzed: number;
  failure: number;
  pending: number;
  not_imported: number;
}

interface ABISchedule {
  ABI: string;
  "Data fim de Ciência": string;
  Competência: string;
}

interface ClientABI {
  id: string;
  name: string;
  cnpj: string;
  abi_status?: string;
  abi_current?: string;
  abi_last_check?: any;
  abi_last_message?: string;
  abi_last_task_id?: string;
}

interface TaskLog {
  timestamp: string;
  message: string;
  level?: string;
}

export default function CheckImportsPage() {
  const [stats, setStats] = React.useState<ABIStats | null>(null);
  const [schedule, setSchedule] = React.useState<ABISchedule[]>([]);
  const [clients, setClients] = React.useState<ClientABI[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  
  // States para Logs e Tarefas
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [currentTaskStatus, setCurrentTaskStatus] = React.useState<any>(null);
  const [realtimeLogs, setRealtimeLogs] = React.useState<TaskLog[]>([]);
  
  // Modal de Log Detalhado
  const [showLogsModal, setShowLogsModal] = React.useState(false);
  const [viewingTaskId, setViewingTaskId] = React.useState<string | null>(null);
  const [detailedLogs, setDetailedLogs] = React.useState<TaskLog[]>([]);
  const [modalTitle, setModalTitle] = React.useState("Console Técnico");
  const [logFilterClient, setLogFilterClient] = React.useState<string | null>(null);

  const logEndRef = React.useRef<HTMLDivElement>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/abi-dashboard-stats");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Erro ao buscar stats:", err);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [schedRes, clientsRes] = await Promise.all([
        fetch("/api/abi-schedule"),
        fetch("/api/clients?limit=100") 
      ]);
      
      if (schedRes.ok) {
        const schedData = await schedRes.json();
        if (Array.isArray(schedData)) setSchedule(schedData);
      }

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData.clients || []);
      }
      
      await fetchStats();
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  // Auto-scroll logs
  React.useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [realtimeLogs, detailedLogs]);

  // Polling logs em tempo real
  React.useEffect(() => {
    let interval: any;
    if (activeTaskId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/task/${activeTaskId}`);
          const data = await res.json();
          setCurrentTaskStatus(data);
          setRealtimeLogs(data.logs || []);
          
          if (data.status === "completed" || data.status === "error" || data.status === "CONCLUIDO" || data.status === "CONCLUIDO_COM_RESSALVAS") {
            setTimeout(() => {
              setActiveTaskId(null);
              fetchData(); 
            }, 3000);
          }
        } catch (err) {
          console.error("Erro polling status:", err);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTaskId]);

  const openDetailedLogs = async (taskId: string, title: string, clientName?: string) => {
    setViewingTaskId(taskId);
    setModalTitle(title);
    setLogFilterClient(clientName || null);
    setDetailedLogs([]);
    setShowLogsModal(true);
    
    try {
      const res = await fetch(`/api/task/${taskId}/logs`);
      const data = await res.json();
      setDetailedLogs(data);
    } catch (err) {
      console.error("Erro ao carregar logs detalhados:", err);
    }
  };

  const handleViewGlobalLog = async () => {
    try {
      const res = await fetch("/api/tasks?type=abi_check_batch");
      const tasks = await res.json();
      if (tasks && tasks.length > 0) {
        openDetailedLogs(tasks[0].id, "Último Log Geral (Lote)");
      } else {
        alert("Nenhum histórico de lote encontrado.");
      }
    } catch (err) {
      console.error("Erro histórico geral:", err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const res = await fetch("/api/upload-abi-schedule", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        alert("Cronograma atualizado com sucesso!");
        fetchData();
      } else {
        alert("Falha ao subir arquivo.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const startCheck = async (clientId?: string) => {
    try {
      const res = await fetch("/api/start-abi-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId || null }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        alert(error.detail || "Erro ao iniciar checagem.");
        return;
      }

      const data = await res.json();
      if (data.task_id) {
        setActiveTaskId(data.task_id);
        setRealtimeLogs([]);
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão com o servidor.");
    }
  };

  const handleCancel = async () => {
    if (!activeTaskId) return;
    if (!confirm("Deseja realmente parar o processamento atual?")) return;

    try {
      await fetch(`/api/cancel-task/${activeTaskId}`, { method: "POST" });
    } catch (err) {
      console.error("Erro ao cancelar:", err);
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "Importado e Analisado": return <CheckCircle2 className="text-green-500" size={16} />;
      case "Importado, falta analisar": return <AlertCircle className="text-blue-500" size={16} />;
      case "Falha": return <XCircle className="text-red-500" size={16} />;
      case "Nao Importado": return <XCircle className="text-slate-400" size={16} />;
      case "Pendente": return <Loader2 className="text-amber-500 animate-spin" size={16} />;
      default: return <Activity className="text-slate-300" size={16} />;
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.cnpj.includes(search)
  );

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      {/* Actions Toolbar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-2xl shadow-sm -mt-2">
        <div className="flex items-center gap-2 pl-2">
          {activeTaskId ? (
            <div className="flex items-center gap-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gax-blue/5 rounded-full border border-gax-blue/10">
                <Loader2 size={14} className="text-gax-blue animate-spin" />
                <span className="text-xs font-bold text-gax-blue uppercase tracking-wider">Executando:</span>
              </div>
              <span className="text-sm font-medium text-slate-600">
                {realtimeLogs.length > 0 ? realtimeLogs[realtimeLogs.length - 1].message : "Iniciando processamento..."}
              </span>
              <button 
                onClick={() => openDetailedLogs(activeTaskId, "Console Técnico Detalhado")}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                title="Abrir Console Completo"
              >
                <Terminal size={14} />
              </button>
              <button 
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-red-100 transition-all"
              >
                <X size={12} />
                Parar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 italic text-sm">
              <ShieldCheck size={16} />
              Sistema pronto para nova checagem
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button 
             onClick={handleViewGlobalLog}
             className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl hover:bg-white transition-all shadow-sm flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
          >
            <History size={16} />
            Histórico
          </button>
          <label className={cn(
            "flex items-center gap-2 cursor-pointer rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 shadow-sm transition-all hover:bg-white",
            isUploading && "opacity-50 pointer-events-none"
          )}>
            <CloudUpload size={16} />
            {isUploading ? "Enviando..." : "Cronograma"}
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleUpload} />
          </label>
          <button 
            onClick={() => startCheck()}
            disabled={!!activeTaskId}
            className="flex items-center gap-2 rounded-xl bg-gax-blue px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50 uppercase tracking-widest"
          >
            <Play size={16} />
            Checar Lote
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Importados", value: stats?.imported || 0, color: "bg-blue-50", text: "text-blue-700", icon: <FileSpreadsheet className="text-blue-500" /> },
          { label: "Importados e Analisados", value: stats?.imported_analyzed || 0, color: "bg-green-50", text: "text-green-700", icon: <ShieldCheck className="text-green-500" /> },
          { label: "Falta Analisar", value: stats?.imported_not_analyzed || 0, color: "bg-amber-50", text: "text-amber-700", icon: <AlertCircle className="text-amber-500" /> },
          { label: "Falhas na Análise", value: stats?.failure || 0, color: "bg-red-50", text: "text-red-700", icon: <XCircle className="text-red-500" /> },
        ].map((stat, i) => (
          <div key={i} className={cn("rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between", stat.color)}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{stat.label}</p>
              <p className={cn("text-2xl font-bold font-display", stat.text)}>{stat.value}</p>
            </div>
            <div className="p-3 rounded-xl bg-white shadow-sm">{stat.icon}</div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Client List */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Activity size={18} className="text-gax-blue" />
                Status por Cliente
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Buscar cliente..." 
                  className="pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-gax-blue/20 outline-none w-48"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-center">ABI Atual</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                        <Loader2 className="animate-spin inline-block mr-2" size={16} />
                        Carregando operadoras...
                      </td>
                    </tr>
                  ) : filteredClients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-700">{client.name}</p>
                        <p className="text-[10px] text-slate-400">
                            {client.abi_last_check ? `Último check: ${formatDistanceToNow(new Date(client.abi_last_check), { addSuffix: true, locale: ptBR })}` : client.cnpj}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-500">
                        {client.abi_current || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(client.abi_status)}
                          <span className={cn(
                            "font-medium",
                            client.abi_status === "Falha" ? "text-red-500" : 
                            client.abi_status === "Importado e Analisado" ? "text-green-600" : "text-slate-600"
                          )}>
                            {client.abi_status || "Não Checado"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {client.abi_last_task_id && (
                              <button 
                                onClick={() => openDetailedLogs(client.abi_last_task_id!, `Log da ABI: ${client.name}`, client.name)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-all"
                                title="Ver Histórico de Logs"
                              >
                                <FileText size={14} />
                              </button>
                          )}
                          <button 
                            onClick={() => startCheck(client.id)}
                            disabled={!!activeTaskId}
                            className="p-1.5 rounded-lg hover:bg-gax-blue-light hover:text-gax-blue text-slate-400 transition-all disabled:opacity-30"
                            title="Checar Agora"
                          >
                            <Play size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar: Schedule & Logs */}
        <div className="flex flex-col gap-6">
          
          {/* Active Status & Progress */}
          {activeTaskId && currentTaskStatus && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right duration-500">
               <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-widest">
                    <Activity size={14} className="text-gax-blue animate-pulse" />
                    Progresso Atual
                  </h2>
                  <span className="text-[10px] font-bold text-gax-blue bg-gax-blue/5 px-2 py-0.5 rounded-full">
                    {currentTaskStatus.current} / {currentTaskStatus.total}
                  </span>
               </div>
               <div className="p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Operadora Atual</p>
                       <p className="text-sm font-bold text-slate-700 truncate">{currentTaskStatus.current_client || 'Iniciando...'}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-2xl font-bold font-display text-gax-blue">
                         {currentTaskStatus.total > 0 ? Math.round((currentTaskStatus.current / currentTaskStatus.total) * 100) : 0}%
                       </p>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gax-blue transition-all duration-1000 ease-in-out shadow-[0_0_12px_rgba(2,130,230,0.4)]" 
                        style={{ width: `${currentTaskStatus.total > 0 ? (currentTaskStatus.current / currentTaskStatus.total) * 100 : 0}%` }}
                    />
                  </div>
                  <button 
                    onClick={() => openDetailedLogs(activeTaskId, "Console Técnico Detalhado")}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:bg-white hover:text-gax-blue transition-all group"
                  >
                    <Terminal size={12} className="group-hover:scale-110 transition-transform" /> 
                    Ver Logs Completos
                  </button>
               </div>
            </div>
          )}

          {/* Schedule Summary */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-widest">
                <RefreshCw size={14} className="text-gax-blue" />
                Cronograma ABIs
              </h2>
              <span className="text-[10px] bg-gax-blue-light text-gax-blue px-2 py-0.5 rounded-full font-bold">ATIVA</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {schedule?.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="font-bold text-slate-700">{item.ABI}</p>
                    <p className="text-[10px] text-slate-400">{item.Competência}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-500">{item["Data fim de Ciência"]}</p>
                    <p className="text-[9px] text-slate-400 capitalize">Fim Ciência</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* DETAILED LOG MODAL */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-900 text-white rounded-lg shadow-lg">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{modalTitle}</h3>
                  <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">
                    Histórico Técnico - ID: {viewingTaskId?.substring(0, 12)}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setShowLogsModal(false); setViewingTaskId(null); setLogFilterClient(null); }} 
                className="p-2 hover:bg-white rounded-lg transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30 scrollbar-thin scrollbar-thumb-slate-200">
              {detailedLogs.length > 0 ? (
                detailedLogs
                  .filter(log => !logFilterClient || log.message.includes(`[${logFilterClient}]`))
                  .map((log, idx) => (
                    <div key={idx} className="flex gap-4 group">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                          log.level === 'ERROR' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' :
                          log.level === 'SUCCESS' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' :
                          log.level === 'WARNING' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                          'bg-gax-blue shadow-[0_0_8px_rgba(2,130,230,0.3)]'
                        )} />
                        {idx < detailedLogs.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn(
                            "text-[13px] font-medium leading-relaxed",
                            log.level === 'ERROR' ? 'text-red-700' : 'text-slate-700'
                          )}>
                            {log.message}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono italic shrink-0">{log.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-gax-blue" />
                  <p className="text-sm italic">Carregando histórico do servidor...</p>
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button 
                onClick={() => { setShowLogsModal(false); setViewingTaskId(null); setLogFilterClient(null); }}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white border border-slate-200 rounded-xl transition-all shadow-sm"
              >
                Fechar Console
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
