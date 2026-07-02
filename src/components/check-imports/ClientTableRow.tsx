"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  XCircle,
  MoreHorizontal,
  Play,
  Scale,
  FileText,
  History,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientABI {
  id: string;
  name: string;
  cnpj: string;
  abi_status?: string;
  abi_current?: string;
  abi_last_check?: any;
  abi_last_message?: string;
  abi_last_task_id?: string;
  url_sistema: string;
  impugnation_status?: string;
  impugnation_last_message?: string;
  impugnation_last_task_id?: string;
  [key: string]: any;
}

interface ABISchedule {
  ABI: string;
  [key: string]: any;
}

interface ClientTableRowProps {
  client: ClientABI;
  activeAbi: ABISchedule | null;
  isSelected: boolean;
  openMenuId: string | null;
  rowDropdownRef: React.RefObject<HTMLDivElement | null> | null;
  activeTaskId: string | null;
  getStatusIcon: (c: any) => React.ReactNode;
  onToggleSelect: (id: string) => void;
  onOpenMenu: (id: string | null) => void;
  onStartCheck: (clientId?: string) => void;
  onStartImpugnationCheck: (clientId?: string) => void;
  onOpenDetailedLogs: (taskId: string, title: string, clientName?: string) => void;
  onViewGlobalLog: () => void;
}

