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
  History,
  MoreHorizontal,
  Calendar,
  Clock,
  RotateCcw,
  FileX,
  Scale
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
  impugnating: number;
}

interface ABISchedule {
  ABI: string;
  "Ano Lançamento"?: string | number;
  "Competência"?: string;
  "Data fim competência"?: string;
  "Data de Lançamento"?: string;
  "Data fim de Ciência"?: string;
  "Data fim de Impugnação"?: string;
  [key: string]: any;
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
  url_sistema: string;
  impugnation_status?: string;
  impugnation_last_message?: string;
  impugnation_last_task_id?: string;
}

interface TaskLog {
  timestamp: string;
  timestamp_precise?: number;
  message: string;
  level: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING' | 'DEBUG';
}

export default function CheckImportsPage() {
  const [stats, setStats] = React.useState<ABIStats | null>(null);
  const [schedule, setSchedule] = React.useState<ABISchedule[]>([]);
  const [activeAbi, setActiveAbi] = React.useState<ABISchedule | null>(null);
  const [clients, setClients] = React.useState<ClientABI[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  
  // States para Logs e Tarefas
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [currentTaskStatus, setCurrentTaskStatus] = React.useState<any>(null);
  const [realtimeLogs, setRealtimeLogs] = React.useState<TaskLog[]>([]);
  
  const [isLoadingLogs, setIsLoadingLogs] = React.useState(false);

  // Modal de Logs
  const [showLogsModal, setShowLogsModal] = React.useState(false);
  const [viewingTaskId, setViewingTaskId] = React.useState<string | null>(null);
  const [detailedLogs, setDetailedLogs] = React.useState<TaskLog[]>([]);
  const [modalTitle, setModalTitle] = React.useState("Console Técnico");
  const [logFilterClient, setLogFilterClient] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll para o final dos logs
  React.useEffect(() => {
    if (showLogsModal && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [realtimeLogs, detailedLogs, showLogsModal]);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const logEndRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Click outside dropdown handler
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        // Novo formato: { active: ..., all: [...] }
        if (schedData.all) setSchedule(schedData.all);
        if (schedData.active) setActiveAbi(schedData.active);
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
    
    // Verifica se há alguma tarefa de ABI ou impugnação já em execução no backend (Persistência pós-refresh)
    const checkActiveTask = async () => {
      try {
        // Verifica ABI tasks
        const res = await fetch("/api/active-task/abi");
        const data = await res.json();
        if (data.id && data.status === 'running') {
          setActiveTaskId(data.id);
          setCurrentTaskStatus(data);
          return;
        }
        // Verifica impugnation tasks
        const resImp = await fetch("/api/active-task/impugnation");
        const dataImp = await resImp.json();
        if (dataImp.id && dataImp.status === 'running') {
          setActiveTaskId(dataImp.id);
          setCurrentTaskStatus(dataImp);
        }
      } catch (err) {
        console.error("Erro ao recuperar tarefa ativa:", err);
      }
    };
    checkActiveTask();
  }, []);

  // Auto-scroll logs
  React.useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [realtimeLogs, detailedLogs]);

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
          
            if (data.status === "completed" || data.status === "error" || data.status === "CONCLUIDO" || data.status === "CONCLUIDO_COM_RESSALVAS" || data.status === "STOPPED" || data.status === "cancelled") {
              clearInterval(interval);
              
              // Garante que o modal de logs continue preenchido ao alternar de activeTask -> history
              if (data.logs && data.logs.length > 0) {
                setDetailedLogs(data.logs);
              }
              
              await fetchData();
              
              // Remove a barra de progresso imediatamente
              setActiveTaskId(null);
            }
        } catch (err) {
          console.error("Erro polling status:", err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [activeTaskId]);

  const openDetailedLogs = async (taskId: string, title: string, clientName?: string) => {
    setViewingTaskId(taskId);
    setModalTitle(title);
    setLogFilterClient(clientName || null);
    setDetailedLogs([]);
    setShowLogsModal(true);
    setIsLoadingLogs(true);
    
    try {
      const url = clientName 
        ? `/api/task/${taskId}/logs?client_name=${encodeURIComponent(clientName)}`
        : `/api/task/${taskId}/logs`;
      const res = await fetch(url);
      const data = await res.json();
      setDetailedLogs(data);
    } catch (err) {
      console.error("Erro ao carregar logs detalhados:", err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleViewGlobalLog = async () => {
    // Abre o modal IMEDIATAMENTE com loading
    setModalTitle("Histórico Recente de ABIs");
    setLogFilterClient(null);
    setDetailedLogs([]);
    setViewingTaskId("history"); // Use um marcador para histórico agregado
    setShowLogsModal(true);
    setIsLoadingLogs(true);

    try {
      // Usa o novo endpoint de histórico agregado (últimos 5 clientes/tasks)
      const res = await fetch("/api/tasks/history-logs?type=abi&limit=5");
      const logsData = await res.json();
      
      if (logsData && logsData.length > 0) {
        setDetailedLogs(logsData);
      } else {
        setDetailedLogs([{ timestamp: "", message: "Nenhum histórico de checagem encontrado.", level: "INFO" }]);
      }
    } catch (err) {
      console.error("Erro histórico geral:", err);
    } finally {
      setIsLoadingLogs(false);
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
        setCurrentTaskStatus(null);
        setRealtimeLogs([]);
        // Atualiza o abi_last_task_id localmente para que o menu 'Ver Log Individual' funcione
        // mesmo antes do fetchData() ser chamado ao final da task
        if (clientId) {
          setClients(prev => prev.map(c => 
            c.id === clientId ? { ...c, abi_last_task_id: data.task_id } : c
          ));
        }
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão com o servidor.");
    }
  };
  
  const handleRunFailedChecks = async () => {
    if (!!activeTaskId) return;
    
    // Filtra operadoras que falharam (Falha, Erro, ou status contendo falha/erro)
    const failedOnes = clients.filter(c => {
      const s = (c.abi_status || "").toLowerCase();
      return s.includes("falha") || s.includes("erro") || s === "nao importado";
    }).map(c => c.id);
    
    if (failedOnes.length === 0) {
      alert("Não há operadoras com falha para re-testar.");
      return;
    }
    
    try {
      const res = await fetch("/api/start-abi-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_ids: failedOnes }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        alert(error.detail || "Erro ao iniciar checagem.");
        return;
      }

      const data = await res.json();
      if (data.task_id) {
        setActiveTaskId(data.task_id);
        setCurrentTaskStatus(null);
        setRealtimeLogs([]);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao disparar checagem de falhas.");
    }
  };

  const startImpugnationCheck = async (clientId?: string) => {
    try {
      const res = await fetch("/api/start-impugnation-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId || null }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        alert(error.detail || "Erro ao iniciar checagem de impugnações.");
        return;
      }

      const data = await res.json();
      if (data.task_id) {
        setActiveTaskId(data.task_id);
        setCurrentTaskStatus(null);
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
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      {/* Actions Toolbar (Real-time Status Bar) */}
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gax-blue">
                    {currentTaskStatus?.total && currentTaskStatus.total > 1 ? "Lote em execução" : "Verificando ABI"}
                    {currentTaskStatus?.total && currentTaskStatus.total > 0 && (
                      <span className="ml-2 opacity-60">({currentTaskStatus.current || 0}/{currentTaskStatus.total})</span>
                    )}
                  </span>
                  {currentTaskStatus?.current_client && (
                    <span className="text-[10px] text-slate-400 truncate">— {currentTaskStatus.current_client}</span>
                  )}
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gax-blue transition-all duration-700 ease-in-out shadow-[0_0_10px_rgba(14,165,233,0.4)]"
                    style={{ width: `${currentTaskStatus?.progress_percent || 0}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-bold text-gax-blue shrink-0">{currentTaskStatus?.progress_percent || 0}%</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => { setViewingTaskId(activeTaskId); setShowLogsModal(true); }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                title="Abrir Console"
              >
                <Terminal size={14} />
              </button>
              <button 
                onClick={handleCancel}
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
                onClick={fetchData}
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
                disabled={!!activeTaskId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-all disabled:opacity-40 font-display"
              >
                <RotateCcw size={12} />
                Re-testar Falhas
              </button>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-all cursor-pointer font-display">
                <CloudUpload size={12} />
                {isUploading ? "..." : "Cronograma"}
                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleUpload} />
              </label>
              <button 
                onClick={() => startImpugnationCheck()}
                disabled={!!activeTaskId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-amber-100 transition-all disabled:opacity-40 font-display shadow-sm"
              >
                <Scale size={12} />
                Checar Impugnações
              </button>
              <button 
                onClick={() => startCheck()}
                disabled={!!activeTaskId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gax-blue text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-gax-blue-hover transition-all shadow-md shadow-gax-blue/20 disabled:opacity-40 font-display"
              >
                <Play size={12} className={activeTaskId ? 'animate-pulse' : ''} />
                Executar Lote
              </button>
            </div>
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Importados", value: stats?.imported || 0, color: "bg-blue-50", text: "text-blue-700", icon: <FileSpreadsheet className="text-blue-500" /> },
          { label: "Importados e Analisados", value: stats?.imported_analyzed || 0, color: "bg-green-50", text: "text-green-700", icon: <ShieldCheck className="text-green-500" /> },
          { label: "Impugnando o ABI", value: stats?.impugnating || 0, color: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: <Scale className="text-amber-600" /> },
          { label: "Falta Analisar", value: stats?.imported_not_analyzed || 0, color: "bg-amber-50", text: "text-amber-700", icon: <AlertCircle className="text-amber-500" /> },
          { label: "Falhas na Análise", value: stats?.failure || 0, color: "bg-red-50", text: "text-red-700", icon: <XCircle className="text-red-500" /> },
          { label: "Não Importados", value: stats?.not_imported || 0, color: "bg-slate-100", text: "text-slate-600", icon: <FileX className="text-slate-400" /> },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl bg-white border border-slate-200 p-5 flex items-center gap-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", stat.color)}>
              {stat.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</p>
              <p className={cn("text-2xl font-bold text-slate-800", stat.text)}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Client List */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '240ms', animationFillMode: 'both' }}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
              <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-widest">
                <Activity size={18} className="text-gax-blue" />
                Status por Cliente
              </h2>
              <div className="relative group w-full max-w-[240px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={14} />
                <input 
                  type="text" 
                  placeholder="Filtrar por nome..." 
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-xs font-medium text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all placeholder:text-slate-300"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/50 text-slate-400 font-bold uppercase tracking-widest text-[10px] border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3.5">Operadora</th>
                    <th className="px-5 py-3.5 text-center">ABI Atual</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="animate-spin text-gax-blue" size={24} />
                          <p className="text-xs text-slate-400 font-medium font-display">Carregando operadoras...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredClients.map((client, idx) => (
                    <tr key={client.id} className="group hover:bg-gax-blue/[0.02] transition-colors animate-in fade-in duration-300" style={{ animationDelay: `${(idx % 10) * 30}ms` }}>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-sm font-display">{client.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium truncate max-w-[240px]">
                              {client.abi_last_check ? `Última checagem: ${formatDistanceToNow(new Date(client.abi_last_check), { addSuffix: true, locale: ptBR })}` : client.cnpj}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-slate-500">
                        {client.abi_current || "-"}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(client.abi_status)}
                          <span className={cn(
                            "font-bold text-[10px] uppercase border px-2.5 py-1 rounded-full",
                            client.abi_status === "Importado e Analisado" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                            client.abi_status === "Importado, falta analisar" ? "bg-blue-50 text-blue-700 border-blue-100" :
                            client.abi_status === "Importado" ? "bg-sky-50 text-sky-700 border-sky-100" :
                            client.abi_status === "Falha na Análise" || client.abi_status === "Falha" ? "bg-rose-50 text-rose-700 border-rose-100" :
                            client.abi_status === "Nao Importado" ? "bg-slate-50 text-slate-500 border-slate-200" :
                            "bg-slate-100 text-slate-500 border-slate-200"
                          )}>
                            {client.abi_status || "Não Checado"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="relative inline-block text-left" ref={openMenuId === client.id ? dropdownRef : null}>
                          <button 
                            onClick={() => setOpenMenuId(openMenuId === client.id ? null : client.id)}
                            className="p-2 text-slate-300 hover:text-gax-blue hover:bg-gax-blue/10 rounded-xl transition-all"
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {openMenuId === client.id && (
                            <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-100 z-50 overflow-hidden animate-in zoom-in-95 duration-150 origin-top-right">
                              <button 
                                onClick={() => { startCheck(client.id); setOpenMenuId(null); }}
                                disabled={!!activeTaskId}
                                className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors disabled:opacity-40"
                              >
                                <Play size={14} /> Checar Importação
                              </button>
                              <button 
                                onClick={() => { startImpugnationCheck(client.id); setOpenMenuId(null); }}
                                disabled={!!activeTaskId || client.abi_status !== 'Importado e Analisado'}
                                className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-30 border-t border-slate-50"
                                title={client.abi_status !== 'Importado e Analisado' ? 'Disponível apenas para clientes que já analisaram o ABI' : ''}
                              >
                                <Scale size={14} /> Checar Impugnação
                              </button>
                              
                              {client.abi_last_task_id ? (
                                <button 
                                  onClick={() => { openDetailedLogs(client.abi_last_task_id!, `Log da ABI: ${client.name}`, client.name); setOpenMenuId(null); }}
                                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors border-t border-slate-50"
                                >
                                  <FileText size={14} /> Ver Log Individual
                                </button>
                              ) : (
                                <button 
                                  onClick={handleViewGlobalLog}
                                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-400 hover:bg-slate-50 transition-colors border-t border-slate-50"
                                >
                                  <History size={14} /> Sem Log Individual
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
        </div>

        {/* Sidebar: Schedule Summary - REDESIGNED */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
              <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-widest">
                <Calendar size={14} className="text-gax-blue" />
                Cronograma {new Date().getFullYear()}
              </h2>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Live</span>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-5">
              {/* Hero Card: Active ABI */}
              {activeAbi ? (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gax-blue to-blue-700 p-5 text-white shadow-lg shadow-gax-blue/20 animate-in zoom-in-95 duration-500">
                  {/* Background decoration */}
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 -ml-4 -mb-4 h-16 w-16 rounded-full bg-white/5 blur-xl"></div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">ABI Atual</span>
                        <h3 className="text-2xl font-black font-display leading-tight">{activeAbi.ABI}</h3>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                        <Activity size={20} className="text-white" />
                      </div>
                    </div>
                    
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10 mb-4">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-1">Competência</p>
                      <p className="font-bold text-sm">{activeAbi.Competência || '-'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-1">Data de Lançamento</p>
                        <p className="font-black text-sm text-amber-300">{activeAbi['Data de Lançamento'] || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-1">Limite Impugn.</p>
                        <p className="font-black text-sm">{activeAbi['Data fim de Impugnação'] || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 p-8 text-center">
                  <Activity size={24} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhuma ABI Ativa</p>
                </div>
              )}

              {/* Upcoming Timeline */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Clock size={12} />
                  Próximos ABIs
                </h4>
                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-slate-100">
                  {schedule && schedule.length > 0 ? (
                    schedule
                      .filter(item => item.ABI !== activeAbi?.ABI)
                      .slice(0, 3) // Mostra os próximas 3
                      .map((item, i) => (
                        <div key={i} className="relative pl-7 group cursor-default">
                          <div className="absolute left-0 top-1 h-6 w-6 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center z-10 group-hover:border-gax-blue transition-colors">
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover:bg-gax-blue transition-colors"></div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-700 text-xs">{item.ABI}</span>
                              <span className="text-[9px] font-bold text-slate-400 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 uppercase">{item.Competência}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">Lançamento: <span className="font-medium text-slate-600">{item['Data de Lançamento']}</span></p>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-[10px] text-slate-300 italic py-4">Nenhum outro ABI no cronograma vigente</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LOG MODAL (Aligned with API Check) */}
      {showLogsModal && (
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
                onClick={() => { setShowLogsModal(false); setViewingTaskId(null); setLogFilterClient(null); }} 
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/20"
            >
              {(() => {
                const displayLogs = (viewingTaskId === activeTaskId) 
                  ? [...realtimeLogs]
                  : [...detailedLogs];

                return displayLogs.length > 0 ? (
                  displayLogs
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
                );
              })()}
              <div ref={logEndRef} />
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 flex justify-end bg-slate-50/60">
              <button 
                onClick={() => { setShowLogsModal(false); setViewingTaskId(null); setLogFilterClient(null); }}
                className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-xl transition-all font-display"
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
