"use client";

import React, { useState, useEffect } from "react";
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
  Scale,
  LayoutGrid
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/apiClient";

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
  finalized: number;
  not_started: number;
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
  const [filterStatus, setFilterStatus] = React.useState<string | null>(null);
  
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
  const [historyMenuOpen, setHistoryMenuOpen] = React.useState(false);
  
  // Sorting states
  const [sortField, setSortField] = React.useState<string | null>("name");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");
  const [sortCycle, setSortCycle] = React.useState(0); 
  
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll para o final dos logs
  React.useEffect(() => {
    if (showLogsModal && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [realtimeLogs, detailedLogs, showLogsModal]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const logEndRef = React.useRef<HTMLDivElement>(null);

  // Click outside dropdown handler
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
        setHistoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await apiClient("/api/abi-dashboard-stats");
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
        apiClient("/api/abi-schedule"),
        apiClient("/api/clients?limit=100") 
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
        const res = await apiClient("/api/active-task/abi");
        const data = await res.json();
        if (data.id && data.status === 'running') {
          setActiveTaskId(data.id);
          setCurrentTaskStatus(data);
          return;
        }
        // Verifica impugnation tasks
        const resImp = await apiClient("/api/active-task/impugnation");
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
          const res = await apiClient(`/api/task/${activeTaskId}`);
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
      }, 10000);
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
      const res = await apiClient(url);
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
      const res = await apiClient("/api/tasks/history-logs?type=abi&limit=5");
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
      const res = await apiClient("/api/upload-abi-schedule", {
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

  const startCheck = async (clientId?: string, clientIds?: string[]) => {
    // Reset modal title for new check
    if (clientIds && clientIds.length > 1) {
      setModalTitle(`Checagem em Lote: ${clientIds.length} operadoras`);
    } else if (clientId) {
      const c = clients.find(cl => cl.id === clientId);
      setModalTitle(`Checagem ABI: ${c?.name || 'Operadora'}`);
    } else {
      setModalTitle("Checagem de ABIs");
    }

    try {
      const res = await apiClient("/api/start-abi-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          client_id: clientId || null,
          client_ids: clientIds || null
        }),
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
      const res = await apiClient("/api/start-abi-check", {
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

  const startImpugnationCheck = async (clientId?: string, clientIds?: string[]) => {
    // Reset modal title for new check
    if (clientIds && clientIds.length > 1) {
      setModalTitle(`Checagem em Lote (Impugnação): ${clientIds.length} operadoras`);
    } else if (clientId) {
      const c = clients.find(cl => cl.id === clientId);
      setModalTitle(`Log Impugnação: ${c?.name || 'Operadora'}`);
    } else {
      setModalTitle("Checagem de Impugnações");
    }

    try {
      const res = await apiClient("/api/start-impugnation-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          client_id: clientId || null,
          client_ids: clientIds || null
        }),
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
        if (clientId) {
          setClients(prev => prev.map(c => 
            c.id === clientId ? { ...c, impugnation_last_task_id: data.task_id } : c
          ));
        }
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
      await apiClient(`/api/cancel-task/${activeTaskId}`, { method: "POST" });
    } catch (err) {
      console.error("Erro ao cancelar:", err);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await apiClient("/api/reports/impugnations", {
        method: "GET",
      });
      if (!res.ok) {
        throw new Error("Erro ao gerar relatório");
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Relatorio_Impugnacoes.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erro ao baixar o relatório de impugnações.");
    }
  };

  const getStatusIcon = (status?: string, impugnationStatus?: string) => {
    if (impugnationStatus === 'Finalizou') return <CheckCircle2 className="text-green-600" size={16} />;
    if (impugnationStatus === 'Impugnando') return <Scale className="text-yellow-600" size={16} />;
    if (impugnationStatus === 'Não Iniciou') return <Clock className="text-purple-600" size={16} />;
    
    const s = (status || "").toLowerCase();
    
    switch (s) {
      case "importado e analisado": return <CheckCircle2 className="text-green-500" size={16} />;
      case "importado, falta analisar": return <AlertCircle className="text-orange-500" size={16} />;
      case "falha":
      case "falha na análise":
      case "falha na analise": return <XCircle className="text-red-500" size={16} />;
      case "nao importado":
      case "não importado": return <XCircle className="text-slate-400" size={16} />;
      case "pendente": return <Loader2 className="text-amber-500 animate-spin" size={16} />;
      default: return <Activity className="text-slate-300" size={16} />;
    }
  };

  const filteredClients = clients.filter(c => {
    const s = search.toLowerCase();
    const matchesSearch = 
      (c.name && c.name.toLowerCase().includes(s)) || 
      (c.cnpj && c.cnpj.includes(s)) ||
      (c.abi_status && c.abi_status.toLowerCase().includes(s)) ||
      (c.impugnation_status && c.impugnation_status.toLowerCase().includes(s)) ||
      ((c as any).group_name && (c as any).group_name.toLowerCase().includes(s));
      
    if (!filterStatus) return matchesSearch;
    
    const sABI = (c.abi_status || "").toLowerCase();
    const sIMP = (c.impugnation_status || "");
    const sMSG = (c.abi_last_message || "").toLowerCase();
    
    // Determina o status exato usando a MESMA lógica mutuamente exclusiva (elif chain) do backend
    let assignedStatus = "Pendente";
    
    if (sIMP === 'Finalizou') {
      assignedStatus = "Finalizou";
    } else if (sIMP === 'Impugnando') {
      assignedStatus = "Impugnando";
    } else if (sIMP === 'Não Iniciou' || sIMP === 'Nao Iniciou') {
      assignedStatus = "Não Inic. Impug.";
    } else if (sABI === 'importado e analisado') {
      assignedStatus = "Analisados";
    } else if (sABI === 'importado') {
      if (sMSG.includes("nao realiza an") || sMSG.includes("não realiza an")) {
        assignedStatus = "Analisados";
      } else {
        assignedStatus = "Falta Analisar";
      }
    } else if (sABI === 'importado, falta analisar') {
      assignedStatus = "Falta Analisar";
    } else if (sABI === 'falha' || sABI === 'falha na análise' || sABI === 'falha na analise') {
      assignedStatus = "Falhas";
    } else if (sABI === 'nao importado' || sABI === 'não importado') {
      assignedStatus = "Não Import.";
    }
    
    // Mapeamento extra para cobrir agrupamentos dos cards:
    if (filterStatus === "Importados") {
      // Importados no backend soma "Importado" e "Importado, falta analisar" (se não for Analisado)
      // Ambos agora são mapeados internamente como "Falta Analisar"
      return matchesSearch && assignedStatus === "Falta Analisar";
    }
    
    return matchesSearch && (assignedStatus === filterStatus);
  }).sort((a, b) => {
    if (sortField === "name") {
      // Clique 1 ou Reset: A-Z por nome
      return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }
    
    if (sortField === "group_name") {
      // Clique 1: Possui Grupo Primeiro
      const hasA = !!(a as any).group_name;
      const hasB = !!(b as any).group_name;
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      if (hasA && hasB) {
        const comp = (a as any).group_name.localeCompare((b as any).group_name);
        if (comp !== 0) return comp;
      }
      return a.name.localeCompare(b.name);
    }

    if (sortField === "no_group") {
      // Clique 2: SEM Grupo Primeiro
      const hasA = !!(a as any).group_name;
      const hasB = !!(b as any).group_name;
      if (!hasA && hasB) return -1;
      if (hasA && !hasB) return 1;
      return a.name.localeCompare(b.name);
    }

    if (sortField === "status_group") {
      // Ordenação Ciclo Status
      const statusOrder: Record<string, number> = {
        "finalizou": 1,
        "impugnando": 10,
        "em análise": 10,
        "não iniciou": 20,
        "nao iniciou": 20,
        "importado e analisado": 1,
        "importado, falta analisar": 10,
        "importado": 10,
        "falha": 30,
        "falha na análise": 30,
        "falha na analise": 30,
        "nao importado": 40,
        "não importado": 40
      };

      const sA = (a.impugnation_status || a.abi_status || "").toLowerCase();
      const sB = (b.impugnation_status || b.abi_status || "").toLowerCase();

      let rankA = statusOrder[sA] || 99;
      let rankB = statusOrder[sB] || 99;

      if (sortCycle === 1) { // Clique 1: Concluídos (Grupo 1)
        if (rankA === 1 && rankB !== 1) return -1;
        if (rankA !== 1 && rankB === 1) return 1;
      } else if (sortCycle === 2) { // Clique 2: Em Andamento (Grupo 10)
        if (rankA === 10 && rankB !== 10) return -1;
        if (rankA !== 10 && rankB === 10) return 1;
      } else if (sortCycle === 3) { // Clique 3: Não Iniciou (Grupo 20)
        if (rankA === 20 && rankB !== 20) return -1;
        if (rankA !== 20 && rankB === 20) return 1;
      } else if (sortCycle === 4) { // Clique 4: Falhas/Pendentes (Grupo 30/40)
        const isFailA = rankA >= 30;
        const isFailB = rankB >= 30;
        if (isFailA && !isFailB) return -1;
        if (!isFailA && isFailB) return 1;
      }

      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    }
    
    return 0;
  });

  const handleSortOperadora = () => {
    if (sortCycle === 0) {
      // Já está em Nome, mudar para Grupo
      setSortField("group_name");
      setSortOrder("asc");
      setSortCycle(1);
    } else if (sortCycle === 1) {
      // Mudar para SEM Grupo
      setSortField("no_group");
      setSortOrder("asc");
      setSortCycle(2);
    } else {
      // Reset para Nome A-Z
      setSortField("name");
      setSortOrder("asc");
      setSortCycle(0);
    }
  };

  const handleSortStatus = () => {
    if (sortField !== "status_group") {
      // Clique 1: Concluídos Primeiro
      setSortField("status_group");
      setSortCycle(1);
    } else if (sortCycle === 1) {
      // Clique 2: Em Andamento Primeiro
      setSortCycle(2);
    } else if (sortCycle === 2) {
      // Clique 3: Não Iniciou Primeiro
      setSortCycle(3);
    } else if (sortCycle === 3) {
      // Clique 4: Falhas Primeiro
      setSortCycle(4);
    } else {
      // Clique 5: Reset
      setSortField("name");
      setSortCycle(0);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto">
      
      {/* Actions Toolbar (Real-time Status Bar) */}
      <div className={cn(
        "rounded-2xl border bg-white px-5 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm transition-all",
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
                    {(currentTaskStatus?.total && currentTaskStatus.total > 1) ? "Lote em execução" : (currentTaskStatus?.type?.includes('impugnation') ? "Checando Impugnação" : "Verificando ABI")}
                    {!!currentTaskStatus?.total && currentTaskStatus.total > 0 && (
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
                onClick={() => { 
                  // Garante título correto baseado no status da tarefa atual
                  if (currentTaskStatus?.total > 1) {
                    setModalTitle(currentTaskStatus?.type?.includes('impugnation') ? "Checagem em Lote (Impugnação)" : "Checagem em Lote (ABI)");
                  } else if (currentTaskStatus?.current_client) {
                    setModalTitle(`${currentTaskStatus?.type?.includes('impugnation') ? 'Log Impugnação' : 'Log ABI'}: ${currentTaskStatus.current_client}`);
                  }
                  
                  setViewingTaskId(activeTaskId); 
                  setShowLogsModal(true); 
                }}
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
            <div className="flex items-center gap-2 text-slate-400 italic text-sm whitespace-nowrap">
              <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
              <span className="text-xs font-medium text-slate-500">Sistema pronto para nova checagem</span>
            </div>
            <div className="flex items-center gap-2 overflow-visible w-full pb-2 md:pb-0 justify-end" ref={dropdownRef}>
              <button 
                onClick={fetchData}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors shrink-0"
                title="Atualizar"
              >
                <RefreshCw size={14} />
              </button>
              
              {(!filterStatus || ["Não Inic. Impug.", "Impugnando", "Finalizou", "Analisados"].includes(filterStatus)) && (
                <button 
                  onClick={() => {
                    // Prioridade: Checkboxes > Filtro atual
                    const selectedIds = selectedClients.size > 0 
                      ? Array.from(selectedClients)
                      : filteredClients.map(c => c.id);

                    if (filterStatus || selectedClients.size > 0) {
                      const isImpugnContext = ["Não Inic. Impug.", "Impugnando", "Finalizou", "Analisados"].includes(filterStatus || "");
                      if (isImpugnContext) startImpugnationCheck(undefined, selectedIds);
                      else startImpugnationCheck(undefined, selectedIds); // Mantém a lógica de lote
                    } else {
                      startImpugnationCheck();
                    }
                    setSelectedClients(new Set()); // Limpa após disparar
                  }}
                  disabled={!!activeTaskId}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-amber-100 transition-all disabled:opacity-40 font-display shadow-sm shrink-0"
                >
                  <Scale size={12} />
                  {(filterStatus || selectedClients.size > 0) ? "Checar Selecionados" : "Checar Impugnações"}
                </button>
              )}
              
              {(!filterStatus || !["Não Inic. Impug.", "Impugnando", "Finalizou", "Analisados"].includes(filterStatus)) && (
                <button 
                  onClick={() => {
                    // Prioridade: Checkboxes > Filtro atual
                    const selectedIds = selectedClients.size > 0 
                      ? Array.from(selectedClients)
                      : filteredClients.map(c => c.id);

                    // Lógica Dinâmica: Se estiver em filtros de Impugnação/Analisados, dispara robô de Impugnação.
                    const isImpugnContext = ["Não Inic. Impug.", "Impugnando", "Finalizou", "Analisados"].includes(filterStatus || "");
                    
                    if (filterStatus || selectedClients.size > 0) {
                      if (isImpugnContext) startImpugnationCheck(undefined, selectedIds);
                      else startCheck(undefined, selectedIds);
                    } else {
                      startCheck();
                    }
                    setSelectedClients(new Set()); // Limpa após disparar
                  }}
                  disabled={!!activeTaskId}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gax-blue text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-gax-blue-hover transition-all shadow-md shadow-gax-blue/20 disabled:opacity-40 font-display shrink-0"
                >
                  <Play size={12} className={activeTaskId ? 'animate-pulse' : ''} />
                  {(filterStatus || selectedClients.size > 0) ? "Checar Selecionados" : "Checar ABIs"}
                </button>
              )}


              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-all cursor-pointer font-display shrink-0">
                <CloudUpload size={12} />
                {isUploading ? "..." : "Cronograma"}
                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleUpload} />
              </label>

              <button 
                onClick={handleRunFailedChecks}
                disabled={!!activeTaskId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-all disabled:opacity-40 font-display shrink-0"
              >
                <RotateCcw size={12} />
                Checar Falhas
              </button>

              <div className="relative">
                <button 
                  onClick={() => setHistoryMenuOpen(!historyMenuOpen)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all shrink-0 border outline-none focus-visible:ring-2 focus-visible:ring-gax-blue/50",
                    historyMenuOpen ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
                  )}
                  title="Mais Opções"
                  aria-label="Mais opções de histórico"
                  aria-expanded={historyMenuOpen}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal size={14} />
                </button>

                {historyMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-100 z-50 overflow-hidden origin-top-right">
                    <button 
                      onClick={() => { handleViewGlobalLog(); setHistoryMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors"
                    >
                      <Terminal size={14} className="opacity-70" />
                      Histórico ABI
                    </button>
                    <button 
                      onClick={async () => {
                        setHistoryMenuOpen(false);
                        setModalTitle("Histórico de Impugnações");
                        setLogFilterClient(null);
                        setDetailedLogs([]);
                        setViewingTaskId("history");
                        setShowLogsModal(true);
                        setIsLoadingLogs(true);
                        try {
                          const res = await apiClient("/api/tasks/history-logs?type=impugnation&limit=5");
                          const logsData = await res.json();
                          setDetailedLogs(logsData?.length > 0 ? logsData : [{ timestamp: "", message: "Nenhum histórico de impugnações encontrado.", level: "INFO" }]);
                        } catch (err) { console.error(err); } finally { setIsLoadingLogs(false); }
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors border-t border-slate-50"
                    >
                      <History size={14} className="opacity-70" />
                      Histórico Impugnações
                    </button>
                    <button 
                      onClick={() => { handleDownloadReport(); setHistoryMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors border-t border-slate-50"
                    >
                      <FileSpreadsheet size={14} className="opacity-70" />
                      Relatório Impugnações
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-2">
        {[
          { label: "Importados", value: stats?.imported || 0, color: "bg-blue-50", text: "text-blue-700", icon: <FileSpreadsheet size={16} className="text-blue-500" /> },
          { label: "Analisados", value: stats?.imported_analyzed || 0, color: "bg-emerald-50", text: "text-emerald-700", icon: <ShieldCheck size={16} className="text-emerald-500" /> },
          { label: "Não Inic. Impug.", value: stats?.not_started || 0, color: "bg-purple-50 border-purple-200", text: "text-purple-700", icon: <Clock size={16} className="text-purple-600" /> },
          { label: "Impugnando", value: stats?.impugnating || 0, color: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", icon: <Scale size={16} className="text-yellow-600" /> },
          { label: "Finalizou", value: stats?.finalized || 0, color: "bg-green-50 border-green-200", text: "text-green-700", icon: <CheckCircle2 size={16} className="text-green-600" /> },
          { label: "Falta Analisar", value: stats?.imported_not_analyzed || 0, color: "bg-orange-50", text: "text-orange-700", icon: <AlertCircle size={16} className="text-orange-500" /> },
          { label: "Falhas", value: stats?.failure || 0, color: "bg-red-50", text: "text-red-700", icon: <XCircle size={16} className="text-red-500" /> },
          { label: "Não Import.", value: stats?.not_imported || 0, color: "bg-slate-100", text: "text-slate-600", icon: <FileX size={16} className="text-slate-400" /> },
        ].map((stat, i) => (
          <button 
            key={i} 
            onClick={() => setFilterStatus(filterStatus === stat.label ? null : stat.label)}
            className={cn(
              "rounded-2xl bg-white border p-2 xl:p-3 flex items-center gap-2 shadow-sm duration-500 transition-all hover:scale-[1.03] active:scale-95 text-left",
              filterStatus === stat.label ? "border-gax-blue shadow-gax-blue/10" : "border-slate-200"
            )} 
          >
            <div className={cn("flex h-7 w-7 xl:h-9 xl:w-9 items-center justify-center rounded-xl shrink-0 font-display", stat.color)}>
              {stat.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] xl:text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-0.5 line-clamp-2 leading-none flex items-center h-5" title={stat.label}>
                {stat.label}
              </p>
              <p className={cn("text-lg xl:text-xl font-black font-display tracking-tight", stat.text)}>{stat.value}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Client List */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
              <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-widest">
                <Activity size={18} className="text-gax-blue" />
                Status por Cliente
              </h2>
              <div className="relative group w-full max-w-[240px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={14} />
                <input 
                  type="text" 
                  placeholder="Nome, status..." 
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-xs font-medium text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all placeholder:text-slate-300"
                  value={search}
                  onChange={(e) => { 
                    setSearch(e.target.value); 
                    setFilterStatus(null); 
                    setSelectedClients(new Set()); 
                  }}
                />
              </div>
            </div>
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 text-slate-400 font-bold uppercase tracking-widest text-[9px] border-b border-slate-100 whitespace-nowrap">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input 
                          type="checkbox" 
                          className="h-3.5 w-3.5 rounded border-slate-300 text-gax-blue focus:ring-gax-blue/20 transition-all cursor-pointer"
                          checked={selectedClients.size === filteredClients.length && filteredClients.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedClients(new Set(filteredClients.map(c => c.id)));
                            } else {
                              setSelectedClients(new Set());
                            }
                          }}
                        />
                      </th>
                      <th 
                        className="px-4 py-3 cursor-pointer hover:text-gax-blue transition-colors"
                        onClick={handleSortOperadora}
                      >
                        <div className="flex items-center gap-1">
                          Operadora {sortField === "name" ? (sortOrder === "asc" ? "↑" : "↓") : sortField === "group_name" ? "(G)" : sortField === "no_group" ? "(G!)" : ""}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 cursor-pointer hover:text-gax-blue transition-colors"
                        onClick={handleSortStatus}
                      >
                        <div className="flex items-center gap-1">
                          Status {sortField === "status_group" ? (sortCycle === 1 ? "(FIN)" : sortCycle === 2 ? "(AND)" : sortCycle === 3 ? "(INI)" : "(FAL)") : ""}
                        </div>
                      </th>
                      <th className="px-4 py-3">Última Checagem</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="animate-spin text-gax-blue" size={24} />
                          <p className="text-xs text-slate-400 font-medium font-display">Carregando operadoras...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredClients.map((client, idx) => (
                    <tr 
                      key={client.id} 
                      className={cn(
                        "group transition-colors text-[11px]",
                        selectedClients.has(client.id) ? "bg-gax-blue/5" : "hover:bg-gax-blue/[0.02]"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <input 
                          type="checkbox" 
                          className="h-3.5 w-3.5 rounded border-slate-300 text-gax-blue focus:ring-gax-blue/20 transition-all cursor-pointer"
                          checked={selectedClients.has(client.id)}
                          onChange={() => {
                            const newSet = new Set(selectedClients);
                            if (newSet.has(client.id)) newSet.delete(client.id);
                            else newSet.add(client.id);
                            setSelectedClients(newSet);
                          }}
                        />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-bold text-slate-800 text-xs font-display leading-tight truncate max-w-[200px]">{client.name}</span>
                          {(client as any).group_name ? (
                            <span className="inline-flex items-center rounded-full bg-gax-blue/5 px-2 py-0.5 text-[8px] font-bold text-gax-blue border border-gax-blue/10 w-fit">
                              {(client as any).group_name}
                            </span>
                          ) : (
                            <span className="text-[8px] text-slate-300 font-medium italic">Sem grupo</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(client.abi_status, client.impugnation_status)}
                          <span className={cn(
                            "font-bold text-[9px] uppercase border px-2 py-0.5 rounded-full whitespace-nowrap",
                            client.impugnation_status === "Finalizou" ? "bg-green-50 text-green-700 border-green-200" :
                            client.impugnation_status === "Impugnando" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                            client.abi_status === "Importado e Analisado" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                            client.abi_status === "Importado, falta analisar" ? "bg-orange-50 text-orange-700 border-orange-100" :
                            client.abi_status === "Importado" ? "bg-sky-50 text-sky-700 border-sky-100" :
                            client.abi_status === "Falha na Análise" || client.abi_status === "Falha" ? "bg-rose-50 text-rose-700 border-rose-100" :
                            client.abi_status === "Nao Importado" || client.abi_status === "Não Importado" ? "bg-slate-50 text-slate-500 border-slate-200" :
                            "bg-slate-100 text-slate-500 border-slate-200"
                          )}>
                            {client.impugnation_status === "Finalizou" ? "Finalizou" :
                             client.impugnation_status === "Impugnando" ? "Impugnando" : 
                             (client.abi_status === "Nao Importado" || client.abi_status === "Não Importado" ? "Não Importado" : (client.abi_status || "Não Checado"))}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex flex-col">
                           {(() => {
                             const lastCheck = [client.abi_last_check, (client as any).impugnation_last_check]
                               .filter(Boolean)
                               .map(d => new Date(d as string))
                               .sort((a, b) => b.getTime() - a.getTime())[0];

                             if (!lastCheck) return <span className="text-[10px] font-bold text-slate-300 italic">Nunca checado</span>;

                             return (
                               <>
                                 <span className="text-[10px] font-bold text-slate-600">
                                   {formatDistanceToNow(lastCheck, { addSuffix: true, locale: ptBR })}
                                 </span>
                                 <span className="text-[8px] text-slate-400 font-medium font-display leading-none">
                                   {lastCheck.toLocaleDateString('pt-BR')} às {lastCheck.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                 </span>
                               </>
                             );
                           })()}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="relative inline-block text-left" ref={openMenuId === client.id ? dropdownRef : null}>
                          <button 
                            onClick={() => setOpenMenuId(openMenuId === client.id ? null : client.id)}
                            className="p-2 text-slate-300 hover:text-gax-blue hover:bg-gax-blue/10 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-gax-blue/50"
                            aria-label="Ações da operadora"
                            aria-expanded={openMenuId === client.id}
                            aria-haspopup="menu"
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {openMenuId === client.id && (
                            <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-100 z-50 overflow-hidden animate-in zoom-in-95 duration-150 origin-top-right">
                              {!(client.abi_status === 'Importado e Analisado' || ['Impugnando', 'Finalizou', 'Não Iniciou', 'Nao Iniciou'].includes(client.impugnation_status || '')) && (
                                <button 
                                  onClick={() => { startCheck(client.id); setOpenMenuId(null); }}
                                  disabled={!!activeTaskId}
                                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors disabled:opacity-40"
                                >
                                  <Play size={14} /> Checar Importação
                                </button>
                              )}

                              {((client.abi_status === 'Importado e Analisado') || ['Impugnando', 'Não Iniciou', 'Nao Iniciou'].includes(client.impugnation_status || '')) && client.impugnation_status !== 'Finalizou' && (
                                <button 
                                  onClick={() => { startImpugnationCheck(client.id); setOpenMenuId(null); }}
                                  disabled={!!activeTaskId}
                                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-30 border-t border-slate-50"
                                  title={client.abi_status !== 'Importado e Analisado' ? 'Disponível apenas para clientes que já analisaram o ABI' : ''}
                                >
                                  <Scale size={14} /> Checar Impugnações
                                </button>
                              )}
                              
                              {client.abi_last_task_id ? (
                                <button 
                                  onClick={() => { openDetailedLogs(client.abi_last_task_id!, `Log da ABI: ${client.name}`, client.name); setOpenMenuId(null); }}
                                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors border-t border-slate-50"
                                >
                                  <FileText size={14} /> Ver Log ABI
                                </button>
                              ) : (
                                <button 
                                  onClick={handleViewGlobalLog}
                                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-400 hover:bg-slate-50 transition-colors border-t border-slate-50"
                                >
                                  <History size={14} /> Sem Log ABI
                                </button>
                              )}
                              {client.impugnation_last_task_id && (
                                <button 
                                  onClick={() => { openDetailedLogs(client.impugnation_last_task_id!, `Log Impugnação: ${client.name}`, client.name); setOpenMenuId(null); }}
                                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-yellow-700 hover:bg-yellow-50 transition-colors border-t border-slate-50"
                                >
                                  <Scale size={14} /> Ver Log Impugnação
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
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gax-blue to-blue-700 p-5 text-white shadow-lg shadow-gax-blue/20">
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden">
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
      {/* Floating Action Bar for Bulk Actions */}
      {selectedClients.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-6 px-6 py-4 bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl shadow-slate-900/40 min-w-[400px]">
            <div className="flex items-center gap-3 pr-6 border-r border-slate-700/50">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gax-blue/20 text-gax-blue">
                <LayoutGrid size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-none">{selectedClients.size} selecionados</span>
                <span className="text-[10px] text-slate-400 font-medium">Gestão em massa</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {filterStatus !== "Finalizou" && (
                <button 
                  onClick={() => {
                    const ids = Array.from(selectedClients);
                    const selectedClientsArr = clients.filter(c => selectedClients.has(c.id));
                    
                    const allReadyForImpugnation = selectedClientsArr.every(c => {
                      const sABI = c.abi_status || "";
                      const sIMP = c.impugnation_status || "";
                      return ["Importado e Analisado"].includes(sABI) || ["Não Iniciou", "Nao Iniciou", "Impugnando", "Finalizou"].includes(sIMP);
                    });
                    
                    const isImpugnContext = ["Não Inic. Impug.", "Impugnando", "Analisados"].includes(filterStatus || "");
                    const actionType = (allReadyForImpugnation || isImpugnContext) ? "impugnações" : "importações/ABI";

                    if (window.confirm(`Deseja iniciar a checagem de ${actionType} para ${selectedClients.size} operadoras?`)) {
                      if (allReadyForImpugnation || isImpugnContext) {
                        startImpugnationCheck(undefined, ids);
                      } else {
                        startCheck(undefined, ids);
                      }
                      setSelectedClients(new Set());
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gax-blue/10 text-gax-blue hover:bg-gax-blue hover:text-white transition-all text-xs font-bold"
                >
                  <Play size={14} />
                  {(() => {
                    const selectedClientsArr = clients.filter(c => selectedClients.has(c.id));
                    const allReadyForImpugnation = selectedClientsArr.every(c => {
                      const sABI = c.abi_status || "";
                      const sIMP = c.impugnation_status || "";
                      return ["Importado e Analisado"].includes(sABI) || ["Não Iniciou", "Nao Iniciou", "Impugnando", "Finalizou"].includes(sIMP);
                    });
                    const isImpugnContext = ["Não Inic. Impug.", "Impugnando", "Analisados"].includes(filterStatus || "");
                    return (allReadyForImpugnation || isImpugnContext) ? "Checar Impugnações" : "Checar ABI";
                  })()}
                </button>
              )}
              
              <button 
                onClick={() => setSelectedClients(new Set())}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all text-xs font-bold"
              >
                <X size={14} />
                Desmarcar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
