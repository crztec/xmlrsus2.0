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
  LayoutGrid,
  ChevronRight,
  ArrowUpRight,
  Filter
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

// --- COMPONENTES AUXILIARES DE DESIGN ---

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 p-3 rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 border-b border-white/10 pb-1">{label}</p>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: payload[0].color || payload[0].fill }} />
          <p className="text-[13px] font-black text-white">
            {payload[0].value.toLocaleString()} <span className="text-[10px] text-slate-400 font-medium">registros</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const StatCard = ({ title, value, icon: Icon, colorClass, delay }: any) => (
  <div 
    className={cn(
      "relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm group hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 fill-mode-both",
      delay
    )}
  >
    <div className="relative z-10 flex items-center justify-between">
      <div>
        <h3 className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-1.5">{title}</h3>
        <p className={cn("text-3xl font-black tracking-tighter", colorClass)}>{value}</p>
      </div>
      <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500 shadow-sm", 
        title === "Finalizados" ? "bg-emerald-50 text-emerald-500" : 
        title === "Em Andamento" ? "bg-amber-50 text-amber-500" : "bg-slate-50 text-slate-400")}>
        <Icon size={24} strokeWidth={2.5} />
      </div>
    </div>
    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500">
      <Icon size={80} strokeWidth={3} />
    </div>
  </div>
);

