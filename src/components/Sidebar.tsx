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
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { label: "Importação", isTitle: true },
  { label: "Upload", icon: <CloudUpload size={20} />, href: "/dashboard" },
  { label: "Dados XML", icon: <FileText size={20} />, href: "/xml-data" },
  { label: "Log de Importação", icon: <ClipboardList size={20} />, href: "/logs" },
  { label: "Configurações", isTitle: true },
  { label: "Clientes", icon: <Users size={20} />, href: "/clients" },
  { label: "Usuários", icon: <Users size={20} />, href: "/users", isAdmin: true },
  { label: "Pendentes", icon: <UserPlus size={20} />, href: "/pending", isAdmin: true },
  { label: "Sistema", icon: <Settings size={20} />, href: "/settings", isAdmin: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isAdmin = true; // Placeholder para Role real
  const [branding, setBranding] = React.useState({ system_name: "GAX", logo_base64: "" });
  const [isLoadingBranding, setIsLoadingBranding] = React.useState(true);
  const [userName, setUserName] = React.useState("Usuário");
  const [userEmail, setUserEmail] = React.useState("carregando...");

  React.useEffect(() => {
    // Busca os dados do usuário logado na máquina
    const storedName = localStorage.getItem("gax_user_name");
    const storedEmail = localStorage.getItem("gax_user_email");
    if (storedName) setUserName(storedName);
    if (storedEmail) setUserEmail(storedEmail);
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

      {/* Footer / User Profile Popover Trigger */}
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-2 text-left transition-colors hover:bg-slate-50">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-500 font-bold text-xs uppercase" aria-hidden="true">
            {userName ? userName.charAt(0) : "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-xs font-bold text-slate-900">{userName}</p>
            <p className="truncate text-[10px] text-slate-500">{userEmail}</p>
          </div>
          <button 
            onClick={() => {
              if (confirm("Deseja realmente sair?")) {
                window.location.href = "/login";
              }
            }}
            className="text-slate-400 hover:text-red-500 transition-colors focus-visible:ring-2 focus-visible:ring-red-200 outline-none rounded-md"
            aria-label="Sair do sistema"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
