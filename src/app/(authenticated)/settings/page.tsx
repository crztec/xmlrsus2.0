"use client";

import React, { useState, useEffect } from "react";
import { Settings, Image as ImageIcon, Type, Trash2, Save, CloudUpload, Loader2, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  const [systemName, setSystemName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    
    fetch("/api/branding")
      .then(res => res.json())
      .then(data => {
        setSystemName(data.system_name || "GAX | Integração RSUS");
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleSaveBranding = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_name: systemName }),
      });
      alert("Identidade visual atualizada com sucesso!");
    } catch (error) {
      alert("Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMaintenance = async (action: 'clear-logs' | 'reset-db') => {
    const messages = {
      'clear-logs': "Tem certeza que deseja limpar todos os logs? Esta ação não pode ser desfeita.",
      'reset-db': "ATENÇÃO: Isso apagará TODOS os dados de clientes, tarefas e arquivos. Deseja continuar?"
    };

    if (confirm(messages[action])) {
      try {
        const res = await fetch(`/api/maintenance/${action}`, { method: "POST" });
        const data = await res.json();
        alert(data.message);
      } catch (error) {
        alert("Erro ao executar ação de manutenção.");
      }
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Arquivo muito grande (Máximo 5MB)");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setIsSaving(true);
      try {
        await fetch("/api/branding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system_name: systemName, logo_base64: base64 }),
        });
        alert("Logo atualizada com sucesso!");
        window.location.reload(); // Refresh to show new logo everywhere
      } catch (error) {
        alert("Erro ao enviar logo.");
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gax-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configurações do Sistema</h1>
        <p className="text-sm text-slate-500">Personalize a aparência e gerencie os dados do GAX</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Branding Section */}
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gax-blue-light text-gax-blue">
              <Settings size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Identidade Visual</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Nome do Sistema</label>
              <div className="relative">
                <Type className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium placeholder:text-slate-300"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Logo Superior (Max 5MB)</label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden">
                  <ImageIcon className="text-slate-300" size={32} />
                </div>
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 cursor-pointer opacity-0" 
                    onChange={handleLogoChange}
                  />
                  <button className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-200">
                    <CloudUpload size={16} />
                    Alterar Logo
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={handleSaveBranding}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 text-sm font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Salvar Nome do Sistema
          </button>
        </section>

        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
              <ShieldCheck size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Segurança e Auditoria</h2>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-xs text-slate-500">O sistema mantém um rastreio automático de todas as ações administrativas, como deleções, logins e manutenções, arquivados fisicamente por 30 dias.</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">Logs de Auditoria do Sistema</p>
                <p className="text-[11px] text-slate-400">Ver rastreabilidade de ações de usuários na plataforma.</p>
              </div>
              <a 
                href="/settings/audit"
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Acessar Logs
              </a>
            </div>
          </div>
        </section>

        {/* Maintenance Section */}
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
              <Trash2 size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Manutenção</h2>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl bg-red-50 p-4">
              <h4 className="mb-1 text-sm font-bold text-red-700">Zona de Perigo</h4>
              <p className="text-xs text-red-600">Estas ações são permanentes e não podem ser desfeitas.</p>
            </div>

            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div>
                <p className="text-sm font-bold text-slate-700">Limpar Logs de Importação</p>
                <p className="text-[11px] text-slate-400">Apaga permanentemente o histórico de logs.</p>
              </div>
              <button 
                onClick={() => handleMaintenance('clear-logs')}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
              >
                Limpar
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">Reiniciar Banco de Dados</p>
                <p className="text-[11px] text-slate-400">Apaga todos os clientes e dados de XML.</p>
              </div>
              <button 
                onClick={() => handleMaintenance('reset-db')}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
              >
                Resetar
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
