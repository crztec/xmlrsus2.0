"use client";

import React, { useState, useEffect } from "react";
import { ClipboardList, History, FileCheck, AlertTriangle, Loader2 } from "lucide-react";

interface Task {
  id: string;
  status: string;
  created_at: string;
  razao_social: string;
  total_arquivos: number;
  arquivos_processados: number;
  logs: any[];
}

export default function LogsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, successRate: "0%", alerts: 0 });

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data);
      
      // Calcular estatísticas básicas
      const total = data.length;
      const success = data.filter((t: any) => t.status === 'CONCLUIDO').length;
      const alerts = data.filter((t: any) => t.status === 'ERRO').length;
      
      setStats({
        total,
        successRate: total > 0 ? `${Math.round((success / total) * 100)}%` : "0%",
        alerts
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
        await fetch("/api/maintenance/clear-logs", { method: 'POST' });
        fetchTasks();
      } catch (error) {
        alert("Erro ao limpar logs.");
      }
    }
  };

  return (
    <div className="space-y-6 text-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Histórico de Importações</h1>
        <p className="text-sm text-slate-500">Logs detalhados de cada processamento realizado pelo robô</p>
      </div>

      <div className="flex gap-4">
        <StatCard icon={<History className="text-gax-blue" />} label="Total Processado" value={stats.total.toString()} />
        <StatCard icon={<FileCheck className="text-green-500" />} label="Sucesso" value={stats.successRate} />
        <StatCard icon={<AlertTriangle className="text-amber-500" />} label="Erros/Alertas" value={stats.alerts.toString()} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
         <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Atividade Recente</span>
            <button 
              onClick={handleClearLogs}
              className="text-xs font-bold text-gax-blue hover:text-gax-blue-hover transition-colors"
            >
              Limpar Logs
            </button>
         </div>
         
         <div className="divide-y divide-slate-50">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-gax-blue" size={32} />
              </div>
            ) : tasks.length > 0 ? (
              tasks.map((task) => (
                <LogItem 
                  key={task.id}
                  time={task.created_at.split(' ')[1].substring(0, 5)} 
                  date={task.created_at.split(' ')[0]}
                  type={task.status === 'CONCLUIDO' ? 'success' : task.status === 'ERRO' ? 'error' : 'info'} 
                  title={`${task.razao_social || 'Cliente Geral'}`} 
                  message={
                    task.status === 'CONCLUIDO' 
                    ? `Processamento finalizado: ${task.total_arquivos} arquivos.` 
                    : task.status === 'EM ANDAMENTO'
                    ? `Em progresso: ${task.arquivos_processados}/${task.total_arquivos} arquivos.`
                    : `Status: ${task.status}`
                  } 
                />
              ))
            ) : (
              <div className="py-20 flex flex-col items-center text-slate-300">
                <ClipboardList size={48} className="opacity-20 mb-4" />
                <p className="font-medium">Nenhum registro encontrado.</p>
              </div>
            )}
         </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex flex-1 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-600 shadow-inner">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-xl font-black text-slate-800 tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function LogItem({ time, date, type, title, message }: { time: string, date: string, type: 'success' | 'error' | 'info', title: string, message: string }) {
  return (
    <div className="group flex gap-4 px-6 py-5 transition-all hover:bg-slate-50/30">
      <div className="flex flex-col items-end min-w-[70px]">
        <span className="text-[10px] font-bold tabular-nums text-slate-500">{time}</span>
        <span className="text-[8px] text-slate-300 uppercase font-medium">{date}</span>
      </div>
      <div className="flex-1">
        <h4 className={`text-xs font-bold ${
          type === 'success' ? 'text-green-600' : type === 'error' ? 'text-red-600' : 'text-slate-800'
        }`}>{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{message}</p>
      </div>
    </div>
  );
}
