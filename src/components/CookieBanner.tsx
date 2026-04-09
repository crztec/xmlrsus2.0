"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Verificar se o usuário já aceitou os termos
    const accepted = localStorage.getItem("gax_cookies_accepted");
    if (!accepted) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("gax_cookies_accepted", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] w-[95%] max-w-2xl -translate-x-1/2 animate-in fade-in slide-in-from-bottom-5 duration-700">
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white/90 p-5 shadow-2xl backdrop-blur-xl md:p-6">
        {/* Efeito Visual */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gax-blue/5 blur-3xl"></div>
        
        <div className="relative flex flex-col items-center gap-5 md:flex-row md:gap-8">
          {/* Ícone */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gax-blue/10 text-gax-blue shadow-inner">
            <ShieldCheck size={30} />
          </div>

          <div className="flex-1 text-center md:text-left">
            <h3 className="text-sm font-black tracking-tight text-slate-900 mb-1">Privacidade & Cookies</h3>
            <p className="text-[12px] font-medium leading-relaxed text-slate-500">
              Utilizamos cookies essenciais e tecnologias semelhantes de acordo com a nossa{" "}
              <Link href="/politica-de-privacidade" className="font-bold text-gax-blue hover:underline">
                Política de Privacidade
              </Link>
              . Ao continuar navegando, você concorda com estas condições.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleAccept}
              className="rounded-xl bg-slate-900 px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-900/10"
            >
              Entendi e Aceito
            </button>
            <button 
              onClick={() => setIsVisible(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
              title="Fechar temporariamente"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
