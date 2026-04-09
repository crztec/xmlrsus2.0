"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CloudUpload,
  ClipboardList,
  Users,
  UserPlus,
  Settings,
  LogOut,
  LayoutDashboard,
  LayoutGrid,
  FileText,
  User,
  Key,
  Shield,
  Loader2,
  ChevronDown,
  Palette,
  Wrench,
  ScrollText,
  Lock,
  Puzzle
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icon registry for dynamic menus
const ICON_MAP: Record<string, React.ReactNode> = {
  CloudUpload: <CloudUpload size={20} />,
  FileText: <FileText size={20} />,
  ClipboardList: <ClipboardList size={20} />,
  Users: <Users size={20} />,
  UserPlus: <UserPlus size={20} />,
  Settings: <Settings size={20} />,
  Puzzle: <Puzzle size={20} />,
  Shield: <Shield size={20} />,
  Palette: <Palette size={20} />,
  ScrollText: <ScrollText size={20} />,
  Lock: <Lock size={20} />,
  LayoutDashboard: <LayoutDashboard size={20} />,
  LayoutGrid: <LayoutGrid size={20} />,
};

const ICON_MAP_SM: Record<string, React.ReactNode> = {
  CloudUpload: <CloudUpload size={18} />,
  FileText: <FileText size={18} />,
  ClipboardList: <ClipboardList size={18} />,
  Users: <Users size={18} />,
  UserPlus: <UserPlus size={18} />,
  Settings: <Settings size={18} />,
  Puzzle: <Puzzle size={18} />,
  Shield: <Shield size={18} />,
  Palette: <Palette size={18} />,
  ScrollText: <ScrollText size={18} />,
  Lock: <Lock size={18} />,
  LayoutDashboard: <LayoutDashboard size={18} />,
  LayoutGrid: <LayoutGrid size={18} />,
};

// Route mapping by key
const ROUTE_MAP: Record<string, string> = {
  dashboard: "/dashboard",
  "xml-data": "/xml-data",
  "check-imports": "/check-imports",
  logs: "/logs",
  "api-checks": "/settings/api-checks",
  clients: "/clients",
  users: "/users",
  groups: "/admin/groups",
  pending: "/pending",
  integrations: "/settings/integrations",
  audit: "/settings/audit",
  "access-control": "/settings/access-control",
  messages: "/settings/messages",
  branding: "/settings/branding",
  menus: "/settings/menus",
};

const DEFAULT_MAIN_MENU = [
  { label: "Enviar ABIs", icon: <CloudUpload size={20} />, href: "/dashboard" },
  { label: "Dados ABIs", icon: <FileText size={20} />, href: "/xml-data" },
  { label: "Checar Importações", icon: <Shield size={20} />, href: "/check-imports" },
  { label: "Histórico de Importações", icon: <ClipboardList size={20} />, href: "/logs" },
  { label: "Checar APIs", icon: <Puzzle size={20} />, href: "/settings/api-checks", isAdmin: true },
];

const DEFAULT_ADMIN_SUB = [
  { label: "Clientes", icon: <Users size={18} />, href: "/clients" },
  { label: "Usuários", icon: <Users size={18} />, href: "/users" },
  { label: "Grupos", icon: <LayoutDashboard size={18} />, href: "/admin/groups" },
  { label: "Pendentes", icon: <UserPlus size={18} />, href: "/pending" },
];

const DEFAULT_CONFIG_SUB = [
  { label: "Integrações", icon: <Puzzle size={18} />, href: "/settings/integrations" },
  { label: "Logs do Sistema", icon: <ScrollText size={18} />, href: "/settings/audit" },
  { label: "Controle de Acessos", icon: <Lock size={18} />, href: "/settings/access-control" },
  { label: "Mensagens", icon: <FileText size={18} />, href: "/settings/messages" },
  { label: "Identidade Visual", icon: <Palette size={18} />, href: "/settings/branding" },
  { label: "Gerenciar Menus", icon: <LayoutGrid size={18} />, href: "/settings/menus" },
];

interface SidebarProps {
  onOpenProfile: () => void;
}

