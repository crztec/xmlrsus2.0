"use client";

import React, { useState, useEffect } from "react";
import { Key, Save, Loader2, ShieldCheck, User, Lock, Building2 } from "lucide-react";

export default function SettingsRSUSPage() {
  const [generalUser, setGeneralUser] = useState("");
  const [generalPass, setGeneralPass] = useState("");
  const [vitoriaUser, setVitoriaUser] = useState("");
  const [vitoriaPass, setVitoriaPass] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    
    // Carrega credenciais atuais
    Promise.all([
      fetch("/api/settings/rsus-credentials?type=general").then(res => res.json()),
      fetch("/api/settings/rsus-credentials?type=unimed_vitoria").then(res => res.json())
    ]).then(([general, vitoria]) => {
      setGeneralUser(general.username || "");
      setGeneralPass(general.password || "");
      setVitoriaUser(vitoria.username || "");
      setVitoriaPass(vitoria.password || "");
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const handleSave = async (type: string) => {
    setIsSaving(true);
    const formData = new FormData();
    formData.append("type", type);
    formData.append("username", type === "general" ? generalUser : vitoriaUser);
    formData.append("password", type === "general" ? generalPass : vitoriaPass);

    try {
      const res = await fetch("/api/settings/rsus-credentials", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        alert("Credenciais salvas com sucesso!");
      } else {
        alert("Erro ao salvar credenciais.");
      }
    } catch (error) {
      alert("Erro de conexão ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gax-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4 border-b border-slate-100/50 pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gax-blue/10 to-gax-blue/5 text-gax-blue shadow-inner">
          <Key size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Configuração de Login RSUS</h2>
          <p className="text-sm text-slate-500">Credenciais globais para automação de importação e checagem.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* General Credentials */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Building2 className="text-slate-400" size={20} />
            <h3 className="font-bold text-slate-800">Credencial Geral (Padrão)</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuário RSUS</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="text" 
                  value={generalUser}
                  onChange={(e) => setGeneralUser(e.target.value)}
                  placeholder="Ex: login.rsus"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all text-slate-700 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Senha RSUS</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="password" 
                  value={generalPass}
                  onChange={(e) => setGeneralPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all text-slate-700"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={() => handleSave("general")}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 text-xs font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Geral
          </button>
        </section>

        {/* Unimed Vitoria Credentials */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-emerald-500" size={20} />
            <h3 className="font-bold text-slate-800">Unimed Vitória</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuário Específico</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="text" 
                  value={vitoriaUser}
                  onChange={(e) => setVitoriaUser(e.target.value)}
                  placeholder="unimed.vix"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all text-slate-700 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Senha Específica</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="password" 
                  value={vitoriaPass}
                  onChange={(e) => setVitoriaPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all text-slate-700"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={() => handleSave("unimed_vitoria")}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 text-xs font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Vitória
          </button>
        </section>
      </div>

      <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 flex gap-4 max-w-2xl">
        <div className="h-10 w-10 shrink-0 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
          <ShieldCheck size={20} />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold text-amber-900 uppercase tracking-tight">Privacidade Garantida</p>
          <p className="text-[11px] text-amber-700/80 leading-relaxed font-medium">As credenciais acima são criptografadas e utilizadas apenas pelos robôs de automação GAX. Elas não são exibidas em logs de sistema ou relatórios públicos.</p>
        </div>
      </div>
    </div>
  );
}