function ClientTableRowInner({
  client,
  activeAbi,
  isSelected,
  openMenuId,
  rowDropdownRef,
  activeTaskId,
  getStatusIcon,
  onToggleSelect,
  onOpenMenu,
  onStartCheck,
  onStartImpugnationCheck,
  onOpenDetailedLogs,
  onViewGlobalLog,
}: ClientTableRowProps) {
  const activeAbiDigits = (activeAbi?.ABI || '').replace(/\D/g, '');
  const clientAbiDigits = (client.abi_current || '').replace(/\D/g, '');
  const isStale = !!(activeAbiDigits && clientAbiDigits && clientAbiDigits !== activeAbiDigits);

  const getTimestamp = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'object' && val._seconds) return val._seconds * 1000;
    return new Date(val).getTime();
  };

  const abiTs = getTimestamp(client.abi_last_check);
  const impTs = getTimestamp(client.impugnation_last_check);
  const maxTs = Math.max(abiTs, impTs);
  
  const lastCheck = maxTs > 0 ? new Date(maxTs) : null;

  return (
    <tr
      className={cn(
        "group transition-colors text-[11px]",
        isSelected ? "bg-gax-blue/5" : "hover:bg-gax-blue/[0.02]"
      )}
    >
      <td className="px-4 py-2.5">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-300 text-gax-blue focus:ring-gax-blue/20 transition-all cursor-pointer"
          checked={isSelected}
          onChange={() => onToggleSelect(client.id)}
        />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-bold text-slate-800 text-xs font-display leading-tight truncate max-w-[200px]">{client.name}</span>
          {client.group_name ? (
            <span className="inline-flex items-center rounded-full bg-gax-blue/5 px-2 py-0.5 text-[8px] font-bold text-gax-blue border border-gax-blue/10 w-fit">
              {client.group_name}
            </span>
          ) : (
            <span className="text-[8px] text-slate-300 font-medium italic">Sem grupo</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {isStale ? (
            <>
              <XCircle className="text-slate-500" size={16} />
              <span className="font-bold text-[9px] uppercase border px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-600 border-slate-200">
                Não Importado
              </span>
            </>
          ) : (
            <>
              {getStatusIcon(client)}
              <span className={cn(
                "font-bold text-[9px] uppercase border px-2 py-0.5 rounded-full whitespace-nowrap",
                client.impugnation_status === "Finalizou" ? "bg-green-50 text-green-700 border-green-200" :
                client.impugnation_status === "Impugnando" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                (client.impugnation_status === "Não Iniciou" || client.impugnation_status === "Nao Iniciou") ? "bg-purple-50 text-purple-700 border-purple-200" :
                client.abi_status === "Importado e Analisado" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                client.abi_status === "Importado, falta analisar" ? "bg-orange-50 text-orange-700 border-orange-100" :
                client.abi_status === "Importado" ? "bg-sky-50 text-sky-700 border-sky-100" :
                (client.abi_status === "Falha na Análise" || client.abi_status === "Falha") ? "bg-rose-50 text-rose-700 border-rose-100" :
                (client.abi_status === "Nao Importado" || client.abi_status === "Não Importado") ? "bg-slate-100 text-slate-600 border-slate-200" :
                client.abi_status === "Pendente" ? "bg-amber-50 text-amber-700 border-amber-200" :
                "bg-slate-100 text-slate-500 border-slate-200"
              )}>
                {client.impugnation_status === "Finalizou" ? "Finalizou" :
                 client.impugnation_status === "Impugnando" ? "Impugnando" :
                 (client.impugnation_status === "Não Iniciou" || client.impugnation_status === "Nao Iniciou") ? "Não Iniciou" :
                 client.abi_status === "Importado e Analisado" ? "Importado e Analisado" :
                 client.abi_status === "Importado, falta analisar" ? "Falta Analisar" :
                 client.abi_status === "Importado" ? "Importado" :
                 (client.abi_status === "Falha na Análise" || client.abi_status === "Falha") ? "Falha" :
                 (client.abi_status === "Nao Importado" || client.abi_status === "Não Importado") ? "Não Importado" :
                 client.abi_status === "Pendente" ? "Pendente" : (client.abi_status || "Não Checado")}
              </span>
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="flex flex-col">
          {!lastCheck ? (
            <span className="text-[10px] font-bold text-slate-300 italic">Nunca checado</span>
          ) : (
            <>
              <span className="text-[10px] font-bold text-slate-600">
                {formatDistanceToNow(lastCheck, { addSuffix: true, locale: ptBR })}
              </span>
              <span className="text-[8px] text-slate-400 font-medium font-display leading-none">
                {lastCheck.toLocaleDateString('pt-BR')} às {lastCheck.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="relative inline-block text-left" ref={openMenuId === client.id ? rowDropdownRef : null}>
          <button
            onClick={() => onOpenMenu(openMenuId === client.id ? null : client.id)}
            className="p-2 text-slate-300 hover:text-gax-blue hover:bg-gax-blue/10 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-gax-blue/50"
            aria-label="Ações da operadora"
            aria-expanded={openMenuId === client.id}
            aria-haspopup="menu"
          >
            <MoreHorizontal size={16} />
          </button>

          {openMenuId === client.id && (
            <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-100 z-50 overflow-hidden animate-in zoom-in-95 duration-150 origin-top-right">
              {(isStale || !(client.abi_status === 'Importado e Analisado' || ['Impugnando', 'Finalizou'].includes(client.impugnation_status || ''))) && (
                <button
                  onClick={() => { onStartCheck(client.id); onOpenMenu(null); }}
                  disabled={!!activeTaskId}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors disabled:opacity-40"
                >
                  <Play size={14} /> Checar ABI
                </button>
              )}
              {!isStale && (client.abi_status === 'Importado e Analisado' || ['Impugnando'].includes(client.impugnation_status || '')) && client.impugnation_status !== 'Finalizou' && (
                <button
                  onClick={() => { onStartImpugnationCheck(client.id); onOpenMenu(null); }}
                  disabled={!!activeTaskId}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-30 border-t border-slate-50"
                  title={client.abi_status !== 'Importado e Analisado' ? 'Disponível apenas para clientes que já analisaram o ABI' : ''}
                >
                  <Scale size={14} /> Checar Impugnações
                </button>
              )}
              {client.abi_last_task_id ? (
                <button
                  onClick={() => { onOpenDetailedLogs(client.abi_last_task_id!, `Log da ABI: ${client.name}`, client.name); onOpenMenu(null); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-700 hover:bg-gax-blue hover:text-white transition-colors border-t border-slate-50"
                >
                  <FileText size={14} /> Ver Log ABI
                </button>
              ) : (
                <button
                  onClick={onViewGlobalLog}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-slate-400 hover:bg-slate-50 transition-colors border-t border-slate-50"
                >
                  <History size={14} /> Sem Log ABI
                </button>
              )}
              {client.impugnation_last_task_id && (
                <button
                  onClick={() => { onOpenDetailedLogs(client.impugnation_last_task_id!, `Log Impugnação: ${client.name}`, client.name); onOpenMenu(null); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[11px] font-bold text-yellow-700 hover:bg-yellow-50 transition-colors border-t border-slate-50"
                >
                  <Scale size={14} /> Ver Log Impugnação
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export const ClientTableRow = React.memo(ClientTableRowInner);
