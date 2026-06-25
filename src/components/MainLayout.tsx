"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
  onToggleSidebar?: () => void;
}

import { 
  CloudUpload, 
  FileText, 
  ClipboardList, 
  Users, 
  UserPlus, 
  Settings, 
  Puzzle, 
  Shield, 
  Palette, 
  Wrench, 
  ScrollText, 
  Lock,
  LayoutDashboard,
  LayoutGrid,
  Menu
} from "lucide-react";

interface PageMeta {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
}

const PAGE_METADATA: Record<string, PageMeta> = {
  "/dashboard": {
    title: "Enviar ABIs",
    subtitle: "Selecione arquivos XML para processamento (Limite: 5MB por arquivo)",
    icon: <CloudUpload size={24} className="text-gax-blue" />
  },
  "/xml-data": {
    title: "Dados ABIs",
    subtitle: "Selecione um cliente para visualizar os dados contidos nos ABIs",
    icon: <FileText size={24} className="text-gax-blue" />
  },
  "/logs": {
    title: "Histórico de Importações",
    subtitle: "Logs de cada processamento realizado",
    icon: <ClipboardList size={24} className="text-gax-blue" />
  },
  "/clients": {
    title: "Clientes Cadastrados",
    subtitle: "Lista de clientes detectados nos XMLs processados",
    icon: <Users size={24} className="text-gax-blue" />
  },
  "/users": {
    title: "Gerenciamento de Usuários",
    subtitle: "Visualize e edite as permissões dos usuários do sistema",
    icon: <Users size={24} className="text-gax-blue" />
  },
  "/pending": {
    title: "Usuários Pendentes",
    subtitle: "Novos cadastros aguardando aprovação administrativa",
    icon: <UserPlus size={24} className="text-gax-blue" />
  },
  "/settings": {
    title: "Configurações do Sistema",
    subtitle: "Personalize a aparência e gerencie os dados do GAX",
    icon: <Settings size={24} className="text-gax-blue" />
  },
  "/settings/api-checks": {
    title: "Checar APIs",
    subtitle: "Verificação automática de conexões com os portais RSUS",
    icon: <Puzzle size={24} className="text-gax-blue" />
  },
  "/check-imports": {
    title: "Checar Importações",
    subtitle: "Monitoramento em tempo real do processamento de ABIs no RSUS",
    icon: <Shield size={24} className="text-gax-blue" />
  },
  "/abi-history": {
    title: "Histórico de ABIs",
    subtitle: "Acompanhe os resultados dos ciclos de ABI finalizados",
    icon: <ScrollText size={24} className="text-gax-blue" />
  },
  "/settings/branding": {
    title: "Identidade Visual",
    subtitle: "Personalize o nome e o logotipo do sistema",
    icon: <Palette size={24} className="text-gax-blue" />
  },
  "/settings/audit": {
    title: "Logs do Sistema",
    subtitle: "Rastreabilidade de ações administrativas no sistema",
    icon: <ScrollText size={24} className="text-gax-blue" />
  },
  "/admin/groups": {
    title: "Gestão de Grupos",
    subtitle: "Agrupe operadoras e federações para melhor organização",
    icon: <LayoutDashboard size={24} className="text-gax-blue" />
  },
  "/settings/access-control": {
    title: "Controle de Acessos",
    subtitle: "Credenciais dos sistemas RSUS e CubeTI Gestão Comercial",
    icon: <Lock size={24} className="text-gax-blue" />
  },
  "/settings/integrations": {
    title: "Integrações",
    subtitle: "Configurações de conectores externos (WhatsApp, Evolution API)",
    icon: <Puzzle size={24} className="text-gax-blue" />
  },
  "/settings/messages": {
    title: "Mensagens & Broadcast",
    subtitle: "Envio de comunicados em massa via WhatsApp",
    icon: <FileText size={24} className="text-gax-blue" />
  },
  "/settings/menus": {
    title: "Gerenciar Menus",
    subtitle: "Personalize a ordem e os nomes dos menus do sistema",
    icon: <LayoutGrid size={24} className="text-gax-blue" />
  },
  "/query-builder": {
    title: "Query Builder",
    subtitle: "Gere e execute queries SQL Server a partir de linguagem natural",
    icon: <Wrench size={24} className="text-gax-blue" />
  }
};

export default function MainLayout({ children, onToggleSidebar }: MainLayoutProps) {
  const pathname = usePathname();
  const [dynamicMetadata, setDynamicMetadata] = React.useState<Record<string, PageMeta>>({});

  // Load dynamic menu labels once
  React.useEffect(() => {
    apiClient("/api/menu-config")
      .then(res => res.json())
      .then(data => {
        if (!data?.main_menu) return;
        const overrides: Record<string, PageMeta> = {};
        // Build a route->key map for looking up the correct PAGE_METADATA entry
        const ROUTE_MAP: Record<string, string> = {
          dashboard: "/dashboard",
          "xml-data": "/xml-data",
          "check-imports": "/check-imports",
          "abi-history": "/abi-history",
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
          "query-builder": "/query-builder",
        };
        const allItems = [...(data.main_menu || []), ...(data.admin_menu || []), ...(data.config_menu || [])];
        allItems.forEach((item: any) => {
          const route = ROUTE_MAP[item.key];
          if (route && PAGE_METADATA[route]) {
            overrides[route] = {
              ...PAGE_METADATA[route],
              title: item.label,
            };
          }
        });
        setDynamicMetadata(overrides);
      })
      .catch(() => {});
  }, []);

  const metadata = dynamicMetadata[pathname] || PAGE_METADATA[pathname] || {
    title: "GAX",
    subtitle: "Gestão de Arquivos XML",
    icon: <CloudUpload size={24} className="text-gax-blue" />
  };

  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Dynamic Header */}
      <header className="flex h-20 items-center justify-between border-b border-slate-200/60 bg-white/50 backdrop-blur-md px-4 md:px-8 sticky top-0 z-20">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Burger Button - Mobile Only */}
          <button 
            onClick={onToggleSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 md:hidden text-slate-600 active:scale-95 transition-all shadow-sm"
          >
            <Menu size={20} />
          </button>

          {metadata.icon && (
            <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl md:rounded-2xl bg-white shadow-sm border border-slate-100 flex-shrink-0">
              {metadata.icon}
            </div>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-display font-bold tracking-tight text-slate-900 leading-tight">{metadata.title}</h1>
            <p className="text-[11px] md:text-[13px] font-medium text-slate-400 line-clamp-1">{metadata.subtitle}</p>
          </div>
        </div>


      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