export default function AbiHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [currentAbiData, setCurrentAbiData] = useState<any>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [topLimit, setTopLimit] = useState(5);

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
      .map(c => ({ name: c.name, total: (c.impugnados || 0) + (c.aptos || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topLimit);

    const agu = [...clients]
      .map(c => ({ name: c.name, total: c.aguardando || 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, topLimit);

    const nImp = [...clients]
      .map(c => ({ name: c.name, total: c.nao_impugnando || 0 }))
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

  // Altura dinâmica baseada na quantidade de itens (40px por item + base)
  const chartHeight = useMemo(() => Math.max(300, topLimit * 40), [topLimit]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 max-w-[1600px] mx-auto min-h-screen text-slate-900 bg-[#f8fafc]/50">
      
      {/* Header Estilo SaaS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 animate-in fade-in duration-700">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gax-blue rounded-xl flex items-center justify-center text-white shadow-lg shadow-gax-blue/20">
              <Activity size={22} strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800">Analytics de ABIs</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium">Monitoramento em tempo real do processamento e histórico consolidado.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex p-1 bg-slate-200/50 backdrop-blur-sm rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('current')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg font-black text-[12px] transition-all duration-300",
                activeTab === 'current' ? "bg-white text-gax-blue shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Activity size={14} /> Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg font-black text-[12px] transition-all duration-300",
                activeTab === 'history' ? "bg-white text-gax-blue shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <History size={14} /> Histórico
            </button>
          </div>

          <div className="h-10 w-px bg-slate-200 mx-1 hidden sm:block" />

          {activeTab === 'current' && (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm hover:border-gax-blue/30 transition-colors">
              <Filter size={14} className="text-slate-400" />
              <select 
                value={topLimit} 
                onChange={(e) => setTopLimit(Number(e.target.value))}
                className="bg-transparent border-none outline-none text-[12px] font-black text-slate-700 cursor-pointer"
              >
                {[5, 10, 15, 20].map(v => <option key={v} value={v}>Top {v} Clientes</option>)}
              </select>
            </div>
          )}

          <button onClick={fetchData} className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-gax-blue transition-all shadow-sm active:scale-95">
            <Clock size={16} className={cn(loading && "animate-spin")} />
          </button>
          
          <button className="h-10 px-5 flex items-center gap-2 rounded-xl bg-gax-blue text-white font-black text-[12px] shadow-lg shadow-gax-blue/20 hover:bg-gax-blue/90 transition-all active:scale-95">
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl border-4 border-slate-100 border-t-gax-blue animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity size={24} className="text-gax-blue animate-pulse" />
            </div>
          </div>
          <p className="font-black text-slate-400 text-[11px] uppercase tracking-widest">Sincronizando Módulos...</p>
        </div>
      ) : activeTab === 'current' ? (
        <div className="space-y-8 animate-in fade-in duration-1000">
          {/* Grid de Cards Superiores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Finalizados" value={currentAbiData?.finalized || 0} icon={ShieldCheck} colorClass="text-emerald-500" delay="delay-75" />
            <StatCard title="Em Andamento" value={currentAbiData?.impugnating || 0} icon={TrendingUp} colorClass="text-amber-500" delay="delay-150" />
            <StatCard title="Não Iniciados" value={currentAbiData?.not_started || 0} icon={ShieldAlert} colorClass="text-slate-400" delay="delay-200" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Coluna de Top Listas (Scrollable) */}
            <div className="lg:col-span-2 space-y-8">
              {[
                { title: `Top ${topLimit} Qtd. Impugnações`, data: topImpugnados, icon: TrendingUp, color: "#10b981", sub: "Atendimentos Aptos e Impugnados" },
                { title: `Top ${topLimit} Qtd. Aguardando`, data: topAguardando, icon: Hourglass, color: "#f59e0b", sub: "Pendências de checagem no portal" },
                { title: `Top ${topLimit} Não Impugnados`, data: topNaoImpugnados, icon: UserX, color: "#94a3b8", sub: "Registros marcados como sem impugnação" }
              ].map((chart, i) => (
                <div key={i} className="bg-white rounded-[24px] border border-slate-200/60 p-6 shadow-sm hover:shadow-xl transition-all duration-500 group">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400 group-hover:bg-slate-100 transition-colors">
                        <chart.icon size={20} />
                      </div>
                      <div>
                        <h4 className="text-[15px] font-black text-slate-800">{chart.title}</h4>
                        <p className="text-[11px] text-slate-400 font-medium">{chart.sub}</p>
                      </div>
                    </div>
                    <ArrowUpRight size={18} className="text-slate-200 group-hover:text-gax-blue transition-colors" />
                  </div>
                  
                  <div style={{ height: `${chartHeight}px` }} className="w-full transition-all duration-500">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart.data} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          axisLine={false} 
                          tickLine={false} 
                          fontSize={10} 
                          fontWeight={800} 
                          width={110}
                          tick={{ fill: '#64748b' }}
                        />
                        <Tooltip cursor={{ fill: '#f8fafc', radius: 8 }} content={<CustomTooltip />} />
                        <Bar 
                          dataKey="total" 
                          fill={chart.color} 
                          radius={[0, 8, 8, 0]} 
                          barSize={20}
                          animationDuration={1500}
                          animationBegin={i * 200}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>

            {/* Coluna Lateral: Distribuição e Insights */}
            <div className="space-y-8">
              <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <h4 className="text-[15px] font-black tracking-tight flex items-center gap-2">
                      <LayoutGrid size={18} className="text-gax-blue" />
                      Distribuição Global
                    </h4>
                    <span className="bg-white/10 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Tempo Real</span>
                  </div>

                  <div className="h-[280px] w-full relative mb-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={distributionData}
                          innerRadius={80}
                          outerRadius={105}
                          paddingAngle={6}
                          dataKey="value"
                          stroke="none"
                        >
                          {distributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center animate-in zoom-in duration-1000">
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Total</p>
                        <p className="text-3xl font-black tracking-tighter">
                          {totalGlobal.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {distributionData.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group/item">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ backgroundColor: DISTRIBUTION_COLORS[idx] }} />
                          <span className="text-[11px] font-black text-white/70 uppercase tracking-tighter group-hover/item:text-white transition-colors">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-black">{item.percentage}%</p>
                          <p className="text-[9px] text-white/30 font-bold">{item.value.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Efeito Visual de Fundo */}
                <div className="absolute -top-20 -right-20 h-64 w-64 bg-gax-blue opacity-10 blur-[100px]" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 bg-emerald-500 opacity-5 blur-[100px]" />
              </div>

              {/* Card de Informação Rápida */}
              <div className="bg-white rounded-[24px] border border-slate-200 p-6 shadow-sm overflow-hidden relative group">
                <h4 className="text-[13px] font-black text-slate-800 mb-4 flex items-center gap-2">
                  <HelpCircle size={16} className="text-gax-blue" />
                  Sincronização de Ciclos
                </h4>
                <p className="text-[12px] text-slate-400 font-medium leading-relaxed">
                  Os snapshots do histórico são gerados automaticamente no portal RSUS. Quando o ciclo 105 encerrar, o GAX irá processar os dados finais e arquivá-los na aba de histórico.
                </p>
                <div className="mt-5 flex items-center gap-2 text-[11px] font-black text-gax-blue cursor-pointer group-hover:gap-3 transition-all">
                  Ver documentação completa <ChevronRight size={14} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Aba ABIs Anteriores - Visual Refinado */
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8">
          <div className="bg-white rounded-[32px] border border-slate-200/60 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-10">
               <div className="space-y-1">
                 <h4 className="text-[18px] font-black text-slate-800 flex items-center gap-2">
                  <Activity size={20} className="text-gax-blue" />
                  Evolução Histórica
                </h4>
                <p className="text-[11px] text-slate-400 font-medium">Progressão volumétrica de impugnações validadas.</p>
               </div>
               <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-6 bg-gax-blue rounded-full" />
                  <span className="text-[10px] text-slate-400 font-black uppercase">Volume Processado</span>
                </div>
               </div>
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="abi" axisLine={false} tickLine={false} fontSize={11} fontWeight={900} tick={{ fill: '#94a3b8' }} dy={10} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="volume" 
                    stroke="#3b82f6" 
                    strokeWidth={4} 
                    dot={{ r: 6, fill: '#3b82f6', strokeWidth: 3, stroke: '#fff' }} 
                    activeDot={{ r: 8, strokeWidth: 0 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:w-96 group">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" />
                <input 
                  type="text" 
                  placeholder="Filtrar por operadora ou ciclo..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-12 pr-4 text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-gax-blue/10 transition-all"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Visualização em</span>
                <div className="h-8 w-8 bg-slate-50 rounded-lg flex items-center justify-center text-gax-blue border border-slate-200 shadow-sm">
                  <LayoutGrid size={14} />
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-5">Identificador</th>
                    <th className="px-8 py-5">Snapshot Operadora</th>
                    <th className="px-8 py-5 text-center">Volume</th>
                    <th className="px-8 py-5 text-center">Impugnados</th>
                    <th className="px-8 py-5 text-center">Eficiência</th>
                    <th className="px-8 py-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((item, idx) => {
                      const total = item.impugnation_stats?.total || 0;
                      const resolvidos = (item.impugnation_stats?.impugnados || 0) + (item.impugnation_stats?.aptos || 0);
                      const eficiencia = total > 0 ? Math.round((resolvidos / total) * 100) : 0;
                      
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-all duration-300 group">
                          <td className="px-8 py-6">
                            <span className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[11px] font-black">{item.abi}</span>
                          </td>
                          <td className="px-8 py-6">
                            <p className="font-black text-[14px] text-slate-800 tracking-tight">{item.client_name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold mt-1">
                              <CalendarDays size={10} />
                              {item.archived_at}
                            </div>
                          </td>
                          <td className="px-8 py-6 text-center font-mono text-[13px] font-black text-slate-600">
                            {total.toLocaleString()}
                          </td>
                          <td className="px-8 py-6 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[12px] font-black text-gax-blue bg-gax-blue/5 px-2.5 py-1 rounded-lg">
                                {item.impugnation_stats?.impugnados || 0}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[12px] font-black tracking-tighter",
                                  eficiencia >= 80 ? "text-emerald-500" : eficiencia >= 50 ? "text-amber-500" : "text-slate-400"
                                )}>
                                  {eficiencia}%
                                </span>
                                {eficiencia >= 80 && <ArrowUpRight size={14} className="text-emerald-500" />}
                              </div>
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div 
                                  className={cn("h-full transition-all duration-1000", eficiencia >= 80 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500")} 
                                  style={{ width: `${eficiencia}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <button className="h-10 w-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-gax-blue hover:border-gax-blue hover:bg-gax-blue/5 transition-all shadow-sm active:scale-95">
                              <FileDown size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-8 py-24 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-20 group">
                          <div className="h-20 w-20 rounded-[32px] bg-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-700">
                            <ClipboardList size={40} />
                          </div>
                          <p className="font-black text-slate-400 text-[14px] uppercase tracking-[0.2em]">Sem Histórico Localizado</p>
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
