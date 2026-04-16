"use client";

import React, { useState, useEffect } from "react";
import {
  ClipboardList,
  History,
  FileCheck,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Trash2,
  Filter,
  ArrowUpDown,
  Search,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/apiClient";


interface Task {
  id: string;
  status: string;
  created_at: string;
  razao_social: string;
  total_arquivos: number;
  arquivos_processados: number;
  logs: any[];
  abi_list?: string[];
  error_message?: string;
  file_results?: { abi: string; status: string }[];
}

/* ─────────────── helpers ─────────────── */

function formatDateBR(raw: string): { date: string; time: string; relative: string } {
  try {
    // raw = "2026-04-01 15:34:22" or ISO
    const normalised = raw.replace(" ", "T");
    const d = new Date(normalised);
    if (isNaN(d.getTime())) throw new Error("Invalid date");

    const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    let relative = "";
    if (mins < 1) relative = "Agora mesmo";
    else if (mins < 60) relative = `Há ${mins} min`;
    else if (hours < 24) relative = `Há ${hours}h`;
    else if (days < 7) relative = `Há ${days} dia${days > 1 ? "s" : ""}`;
    else relative = date;

    return { date, time, relative };
  } catch {
    return { date: raw, time: "", relative: "" };
  }
}

function getTaskStatus(task: Task): "success" | "error" | "running" | "warning" {
  if (task.status === "ERRO") return "error";
  if (task.status === "EM ANDAMENTO") return "running";
  if (task.status === "CONCLUIDO") {
    if (task.file_results && task.file_results.some((f) => f.status === "ERRO")) return "warning";
    return "success";
  }
  return "warning";
}

/* ─────────────── Main Component ─────────────── */

export default function LogsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, success: 0, errors: 0, successRate: "0%" });
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "error">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = 12;

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient(`/api/tasks?t=${Date.now()}&exclude_api=true`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const allData = await res.json();

      const MONITORING_TYPES = [
        "batch_api_check", "single_api_check", "api_check_batch", "api_check_single",
        "abi_check_batch", "abi_check_single",
      ];
      const data = allData.filter((t: Task) => !MONITORING_TYPES.includes((t as any).type));

      setTasks(data);

      const total = data.length;
      const success = data.filter((t: Task) =>
        t.status === "CONCLUIDO" &&
        (!t.file_results || t.file_results.length === 0 || t.file_results.every((f: any) => f.status === "SUCESSO"))
      ).length;
      const errors = data.filter((t: Task) =>
        t.status === "ERRO" || (t.file_results && t.file_results.some((f: any) => f.status === "ERRO"))
      ).length;

      setStats({
        total,
        success,
        errors,
        successRate: total > 0 ? `${Math.round((success / total) * 100)}%` : "0%",
      });
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleClearLogs = async () => {
    if (confirm("Deseja realmente limpar todos os logs do banco de dados?")) {
      try {
        await apiClient("/api/maintenance/clear-logs", { method: "POST" });
        fetchTasks();
      } catch {
        alert("Erro ao limpar logs.");
      }
    }
  };

  /* ─── filtering ─── */
  const filteredTasks = tasks.filter((t) => {
    const statusMatch =
      filterStatus === "all" ||
      (filterStatus === "success" && getTaskStatus(t) === "success") ||
      (filterStatus === "error" && (getTaskStatus(t) === "error" || getTaskStatus(t) === "warning"));
    const searchMatch =
      !searchTerm ||
      (t.razao_social && t.razao_social.toLowerCase().includes(searchTerm.toLowerCase()));
    return statusMatch && searchMatch;
  });

  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchTerm]);

  /* ─── Status config map ─── */
  const statusConfig = {
    success: {
      icon: <CheckCircle2 size={16} />,
      label: "Sucesso",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-100",
      dot: "bg-emerald-500",
      ring: "ring-emerald-500/20",
    },
    error: {
      icon: <XCircle size={16} />,
      label: "Erro",
      bg: "bg-rose-50",
      text: "text-rose-700",
      border: "border-rose-100",
      dot: "bg-rose-500",
      ring: "ring-rose-500/20",
    },
    warning: {
      icon: <AlertTriangle size={16} />,
      label: "Parcial",
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-100",
      dot: "bg-amber-500",
      ring: "ring-amber-500/20",
    },
    running: {
      icon: <Loader2 size={16} className="animate-spin" />,
      label: "Em Andamento",
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-100",
      dot: "bg-blue-500",
      ring: "ring-blue-500/20",
    },
  };

  return (
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div></div>

      {/* ═══════ STATS STRIP ═══════ */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {[
          {
            label: "Total Processado",
            value: stats.total,
            icon: <History size={20} />,
            color: "text-gax-blue",
            bg: "bg-gax-blue/5",
            border: "border-gax-blue/10",
          },
          {
            label: "Importados com Sucesso",
            value: stats.success,
            icon: <CheckCircle2 size={20} />,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            border: "border-emerald-100",
          },
          {
            label: "Falhas Detectadas",
            value: stats.errors,
            icon: <XCircle size={20} />,
            color: "text-rose-600",
            bg: "bg-rose-50",
            border: "border-rose-100",
          },
          {
            label: "Taxa de Sucesso",
            value: stats.successRate,
            icon: <FileCheck size={20} />,
            color: "text-gax-blue",
            bg: "bg-gax-blue/5",
            border: "border-gax-blue/10",
          },
        ].map((s, i) => (
          <div
            key={i}
            className={cn(
              "group flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md",
              s.border
            )}
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
          >
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl shrink-0 transition-transform group-hover:scale-105", s.bg, s.color)}>
              {s.icon}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">{s.label}</p>
              <p className={cn("text-2xl font-black tracking-tight", s.color)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════ TOOLBAR ═══════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
        <div className="flex items-center gap-3">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/60 bg-white p-1 shadow-sm">
            {(["all", "success", "error"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                  filterStatus === f
                    ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                )}
              >
                {f === "all" ? "Todos" : f === "success" ? "Sucesso" : "Falhas"}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={14} />
            <input
              type="text"
              placeholder="Buscar operadora..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-48 rounded-xl border border-slate-200/60 bg-white pl-9 pr-4 py-2 text-[11px] font-medium text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all placeholder:text-slate-300 shadow-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasks}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-50 transition-all shadow-sm"
          >
            <RefreshCw size={12} />
            Atualizar
          </button>
          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-100 bg-rose-50 text-rose-600 text-[10px] font-bold uppercase tracking-wider hover:bg-rose-100 transition-all shadow-sm"
          >
            <Trash2 size={12} />
            Limpar Tudo
          </button>
        </div>
      </div>

      {/* ═══════ LOG TABLE ═══════ */}
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="animate-spin text-gax-blue" size={32} />
            <p className="text-xs font-medium text-slate-400">Carregando histórico...</p>
          </div>
        ) : paginatedTasks.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 w-[140px]">Data/Hora</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Operadora</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 w-[120px]">Status</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 w-[100px] text-center">Arquivos</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">ABIs Processadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedTasks.map((task, idx) => {
                    const st = getTaskStatus(task);
                    const cfg = statusConfig[st];
                    const { date, time, relative } = formatDateBR(task.created_at);

                    return (
                      <tr
                        key={task.id}
                        className="group transition-colors hover:bg-slate-50/60 animate-in fade-in duration-300"
                        style={{ animationDelay: `${(idx % 12) * 25}ms` }}
                      >
                        {/* Date/Time */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700 tabular-nums">{time}</span>
                            <span className="text-[10px] font-medium text-slate-400">{date}</span>
                            <span className="text-[9px] font-medium text-gax-blue/70 mt-0.5">{relative}</span>
                          </div>
                        </td>

                        {/* Operadora */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800 leading-tight">
                              {task.razao_social || "Cliente Geral"}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400 mt-0.5">
                              {task.status === "CONCLUIDO"
                                ? `Processamento finalizado: ${task.total_arquivos} arquivo${task.total_arquivos !== 1 ? "s" : ""}`
                                : task.status === "EM ANDAMENTO"
                                ? `Em progresso: ${task.arquivos_processados}/${task.total_arquivos}`
                                : task.error_message
                                ? `Erro: ${task.error_message}`
                                : `Status: ${task.status}`}
                            </span>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-6 py-4">
                          <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 border", cfg.bg, cfg.text, cfg.border)}>
                            {cfg.icon}
                            <span className="text-[10px] font-bold uppercase tracking-wider">{cfg.label}</span>
                          </div>
                        </td>

                        {/* Arquivos */}
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-bold text-slate-700 tabular-nums">
                            {task.total_arquivos || 0}
                          </span>
                        </td>

                        {/* ABI Results */}
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {task.file_results && task.file_results.length > 0 ? (
                              task.file_results.map((res, rIdx) => (
                                <span
                                  key={rIdx}
                                  title={`ABI ${res.abi} — ${res.status}`}
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md border transition-all",
                                    res.status === "SUCESSO"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                      : res.status === "ERRO"
                                      ? "bg-rose-50 text-rose-700 border-rose-100"
                                      : res.status === "SUBSTITUIDO"
                                      ? "bg-slate-50 text-slate-400 border-slate-100 line-through"
                                      : "bg-blue-50 text-blue-700 border-blue-100"
                                  )}
                                >
                                  {res.status === "SUCESSO" && <CheckCircle2 size={8} />}
                                  {res.status === "ERRO" && <XCircle size={8} />}
                                  {res.abi}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-300 italic">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4">
                <span className="text-xs font-medium text-slate-500">
                  Mostrando {(currentPage - 1) * itemsPerPage + 1} a{" "}
                  {Math.min(currentPage * itemsPerPage, filteredTasks.length)} de {filteredTasks.length} registros
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                  >
                    Primeira
                  </button>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                    aria-label="Anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-bold text-slate-700 px-2 tabular-nums">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || filteredTasks.length === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                    aria-label="Próxima"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                  >
                    Última
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-24 flex flex-col items-center text-slate-300">
            <ClipboardList size={48} className="opacity-20 mb-4" />
            <p className="text-sm font-bold text-slate-400">Nenhum registro encontrado.</p>
            <p className="text-[10px] text-slate-300 mt-1">
              {filterStatus !== "all" || searchTerm
                ? "Tente ajustar os filtros acima."
                : "Os logs de importação aparecerão aqui automaticamente."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
