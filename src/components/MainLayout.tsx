"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
}

const PAGE_METADATA: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Nova Importação",
    subtitle: "Selecione arquivos XML para processamento (Limite: 5MB por arquivo)"
  },
  "/xml-data": {
    title: "Dados ABIs",
    subtitle: "Selecione um cliente para visualizar os dados contidos nos ABIs"
  },
  "/logs": {
    title: "Histórico de Importações",
    subtitle: "Logs de cada processamento realizado"
  },
  "/clients": {
    title: "Clientes Cadastrados",
    subtitle: "Lista de clientes detectados nos XMLs processados"
  },
  "/users": {
    title: "Gerenciamento de Usuários",
    subtitle: "Visualize e edite as permissões dos usuários do sistema"
  },
  "/pending": {
    title: "Usuários Pendentes",
    subtitle: "Novos cadastros aguardando aprovação administrativa"
  },
  "/settings": {
    title: "Configurações do Sistema",
    subtitle: "Personalize a aparência e gerencie os dados do GAX"
  }
};

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const metadata = PAGE_METADATA[pathname] || {
    title: "GAX",
    subtitle: "Gestão de Arquivos XML"
  };

  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Dynamic Header */}
      <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-slate-800">{metadata.title}</h1>
          <p className="text-sm font-medium text-slate-400">{metadata.subtitle}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Sistema Online</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
