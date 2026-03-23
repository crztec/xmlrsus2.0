"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CloudUpload,
  ClipboardList,
  Users,
  UserPlus,
  Settings,
  LogOut,
  ChevronLeft,
  LayoutDashboard,
  FileText,
  User,
  Mail,
  Key,
  Shield,
  Loader2,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { label: "Importação", isTitle: true },
  { label: "Upload", icon: <CloudUpload size={20} />, href: "/dashboard" },
  { label: "Dados XML", icon: <FileText size={20} />, href: "/xml-data" },
  { label: "Log de Importação", icon: <ClipboardList size={20} />, href: "/logs" },
  { label: "Configurações", isTitle: true, isAdmin: true },
  { label: "Clientes", icon: <Users size={20} />, href: "/clients", isAdmin: true },
  { label: "Usuários", icon: <Users size={20} />, href: "/users", isAdmin: true },
  { label: "Pendentes", icon: <UserPlus size={20} />, href: "/pending", isAdmin: true },
  { label: "Sistema", icon: <Settings size={20} />, href: "/settings", isAdmin: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [branding, setBranding] = React.useState({ system_name: "GAX", logo_base64: "" });
  const [isLoadingBranding, setIsLoadingBranding] = React.useState(true);
  const [userName, setUserName] = React.useState("Usuário");
  const [userEmail, setUserEmail] = React.useState("carregando...");

  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState({
    first_name: "",
    last_name: "",
    new_email: "",
    new_password: "",
    current_password: "",
    code: ""
  });
  const [isRequestingCode, setIsRequestingCode] = React.useState(false);
  const [showCodeField, setShowCodeField] = React.useState(false);
  const [resendTimer, setResendTimer] = React.useState(0);
  const [statusMsg, setStatusMsg] = React.useState({ type: "", text: "" });

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  React.useEffect(() => {
    // Busca os dados do usuário logado na máquina
    const storedName = localStorage.getItem("gax_user_name");
    const storedEmail = localStorage.getItem("gax_user_email");
    const storedRole = localStorage.getItem("gax_user_role");
    
    if (storedEmail) {
      setUserEmail(storedEmail);
      // Busca perfil completo do servidor para preencher a modal
      fetch(`/api/profile?email=${storedEmail}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.detail) {
            setUserName(`${data.first_name} ${data.last_name}`.trim() || data.email);
            setProfileForm(prev => ({
              ...prev,
              first_name: data.first_name || "",
              last_name: data.last_name || ""
            }));
          }
        })
        .catch(err => console.error("Erro ao buscar perfil:", err));
    }
    
    if (storedRole === "admin") setIsAdmin(true);
  }, []);

  React.useEffect(() => {
    fetch("/api/branding")
      .then(res => {
        if (!res.ok) throw new Error("API não retornou ok");
        return res.json();
      })
      .then(data => {
        if (data && data.system_name) {
          setBranding({
            system_name: data.system_name,
            logo_base64: data.logo_base64 || ""
          });
        }
      })
      .catch(err => console.error("Erro ao carregar branding:", err))
      .finally(() => setIsLoadingBranding(false));
  }, []);

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      {/* Header Sidebar */}
      <div className="flex h-16 items-center border-b border-slate-100 px-6">
        <div className="flex items-center gap-2 overflow-hidden w-full">
          {isLoadingBranding ? (
            <div className="flex items-center gap-3 w-full animate-pulse">
              <div className="h-8 w-8 rounded-lg bg-slate-200 shrink-0"></div>
              <div className="h-4 w-24 rounded bg-slate-200"></div>
            </div>
          ) : (
            <>
              {branding.logo_base64 ? (
                <div className="h-8 w-8 overflow-hidden rounded-lg shrink-0">
                  <img src={branding.logo_base64} alt={`Logo ${branding.system_name}`} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gax-blue text-white shrink-0" aria-hidden="true">
                  <CloudUpload size={18} />
                </div>
              )}
              <span className="text-lg font-bold tracking-tight text-slate-800 truncate" title={branding.system_name}>
                {branding.system_name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navegação Principal">
        <div className="space-y-1">
          {menuItems.map((item, idx) => {
            if (item.isTitle) {
              if (item.isAdmin && !isAdmin) return null;
              return (
                <div key={idx} className="mb-2 mt-4 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400" aria-hidden="true">
                  {item.label}
                </div>
              );
            }

            if (item.isAdmin && !isAdmin) return null;

            const isActive = pathname === item.href;

            return (
              <Link
                key={idx}
                href={item.href || "#"}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-gax-blue/20",
                  isActive
                    ? "bg-gax-blue-light text-gax-blue"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={cn(isActive ? "text-gax-blue" : "text-slate-400")} aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
                {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-gax-blue" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer / User Profile Trigger */}
      <div className="border-t border-slate-100 p-4">
        <button 
          onClick={() => setIsProfileModalOpen(true)}
          className="w-full flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-2 text-left transition-colors hover:bg-slate-100/80 group"
          title="Ver Perfil"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gax-blue text-white font-bold text-xs uppercase shadow-sm group-hover:scale-105 transition-transform" aria-hidden="true">
            {userName ? userName.charAt(0) : "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-xs font-bold text-slate-900">{userName}</p>
            <p className="truncate text-[10px] text-slate-500">{userEmail}</p>
          </div>
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Deseja realmente sair?")) {
                localStorage.clear();
                window.location.href = "/login";
              }
            }}
            className="p-1 text-slate-400 hover:text-red-500 transition-colors focus-visible:ring-2 focus-visible:ring-red-200 outline-none rounded-md"
            aria-label="Sair do sistema"
          >
            <LogOut size={16} aria-hidden="true" />
          </div>
        </button>
      </div>

      {/* User Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gax-blue/10 text-gax-blue">
                  <User size={18} />
                </div>
                <h3 className="font-bold text-slate-800">Meu Perfil</h3>
              </div>
              <button 
                onClick={() => {
                  setIsProfileModalOpen(false);
                  setShowCodeField(false);
                  setStatusMsg({ type: "", text: "" });
                  setResendTimer(0);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {statusMsg.text && (
                <div className={cn(
                  "p-3 rounded-lg text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top-2",
                  statusMsg.type === "success" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                )}>
                  {statusMsg.type === "success" ? <Shield size={14} /> : <Shield size={14} className="opacity-50" />}
                  {statusMsg.text}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Nome</label>
                  <input 
                    type="text"
                    value={profileForm.first_name}
                    onChange={e => setProfileForm({...profileForm, first_name: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/30 px-3 py-2 text-sm focus:border-gax-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-gax-blue/10 transition-all font-medium text-slate-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Sobrenome</label>
                  <input 
                    type="text"
                    value={profileForm.last_name}
                    onChange={e => setProfileForm({...profileForm, last_name: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/30 px-3 py-2 text-sm focus:border-gax-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-gax-blue/10 transition-all font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-50">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gax-blue flex items-center gap-2">
                  <Shield size={12} /> Alterações Sensíveis
                </h4>
                
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Novo E-mail (Opcional)</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 text-slate-300" size={16} />
                    <input 
                      type="email"
                      placeholder="deixe vazio para não alterar"
                      autoComplete="off"
                      value={profileForm.new_email}
                      onChange={e => setProfileForm({...profileForm, new_email: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/30 pl-10 pr-3 py-2 text-sm focus:border-gax-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-gax-blue/10 transition-all font-medium text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Nova Senha (Opcional)</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 text-slate-300" size={16} />
                    <input 
                      type="password"
                      id="gax-new-password-field"
                      name="password_new_null"
                      placeholder="mínimo 6 caracteres"
                      autoComplete="new-password"
                      value={profileForm.new_password}
                      onChange={e => setProfileForm({...profileForm, new_password: e.target.value})}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/30 pl-10 pr-3 py-2 text-sm focus:border-gax-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-gax-blue/10 transition-all font-medium text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {(profileForm.new_password.trim() !== "" || (profileForm.new_email.trim() !== "" && profileForm.new_email !== userEmail)) && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-red-500 ml-1">Confirmação: Senha Atual</label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-2.5 text-red-300" size={16} />
                      <input 
                        type="password"
                        placeholder="digite sua senha atual"
                        value={profileForm.current_password}
                        onChange={e => setProfileForm({...profileForm, current_password: e.target.value})}
                        className="w-full rounded-lg border border-red-200 bg-red-50/10 pl-10 pr-3 py-2 text-sm focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 transition-all font-medium text-slate-700 placeholder:text-slate-300"
                      />
                    </div>
                    {(profileForm.new_email && profileForm.new_email !== userEmail) && (
                      <p className="text-[10px] text-slate-500 italic ml-1">Para mudar o e-mail, também será necessário um código de verificação.</p>
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
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-gax-blue/10 px-4 py-2 text-xs font-bold text-gax-blue hover:bg-gax-blue/20 transition-all disabled:opacity-50"
                  >
                    {isRequestingCode ? <Loader2 className="animate-spin" size={14} /> : "Solicitar Código para Mudar E-mail"}
                  </button>
                )}

                {showCodeField && (
                  <div className="space-y-3 animate-in slide-in-from-bottom-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-gax-blue ml-1 italic text-center block">Digite o código de 6 dígitos enviado ao seu e-mail</label>
                    <input 
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={profileForm.code}
                      onChange={e => setProfileForm({...profileForm, code: e.target.value.replace(/\D/g, "")})}
                      className="w-full rounded-lg border-2 border-gax-blue/30 bg-white px-3 py-3 text-center text-xl font-bold tracking-[0.5em] focus:border-gax-blue focus:outline-none focus:ring-4 focus:ring-gax-blue/10 transition-all text-slate-800"
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
                                setStatusMsg({ type: "error", text: data.detail || "Erro ao reenviar." });
                              }
                            } catch (err) {
                              setStatusMsg({ type: "error", text: "Erro de rede." });
                            } finally {
                              setIsRequestingCode(false);
                            }
                          }}
                          className="text-[10px] font-bold text-gax-blue hover:underline uppercase tracking-tighter"
                        >
                          Não recebeu? Reenviar código agora
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex gap-3">
              <button 
                onClick={() => {
                  setIsProfileModalOpen(false);
                  setShowCodeField(false);
                  setStatusMsg({ type: "", text: "" });
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
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
                      setUserName(`${profileForm.first_name} ${profileForm.last_name}`.trim());
                      localStorage.setItem("gax_user_name", `${profileForm.first_name} ${profileForm.last_name}`.trim());
                      if (profileForm.new_email) {
                        localStorage.setItem("gax_user_email", profileForm.new_email);
                        setUserEmail(profileForm.new_email);
                      }
                      // Limpa campos sensíveis mas mantém a modal aberta
                      setProfileForm(prev => ({ ...prev, new_email: "", new_password: "", current_password: "", code: "" }));
                      setShowCodeField(false);
                    } else {
                      setStatusMsg({ type: "error", text: data.detail || "Erro ao atualizar perfil." });
                    }
                  } catch (err) {
                    setStatusMsg({ type: "error", text: "Erro na rede ao atualizar perfil." });
                  }
                }}
                className="flex-1 rounded-lg bg-gax-blue px-4 py-2 text-sm font-bold text-white shadow-lg shadow-gax-blue/20 hover:bg-gax-blue-dark transition-all"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
