"use client";

import React, { useState, useEffect } from "react";
import { 
  CloudUpload, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Rocket,
  ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [logs, setLogs] = useState<{status: 'success' | 'error' | 'processing' | 'info', message: string, time: string}[]>([]);

  const addLog = (message: string, status: 'success' | 'error' | 'processing' | 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [{ status, message, time }, ...prev].slice(0, 50));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(f => f.size <= 5 * 1024 * 1024);
      const oversized = Array.from(e.target.files).filter(f => f.size > 5 * 1024 * 1024);
      if (oversized.length > 0) {
        addLog(`Ignorados ${oversized.length} arquivos que excedem 5MB.`, 'error');
      }
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Detalhes do sistema RSUS
  const [rsusUrl, setRsusUrl] = useState("");
  const [rsusUser, setRsusUser] = useState("");
  const [rsusPass, setRsusPass] = useState("");
  const [rememberCreds, setRememberCreds] = useState(true);

  // Carregar dados persistidos ao montar
  useEffect(() => {
    const savedTaskId = localStorage.getItem("activeTaskId");
    if (savedTaskId) setActiveTaskId(savedTaskId);

    const savedUrl = localStorage.getItem("rsusUrl");
    const savedUser = localStorage.getItem("rsusUser");
    if (savedUrl) setRsusUrl(savedUrl);
    if (savedUser) setRsusUser(savedUser);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTaskId) {
      localStorage.setItem("activeTaskId", activeTaskId);
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/task/${activeTaskId}`);
          if (!res.ok) {
            if (res.status === 404) {
               localStorage.removeItem("activeTaskId");
               setActiveTaskId(null);
            }
            return;
          }
          const data = await res.json();
          setProgress(data.progress);
          
          if (data.logs && data.logs.length > 0) {
            // Limpa logs locais e sincroniza com os do servidor para evitar duplicados ou sumiço
            setLogs(data.logs.map((l: any) => ({
              status: l.level === 'INFO' ? 'info' : l.level === 'SUCCESS' ? 'success' : 'error',
              message: l.message,
              time: l.timestamp
            })).reverse());
          }

          if (data.status === 'CONCLUIDO' || data.status === 'ERRO') {
            localStorage.removeItem("activeTaskId");
            setActiveTaskId(null);
            addLog(data.status === 'CONCLUIDO' ? "Processamento finalizado com sucesso!" : "Ocorreu um erro no processamento.", data.status === 'CONCLUIDO' ? 'success' : 'error');
          }
        } catch (e) {
          console.error("Erro polling", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTaskId]);

  const handleUpload = async () => {
    if (files.length === 0) return;
    if (!rsusUrl || !rsusUser || !rsusPass) {
      alert("Por favor, preencha as credenciais do RSUS antes de iniciar.");
      return;
    }

    if (rememberCreds) {
      localStorage.setItem("rsusUrl", rsusUrl);
      localStorage.setItem("rsusUser", rsusUser);
    }

    setIsUploading(true);
    addLog(`Iniciando upload de ${files.length} arquivos...`, 'info');

    const formData = new FormData();
    files.forEach(f => formData.append("files", f));
    formData.append("url_sistema", rsusUrl);
    formData.append("usuario", rsusUser);
    formData.append("senha", rsusPass);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.error) {
          addLog(data.error, "error");
        } else {
          addLog(`Upload concluído: ${data.razao_social}`, "success");
          addLog("Tarefa enviada para a fila do robô.", "info");
          setFiles([]);
          setActiveTaskId(data.task_id);
        }
      } else {
        const errorText = await response.text();
        addLog(`Erro no servidor (${response.status}): ${errorText.substring(0, 50)}...`, "error");
      }
    } catch (error: any) {
      addLog(`Erro de conexão: ${error.message || "Verifique se o backend está rodando."}`, "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Nova Importação</h3>
            <p className="text-sm text-slate-500">Selecione arquivos XML para processamento (Limite: 5MB por arquivo)</p>
          </div>
          {files.length > 0 && (
            <button 
              onClick={handleUpload}
              disabled={isUploading}
              className="flex items-center gap-2 rounded-xl bg-gax-blue px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover active:scale-95 disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Rocket size={18} />}
              {isUploading ? "Enviando..." : "Iniciar Processamento"}
            </button>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">URL do Sistema RSUS</label>
            <input 
              type="text" 
              placeholder="https://..." 
              value={rsusUrl}
              onChange={(e) => setRsusUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuário</label>
            <input 
              type="text" 
              placeholder="Digite seu login" 
              value={rsusUser}
              onChange={(e) => setRsusUser(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Senha</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={rsusPass}
              onChange={(e) => setRsusPass(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10"
            />
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <input 
            type="checkbox" 
            id="remember" 
            checked={rememberCreds}
            onChange={(e) => setRememberCreds(e.target.checked)}
            className="rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
          />
          <label htmlFor="remember" className="text-xs text-slate-500">Lembrar credenciais (salvo no navegador)</label>
        </div>

        {activeTaskId && (
          <div className="mb-8 rounded-2xl bg-gax-blue-light/30 p-4 border border-gax-blue/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-gax-blue" />
                <span className="text-xs font-bold text-gax-blue">Processamento em Andamento...</span>
              </div>
              <span className="text-xs font-bold text-gax-blue">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/50">
              <div 
                className="h-full bg-gax-blue transition-all duration-500 shadow-[0_0_10px_rgba(37,99,235,0.3)]" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        )}

        <div 
          className={cn(
            "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-10 transition-all hover:bg-slate-50",
            files.length > 0 && "border-gax-blue/30 bg-gax-blue-light/10"
          )}
        >
          <input 
            type="file" 
            multiple 
            accept=".xml" 
            onChange={handleFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md text-gax-blue">
            <CloudUpload size={32} />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-700">Arraste seus arquivos aqui ou clique para procurar</p>
          <p className="mt-1 text-xs text-slate-400">Apenas arquivos .XML são aceitos</p>
        </div>

        {files.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file, idx) => (
              <div key={idx} className="group relative flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-all hover:border-gax-blue/20 hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gax-blue-light text-gax-blue">
                  <FileText size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-xs font-bold text-slate-700">{file.name}</p>
                  <p className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button 
                  onClick={() => removeFile(idx)}
                  className="absolute -right-1 -top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm transition-all hover:text-red-500 group-hover:flex"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Monitoring Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h3 className="mb-6 text-xl font-bold text-slate-800">Log de Execução</h3>
        
        {logs.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 max-h-[500px] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {logs.map((log, i) => (
                  <LogEntry key={i} status={log.status as any} message={log.message} time={log.time} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <ClipboardList size={48} className="opacity-20" />
            <p className="mt-4 text-sm font-medium">Nenhuma atividade recente.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function LogEntry({ status, message, time }: { status: 'success' | 'error' | 'processing' | 'info', message: string, time: string }) {
  return (
    <div className="flex items-center gap-3 text-xs animate-in fade-in slide-in-from-top-1 duration-300">
      {status === 'success' && <CheckCircle2 size={16} className="text-green-500" />}
      {status === 'error' && <AlertCircle size={16} className="text-red-500" />}
      {status === 'info' && <Rocket size={16} className="text-gax-blue" />}
      {status === 'processing' && <Loader2 size={16} className="animate-spin text-gax-blue" />}
      <span className={cn(
        "font-medium",
        status === 'success' && "text-green-700",
        status === 'error' && "text-red-700",
        status === 'info' && "text-gax-blue",
        status === 'processing' && "text-slate-600"
      )}>
        {message}
      </span>
      <span className="ml-auto text-[10px] text-slate-400">{time}</span>
    </div>
  );
}
