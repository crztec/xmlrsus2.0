"use client";

import React, { useState, useEffect } from "react";
import { Puzzle, Save, Loader2, Plus, Trash2, Wifi, WifiOff, QrCode, Phone, Globe, Key } from "lucide-react";

export default function IntegrationsPage() {
  const [evoUrl, setEvoUrl] = useState("");
  const [evoKey, setEvoKey] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [numbers, setNumbers] = useState<string[]>([]);
  const [testMessage, setTestMessage] = useState("🔔 Teste de Conexão GAX - Evolution API está funcionando!");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingServer, setIsSavingServer] = useState(false);
  const [isSavingInstance, setIsSavingInstance] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<any>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }

    fetch("/api/whatsapp/config")
      .then(res => res.json())
      .then(data => {
        if (data && !data.detail) {
          setEvoUrl(data.url || "");
          setEvoKey(data.api_key || "");
          setInstanceName(data.instance_name || "");
          if (data.target_numbers && data.target_numbers.length > 0) {
            setNumbers(data.target_numbers);
          }
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleSaveServerConfig = async () => {
    setIsSavingServer(true);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: evoUrl, 
          api_key: evoKey, 
          instance_name: instanceName,
          target_numbers: numbers.filter(n => n.trim()) 
        }),
      });
      if (res.ok) alert("Configuração do servidor salva com sucesso!");
      else {
        const err = await res.json();
        alert(err.detail || "Erro ao salvar configuração.");
      }
    } catch { alert("Erro de conexão."); }
    finally { setIsSavingServer(false); }
  };

  const handleSaveInstanceConfig = async () => {
    setIsSavingInstance(true);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: evoUrl,
          api_key: evoKey,
          instance_name: instanceName,
          target_numbers: numbers.filter(n => n.trim())
        }),
      });
      if (res.ok) alert("Nome da instância salvo com sucesso!");
      else {
        const err = await res.json();
        alert(err.detail || "Erro ao salvar nome da instância.");
      }
    } catch { alert("Erro de conexão."); }
    finally { setIsSavingInstance(false); }
  };

  const handleSendTest = async () => {
    if (!testMessage.trim()) return alert("Digite uma mensagem de teste.");
    setIsTesting(true);
    try {
      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = await res.json();
      if (res.ok) alert(data.message || "Mensagem enviada!");
      else alert(data.detail || "Erro ao enviar mensagem de teste.");
    } catch { alert("Erro de conexão."); }
    finally { setIsTesting(false); }
  };

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    setInstanceStatus(null);
    try {
      const res = await fetch("/api/whatsapp/instance/status");
      const data = await res.json();
      if (!res.ok) {
        setInstanceStatus({ error: data.detail || "Erro ao consultar status." });
      } else {
        setInstanceStatus(data);
      }
    } catch { setInstanceStatus({ error: "Erro de conexão com a API." }); }
    finally { setIsCheckingStatus(false); }
  };

  const handleCreateInstance = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/whatsapp/instance/create", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert("Instância criada com sucesso!");
        setInstanceStatus(data);
      } else {
        alert(data.detail || "Erro ao criar instância.");
      }
    } catch { alert("Erro de conexão."); }
    finally { setIsCreating(false); }
  };

  const handleGetQR = async () => {
    setIsLoadingQR(true);
    setQrCode(null);
    try {
      const res = await fetch("/api/whatsapp/instance/qrcode");
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Erro ao gerar QR Code.");
        return;
      }
      if (data.base64) {
        setQrCode(data.base64);
      } else if (data.pairingCode) {
        setQrCode(null);
        alert(`Código de pareamento: ${data.pairingCode}`);
      } else {
        alert(data.message || data.detail || "Não foi possível gerar QR Code. A instância pode já estar conectada.");
      }
    } catch { alert("Erro de conexão."); }
    finally { setIsLoadingQR(false); }
  };

  const addNumber = () => setNumbers([...numbers, ""]);
  const removeNumber = (idx: number) => setNumbers(numbers.filter((_, i) => i !== idx));
  const updateNumber = (idx: number, val: string) => {
    const copy = [...numbers];
    copy[idx] = val;
    setNumbers(copy);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gax-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Card: WhatsApp Config (Server Config) */}
        <section className="flex flex-col h-fit space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-4 border-b border-slate-100/50 pb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 shadow-inner">
              <Globe size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Configuração do Servidor</h2>
              <p className="text-[11px] text-slate-400">Parâmetros globais da Evolution API e Alertas</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Evolution API URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="url" value={evoUrl} onChange={(e) => setEvoUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Global API Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="password" value={evoKey} onChange={(e) => setEvoKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium" />
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Números de Destino</label>
                <button onClick={addNumber} className="flex items-center gap-1 text-[10px] text-gax-blue font-bold hover:text-gax-blue-hover transition-colors">
                  <Plus size={12} /> Adicionar
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {numbers.map((num, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                      <input type="text" value={num} onChange={(e) => updateNumber(idx, e.target.value)}
                        placeholder="5527999999999"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-gax-blue focus:ring-2 focus:ring-gax-blue/10 text-slate-700 font-mono" />
                    </div>
                    {numbers.length > 1 && (
                      <button onClick={() => removeNumber(idx)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100/50 pt-6 mt-4">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Mensagem de Teste</label>
              <textarea 
                value={testMessage} 
                onChange={(e) => setTestMessage(e.target.value)}
                rows={2}
                maxLength={4000}
                className="w-full rounded-xl border border-slate-200 bg-white/50 p-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 text-slate-600 font-medium resize-none mb-3"
              />
              <button 
                onClick={handleSendTest} 
                disabled={isTesting || isSavingServer || isSavingInstance}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gax-blue bg-white py-2.5 text-xs font-bold text-gax-blue transition-all hover:bg-gax-blue/5 disabled:opacity-50"
              >
                {isTesting ? <Loader2 className="animate-spin" size={16} /> : <Phone size={16} />}
                Enviar Mensagem de Teste
              </button>
            </div>

            <button onClick={handleSaveServerConfig} disabled={isSavingServer || isSavingInstance}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:opacity-50">
              {isSavingServer ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Salvar Configuração do Servidor
            </button>
          </div>
        </section>

        {/* Card: Instance Management (Session Config) */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm h-fit">
          <div className="flex items-center gap-4 border-b border-slate-100/50 pb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 shadow-inner">
              <Wifi size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Gestão da Instância</h2>
              <p className="text-[11px] text-slate-400">Controle a sessão atual no WhatsApp</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nome da Instância</label>
                <div className="relative">
                  <Puzzle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="text" value={instanceName} onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="Ex: GaxBot"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium font-mono" />
                </div>
                <p className="mt-2 text-[10px] text-slate-400 italic leading-relaxed">
                  A instância salva será usada pelo GAX para enviar todas as mensagens e alertas.
                </p>
              </div>

              <button onClick={handleSaveInstanceConfig} disabled={isSavingInstance || isSavingServer}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-100 py-2.5 text-xs font-bold text-violet-700 transition-all hover:bg-violet-200 disabled:opacity-50">
                {isSavingInstance ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Salvar Nome da Instância
              </button>
            </div>

            <div className="flex gap-3 flex-wrap border-t border-slate-100/50 pt-6">
              <button onClick={handleCheckStatus} disabled={isCheckingStatus}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                {isCheckingStatus ? <Loader2 className="animate-spin" size={14} /> : <Wifi size={14} />}
                Verificar Status
              </button>
              <button onClick={handleCreateInstance} disabled={isCreating}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                {isCreating ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                Criar Instância
              </button>
            </div>

            <button onClick={handleGetQR} disabled={isLoadingQR}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700 transition-all disabled:opacity-50 shadow-lg shadow-violet-600/20">
              {isLoadingQR ? <Loader2 className="animate-spin" size={18} /> : <QrCode size={18} />}
              Gerar QR Code
            </button>

            {/* Status Result */}
            {instanceStatus && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Retorno da API</p>
                  {instanceStatus.instance?.state === "open" && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Conectado
                    </span>
                  )}
                </div>
                {instanceStatus.error ? (
                  <div className="flex items-center gap-2 text-red-500 bg-red-50 p-3 rounded-lg border border-red-100">
                    <WifiOff size={16} /> <span className="text-xs font-medium">{instanceStatus.error}</span>
                  </div>
                ) : (
                  <pre className="text-[11px] text-slate-600 font-mono bg-white rounded-lg p-3 border border-slate-100 overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {JSON.stringify(instanceStatus, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* QR Code Display */}
            {qrCode && (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-violet-100 bg-violet-50/50 p-6 animate-in fade-in zoom-in-95 duration-500">
                <p className="text-xs font-bold text-violet-800 uppercase tracking-wider">Escaneie o QR Code</p>
                <div className="bg-white rounded-2xl p-4 shadow-lg ring-1 ring-violet-100">
                  <img src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code WhatsApp" className="w-64 h-64 object-contain" />
                </div>
                <p className="text-[10px] text-violet-500 font-medium text-center">O código expira em alguns segundos.<br/>Se necessário, gere um novo código.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
