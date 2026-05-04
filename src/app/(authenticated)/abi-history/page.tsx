"use client";

import React, { useState, useEffect } from "react";
import { 
  ClipboardList, 
  Search, 
  History, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Download,
  Loader2,
  CalendarDays,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/apiClient";

export default function AbiHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [currentAbiData, setCurrentAbiData] = useState<any>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('history');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, historyRes] = await Promise.all([
        apiClient("/api/abi-dashboard-stats"),
        apiClient("/api/abi-historical-data")
      ]);
      
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setCurrentAbiData(stats);
      }
      
      if (historyRes.ok) {
        const history = await historyRes.json();
        setHistoricalData(history);
      }
    } catch (err) {
      console.error("Erro ao buscar dados do histórico:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredHistory = historicalData.filter(item => 
    item.client_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    String(item.abi).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 p-2 md:p-4 max-w-7xl mx-auto min-h-screen">
      
      {/* Navegação de Abas e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full mb-2">
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 shadow-inner w-full sm:w-max">
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-[13px] transition-all duration-300",
              activeTab === 'history' 
                ? "bg-white text-gax-blue shadow-sm" 
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
            )}
          >
            <ClipboardList size={16} />
            ABIs Anteriores
          </button>
          <button
            onClick={() => setActiveTab('current')}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-[13px] transition-all duration-300",
              activeTab === 'current' 
                ? "bg-white text-gax-blue shadow-sm" 
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
            )}
          >
            <CalendarDays size={16} />
            Visão Geral Atual
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-gax-blue transition-colors shadow-sm disabled:opacity-50"
            title="Atualizar Dados"
          >
            <Clock size={16} className={cn(loading && "animate-spin")} />
          </button>
          <button className="flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 hover:text-gax-blue transition-colors text-[13px] shadow-sm">
            <Download size={14} />
            Exportar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
          <Loader2 size={24} className="animate-spin text-gax-blue" />
          <p className="font-medium text-sm">Carregando dados históricos...</p>
        </div>
      ) : activeTab === 'current' ? (
        /* Aba do ABI Atual */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-white p-5 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:scale-110 transition-transform">
                <ShieldCheck size={80} />
              </div>
              <h3 className="text-emerald-800 font-bold mb-1 text-[13px]">Finalizados</h3>
              <p className="text-3xl font-black text-emerald-600 tracking-tight">{currentAbiData?.finalized || 0}</p>
              <p className="text-[11px] text-emerald-600/70 mt-1 font-medium">Aguardando próximo ciclo.</p>
            </div>
            
            <div className="rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50/50 to-white p-5 shadow-sm relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:scale-110 transition-transform">
                <TrendingUp size={80} />
              </div>
              <h3 className="text-amber-800 font-bold mb-1 text-[13px]">Em Andamento</h3>
              <p className="text-3xl font-black text-amber-600 tracking-tight">{currentAbiData?.impugnating || 0}</p>
              <p className="text-[11px] text-amber-600/70 mt-1 font-medium">Na fase de impugnação.</p>
            </div>
            
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/50 to-white p-5 shadow-sm relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:scale-110 transition-transform">
                <ShieldAlert size={80} />
              </div>
              <h3 className="text-slate-600 font-bold mb-1 text-[13px]">Não Iniciados</h3>
              <p className="text-3xl font-black text-slate-800 tracking-tight">{currentAbiData?.not_started || 0}</p>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Aguardando importação.</p>
            </div>
          </div>
          
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-start gap-4">
            <div className="h-12 w-12 bg-gax-blue-light/20 rounded-xl flex items-center justify-center text-gax-blue shrink-0">
              <History size={24} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 mb-1">Como o histórico funciona?</h2>
              <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                Os dados desta aba representam o processamento atual. Assim que a operadora iniciar um ciclo novo (ex: do ABI 105 para o 106), o robô automaticamente salvará um <strong>snapshot (foto)</strong> do estado final e zerará a contagem, enviando os dados consolidados para a aba de "ABIs Anteriores".
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Aba de Histórico */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 pl-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400 flex-1 w-full">
              <Search size={16} />
              <input 
                type="text" 
                placeholder="Buscar por operadora ou número do ABI..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[13px] text-slate-700 font-medium placeholder:text-slate-400 placeholder:font-normal"
              />
            </div>
            {searchQuery && (
              <span className="text-[10px] font-bold text-gax-blue bg-gax-blue-light/30 px-2 py-1 rounded-md">
                {filteredHistory.length} resultados
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="px-4 py-3">Operadora</th>
                    <th className="px-4 py-3">Ciclo ABI</th>
                    <th className="px-4 py-3">Status Final</th>
                    <th className="px-4 py-3 text-center">Impugnados</th>
                    <th className="px-4 py-3 text-center">Aptos</th>
                    <th className="px-4 py-3 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800 text-[13px] group-hover:text-gax-blue transition-colors">{item.client_name}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            Arquivado em: <span className="font-mono text-[9px]">{item.archived_at}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px] border border-slate-200">
                            {item.abi}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {item.impugnation_status === 'Finalizou' || item.impugnation_status === 'Sem Impugnação' ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : (
                              <AlertCircle size={14} className="text-amber-500" />
                            )}
                            <span className={cn(
                              "text-[11px] font-bold",
                              (item.impugnation_status === 'Finalizou' || item.impugnation_status === 'Sem Impugnação') ? "text-emerald-700" : "text-amber-700"
                            )}>
                              {item.impugnation_status || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-[12px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100/50">
                            {item.impugnation_stats?.impugnados || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-[12px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/50">
                            {item.impugnation_stats?.aptos || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-[12px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                            {item.impugnation_stats?.total || 0}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <ClipboardList size={32} className="text-slate-300" />
                          <p className="font-medium text-[13px]">Nenhum registro histórico encontrado.</p>
                          <p className="text-[11px] text-slate-400">Os registros aparecerão aqui quando o primeiro ciclo de ABI for concluído.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
