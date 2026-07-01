"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Terminal, X, Loader2 } from "lucide-react";

interface TaskLog {
  timestamp: string;
  timestamp_precise?: number;
  message: string;
  level: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING' | 'DEBUG';
}

interface TaskLogsModalProps {
  show: boolean;
  title: string;
  viewingTaskId: string | null;
  activeTaskId: string | null;
  realtimeLogs: TaskLog[];
  detailedLogs: TaskLog[];
  logFilterClient: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  logEndRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export function TaskLogsModal({
  show,
  title,
  viewingTaskId,
  activeTaskId,
  realtimeLogs,
  detailedLogs,
  logFilterClient,
  scrollRef,
  logEndRef,
  onClose,
}: TaskLogsModalProps) {
  if (!show) return null;

  const displayLogs = viewingTaskId === activeTaskId
    ? [...realtimeLogs]
    : [...detailedLogs];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gax-blue text-white rounded-xl shadow-lg shadow-gax-blue/20">
              <Terminal size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-[10px] text-gax-blue font-bold uppercase tracking-widest">
                {(viewingTaskId && viewingTaskId !== activeTaskId) ? 'Visualizando Histórico' : 'Monitoramento em Tempo Real'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
          >
            <X size={16} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/20"
        >
          {displayLogs.length > 0 ? (
            displayLogs
              .filter(log => !logFilterClient || log.message.includes(`[${logFilterClient}]`))
              .map((log, idx) => (
                <div key={idx} className="flex gap-3.5">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                    log.level === 'ERROR' ? 'bg-rose-500' :
                    log.level === 'SUCCESS' ? 'bg-emerald-500' :
                    log.level === 'WARNING' ? 'bg-amber-500' :
                    'bg-gax-blue'
                  )} />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn(
                        "text-[12.5px] font-medium leading-relaxed",
                        log.level === 'ERROR' ? 'text-rose-700' :
                        log.level === 'WARNING' ? 'text-amber-700' :
                        'text-slate-700'
                      )}>
                        {log.message}
                      </span>
                      <span className="text-[9px] text-slate-300 font-mono italic shrink-0">{log.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-3">
              <Loader2 size={24} className="animate-spin text-gax-blue" />
              <p className="text-xs text-slate-400 italic font-display">Carregando logs...</p>
            </div>
          )}
          <div ref={logEndRef} />
        </div>

        <div className="px-6 py-3.5 border-t border-slate-100 flex justify-end bg-slate-50/60">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-xl transition-all font-display"
          >
            Fechar Console
          </button>
        </div>
      </div>
    </div>
  );
}
