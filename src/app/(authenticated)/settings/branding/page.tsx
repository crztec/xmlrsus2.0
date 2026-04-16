"use client";

import React, { useState, useEffect } from "react";
import { Settings, Image as ImageIcon, Type, Save, CloudUpload, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";


export default function BrandingPage() {
  const [systemName, setSystemName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    
    apiClient("/api/branding")
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
      await apiClient("/api/branding", {
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
        await apiClient("/api/branding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system_name: systemName, logo_base64: base64 }),
        });
        alert("Logo atualizada com sucesso!");
        window.location.reload();
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
    <div className="flex flex-col gap-8 p-8 pt-2 max-w-3xl mx-auto animate-in fade-in duration-500">
      <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4 border-b border-slate-100/50 pb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gax-blue/10 to-gax-blue/5 text-gax-blue shadow-inner">
            <Settings size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Identidade Visual</h2>
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
    </div>
  );
}
