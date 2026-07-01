"use client";

import React, { useState, useRef } from "react";
import {
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
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
import { signInWithPopup, GoogleAuthProvider, signOut, signInWithEmailAndPassword } from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Carregar dados salvos ao montar o componente
  React.useEffect(() => {
    // Verifica se veio de um redirecionamento de sessão expirada
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("expired") === "true") {
        setError("Sua sessão expirou por inatividade. Por favor, faça login novamente.");
      }
    }

    const savedEmail = localStorage.getItem("gax_remembered_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
    // Limpa credenciais legadas do localStorage (segurança)
    localStorage.removeItem("gax_remembered_pass");
  }, []);

  const handleResetPassword = async (e: React.SyntheticEvent<HTMLFormElement>) => {
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

const handleLogin = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Persistência "Lembrar de mim" — apenas email, nunca senha
    if (rememberMe) {
      localStorage.setItem("gax_remembered_email", email);
    } else {
      localStorage.removeItem("gax_remembered_email");
    }

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
      // 1. Autentica localmente via Firebase SDK para garantir persistência e auto-refresh do token
      const userCredential = await signInWithEmailAndPassword(auth, emailValue, passwordValue);
      const firebaseIdToken = await userCredential.user.getIdToken();

      const formData = new FormData();
      formData.append("email", emailValue);
      formData.append("password", passwordValue);

      // 2. Chama a API para registrar log de auditoria e validar role
      const res = await fetch("/api/login", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        localStorage.setItem("gax_auth_token", data.idToken || firebaseIdToken); // Salva o token JWT
        localStorage.setItem("gax_user_email", emailValue);
        localStorage.setItem("gax_user_name", data?.first_name || emailValue.split('@')[0]);
        localStorage.setItem("gax_user_role", data?.role || "user");
        window.location.href = "/";
      } else {
        // Tratamento de Erro Amigável
        const errorDetail = data.detail;
        let msg = `Erro (Status: ${res.status}): `;
        
        if (Array.isArray(errorDetail)) {
          msg += "Dados de validação incorretos.";
        } else {
          msg += typeof errorDetail === 'string' ? errorDetail : "Credenciais inválidas.";
        }
        
        setError(msg);
        await signOut(auth); // Desloga do Firebase se a API backend recusou o login (ex: pendente)
      }
    } catch (_err: any) {
      setError(`Falha de Conexão: ${_err.message || "Servidor offline"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      
      // Obtém o ID Token REAL do Google (OAuth 2.0) a partir do resultado
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const googleIdToken = credential?.idToken;

      if (!googleIdToken) {
        throw new Error("Não foi possível obter o token do Google.");
      }

      // Obtemos o token do Firebase do usuário como fallback
      const firebaseIdToken = await result.user.getIdToken();

      const formData = new FormData();
      formData.append("id_token", googleIdToken);

      const res = await fetch("/api/auth/google", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Salva o ID token do Firebase retornado pela API (ou o local como fallback)
        localStorage.setItem("gax_auth_token", data.idToken || firebaseIdToken);
        localStorage.setItem("gax_user_email", result.user.email || "");
        localStorage.setItem("gax_user_name", data?.first_name || result.user.displayName || result.user.email?.split('@')[0] || "");
        localStorage.setItem("gax_user_role", data?.role || "user");
        window.location.href = "/";
      } else {
        const errorDetail = data.detail;
        const msg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);
        setError(msg || "Falha na autenticação com o Google.");
        await signOut(auth); // Clear the Firebase SDK state so it doesn't block future logins
      }
    } catch (_err: any) {
      console.error("Erro no Login com Google:", _err);
      if (_err.code !== "auth/popup-closed-by-user") {
        let msg = "Falha ao autenticar com o Google. Por favor, tente novamente mais tarde.";
        if (_err.code === "auth/unauthorized-domain") {
          msg = `Domínio não autorizado. Adicione '${window.location.hostname}' aos Domínios Autorizados no console do Firebase.`;
        } else if (_err.code === "auth/invalid-credential" || _err.code === "auth/unauthorized-client") {
          msg = "Erro de credenciais no servidor de autenticação. Por favor, contate o administrador para verificar as configurações do Google OAuth no Firebase.";
        } else if (_err.code === "auth/popup-blocked") {
          msg = "O popup de login do Google foi bloqueado pelo seu navegador. Por favor, permita popups para este site.";
        } else if (_err.message) {
          msg = `Erro Google: ${_err.message}`;
        }
        setError(msg);
        await signOut(auth).catch(() => {}); // Clear the Firebase SDK state on error
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Lado Esquerdo: Formulário de Login */}
      <div className="relative flex w-full flex-col justify-center px-6 sm:px-16 lg:w-[40%] bg-white z-10 lg:border-r border-gray-100">
        
        <div className="mx-auto w-full max-w-[340px] animate-in fade-in slide-in-from-bottom-4 duration-700 relative z-10">
          {/* Logo Section */}
          <div className="mb-10 flex flex-col items-start">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gax-blue p-2 shadow-sm">
              <img src="/Imagens/Glogo.png" alt="GAX Logo" className="h-full w-full object-contain brightness-0 invert" width={48} height={48} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Bem-vindo de volta</h1>
            <p className="text-sm text-gray-500">Insira suas credenciais para acessar sua conta</p>
          </div>


          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="seu.email@exemplo.com"
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gax-blue focus:ring-2 focus:ring-gax-blue/10 font-medium autofill:bg-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500" htmlFor="password">
                Senha
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  className="h-10 w-full rounded-md border border-gray-200 bg-white pl-3 pr-10 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gax-blue focus:ring-2 focus:ring-gax-blue/10 font-medium autofill:bg-white"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="h-3.5 w-3.5 rounded border-gray-300 text-gax-blue focus:ring-gax-blue"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="text-xs font-medium text-gray-400 group-hover:text-gray-600 transition-colors">Lembrar de mim</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-xs font-medium text-gray-400 hover:text-gax-blue transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-xs font-semibold text-red-600 animate-in fade-in duration-300 border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-10 w-full items-center justify-center rounded-md bg-gax-blue font-bold text-sm text-white transition-all hover:bg-gax-blue-hover active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                  <span>Entrando...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn size={16} />
                  <span>Entrar</span>
                </div>
              )}
            </button>

            <div className="relative py-2 mt-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400 font-bold">OU</span>
              </div>
            </div>

            {/* Botão Google - Minimalist Outline (Reposicionado) */}
            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="group flex h-10 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-100 disabled:opacity-50 shadow-sm"
            >
              <svg className="h-4 w-4 shrink-0" width="16" height="16" style={{ width: '16px', height: '16px', flexShrink: 0 }} viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Entrar com Google
            </button>

            <p className="mt-6 text-center text-[10px] leading-relaxed text-gray-400 px-4">
              Ao acessar, você concorda com nossos{" "}
              <Link href="/termos-de-uso" target="_blank" className="hover:text-gray-600 underline underline-offset-2">
                Termos
              </Link>{" "}
              e{" "}
              <Link href="/politica-de-privacidade" target="_blank" className="hover:text-gray-600 underline underline-offset-2">
                Privacidade
              </Link>.
            </p>
          </form>

          <p className="mt-8 text-center text-sm font-medium text-gray-500">
            Ainda não possui acesso?{" "}
            <Link href="/register" className="font-bold text-gax-blue transition-colors hover:text-gax-blue-hover">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>

      {/* Lado Direito: Visual Premium Grid - Clean SaaS Style */}
      <div className="relative hidden w-[60%] flex-col justify-center overflow-hidden bg-gray-900 p-20 lg:flex">
        {/* Modern Shapes Background */}
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-gax-blue/10 blur-3xl opacity-20"></div>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
        
        <div className="relative z-10 max-w-xl animate-in fade-in zoom-in-95 duration-1000">
          <h2 className="text-5xl font-bold leading-tight text-white mb-8 tracking-tight">
            Plataforma completa de <br/>
            <span className="text-gax-blue">Inteligência e Automação</span> para o Ecossistema RSUS.
          </h2>

          <p className="text-gray-400 text-lg leading-relaxed mb-12 font-medium">
            Integração nativa, processamento automatizado e relatórios inteligentes em uma única interface profissional e minimalista.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <FeatureCard
              icon={<CloudUpload size={20} />}
              title="No-code Import"
              desc="Processamento rápido e sem complicações."
            />
            <FeatureCard
              icon={<BarChart3 size={20} />}
              title="Tempo Real"
              desc="Acompanhe o progresso de cada importação."
            />
          </div>
        </div>
      </div>

      {/* Modal de Reset de Senha */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-300 border border-gray-100">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Recuperar Senha</h3>
              <button
                onClick={() => { setShowResetModal(false); setResetStatus(null); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <p className="mb-6 text-sm text-gray-500 leading-relaxed">
              Digite seu e-mail abaixo para receber as instruções de recuperação.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-tight">E-mail</label>
                <input
                  type="email"
                  placeholder="seu.email@exemplo.com"
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gax-blue focus:ring-2 focus:ring-gax-blue/10 transition-all"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>

              {resetStatus && (
                <div className={cn(
                  "rounded-md p-3 text-xs font-semibold",
                  resetStatus.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                )}>
                  {resetStatus.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={isResetting}
                className="flex h-10 w-full items-center justify-center rounded-md bg-gax-blue font-bold text-sm text-white transition-all hover:bg-gax-blue-hover disabled:opacity-50"
              >
                {isResetting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div> : "Enviar E-mail"}
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
    <div className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-all hover:bg-white/[0.06] hover:border-white/20">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gax-blue text-white shadow-lg shadow-gax-blue/20">
        {icon}
      </div>
      <h3 className="mb-1 text-base font-bold text-white transition-colors group-hover:text-gax-blue-light">{title}</h3>
      <p className="text-xs leading-relaxed text-gray-400">{desc}</p>
    </div>
  );
}
