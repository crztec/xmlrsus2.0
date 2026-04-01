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
  { label: "Enviar ABIs", icon: <CloudUpload size={20} />, href: "/dashboard" },
  { label: "Dados ABIs", icon: <FileText size={20} />, href: "/xml-data" },
  { label: "Checar Importações", icon: <Shield size={20} />, href: "/check-imports" },
  { label: "Importações", icon: <ClipboardList size={20} />, href: "/logs" },
  { label: "Configurações", isTitle: true, isAdmin: true },
  { label: "Clientes", icon: <Users size={20} />, href: "/clients", isAdmin: true },
  { label: "Usuários", icon: <Users size={20} />, href: "/users", isAdmin: true },
  { label: "Pendentes", icon: <UserPlus size={20} />, href: "/pending", isAdmin: true },
  { label: "Checar APIs", icon: <Shield size={20} />, href: "/settings/api-checks", isAdmin: true },
  { label: "Login RSUS", icon: <Key size={20} />, href: "/settings/rsus", isAdmin: true },
  { label: "Sistema", icon: <Settings size={20} />, href: "/settings", isAdmin: true },
];

interface SidebarProps {
  onOpenProfile: () => void;
}

export default function Sidebar({ onOpenProfile }: SidebarProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [branding, setBranding] = React.useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gax_branding");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return { system_name: "GAX", logo_base64: "" };
        }
      }
    }
    return { system_name: "GAX", logo_base64: "" };
  });
  const [isLoadingBranding, setIsLoadingBranding] = React.useState(true);
  const [userName, setUserName] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gax_user_name") || "Usuário";
    }
    return "Usuário";
  });
  const [userEmail, setUserEmail] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gax_user_email") || "...";
    }
    return "...";
  });



  React.useEffect(() => {
    // Busca os dados do usuário logado na máquina
    const storedEmail = localStorage.getItem("gax_user_email");
    const storedRole = localStorage.getItem("gax_user_role");

    if (storedEmail) {
      setUserEmail(storedEmail);
      // Busca perfil básico para o nome do usuário
      fetch(`/api/profile?email=${storedEmail}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.detail) {
            const fullName = `${data.first_name} ${data.last_name}`.trim() || data.email;
            setUserName(fullName);
            localStorage.setItem("gax_user_name", fullName);
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
          const freshBranding = {
            system_name: data.system_name,
            logo_base64: data.logo_base64 || ""
          };
          setBranding(freshBranding);
          localStorage.setItem("gax_branding", JSON.stringify(freshBranding));
        }
      })
      .catch(err => console.error("Erro ao carregar branding:", err))
      .finally(() => setIsLoadingBranding(false));
  }, []);

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200/60 bg-white/80 backdrop-blur-xl">
      {/* Header Sidebar */}
      <div className="flex h-16 items-center border-b border-slate-100/50 px-6">
        <div className="flex items-center gap-2 overflow-hidden w-full">
          {isLoadingBranding ? (
            <div className="flex items-center gap-3 w-full animate-pulse">
              <div className="h-8 w-8 rounded-lg bg-slate-200/50 shrink-0"></div>
              <div className="h-4 w-24 rounded bg-slate-200/50"></div>
            </div>
          ) : (
            <>
              {branding.logo_base64 ? (
                <div className="h-8 w-8 overflow-hidden rounded-lg shrink-0 shadow-sm border border-slate-100">
                  <img src={branding.logo_base64} alt={`Logo ${branding.system_name}`} className="h-full w-full object-contain p-1" width={32} height={32} />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gax-blue text-white shrink-0 shadow-lg shadow-gax-blue/20" aria-hidden="true">
                  <CloudUpload size={18} />
                </div>
              )}
              <span className="text-lg font-display font-bold tracking-tight text-slate-800 truncate" title={branding.system_name}>
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
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-gax-blue/20 group",
                  isActive
                    ? "bg-gax-blue-light/50 text-gax-blue shadow-sm border border-gax-blue/10"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={cn(
                  "transition-colors",
                  isActive ? "text-gax-blue" : "text-slate-400 group-hover:text-slate-600"
                )} aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
                {isActive && (
                  <div 
                    className="ml-auto h-5 w-1 rounded-full bg-gax-blue animate-in slide-in-from-right-1 duration-300" 
                    aria-hidden="true" 
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer / User Profile Trigger */}
      <div className="border-t border-slate-100/50 p-4">
        <button
          onClick={onOpenProfile}
          className="w-full flex items-center gap-3 rounded-2xl border border-slate-100/50 bg-slate-50/30 p-2 text-left transition-all hover:bg-white hover:shadow-xl hover:shadow-slate-200/40 group border-transparent hover:border-slate-100"
          title="Ver Perfil"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gax-blue to-gax-blue-hover text-white font-bold text-xs uppercase shadow-lg shadow-gax-blue/20 group-hover:scale-105 transition-transform" aria-hidden="true">
            {userName ? userName.charAt(0) : "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-xs font-bold text-slate-900 leading-tight">{userName}</p>
            <p className="truncate text-[10px] text-slate-400 font-medium">{userEmail}</p>
          </div>
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Deseja realmente sair?")) {
                localStorage.clear();
                window.location.href = "/login";
              }
            }}
            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-red-200 outline-none"
            aria-label="Sair do sistema"
          >
            <LogOut size={16} aria-hidden="true" />
          </div>
        </button>
      </div>

    </aside>
  );
}
