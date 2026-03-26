"use client";

import React, { useState, useEffect } from "react";
import { User, Mail, Key, Shield, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName: string;
}

export default function UserProfileModal({ isOpen, onClose, userEmail, userName }: UserProfileModalProps) {
  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    new_email: "",
    new_password: "",
    current_password: "",
    code: ""
  });
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [showCodeField, setShowCodeField] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [statusMsg, setStatusMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    if (isOpen && userEmail) {
      fetch(`/api/profile?email=${userEmail}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.detail) {
            setProfileForm(prev => ({
              ...prev,
              first_name: data.first_name || "",
              last_name: data.last_name || ""
            }));
          }
        })
        .catch(err => console.error("Erro ao buscar perfil:", err));
    }
  }, [isOpen, userEmail]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gax-blue/10 text-gax-blue">
              <User size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Meu Perfil</h3>
          </div>
          <button
            onClick={() => {
              onClose();
              setShowCodeField(false);
              setStatusMsg({ type: "", text: "" });
              setResendTimer(0);
            }}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {statusMsg.text && (
            <div className={cn(
              "p-4 rounded-2xl text-xs font-medium flex items-center gap-3 animate-in slide-in-from-top-2",
              statusMsg.type === "success" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
            )}>
              <Shield size={16} className={cn(statusMsg.type === "success" ? "text-emerald-500" : "text-red-500")} />
              {statusMsg.text}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Nome</label>
              <input
                type="text"
                value={profileForm.first_name}
                onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/30 px-4 py-2.5 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium text-slate-700"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Sobrenome</label>
              <input
                type="text"
                value={profileForm.last_name}
                onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/30 px-4 py-2.5 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium text-slate-700"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100/50">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gax-blue flex items-center gap-2">
              <Shield size={14} /> Alterações Sensíveis
            </h4>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Novo E-mail (Opcional)</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={18} />
                <input
                  type="email"
                  placeholder="deixe vazio para não alterar"
                  autoComplete="off"
                  value={profileForm.new_email}
                  onChange={e => setProfileForm({ ...profileForm, new_email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/30 pl-12 pr-4 py-2.5 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium text-slate-700 placeholder:text-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Nova Senha (Opcional)</label>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={18} />
                <input
                  type="password"
                  id="gax-new-password-field-standalone"
                  placeholder="mínimo 6 caracteres"
                  autoComplete="new-password"
                  value={profileForm.new_password}
                  onChange={e => setProfileForm({ ...profileForm, new_password: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/30 pl-12 pr-4 py-2.5 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium text-slate-700 placeholder:text-slate-300"
                />
              </div>
            </div>

            {(profileForm.new_password.trim() !== "" || (profileForm.new_email.trim() !== "" && profileForm.new_email !== userEmail)) && (
              <div className="space-y-1.5 animate-in slide-in-from-top-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-rose-500 ml-1">Confirmação: Senha Atual</label>
                <div className="relative group">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-300 group-focus-within:text-rose-500 transition-colors" size={18} />
                  <input
                    type="password"
                    placeholder="digite sua senha atual"
                    value={profileForm.current_password}
                    onChange={e => setProfileForm({ ...profileForm, current_password: e.target.value })}
                    className="w-full rounded-xl border border-rose-200 bg-rose-50/10 pl-12 pr-4 py-2.5 text-sm outline-none focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100 transition-all font-medium text-slate-700 placeholder:text-slate-300"
                  />
                </div>
                {(profileForm.new_email && profileForm.new_email !== userEmail) && (
                  <p className="text-[10px] text-slate-400 italic ml-1">Para mudar o e-mail, também será necessário um código de verificação.</p>
                )}
              </div>
            )}

            {(profileForm.new_email && profileForm.new_email !== userEmail) && !showCodeField && (
              <button
                onClick={async () => {
                  setIsRequestingCode(true);
                  setStatusMsg({ type: "", text: "" });
                  try {
                    const body = new FormData();
                    body.append("email", userEmail);
                    body.append("action_type", 'email_change');

                    const res = await fetch("/api/profile/request-code", { method: "POST", body });
                    const data = await res.json();

                    if (res.ok) {
                      setShowCodeField(true);
                      setResendTimer(30);
                      setProfileForm(prev => ({ ...prev, code: "" }));
                      setStatusMsg({ type: "success", text: "Código enviado para " + userEmail });
                    } else {
                      setStatusMsg({ type: "error", text: data.detail || "Erro ao solicitar código." });
                    }
                  } catch (err) {
                    setStatusMsg({ type: "error", text: "Erro na rede ao solicitar código." });
                  } finally {
                    setIsRequestingCode(false);
                  }
                }}
                disabled={isRequestingCode}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gax-blue/10 px-4 py-3 text-xs font-bold text-gax-blue hover:bg-gax-blue/20 transition-all disabled:opacity-50"
              >
                {isRequestingCode ? <Loader2 className="animate-spin" size={14} /> : "Solicitar Código de Verificação"}
              </button>
            )}

            {showCodeField && (
              <div className="space-y-4 animate-in slide-in-from-bottom-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gax-blue ml-1 italic text-center block">Digite o código enviado ao seu e-mail</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={profileForm.code}
                  onChange={e => setProfileForm({ ...profileForm, code: e.target.value.replace(/\D/g, "") })}
                  className="w-full rounded-2xl border-2 border-gax-blue/30 bg-white px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] focus:border-gax-blue focus:outline-none focus:ring-4 focus:ring-gax-blue/10 transition-all text-slate-800"
                />
                <div className="flex justify-center">
                  {resendTimer > 0 ? (
                    <p className="text-[10px] text-slate-400 font-medium italic">Reenviar código em {resendTimer}s</p>
                  ) : (
                    <button
                      onClick={async () => {
                        setIsRequestingCode(true);
                        setStatusMsg({ type: "", text: "" });
                        try {
                          const type = profileForm.new_email ? 'email_change' : 'password_change';
                          const body = new FormData();
                          body.append("email", userEmail);
                          body.append("action_type", type);
                          const res = await fetch("/api/profile/request-code", { method: "POST", body });
                          const data = await res.json();
                          if (res.ok) {
                            setResendTimer(30);
                            setProfileForm(prev => ({ ...prev, code: "" }));
                            setStatusMsg({ type: "success", text: "Novo código enviado!" });
                          } else {
                            const errDetail = data.detail;
                            const msg = typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail);
                            setStatusMsg({ type: "error", text: msg || "Erro ao reenviar." });
                          }
                        } catch (err) {
                          setStatusMsg({ type: "error", text: "Erro de rede." });
                        } finally {
                          setIsRequestingCode(false);
                        }
                      }}
                      className="text-[10px] font-bold text-gax-blue hover:underline uppercase tracking-tight"
                    >
                      Reenviar código agora
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-50/80 px-8 py-6 flex gap-4">
          <button
            onClick={() => {
              onClose();
              setShowCodeField(false);
              setStatusMsg({ type: "", text: "" });
            }}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              setStatusMsg({ type: "", text: "" });
              const body = new FormData();
              body.append("current_email", userEmail);
              body.append("first_name", profileForm.first_name);
              body.append("last_name", profileForm.last_name);
              if (profileForm.new_email) body.append("new_email", profileForm.new_email);
              if (profileForm.new_password) body.append("new_password", profileForm.new_password);
              if (profileForm.current_password) body.append("current_password", profileForm.current_password);
              if (profileForm.code) body.append("code", profileForm.code);

              try {
                const res = await fetch("/api/profile/update", { method: "POST", body });
                const data = await res.json();

                if (res.ok) {
                  setStatusMsg({ type: "success", text: "Perfil atualizado com sucesso!" });
                  const fullName = `${profileForm.first_name} ${profileForm.last_name}`.trim();
                  localStorage.setItem("gax_user_name", fullName);
                  if (profileForm.new_email) {
                    localStorage.setItem("gax_user_email", profileForm.new_email);
                  }
                  // Notifica o sistema da mudança (opcional se o Sidebar ler do localStorage)
                  window.dispatchEvent(new CustomEvent('profile-updated', { detail: { name: fullName, email: profileForm.new_email || userEmail } }));

                  // Limpa campos sensíveis
                  setProfileForm(prev => ({ ...prev, new_email: "", new_password: "", current_password: "", code: "" }));
                  setShowCodeField(false);

                  // Fecha após 1.5s
                  setTimeout(() => onClose(), 1500);
                } else {
                  const msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
                  setStatusMsg({ type: "error", text: msg || "Erro ao atualizar perfil." });
                }
              } catch (err) {
                setStatusMsg({ type: "error", text: "Erro na rede ao atualizar perfil." });
              }
            }}
            className="flex-[1.5] rounded-xl bg-gax-blue py-3.5 text-sm font-bold text-white shadow-lg shadow-gax-blue/20 hover:bg-gax-blue-hover transition-all"
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}
