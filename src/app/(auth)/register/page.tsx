"use client";

import React, { useState } from "react";
import { 
  UserPlus, 
  Mail, 
  Lock, 
  User,
  Chrome, 
  LogIn,
  CloudUpload, 
  BarChart3, 
  Users, 
  ShieldCheck 
} from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: ""
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = new FormData();
      data.append("email", formData.email);
      data.append("password", formData.password);
      data.append("first_name", formData.firstName);
      data.append("last_name", formData.lastName);

      const res = await fetch("/api/register", {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/login";
        }, 3000);
      } else {
        const errData = await res.json();
        const errorDetail = errData.detail;
        const msg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);
        setError(msg || "Erro ao criar conta.");
      }
    } catch (err) {
      setError("Erro de conexão com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      <div className="flex w-full flex-col justify-center px-8 sm:px-16 lg:w-[45%] py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gax-blue text-white">
              <CloudUpload size={24} />
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-800">GAX</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Criar Conta</h1>
            <p className="mt-2 text-slate-500">Junte-se a nós para gerenciar seus XMLs com eficiência.</p>
          </div>

          {success ? (
            <div className="rounded-2xl bg-green-50 p-8 text-center animate-in fade-in zoom-in duration-500">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <ShieldCheck size={32} />
              </div>
              <h3 className="mb-2 text-xl font-bold text-green-800">Conta Criada!</h3>
              <p className="text-sm text-green-600">Sua conta foi enviada para aprovação do administrador. Você será redirecionado para o login em breve.</p>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Nome</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      placeholder="Nome"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Sobrenome</label>
                  <input
                    type="text"
                    placeholder="Sobrenome"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-4 text-sm outline-none transition-all focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">E-mail</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    placeholder="seu.email@exemplo.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Senha</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Confirmar Senha</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <ShieldCheck size={16} />
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
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
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gax-blue py-3.5 font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <>
                    <UserPlus size={20} />
                    Cadastrar
                  </>
                )}
              </button>

              <p className="mt-4 text-center text-[11px] font-medium leading-relaxed text-slate-400 px-4">
                Ao cadastrar-se, você concorda com nossos{" "}
                <Link href="/termos-de-uso" target="_blank" className="font-bold text-slate-500 hover:text-gax-blue underline decoration-slate-200 underline-offset-4">
                  Termos de Uso
                </Link>{" "}
                e{" "}
                <Link href="/politica-de-privacidade" target="_blank" className="font-bold text-slate-500 hover:text-gax-blue underline decoration-slate-200 underline-offset-4">
                  Política de Privacidade
                </Link>.
              </p>
            </form>
          )}

          <p className="mt-8 text-center text-sm font-medium text-slate-500">
            Já tem uma conta?{" "}
            <Link href="/login" className="font-bold text-gax-blue transition-colors hover:text-gax-blue-hover">
              Faça login
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden w-[55%] flex-col justify-center overflow-hidden bg-gax-blue p-16 lg:flex">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-gax-blue-hover/30 blur-3xl"></div>

        <div className="relative z-10 max-w-2xl text-white">
          <h2 className="text-5xl font-black leading-tight">
            Pronto para <span className="text-white/70">Começar?</span>
          </h2>
          <p className="mt-6 text-xl leading-relaxed text-gax-blue-light/80">
            Crie sua conta em segundos e tenha acesso imediato às ferramentas de automação XML do RSUS.
          </p>
        </div>
      </div>
    </div>
  );
}
