"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  ClipboardList, 
  Search, 
  History, 
  Clock, 
  TrendingUp,
  Download,
  Loader2,
  CalendarDays,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  FileDown,
  Activity,
  UserX,
  Hourglass,
  LayoutGrid
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
  Line
} from "recharts";

const DISTRIBUTION_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#94a3b8'];

export default function AbiHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [currentAbiData, setCurrentAbiData] = useState<any>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [topLimit, setTopLimit] = useState(5);
  const [selectedSlice, setSelectedSlice] = useState<string | null>(null);

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

  // --- CÁLCULO DE DADOS REAIS PARA OS GRÁFICOS ---

  const { topImpugnados, topAguardando, topNaoImpugnados, distributionData, evolutionData, totalGlobal } = useMemo(() => {
    const clients = currentAbiData?.client_details || [];
    
    const imp = [...clients]
      .map(c => ({ name: c.name, total: (c.impugnados || 0) + (c.aptos || 0), clientTotal: c.total || 1 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topLimit);

    const agu = [...clients]
      .map(c => ({ name: c.name, total: c.aguardando || 0, clientTotal: c.total || 1 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topLimit);

    const nImp = [...clients]
      .map(c => ({ name: c.name, total: c.nao_impugnando || 0, clientTotal: c.total || 1 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topLimit);

    const total = clients.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0);
    
    const dist = [
      { name: 'Impugnados', value: clients.reduce((acc: number, curr: any) => acc + (curr.impugnados || 0), 0) },
      { name: 'Aptos', value: clients.reduce((acc: number, curr: any) => acc + (curr.aptos || 0), 0) },
      { name: 'Aguardando', value: clients.reduce((acc: number, curr: any) => acc + (curr.aguardando || 0), 0) },
      { name: 'Não Impugnados', value: clients.reduce((acc: number, curr: any) => acc + (curr.nao_impugnando || 0), 0) },
    ].map(d => ({
      ...d,
      percentage: total > 0 ? Math.round((d.value / total) * 100) : 0
    })).filter(d => d.value > 0);

    const evoMap: Record<string, number> = {};
    historicalData.forEach(item => {
      const abi = String(item.abi || 'N/A');
      const volume = (item.impugnation_stats?.impugnados || 0) + (item.impugnation_stats?.aptos || 0);
      evoMap[abi] = (evoMap[abi] || 0) + volume;
    });

    const evo = Object.entries(evoMap)
      .map(([abi, volume]) => ({ abi: abi.includes('º') ? abi : `${abi}º`, volume }))
      .sort((a, b) => {
        const numA = parseInt(a.abi.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.abi.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

    if (evo.length === 0) evo.push({ abi: '105º', volume: 0 });

    return { 
      topImpugnados: imp, 
      topAguardando: agu, 
      topNaoImpugnados: nImp, 
      distributionData: dist,
      evolutionData: evo,
      totalGlobal: total
    };
  }, [currentAbiData, historicalData, topLimit]);

  const sliceDetails = useMemo(() => {
    if (!selectedSlice) return [];
    const clients = currentAbiData?.client_details || [];
    
    let key = '';
    if (selectedSlice === 'Impugnados') key = 'impugnados';
    else if (selectedSlice === 'Aptos') key = 'aptos';
    else if (selectedSlice === 'Aguardando') key = 'aguardando';
    else if (selectedSlice === 'Não Impugnados') key = 'nao_impugnando';

    if (!key) return [];
    
    return [...clients]
      .map(c => ({ name: c.name, value: c[key] || 0, clientTotal: c.total || 1 }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [currentAbiData, selectedSlice]);

  // Altura dinâmica baseada na quantidade de itens (40px por item + base)
  const chartHeight = useMemo(() => Math.max(300, topLimit * 40), [topLimit]);

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
        
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {activeTab === 'current' && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 flex-1 sm:flex-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight whitespace-nowrap">Exibir:</span>
              <select 
                value={topLimit} 
                onChange={(e) => setTopLimit(Number(e.target.value))}
                className="bg-transparent border-none outline-none text-[12px] font-bold text-gax-blue cursor-pointer w-full"
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchData} 
              disabled={loading}
              className="flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-gax-blue transition-all shadow-sm disabled:opacity-50"
              title="Atualizar Dados"
            >
              <Clock size={14} className={cn(loading && "animate-spin")} />
            </button>
            <button className="flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 hover:text-gax-blue transition-all text-[11px] sm:text-[12px] shadow-sm">
              <Download size={13} />
              <span className="hidden xs:inline">Exportar</span>
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Gráfico de Barras - Top Clientes Impugnações */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500" />
                  Top {topLimit} Impugnações
                </h4>
                <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-medium italic">Dados Reais</span>
              </div>
              <div style={{ height: `${chartHeight}px` }} className="w-full transition-all">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topImpugnados} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={9} 
                      fontWeight={600} 
                      width={70}
                      tick={{ fill: '#64748b' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']}
                    />
                    <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} barSize={topLimit > 10 ? 12 : 18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de Barras - Top Clientes Aguardando */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Hourglass size={16} className="text-amber-500" />
                  Top {topLimit} Aguardando
                </h4>
              </div>
              <div style={{ height: `${chartHeight}px` }} className="w-full transition-all">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topAguardando} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={9} 
                      fontWeight={600} 
                      width={70}
                      tick={{ fill: '#64748b' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']}
                    />
                    <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={topLimit > 10 ? 12 : 18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de Barras - Top Clientes Não Impugnados */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <UserX size={16} className="text-slate-400" />
                  Top {topLimit} Não Impugnados
                </h4>
              </div>
              <div style={{ height: `${chartHeight}px` }} className="w-full transition-all">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topNaoImpugnados} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={9} 
                      fontWeight={600} 
                      width={70}
                      tick={{ fill: '#64748b' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']}
                    />
                    <Bar dataKey="total" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={topLimit > 10 ? 12 : 18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de Rosca - Distribuição */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <LayoutGrid size={16} className="text-gax-blue" />
                  {selectedSlice ? `Operadoras: ${selectedSlice}` : 'Distribuição Global de Atendimentos'}
                </h4>
                {selectedSlice && (
                  <button onClick={() => setSelectedSlice(null)} className="text-[11px] text-gax-blue hover:text-blue-700 hover:bg-blue-50 transition-colors font-bold px-2 py-1 bg-slate-50 rounded-md border border-slate-200 cursor-pointer">
                    Voltar
                  </button>
                )}
              </div>
              <div className="h-[280px] w-full relative">
                {selectedSlice ? (
                  <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                    <div style={{ height: Math.max(280, sliceDetails.length * 35) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sliceDetails} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={10} fontWeight={600} width={80} tick={{ fill: '#64748b' }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }} formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']} />
                          <Bar dataKey="value" fill={DISTRIBUTION_COLORS[distributionData.findIndex(d => d.name === selectedSlice) || 0] || '#94a3b8'} radius={[0, 4, 4, 0]} barSize={12} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : distributionData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={distributionData}
                          innerRadius={70}
                          outerRadius={95}
                          paddingAngle={5}
                          dataKey="value"
                          labelLine={false}
                          className="cursor-pointer hover:opacity-90 transition-opacity outline-none"
                          onClick={(data) => setSelectedSlice(data.name || null)}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
                            if ((percent || 0) < 0.05) return null;
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                            const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
                            const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
                            return (
                              <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={800} style={{ pointerEvents: 'none' }}>
                                {`${((percent || 0) * 100).toFixed(0)}%`}
                              </text>
                            );
                          }}
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
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total</p>
                        <p className="text-2xl font-black text-slate-800">
                          {totalGlobal.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-300 italic text-[11px]">
                    Nenhum dado real para exibir ainda.
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 border-t border-slate-50 pt-4">
                {distributionData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between group cursor-default">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: DISTRIBUTION_COLORS[idx] }} />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{item.name}</span>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className="text-[11px] font-black text-slate-700">{item.percentage}%</span>
                      <span className="text-[10px] font-bold text-slate-300 group-hover:text-gax-blue transition-colors">({item.value.toLocaleString()})</span>
                    </div>
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
                <Activity size={16} className="text-gax-blue" />
                Evolução de Impugnações por Ciclo
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-0.5 w-4 bg-gax-blue" />
                  <span className="text-[10px] text-slate-400 font-bold">Volume Total (Imp/Apto)</span>
                </div>
              </div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData}>
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
                          <td className="px-5 py-4 text-center font-mono text-[13px] font-bold text-slate-600">
                            {total.toLocaleString()}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-[12px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                              {item.impugnation_stats?.impugnados || 0}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                             <span className="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                              {item.impugnation_stats?.aptos || 0}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                             <span className="text-[12px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
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
