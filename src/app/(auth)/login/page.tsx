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
    } catch (err) {
      setResetStatus({ type: 'error', msg: "Erro de conexão." });
    } finally {
      setIsResetting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const res = await fetch("/api/login", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        localStorage.setItem("gax_user_email", email);
        localStorage.setItem("gax_user_name", data?.first_name || email.split('@')[0]);
        localStorage.setItem("gax_user_role", data?.role || "user");
        window.location.href = "/";
      } else {
        const errorDetail = data.detail;
        const msg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);
        setError(msg || "Falha no login. Verifique suas credenciais.");
      }
    } catch (err: any) {
      setError("Erro de conexão com o servidor.");
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
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Erro ao autenticar com o Google.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      {/* Lado Esquerdo: Formulário de Login */}
      <div className="flex w-full flex-col justify-center px-8 sm:px-16 lg:w-[45%]">
        <div className="mx-auto w-full max-w-md">
          {/* Logo Placeholder */}
          <div className="mb-10 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg overflow-hidden bg-white shadow-sm border border-slate-100">
              <img src="/Imagens/Glogo.png" alt="GAX Logo" className="h-full w-full object-contain" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800">GAX - Gestão de Arquivos XML</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Entrar</h1>
            <p className="mt-2 text-slate-500">Bem-vindo de volta! Faça login na sua conta.</p>
          </div>

          {/* Botão Google */}
          <button 
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-gax-blue/30 focus:outline-none focus:ring-2 focus:ring-gax-blue/20 disabled:opacity-50"
          >
            <Chrome size={20} className="text-gax-blue" />
            Continuar com o Google
          </button>

          <div className="my-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-100"></div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Ou entre com e-mail</span>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="email">
                E-mail
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <Mail size={18} />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="seu.email@exemplo.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-4 text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-sm font-semibold text-gax-blue transition-colors hover:text-gax-blue-hover"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-11 pr-4 text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3.5 font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover hover:shadow-xl hover:shadow-gax-blue/30 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <>
                  <LogIn size={20} />
                  Entrar
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm font-medium text-slate-500">
            Ainda não tem uma conta?{" "}
            <Link href="/register" className="font-bold text-gax-blue transition-colors hover:text-gax-blue-hover">
              Cadastre-se gratuitamente
            </Link>
          </p>
        </div>
      </div>

      {/* Lado Direito: Features/Destaques (Design Premium) */}
      <div className="relative hidden w-[55%] flex-col justify-center overflow-hidden bg-gax-blue p-16 lg:flex">
        {/* Background Decorative Circles */}
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-gax-blue-hover/30 blur-3xl"></div>

        <div className="relative z-10 max-w-2xl">
          <div className="mb-6 inline-flex items-center rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-md">
            <span className="mr-2 flex h-2 w-2 rounded-full bg-white"></span>
            Plataforma Integração RSUS
          </div>

          <h2 className="text-5xl font-black leading-tight text-white">
            Gestão de ponta a ponta para <span className="text-white/70">Arquivos XML.</span>
          </h2>

          <p className="mt-6 text-xl leading-relaxed text-gax-blue-light/80">
            Ganhe tempo e controle total com o melhor sistema de gestão para
            importação RSUS do Brasil. Potencialize seu faturamento com relatórios
            inteligentes e processamento automatizado.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-6">
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
