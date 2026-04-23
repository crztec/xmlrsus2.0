"use client";

import React from "react";
import { Trash2, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

export default function MaintenancePage() {
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    setIsLoading(false);
  }, []);

  const handleMaintenance = async (action: 'clear-logs' | 'reset-db') => {
    const messages = {
      'clear-logs': "Tem certeza que deseja limpar todos os logs? Esta ação não pode ser desfeita.",
      'reset-db': "ATENÇÃO: Isso apagará TODOS os dados de clientes, tarefas e arquivos. Deseja continuar?"
    };

    if (confirm(messages[action])) {
      try {
        const res = await apiClient(`/api/maintenance/${action}`, { method: "POST" });
        const data = await res.json();
        alert(data.message);
      } catch (error) {
        alert("Erro ao executar ação de manutenção.");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gax-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8 pt-2 max-w-3xl mx-auto">
      <section className="space-y-6 rounded-3xl border border-slate-200/60 bg-white/70 p-6 md:p-8 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
            <Trash2 size={20} />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Manutenção</h2>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl bg-red-50 p-4">
            <h4 className="mb-1 text-sm font-bold text-red-700">Zona de Perigo</h4>
            <p className="text-xs text-red-600">Estas ações são permanentes e não podem ser desfeitas.</p>
          </div>

          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div>
              <p className="text-sm font-bold text-slate-700">Limpar Logs de Importação</p>
              <p className="text-[11px] text-slate-400">Apaga permanentemente o histórico de logs.</p>
            </div>
            <button 
              onClick={() => handleMaintenance('clear-logs')}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
            >
              Limpar
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">Reiniciar Banco de Dados</p>
              <p className="text-[11px] text-slate-400">Apaga todos os clientes e dados de XML.</p>
            </div>
            <button 
              onClick={() => handleMaintenance('reset-db')}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
            >
              Resetar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