export default function Sidebar({ onOpenProfile }: SidebarProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [systemMenuOpen, setSystemMenuOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.pathname.startsWith("/settings");
    }
    return false;
  });
  const [adminMenuOpen, setAdminMenuOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname;
      return p.startsWith("/clients") || p.startsWith("/users") || p.startsWith("/admin/groups") || p.startsWith("/pending");
    }
    return false;
  });

  // Dynamic menu state
  const [mainMenuItems, setMainMenuItems] = useState<any[]>([{ label: "Importação", isTitle: true }, ...DEFAULT_MAIN_MENU]);
  const [adminSubItems, setAdminSubItems] = useState<any[]>(DEFAULT_ADMIN_SUB);
  const [configSubItems, setConfigSubItems] = useState<any[]>(DEFAULT_CONFIG_SUB);
  const [sectionLabels, setSectionLabels] = useState({ main_title: "Importação", admin_title: "Administração", config_title: "Configuração" });
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
  const [userName, setUserName] = React.useState("Usuário");
  const [userEmail, setUserEmail] = React.useState("...");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setUserName(localStorage.getItem("gax_user_name") || "Usuário");
      setUserEmail(localStorage.getItem("gax_user_email") || "...");
    }
  }, []);

  React.useEffect(() => {
    const storedEmail = localStorage.getItem("gax_user_email");
    const storedRole = localStorage.getItem("gax_user_role");

    if (storedEmail) {
      setUserEmail(storedEmail);
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

  // Auto-open system menu when navigating to a settings sub-route
  const isSettingsActive = pathname.startsWith("/settings") && !pathname.includes("api-checks");
  const isAdminActive = pathname.startsWith("/clients") || pathname.startsWith("/users") || pathname.startsWith("/admin/groups") || pathname.startsWith("/pending");

  // Load dynamic menu config
  useEffect(() => {
    fetch("/api/menu-config")
      .then(res => res.json())
      .then(data => {
        if (data && data.main_menu) {
          // Build main menu from config
          const titleLabel = data.section_labels?.main_title || "Importação";
          const dynamicMain: any[] = [{ label: titleLabel, isTitle: true }];
          const sortedMain = [...data.main_menu].sort((a: any, b: any) => a.order - b.order);
          sortedMain.forEach((item: any) => {
            dynamicMain.push({
              label: item.label,
              icon: ICON_MAP[item.icon] || <Settings size={20} />,
              href: ROUTE_MAP[item.key] || "/dashboard",
              isAdmin: item.isAdmin || false,
            });
          });
          setMainMenuItems(dynamicMain);

          // Build admin sub-items
          if (data.admin_menu) {
            const sortedAdmin = [...data.admin_menu].sort((a: any, b: any) => a.order - b.order);
            setAdminSubItems(sortedAdmin.map((item: any) => ({
              label: item.label,
              icon: ICON_MAP_SM[item.icon] || <Settings size={18} />,
              href: ROUTE_MAP[item.key] || "/clients",
            })));
          }

          // Build config sub-items
          if (data.config_menu) {
            const sortedConfig = [...data.config_menu].sort((a: any, b: any) => a.order - b.order);
            setConfigSubItems(sortedConfig.map((item: any) => ({
              label: item.label,
              icon: ICON_MAP_SM[item.icon] || <Settings size={18} />,
              href: ROUTE_MAP[item.key] || "/settings",
            })));
          }

          // Section labels
          if (data.section_labels) {
            setSectionLabels(data.section_labels);
          }
        }
      })
      .catch(err => console.error("Erro ao carregar menu config:", err));
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
          {mainMenuItems.map((item, idx) => {
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

          {/* Administração - Collapsible Menu (admin only) */}
          {isAdmin && (
            <>
              <button
                onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-gax-blue/20 group",
                  isAdminActive
                    ? "bg-gax-blue-light/50 text-gax-blue shadow-sm border border-gax-blue/10"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                )}
              >
                <span className={cn(
                  "transition-colors",
                  adminMenuOpen ? "text-gax-blue" : "text-slate-400 group-hover:text-slate-600"
                )}>
                  <Settings size={20} />
                </span>
                {sectionLabels.admin_title}
                <ChevronDown 
                  size={14} 
                  className={cn(
                    "ml-auto transition-transform duration-200",
                    adminMenuOpen ? "rotate-180" : ""
                  )} 
                />
              </button>

              <div className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                adminMenuOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
              )}>
                <div className="ml-3 space-y-0.5 border-l-2 border-slate-100 pl-3 py-1">
                  {adminSubItems.map((sub, idx) => {
                    const isSubActive = pathname === sub.href;
                    return (
                      <Link
                        key={idx}
                        href={sub.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all group",
                          isSubActive
                            ? "bg-gax-blue/5 text-gax-blue"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        )}
                      >
                        <span className={cn(
                          "transition-colors",
                          isSubActive ? "text-gax-blue" : "text-slate-400 group-hover:text-slate-500"
                        )}>
                          {sub.icon}
                        </span>
                        {sub.label}
                        {isSubActive && (
                          <div className="ml-auto h-4 w-0.5 rounded-full bg-gax-blue" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Configuração - Collapsible Menu (admin only) */}
          {isAdmin && (
            <>
              <button
                onClick={() => setSystemMenuOpen(!systemMenuOpen)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-gax-blue/20 group",
                  isSettingsActive
                    ? "bg-gax-blue-light/50 text-gax-blue shadow-sm border border-gax-blue/10"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                )}
              >
                <span className={cn(
                  "transition-colors",
                  isSettingsActive ? "text-gax-blue" : "text-slate-400 group-hover:text-slate-600"
                )}>
                  <Settings size={20} />
                </span>
                {sectionLabels.config_title}
                <ChevronDown 
                  size={14} 
                  className={cn(
                    "ml-auto transition-transform duration-200",
                    systemMenuOpen ? "rotate-180" : ""
                  )} 
                />
              </button>

              <div className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                systemMenuOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
              )}>
                <div className="ml-3 space-y-0.5 border-l-2 border-slate-100 pl-3 py-1">
                  {configSubItems.map((sub: any, idx: number) => {
                    const isSubActive = pathname === sub.href;
                    return (
                      <Link
                        key={idx}
                        href={sub.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all group",
                          isSubActive
                            ? "bg-gax-blue/5 text-gax-blue"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        )}
                      >
                        <span className={cn(
                          "transition-colors",
                          isSubActive ? "text-gax-blue" : "text-slate-400 group-hover:text-slate-500"
                        )}>
                          {sub.icon}
                        </span>
                        {sub.label}
                        {isSubActive && (
                          <div className="ml-auto h-4 w-0.5 rounded-full bg-gax-blue" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </>
          )}
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
