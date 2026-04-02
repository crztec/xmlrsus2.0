"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
  level: "INFO" | "WARNING" | "ERROR";
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      if (data.status === "success") {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Erro ao buscar auditoria:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (confirm("ATENÇÃO: Deseja realmente excluir todos os registros de auditoria? Apenas os últimos 30 dias são mantidos por padrão.")) {
      setIsClearing(true);
      try {
        const res = await fetch("/api/audit", { method: "DELETE" });
        if (res.ok) {
          alert("Logs de auditoria apagados com sucesso.");
          fetchLogs();
        } else {
          alert("Erro ao apagar logs.");
        }
      } catch (err) {
        alert("Erro de conexão.");
      } finally {
        setIsClearing(false);
      }
    }
  };

  const totalPages = Math.ceil(logs.length / itemsPerPage);
  const currentLogs = logs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "INFO": return <Info size={16} className="text-blue-600" />;
      case "WARNING": return <AlertTriangle size={16} className="text-amber-600" />;
      case "ERROR": return <AlertCircle size={16} className="text-red-600" />;
      default: return <Info size={16} />;
    }
  };

  return (
    <div className="flex flex-col gap-8 p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="text-gax-blue" size={28} />
            Logs de Auditoria de Sistema
          </h1>
          <p className="text-sm text-slate-500 mt-1">Rastreabilidade completa de ações dos usuários na plataforma.</p>
        </div>
        <button
          onClick={handleClearLogs}
          disabled={isClearing || logs.length === 0}
          className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          {isClearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          Excluir Histórico
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3 text-amber-800">
          <AlertTriangle size={20} className="shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Política de Retenção</p>
            <p className="mt-1">Para otimização do banco de dados, registros de auditoria com mais de <b>30 dias</b> são apagados automaticamente pelo sistema.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold">Data / Hora</th>
                <th className="px-6 py-4 font-bold">Nível</th>
                <th className="px-6 py-4 font-bold">Usuário</th>
                <th className="px-6 py-4 font-bold">Ação</th>
                <th className="px-6 py-4 font-bold">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Loader2 className="mx-auto animate-spin text-gax-blue" size={24} />
                    <p className="mt-2 text-xs text-slate-400">Carregando auditoria...</p>
                  </td>
                </tr>
              ) : currentLogs.length > 0 ? (
                currentLogs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-[11px] text-slate-500">{log.timestamp}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                        log.level === "INFO" && "bg-blue-50 text-blue-600",
                        log.level === "WARNING" && "bg-amber-50 text-amber-600",
                        log.level === "ERROR" && "bg-red-50 text-red-600"
                      )}>
                        {getLevelIcon(log.level)}
                        {log.level}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-700">{log.user}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-bold text-slate-800">{log.action}</td>
                    <td className="px-6 py-4 text-xs max-w-xs truncate" title={log.details}>{log.details}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">Nenhum registro encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/30 px-6 py-4">
            <span className="text-xs text-slate-500 font-medium">
              Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, logs.length)} de {logs.length} registros
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
              >
                Primeira
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                aria-label="Anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-slate-700 px-2">
                {currentPage} / {totalPages || 1}
              </span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || logs.length === 0}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                aria-label="Próxima"
              >
                <ChevronRight size={16} />
              </button>
              <button 
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
              >
                Última
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
