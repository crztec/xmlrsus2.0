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
    <div className="flex flex-col gap-6 md:gap-8 p-4 md:p-8 pt-2 max-w-7xl mx-auto min-h-screen">
      
      {/* Header Imponente */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
              <History size={20} />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Histórico de ABIs</h1>
          </div>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Acompanhe a evolução, analise o desempenho e acesse os resultados de todos os ciclos de Avaliação de Benefício de Intervenção (ABI) finalizados.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm disabled:opacity-50"
          >
            <Clock size={18} className={cn(loading && "animate-spin")} />
          </button>
          <button className="flex items-center gap-2 h-10 px-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 transition-colors">
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      {/* Navegação de Abas */}
      <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl w-full md:w-max border border-slate-200/50 shadow-inner">
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300",
            activeTab === 'history' 
              ? "bg-white text-indigo-700 shadow-sm" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
          )}
        >
          <ClipboardList size={16} />
          ABIs Anteriores
        </button>
        <button
          onClick={() => setActiveTab('current')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300",
            activeTab === 'current' 
              ? "bg-white text-indigo-700 shadow-sm" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
          )}
        >
          <CalendarDays size={16} />
          Visão Geral Atual
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
          <Loader2 size={32} className="animate-spin text-indigo-500" />
          <p className="font-medium">Carregando dados históricos...</p>
        </div>
      ) : activeTab === 'current' ? (
        /* Aba do ABI Atual */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="rounded-3xl border border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-white p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                <ShieldCheck size={100} />
              </div>
              <h3 className="text-emerald-800 font-bold mb-1">Finalizados (Aguardando Próximo)</h3>
              <p className="text-4xl font-black text-emerald-600 tracking-tight">{currentAbiData?.finalized || 0}</p>
              <p className="text-xs text-emerald-600/70 mt-2 font-medium">Operadoras concluíram o ciclo atual.</p>
            </div>
            
            <div className="rounded-3xl border border-amber-100 bg-gradient-to-b from-amber-50/50 to-white p-6 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-6 opacity-10">
                <TrendingUp size={100} />
              </div>
              <h3 className="text-amber-800 font-bold mb-1">Em Andamento</h3>
              <p className="text-4xl font-black text-amber-600 tracking-tight">{currentAbiData?.impugnating || 0}</p>
              <p className="text-xs text-amber-600/70 mt-2 font-medium">Operadoras em fase de impugnação.</p>
            </div>
            
            <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50/50 to-white p-6 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-6 opacity-10">
                <ShieldAlert size={100} />
              </div>
              <h3 className="text-slate-600 font-bold mb-1">Não Iniciados</h3>
              <p className="text-4xl font-black text-slate-800 tracking-tight">{currentAbiData?.not_started || 0}</p>
              <p className="text-xs text-slate-500 mt-2 font-medium">Aguardando importação ou início.</p>
            </div>
          </div>
          
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto h-16 w-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500 mb-4">
              <CalendarDays size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Ciclo de 3 Meses</h2>
            <p className="text-slate-500 max-w-lg mx-auto">
              Os dados do ABI atual estão sendo processados. Assim que um novo ciclo iniciar, o robô automaticamente salvará um snapshot (foto) do estado atual e iniciará a nova contagem, movendo estes dados para o histórico.
            </p>
          </div>
        </div>
      ) : (
        /* Aba de Histórico */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 pl-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 text-slate-400 flex-1 w-full">
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Buscar por operadora ou número do ABI..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-sm text-slate-700 font-medium placeholder:text-slate-400 placeholder:font-normal"
              />
            </div>
            {searchQuery && (
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                {filteredHistory.length} resultados
              </span>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="px-6 py-4 rounded-tl-3xl">Operadora</th>
                    <th className="px-6 py-4">Ciclo ABI</th>
                    <th className="px-6 py-4">Status Final</th>
                    <th className="px-6 py-4 text-center">Impugnados</th>
                    <th className="px-6 py-4 text-center">Aptos</th>
                    <th className="px-6 py-4 text-center rounded-tr-3xl">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-5">
                          <p className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{item.client_name}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-1">
                            Arquivado em: <span className="font-mono">{item.archived_at}</span>
                          </p>
                        </td>
                        <td className="px-6 py-5">
                          <span className="inline-flex items-center px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-100">
                            {item.abi}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            {item.impugnation_status === 'Finalizou' || item.impugnation_status === 'Sem Impugnação' ? (
                              <CheckCircle2 size={16} className="text-emerald-500" />
                            ) : (
                              <AlertCircle size={16} className="text-amber-500" />
                            )}
                            <span className={cn(
                              "text-xs font-bold",
                              (item.impugnation_status === 'Finalizou' || item.impugnation_status === 'Sem Impugnação') ? "text-emerald-700" : "text-amber-700"
                            )}>
                              {item.impugnation_status || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="font-mono text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-lg">
                            {item.impugnation_stats?.impugnados || 0}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="font-mono text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">
                            {item.impugnation_stats?.aptos || 0}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1 rounded-lg">
                            {item.impugnation_stats?.total || 0}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-3">
                          <ClipboardList size={48} className="text-slate-200" />
                          <p className="font-medium text-sm">Nenhum registro histórico encontrado.</p>
                          <p className="text-xs text-slate-400">Os registros aparecerão aqui quando o primeiro ciclo de ABI for concluído e o robô iniciar o próximo.</p>
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
