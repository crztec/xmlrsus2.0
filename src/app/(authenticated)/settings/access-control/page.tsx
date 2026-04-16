"use client";

import React, { useState, useEffect } from "react";
import { Key, Save, Loader2, ShieldCheck, User, Lock, Building2, Mail } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

export default function AccessControlPage() {
  const [generalUser, setGeneralUser] = useState("");
  const [generalPass, setGeneralPass] = useState("");
  const [vitoriaUser, setVitoriaUser] = useState("");
  const [vitoriaPass, setVitoriaPass] = useState("");
  const [cubEmail, setCubEmail] = useState("");
  const [cubPass, setCubPass] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    
    Promise.all([
      apiClient("/api/settings/rsus-credentials?type=general").then(res => res.json()),
      apiClient("/api/settings/rsus-credentials?type=unimed_vitoria").then(res => res.json()),
      apiClient("/api/settings/cubeti-credentials").then(res => res.json()).catch(() => ({ email: "", password: "" }))
    ]).then(([general, vitoria, cubeti]) => {
      setGeneralUser(general.username || "");
      setGeneralPass(general.password || "");
      setVitoriaUser(vitoria.username || "");
      setVitoriaPass(vitoria.password || "");
      setCubEmail(cubeti.email || "");
      setCubPass(cubeti.password || "");
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const handleSaveRSUS = async (type: string) => {
    setIsSaving(type);
    const params = new URLSearchParams();
    params.append("type", type);
    params.append("username", type === "general" ? generalUser : vitoriaUser);
    params.append("password", type === "general" ? generalPass : vitoriaPass);

    try {
      const res = await apiClient("/api/settings/rsus-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (res.ok) alert("Credenciais RSUS salvas com sucesso!");
      else {
        const err = await res.json();
        alert(`Erro: ${err.detail || "Erro desconhecido"}`);
      }
    } catch { alert("Erro de conexão."); }
    finally { setIsSaving(null); }
  };

  const handleSaveCubeti = async () => {
    setIsSaving("cubeti");
    try {
      const res = await apiClient("/api/settings/cubeti-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cubEmail, password: cubPass }),
      });
      if (res.ok) alert("Credenciais CubeTI salvas com sucesso!");
      else {
        const err = await res.json();
        alert(`Erro: ${err.detail || "Erro desconhecido"}`);
      }
    } catch { alert("Erro de conexão."); }
    finally { setIsSaving(null); }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gax-blue" size={32} />
      </div>
    );
  }

  const inputCls = "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all text-slate-700 font-medium";

  return (
    <div className="flex flex-col gap-6 md:gap-8 p-4 md:p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
        {/* RSUS Geral */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-6 md:p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Building2 className="text-slate-400" size={20} />
            <h3 className="font-bold text-slate-800">Credencial RSUS Geral</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuário RSUS</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="text" value={generalUser} onChange={(e) => setGeneralUser(e.target.value)} placeholder="Ex: login.rsus" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Senha RSUS</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="password" value={generalPass} onChange={(e) => setGeneralPass(e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
            </div>
          </div>
          <button onClick={() => handleSaveRSUS("general")} disabled={isSaving !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 text-xs font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50">
            {isSaving === "general" ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Geral
          </button>
        </section>

        {/* RSUS Vitória */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-6 md:p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-emerald-500" size={20} />
            <h3 className="font-bold text-slate-800">Unimed Vitória</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuário Específico</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="text" value={vitoriaUser} onChange={(e) => setVitoriaUser(e.target.value)} placeholder="unimed.vix" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Senha Específica</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="password" value={vitoriaPass} onChange={(e) => setVitoriaPass(e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
            </div>
          </div>
          <button onClick={() => handleSaveRSUS("unimed_vitoria")} disabled={isSaving !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 text-xs font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50">
            {isSaving === "unimed_vitoria" ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Vitória
          </button>
        </section>

        {/* CubeTI Gestão Comercial */}
        <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-6 md:p-8 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Key className="text-violet-500" size={20} />
            <h3 className="font-bold text-slate-800">Gestão Comercial CubeTI</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="email" value={cubEmail} onChange={(e) => setCubEmail(e.target.value)} placeholder="email@cubeti.com.br" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="password" value={cubPass} onChange={(e) => setCubPass(e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
            </div>
          </div>
          <button onClick={handleSaveCubeti} disabled={isSaving !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-xs font-bold text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:opacity-50">
            {isSaving === "cubeti" ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar CubeTI
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
