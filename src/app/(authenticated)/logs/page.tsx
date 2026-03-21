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
  abi_list?: string[]; 
  error_message?: string;
}

export default function LogsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, successRate: "0%", alerts: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      
      // Deduplicar tarefas por conteúdo (cliente + data + status)
      // Resolve casos onde registros idênticos possuem IDs técnicos diferentes
      const uniqueTasks = data.reduce((acc: Task[], current: Task) => {
        const isDuplicate = acc.find(t => 
          t.razao_social === current.razao_social && 
          t.created_at === current.created_at &&
          t.status === current.status
        );
        if (!isDuplicate) {
          acc.push(current);
        }
        return acc;
      }, []);
      
      setTasks(uniqueTasks);
      
      // Calcular estatísticas com base nos dados únicos
      const total = uniqueTasks.length;
      const success = uniqueTasks.filter((t: any) => t.status === 'CONCLUIDO').length;
      const alerts = uniqueTasks.filter((t: any) => t.status === 'ERRO').length;
      
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
              <>
                {tasks
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((task) => (
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
                        : task.status === 'ERRO' && task.error_message
                        ? `Erro: ${task.error_message}`
                        : `Status: ${task.status}`
                      }
                      abis={task.logs?.filter(l => l.message && l.message.includes("ABI")).map(l => {
                        const m = l.message.match(/ABI\s*:?\s*(\d+)/i);
                        if (!m) return null;
                        const abi = m[1].trim();
                        // Ignorar se parecer uma data (8 dígitos, ex: 14122020)
                        if (abi.length === 8) return null;
                        return abi;
                      }).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                    />
                  ))
                }
                
                {/* Pagination Controls */}
                <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/30 px-6 py-4">
                  <span className="text-xs text-slate-500 font-medium">
                    Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, tasks.length)} de {tasks.length} registros
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
                    >
                      Anterior
                    </button>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(tasks.length / itemsPerPage)))}
                      disabled={currentPage === Math.ceil(tasks.length / itemsPerPage)}
                      className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </>
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

function LogItem({ time, date, type, title, message, abis }: { time: string, date: string, type: 'success' | 'error' | 'info', title: string, message: string, abis?: string }) {
  return (
    <div className="group flex gap-4 px-6 py-5 transition-all hover:bg-slate-50/30">
      <div className="flex flex-col items-end min-w-[70px]">
        <span className="text-[10px] font-bold tabular-nums text-slate-500">{time}</span>
        <span className="text-[8px] text-slate-300 uppercase font-medium">{date}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-4">
          <h4 className={`text-xs font-bold ${
            type === 'success' ? 'text-green-600' : type === 'error' ? 'text-red-600' : 'text-slate-800'
          }`}>{title}</h4>
          {abis && (
            <span className="text-[10px] font-bold text-gax-blue bg-gax-blue-light/30 px-2 py-0.5 rounded-full">
              ABIs: {abis}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{message}</p>
      </div>
    </div>
  );
}
