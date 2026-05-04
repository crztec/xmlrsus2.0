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
  ShieldAlert,
  HelpCircle,
  FileDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/apiClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";

// Dados Mockados para os Gráficos
const TOP_CLIENTS_DATA = [
  { name: 'Unimed BH', total: 2813 },
  { name: 'Bradesco', total: 1450 },
  { name: 'Amil', total: 980 },
  { name: 'Cassems', total: 754 },
  { name: 'SulAmérica', total: 620 },
];

const DISTRIBUTION_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#94a3b8'];

const EVOLUTION_DATA = [
  { abi: '101º', volume: 7200 },
  { abi: '102º', volume: 8500 },
  { abi: '103º', volume: 9200 },
  { abi: '104º', volume: 8800 },
  { abi: '105º', volume: 10500 },
];

export default function AbiHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [currentAbiData, setCurrentAbiData] = useState<any>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

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

  // Dados calculados para o gráfico de rosca baseados no histórico consolidado (se houver)
  const distributionData = [
    { name: 'Impugnados', value: historicalData.reduce((acc, curr) => acc + (curr.impugnation_stats?.impugnados || 0), 0) || 4500 },
    { name: 'Aptos', value: historicalData.reduce((acc, curr) => acc + (curr.impugnation_stats?.aptos || 0), 0) || 2800 },
    { name: 'Aguardando', value: historicalData.reduce((acc, curr) => acc + (curr.impugnation_stats?.aguardando || 0), 0) || 1200 },
    { name: 'Não Impugnados', value: historicalData.reduce((acc, curr) => acc + (curr.impugnation_stats?.nao_impugnando || 0), 0) || 800 },
  ];

  return (
    <div className="flex flex-col gap-5 p-2 md:p-4 max-w-7xl mx-auto min-h-screen text-slate-800">
      
      {/* Header com Navegação e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm w-full sm:w-max">
            <button
              onClick={() => setActiveTab('current')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-[12px] transition-all",
                activeTab === 'current' 
                  ? "bg-white text-gax-blue shadow-sm border border-slate-100" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <CalendarDays size={14} />
              Visão Geral Atual
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-[12px] transition-all",
                activeTab === 'history' 
                  ? "bg-white text-gax-blue shadow-sm border border-slate-100" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <ClipboardList size={14} />
              ABIs Anteriores
            </button>
          </div>
          
          <div className="group relative">
            <HelpCircle size={18} className="text-slate-400 cursor-help hover:text-gax-blue transition-colors" />
            <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-slate-800 text-white text-[11px] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none leading-relaxed">
              <p className="font-bold mb-1 border-b border-white/10 pb-1 flex items-center gap-1.5">
                <History size={12} /> Como o histórico funciona?
              </p>
              Os dados representam o processamento atual. Assim que a operadora iniciar um ciclo novo (ex: ABI 105 para o 106), o robô salva um snapshot automático e envia os consolidados para "ABIs Anteriores".
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-gax-blue transition-all shadow-sm disabled:opacity-50"
            title="Atualizar Dados"
          >
            <Clock size={14} className={cn(loading && "animate-spin")} />
          </button>
          <button className="flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 hover:text-gax-blue transition-all text-[12px] shadow-sm">
            <Download size={13} />
            Exportar Dashboard
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-80 gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin text-gax-blue" />
          <p className="font-semibold text-[13px]">Sincronizando dados...</p>
        </div>
      ) : activeTab === 'current' ? (
        /* Aba Visão Geral Atual */
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-5">
          {/* Cards de Resumo Compactos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-colors">
              <div>
                <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Finalizados</h3>
                <p className="text-2xl font-black text-emerald-600 tracking-tight">{currentAbiData?.finalized || 0}</p>
              </div>
              <div className="h-10 w-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                <ShieldCheck size={20} />
              </div>
            </div>
            
            <div className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-amber-200 transition-colors">
              <div>
                <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Em Andamento</h3>
                <p className="text-2xl font-black text-amber-600 tracking-tight">{currentAbiData?.impugnating || 0}</p>
              </div>
              <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                <TrendingUp size={20} />
              </div>
            </div>
            
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-slate-300 transition-colors">
              <div>
                <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Não Iniciados</h3>
                <p className="text-2xl font-black text-slate-800 tracking-tight">{currentAbiData?.not_started || 0}</p>
              </div>
              <div className="h-10 w-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                <ShieldAlert size={20} />
              </div>
            </div>
          </div>

          {/* Grid de Gráficos Analíticos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Gráfico de Barras - Top Clientes */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp size={16} className="text-gax-blue" />
                  Top 5 Qtd. Impugnações
                </h4>
                <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-medium italic">Dados Consolidados</span>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={TOP_CLIENTS_DATA} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={11} 
                      fontWeight={600} 
                      width={80}
                      tick={{ fill: '#64748b' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de Rosca - Distribuição */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <h4 className="text-sm font-bold mb-6 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-gax-blue animate-pulse" />
                Distribuição de Atendimentos
              </h4>
              <div className="h-[220px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legenda Manual para precisão */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <div className="text-center">
                     <p className="text-[10px] text-slate-400 font-bold uppercase">Total</p>
                     <p className="text-xl font-black text-slate-800">
                       {distributionData.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}
                     </p>
                   </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {distributionData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: DISTRIBUTION_COLORS[idx] }} />
                    <span className="text-[10px] font-bold text-slate-500 truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Aba ABIs Anteriores */
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-5">
          {/* Gráfico de Evolução de Ciclos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-6">
               <h4 className="text-sm font-bold flex items-center gap-2">
                <LineChart size={16} className="text-gax-blue" />
                Evolução de Impugnações por Ciclo
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-0.5 w-4 bg-gax-blue" />
                  <span className="text-[10px] text-slate-400 font-bold">Volume Total</span>
                </div>
              </div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={EVOLUTION_DATA}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="abi" 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={11} 
                    fontWeight={600} 
                    tick={{ fill: '#94a3b8' }} 
                  />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="volume" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} 
                    activeDot={{ r: 6 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela de Histórico Minimalista */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-b border-slate-100 gap-4">
              <div className="flex items-center gap-2 text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full sm:w-80">
                <Search size={14} />
                <input 
                  type="text" 
                  placeholder="Pesquisar histórico..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-[12px] text-slate-700 w-full placeholder:text-slate-400"
                />
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Snapshots Arquivados</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <th className="px-5 py-4">ABI</th>
                    <th className="px-5 py-4">Operadora / Competência</th>
                    <th className="px-5 py-4 text-center">Total</th>
                    <th className="px-5 py-4 text-center">Impugnados</th>
                    <th className="px-5 py-4 text-center">Aptos</th>
                    <th className="px-5 py-4 text-center">Aguardando</th>
                    <th className="px-5 py-4 text-center">Eficiência (%)</th>
                    <th className="px-5 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((item, idx) => {
                      const total = item.impugnation_stats?.total || 0;
                      const resolvidos = (item.impugnation_stats?.impugnados || 0) + (item.impugnation_stats?.aptos || 0);
                      const eficiencia = total > 0 ? Math.round((resolvidos / total) * 100) : 0;
                      
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-all group">
                          <td className="px-5 py-4">
                            <span className="font-black text-slate-800 text-[12px]">{item.abi}</span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-bold text-[13px] text-slate-800">{item.client_name}</p>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium mt-0.5">
                              <CalendarDays size={10} />
                              Arquivado em {item.archived_at}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center font-mono text-[12px] font-bold text-slate-600">
                            {total}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-[12px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                              {item.impugnation_stats?.impugnados || 0}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                             <span className="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                              {item.impugnation_stats?.aptos || 0}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                             <span className="text-[12px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                              {item.impugnation_stats?.aguardando || 0}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={cn(
                                "text-[11px] font-black",
                                eficiencia >= 80 ? "text-emerald-600" : eficiencia >= 50 ? "text-amber-600" : "text-slate-500"
                              )}>
                                {eficiencia}%
                              </span>
                              <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={cn("h-full", eficiencia >= 80 ? "bg-emerald-500" : "bg-amber-500")} 
                                  style={{ width: `${eficiencia}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button className="h-8 w-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-gax-blue hover:border-gax-blue transition-all shadow-sm">
                              <FileDown size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2 opacity-50">
                          <ClipboardList size={36} />
                          <p className="font-bold text-[13px]">Nenhum snapshot encontrado.</p>
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
