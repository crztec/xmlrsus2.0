"use client";

import React, { useState, useEffect } from "react";
import { Puzzle, Save, Loader2, Plus, Trash2, Wifi, WifiOff, QrCode, Phone, Globe, Key } from "lucide-react";

export default function IntegrationsPage() {
  const [evoUrl, setEvoUrl] = useState("http://34.75.185.221:8080");
  const [evoKey, setEvoKey] = useState("92367wC!");
  const [instanceName, setInstanceName] = useState("");
  const [numbers, setNumbers] = useState<string[]>(["5527997629236"]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
          setEvoUrl(data.url || "http://34.75.185.221:8080");
          setEvoKey(data.api_key || "92367wC!");
          setInstanceName(data.instance_name || "");
          if (data.target_numbers && data.target_numbers.length > 0) {
            setNumbers(data.target_numbers);
          }
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: evoUrl, api_key: evoKey, instance_name: instanceName, target_numbers: numbers.filter(n => n.trim()) }),
      });
      if (res.ok) alert("Configuração salva com sucesso!");
      else alert("Erro ao salvar configuração.");
    } catch { alert("Erro de conexão."); }
    finally { setIsSaving(false); }
  };

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    setInstanceStatus(null);
    try {
      const res = await fetch("/api/whatsapp/instance/status");
      const data = await res.json();
      setInstanceStatus(data);
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
        {/* Card: WhatsApp Config */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-4 border-b border-slate-100/50 pb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 shadow-inner">
              <Puzzle size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">WhatsApp - Evolution API</h2>
              <p className="text-[11px] text-slate-400">Configurações de conexão e destinatários de alertas</p>
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

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nome da Instância</label>
              <div className="relative">
                <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="text" value={instanceName} onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Ex: GaxBot"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium font-mono" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Números de Destino</label>
                <button onClick={addNumber} className="flex items-center gap-1 text-[10px] text-gax-blue font-bold hover:text-gax-blue-hover transition-colors">
                  <Plus size={12} /> Adicionar
                </button>
              </div>
              <div className="space-y-2">
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
          </div>

          <button onClick={handleSaveConfig} disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Salvar Configuração
          </button>
        </section>

        {/* Card: Instance Management */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-4 border-b border-slate-100/50 pb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 shadow-inner">
              <Wifi size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Gestão da Instância</h2>
              <p className="text-[11px] text-slate-400">Controle a instância <span className="font-bold text-slate-600">'{instanceName}'</span> da Evolution API</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <button onClick={handleCheckStatus} disabled={isCheckingStatus}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                {isCheckingStatus ? <Loader2 className="animate-spin" size={14} /> : <Wifi size={14} />}
                Verificar Status
              </button>
              <button onClick={handleCreateInstance} disabled={isCreating}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                {isCreating ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                Criar Instância
              </button>
              <button onClick={handleGetQR} disabled={isLoadingQR}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700 transition-all disabled:opacity-50 shadow-lg shadow-violet-600/20">
                {isLoadingQR ? <Loader2 className="animate-spin" size={14} /> : <QrCode size={14} />}
                Gerar QR Code
              </button>
            </div>

            {/* Status Result */}
            {instanceStatus && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2 animate-in slide-in-from-top-2 duration-300">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Status da Instância</p>
                {instanceStatus.error ? (
                  <div className="flex items-center gap-2 text-red-500">
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
                <p className="text-xs font-bold text-violet-800 uppercase tracking-wider">Escaneie o QR Code com o WhatsApp</p>
                <div className="bg-white rounded-2xl p-4 shadow-lg">
                  <img src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code WhatsApp" className="w-64 h-64 object-contain" />
                </div>
                <p className="text-[10px] text-violet-500 font-medium">O código expira em alguns segundos. Gere novamente se necessário.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
