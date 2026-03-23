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
  ClipboardList,
  AlertTriangle 
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [logs, setLogs] = useState<{status: 'success' | 'error' | 'processing' | 'info' | 'debug', message: string, time: string}[]>([]);
  const [showDetailedLogs, setShowDetailedLogs] = useState(false);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const addLog = (message: string, status: 'success' | 'error' | 'processing' | 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [{ status, message, time }, ...prev].slice(0, 500));
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
    let interval: any;
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
              status: l.level.toLowerCase() as any,
              message: l.message,
              time: l.timestamp
            })));
          }

          if (data.status === 'CONCLUIDO' || data.status === 'ERRO') {
            // Pequeno delay para garantir que o último set de logs (com a mensagem final) foi processado
            setTimeout(() => {
              localStorage.removeItem("activeTaskId");
              setActiveTaskId(null);
            }, 2000);
          }
        } catch (e) {
          console.error("Erro polling", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTaskId]);

  const handleUpload = async (force = false) => {
    if (files.length === 0) return;
    if (!rsusUrl || !rsusUser || !rsusPass) {
      alert("Por favor, preencha as credenciais do RSUS antes de iniciar.");
      return;
    }

    if (rememberCreds) {
      localStorage.setItem("rsusUrl", rsusUrl);
      localStorage.setItem("rsusUser", rsusUser);
    }

    // Se não for "force", faz o pre-check primeiro
    if (!force) {
      setIsChecking(true);
      try {
        const formDataCheck = new FormData();
        files.forEach(f => formDataCheck.append("files", f));
        
        const resCheck = await fetch("/api/pre-check", {
          method: "POST",
          body: formDataCheck
        });
        
        if (resCheck.ok) {
          const dataCheck = await resCheck.json();
          if (dataCheck.duplicates && dataCheck.duplicates.length > 0) {
            setDuplicates(dataCheck.duplicates);
            setShowConfirmModal(true);
            setIsChecking(false);
            return;
          }
        }
      } catch (e) {
        console.error("Erro no pre-check", e);
      } finally {
        setIsChecking(false);
      }
    }

    setShowConfirmModal(false);
    setIsUploading(true);
    addLog(`Iniciando upload de ${files.length} arquivos...`, 'info');

    const formData = new FormData();
    files.forEach(f => formData.append("files", f));
    formData.append("url_sistema", rsusUrl);
    formData.append("usuario", rsusUser);
    formData.append("senha", rsusPass);
    formData.append("gax_user_email", localStorage.getItem("gax_user_email") || "Admin/Sistema");
    if (force) formData.append("force", "true");

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
          <div></div>
          {files.length > 0 && (
            <button 
              onClick={() => handleUpload(false)}
              disabled={isUploading || isChecking}
              className="flex items-center gap-2 rounded-xl bg-gax-blue px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover active:scale-95 disabled:opacity-50"
            >
              {isUploading || isChecking ? <Loader2 size={18} className="animate-spin" /> : <Rocket size={18} />}
              {isChecking ? "Validando..." : isUploading ? "Enviando..." : "Iniciar Processamento"}
            </button>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="rsusUrlInput" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">URL do Sistema RSUS</label>
            <input 
              id="rsusUrlInput"
              type="text" 
              placeholder="https://..." 
              value={rsusUrl}
              onChange={(e) => setRsusUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium placeholder:text-slate-300"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="rsusUserInput" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuário</label>
            <input 
              id="rsusUserInput"
              type="text" 
              placeholder="Digite seu login" 
              value={rsusUser}
              onChange={(e) => setRsusUser(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium placeholder:text-slate-300"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="rsusPassInput" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Senha</label>
            <input 
              id="rsusPassInput"
              type="password" 
              placeholder="••••••••" 
              value={rsusPass}
              onChange={(e) => setRsusPass(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium placeholder:text-slate-300"
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
                  className="absolute -right-1 -top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm transition-all hover:text-red-500 group-hover:flex focus-visible:ring-2 focus-visible:ring-red-200 outline-none"
                  aria-label={`Remover arquivo ${file.name}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Monitoring Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-800">Acompanhamento da Importação</h3>
          {logs.length > 0 && (
            <button 
              onClick={() => setShowDetailedLogs(true)}
              className="text-xs font-bold text-gax-blue hover:underline"
            >
              Ver Logs Detalhados
            </button>
          )}
        </div>
        
        {logs.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 max-h-[500px] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {logs
                  .filter(log => log.status !== 'debug') // Filtra para o resumo
                  .slice(0, 5) // Limita para exibir apenas as primeiras 5 linhas (mais recentes)
                  .map((log, i) => (
                    <LogEntry key={i} status={log.status as any} message={log.message} time={log.time} />
                  ))
                }
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

      {/* Detailed Log Modal */}
      {showDetailedLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Log Detalhado de Execução</h3>
                <p className="text-xs text-slate-500">Trace técnico completo para suporte e desenvolvimento</p>
              </div>
              <button 
                onClick={() => setShowDetailedLogs(false)}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 font-mono text-[10px] bg-slate-950 text-slate-300 custom-scrollbar">
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 border-b border-white/5 pb-2">
                    <span className="shrink-0 text-white/30">[{log.time}]</span>
                    <span className={cn(
                      "shrink-0 font-bold px-1 rounded uppercase",
                      log.status === 'error' && "bg-red-500/20 text-red-400",
                      log.status === 'success' && "bg-green-500/20 text-green-400",
                      log.status === 'debug' && "bg-slate-500/20 text-slate-400",
                      log.status === 'info' && "bg-blue-500/20 text-blue-400"
                    )}>{log.status}</span>
                    <span className="whitespace-pre-wrap">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-100 p-4 flex justify-end">
               <button 
                onClick={() => setShowDetailedLogs(false)}
                className="px-6 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors"
               >
                Fechar
               </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Duplicatas */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-slate-50/50 p-6">
              <div className="flex items-center gap-3 text-amber-600">
                <AlertCircle size={24} />
                <h4 className="text-lg font-bold">ABIs já importados</h4>
              </div>
            </div>
            <div className="p-6">
              <p className="mb-4 text-sm text-slate-600">
                Identificamos que os seguintes ABIs já foram enviados com sucesso anteriormente:
              </p>
              <div className="mb-6 flex flex-wrap gap-2">
                {duplicates.map(abi => (
                  <span key={abi} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 border border-slate-200">
                    ABI {abi}
                  </span>
                ))}
              </div>
              <p className="mb-6 text-sm font-medium text-slate-800">
                Deseja reenviar e substituir essas informações no portal da ANS?
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleUpload(true)}
                  className="flex-1 rounded-xl bg-amber-600 py-3 text-sm font-bold text-white shadow-lg shadow-amber-600/20 transition-all hover:bg-amber-700 active:scale-95"
                >
                  Sim, Substituir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LogEntry({ status, message, time }: { status: 'success' | 'error' | 'processing' | 'info' | 'debug' | 'warning', message: string, time: string }) {
  return (
    <div className="flex items-center gap-3 text-xs animate-in fade-in slide-in-from-top-1 duration-300">
      {status === 'success' && <CheckCircle2 size={16} className="text-green-500" />}
      {status === 'error' && <AlertCircle size={16} className="text-red-500" />}
      {status === 'warning' && <AlertTriangle size={16} className="text-amber-500" />}
      {status === 'info' && <Rocket size={16} className="text-gax-blue" />}
      {status === 'debug' && <FileText size={16} className="text-slate-400" />}
      {status === 'processing' && <Loader2 size={16} className="animate-spin text-gax-blue" />}
      <span className={cn(
        "font-medium",
        status === 'success' && "text-green-700",
        status === 'error' && "text-red-700",
        status === 'warning' && "text-amber-700",
        status === 'info' && "text-gax-blue",
        status === 'processing' && "text-slate-600"
      )}>
        {message}
      </span>
      <span className="ml-auto text-[10px] text-slate-400">{time}</span>
    </div>
  );
}
