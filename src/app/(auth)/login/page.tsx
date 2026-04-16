"use client";

import React, { useState } from "react";
import {
  LogIn,
  Mail,
  Lock,
  Chrome,
  ChevronRight,
  CloudUpload,
  BarChart3,
  Users,
  ShieldCheck,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    setResetStatus(null);
    try {
      const formData = new FormData();
      formData.append("email", resetEmail);
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setResetStatus({ type: 'success', msg: "E-mail de recuperação enviado com sucesso!" });
      } else {
        const data = await res.json();
        const errorDetail = data.detail;
        const msg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);
        setResetStatus({ type: 'error', msg: msg || "Erro ao enviar e-mail." });
      }
    } catch (_err) {
      setResetStatus({ type: 'error', msg: "Erro de conexão." });
    } finally {
      setIsResetting(false);
    }
  };

const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Captura valores diretamente do formulário (resolve bug de autofill do browser)
    const dataForm = new FormData(e.currentTarget);
    const emailValue = dataForm.get("email")?.toString() || "";
    const passwordValue = dataForm.get("password")?.toString() || "";

    // Validação de Frontend
    if (!emailValue.trim() || !passwordValue.trim()) {
      setError("Por favor, preencha seu e-mail e senha para continuar.");
      setIsLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("email", emailValue);
      formData.append("password", passwordValue);

      const res = await fetch("/api/login", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        localStorage.setItem("gax_user_email", emailValue);
        localStorage.setItem("gax_user_name", data?.first_name || emailValue.split('@')[0]);
        localStorage.setItem("gax_user_role", data?.role || "user");
        window.location.href = "/";
      } else {
        // Tratamento de Erro Amigável
        const errorDetail = data.detail;
        let msg = "";
        
        if (Array.isArray(errorDetail)) {
          // Erro de validação do FastAPI (422)
          msg = "Dados incompletos. Verifique se preencheu o e-mail e a senha.";
        } else {
          msg = typeof errorDetail === 'string' ? errorDetail : "E-mail ou senha incorretos.";
        }
        
        setError(msg);
      }
    } catch (_err: any) {
      setError("Erro de conexão com o servidor. Verifique sua internet.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const idToken = await user.getIdToken();

      const formData = new FormData();
      formData.append("id_token", idToken);

      const res = await fetch("/api/auth/google", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        localStorage.setItem("gax_user_email", user.email || "");
        localStorage.setItem("gax_user_name", data?.first_name || user.displayName || user.email?.split('@')[0] || "");
        localStorage.setItem("gax_user_role", data?.role || "user");
        window.location.href = "/";
      } else {
        const errorDetail = data.detail;
        const msg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);
        setError(msg || "Falha na autenticação com o Google.");
      }
    } catch (_err: any) {
      if (_err.code !== "auth/popup-closed-by-user") {
        setError("Erro ao autenticar com o Google.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Lado Esquerdo: Formulário de Login */}
      <div className="relative flex w-full flex-col justify-center px-8 sm:px-16 lg:w-[45%] bg-white shadow-2xl z-10 border-r border-slate-200/50">
        {/* Subtle Decorative Background for Login Side */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0f172a 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        
        <div className="mx-auto w-full max-w-md animate-in fade-in slide-in-from-left-4 duration-700 relative z-10">
          {/* Logo Section - Centralized */}
          <div className="mb-12 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-gradient-to-br from-gax-blue to-gax-blue-hover p-4 shadow-[0_20px_50px_rgba(59,130,246,0.3)] ring-offset-4 ring-1 ring-gax-blue/20">
              <img src="/Imagens/Glogo.png" alt="GAX Logo" className="h-full w-full object-contain brightness-0 invert" width={96} height={96} />
            </div>
            <div className="flex flex-col items-center">
              <h1 className="text-6xl font-display font-black tracking-tighter text-slate-900 mb-1">GAX</h1>
              <p className="text-[11px] font-bold uppercase tracking-[0.5em] text-slate-400 pl-[0.5em]">Gestão de Arquivos XML</p>
            </div>
          </div>

          {/* Botão Google */}
          <button 
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="group flex w-full items-center justify-center gap-4 rounded-2xl border border-slate-200/60 bg-white py-4 font-bold text-slate-700 transition-all hover:bg-slate-50 hover:border-gax-blue/30 hover:shadow-xl hover:shadow-slate-200/50 focus:outline-none focus:ring-4 focus:ring-gax-blue/10 disabled:opacity-50"
          >
            <Chrome size={20} className="text-gax-blue group-hover:scale-110 transition-transform" />
            Continuar com o Google
          </button>

          <div className="my-10 flex items-center gap-4 text-slate-300">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200"></div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 px-2 text-center">Ou use suas credenciais</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200"></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1" htmlFor="email">
                E-mail
              </label>
              <div className="relative group">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-300 group-focus-within:text-gax-blue transition-colors">
                  <Mail size={18} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seu.email@exemplo.com"
                  className="w-full rounded-2xl border border-slate-200/60 bg-slate-50/50 py-4 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 font-medium"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500" htmlFor="password">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-[11px] font-bold text-gax-blue hover:text-gax-blue-hover transition-colors"
                >
                  Esqueceu?
                </button>
              </div>
              <div className="relative group">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-300 group-focus-within:text-gax-blue transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••••••"
                  className="w-full rounded-2xl border border-slate-200/60 bg-slate-50/50 py-4 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 font-medium"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-4 text-[13px] font-bold text-red-600 animate-in shake-1 duration-300 border border-red-100/50">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-gax-blue py-4 font-bold text-white shadow-[0_10px_25px_rgba(59,130,246,0.4)] transition-all hover:bg-gax-blue-hover hover:shadow-[0_15px_35px_rgba(59,130,246,0.5)] active:scale-[0.98] disabled:opacity-50 group/btn"
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
              {isLoading ? (
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                  <span>Iniciando Sessão...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 group-hover/btn:scale-105 transition-transform">
                  <LogIn size={20} />
                  <span>Entrar</span>
                </div>
              )}
            </button>

            <p className="mt-4 text-center text-[11px] font-medium leading-relaxed text-slate-400 px-4">
              Ao entrar no sistema, você concorda com nossos{" "}
              <Link href="/termos-de-uso" target="_blank" className="font-bold text-slate-500 hover:text-gax-blue underline decoration-slate-200 underline-offset-4">
                Termos de Uso
              </Link>{" "}
              e{" "}
              <Link href="/politica-de-privacidade" target="_blank" className="font-bold text-slate-500 hover:text-gax-blue underline decoration-slate-200 underline-offset-4">
                Política de Privacidade
              </Link>.
            </p>
          </form>

          <p className="mt-8 text-center text-[13px] font-medium text-slate-500">
            Ainda não possui acesso?{" "}
            <Link href="/register" className="font-bold text-gax-blue transition-colors hover:text-gax-blue-hover">
              Solicitar Credenciais
            </Link>
          </p>
        </div>
      </div>

      {/* Lado Direito: Visual Premium Grid */}
      <div className="relative hidden w-[55%] flex-col justify-center overflow-hidden bg-slate-900 p-20 lg:flex">
        {/* Background Decorative */}
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-gax-blue/20 blur-3xl opacity-50"></div>
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-gax-blue-hover/10 blur-3xl opacity-30"></div>
        
        {/* Modern Grid Background */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

        <div className="relative z-10 max-w-xl animate-in fade-in zoom-in-95 duration-1000">


          <h2 className="text-5xl font-display font-black leading-tight text-white mb-8">
            Gestão de <span className="text-gax-blue">ponta a ponta</span> para Arquivos XML.
          </h2>

          <p className="text-slate-400 text-lg leading-relaxed mb-12 font-medium">
            Integração nativa com o sistema RSUS, processamento automatizado e relatórios inteligentes em uma única interface profissional.
          </p>

          <div className="grid grid-cols-2 gap-6">
            <FeatureCard
              icon={<CloudUpload size={24} />}
              title="Upload Inteligente"
              desc="Processamento individual ou em lote, fácil, rápido e sem complicações."
            />
            <FeatureCard
              icon={<BarChart3 size={24} />}
              title="Acompanhamento Real"
              desc="Monitore cada importação com progresso em tempo real."
            />
            <FeatureCard
              icon={<Users size={24} />}
              title="Gestão de Clientes"
              desc="Dados organizados e segmentados por cada cliente."
            />
            <FeatureCard
              icon={<ShieldCheck size={24} />}
              title="Segurança GAX"
              desc="Tudo o que você precisa em uma plataforma única e segura."
            />
          </div>
        </div>
      </div>

      {/* Modal de Reset de Senha */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Recuperar Senha</h3>
              <button
                onClick={() => { setShowResetModal(false); setResetStatus(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <p className="mb-6 text-sm text-slate-500">
              Digite seu e-mail abaixo. Se houver uma conta associada, enviaremos instruções para redefinir sua senha.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">E-mail</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    placeholder="seu.email@exemplo.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-slate-900 outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {resetStatus && (
                <div className={cn(
                  "rounded-lg p-3 text-sm font-medium",
                  resetStatus.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                )}>
                  {resetStatus.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={isResetting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3 font-bold text-white transition-all hover:bg-gax-blue-hover disabled:opacity-50"
              >
                {isResetting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div> : "Enviar E-mail"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="group rounded-2xl bg-white/5 p-6 backdrop-blur-sm transition-all hover:bg-white/10">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white transition-colors group-hover:bg-white group-hover:text-gax-blue">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-gax-blue-light/60">{desc}</p>
    </div>
  );
}
