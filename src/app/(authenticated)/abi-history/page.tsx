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
  Line,
  AreaChart,
  Area
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
  const [selectedHistoricalSlice, setSelectedHistoricalSlice] = useState<string | null>(null);
  const [selectedHistoricalAbi, setSelectedHistoricalAbi] = useState<string | null>(null);
  const [evolutionClientId, setEvolutionClientId] = useState<string>("global");
  const [historicalEvolutionData, setHistoricalEvolutionData] = useState<any>(null);
  const [loadingHistoricalSnapshots, setLoadingHistoricalSnapshots] = useState(false);

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

  const fetchHistoricalSnapshots = async (abi: string) => {
    setLoadingHistoricalSnapshots(true);
    try {
      const res = await apiClient(`/api/abi-historical-snapshots/${abi}`);
      if (res.ok) {
        const data = await res.json();
        setHistoricalEvolutionData(data);
      }
    } catch (err) {
      console.error("Erro ao buscar snapshots históricos:", err);
    } finally {
      setLoadingHistoricalSnapshots(false);
    }
  };

  useEffect(() => {
    if (selectedHistoricalAbi && activeTab === 'history') {
      fetchHistoricalSnapshots(selectedHistoricalAbi);
    }
  }, [selectedHistoricalAbi, activeTab]);

  const handleExport = async (abi?: string | null) => {
    try {
      const url = abi ? `/api/export-impugnations?abi=${abi}` : '/api/export-impugnations';
      const res = await apiClient(url, {
        method: 'GET'
      });
      if (!res.ok) throw new Error("Falha ao exportar");
      
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Relatorio_Impugnacoes_${abi ? `ABI_${abi}` : 'Atual'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Erro na exportação:", err);
      alert("Erro ao exportar arquivo. Verifique sua conexão ou tente novamente.");
    }
  };

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
      // A visão principal exibe o TOTAL de atendimentos de cada ABI
      const volume = item.total || 0;
      evoMap[abi] = (evoMap[abi] || 0) + volume;
    });

    const evo = Object.entries(evoMap)
      .map(([abi, volume]) => ({ abi: abi.includes('º') ? abi : `${abi}º`, volume, rawAbi: abi }))
      .sort((a, b) => {
        const numA = parseInt(a.abi.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.abi.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

    // Adiciona o atual se houver
    if (currentAbiData) {
      const currentAbi = String(currentAbiData.abi_num || 'Atual');
      if (!evoMap[currentAbi]) {
        const totalCurrent = currentAbiData.total_atendimentos || 0;
        evo.push({ abi: currentAbi.includes('º') ? currentAbi : `${currentAbi}º`, volume: totalCurrent, rawAbi: currentAbi });
      }
    }

    if (evo.length === 0) evo.push({ abi: '105º', volume: 0, rawAbi: '105' });

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

  const historicalAbisList = useMemo(() => {
    const abis = new Set<string>();
    historicalData.forEach(item => abis.add(String(item.abi)));
    return Array.from(abis).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numB - numA;
    });
  }, [historicalData]);

  useEffect(() => {
    if (activeTab === 'history' && !selectedHistoricalAbi && historicalAbisList.length > 0) {
      setSelectedHistoricalAbi(historicalAbisList[0]);
    }
  }, [activeTab, historicalAbisList, selectedHistoricalAbi]);

  const historicalDataForCharts = useMemo(() => {
    if (!selectedHistoricalAbi) return null;
    
    const clients = historicalData.filter(item => String(item.abi) === selectedHistoricalAbi).map(item => {
      const stats_raw = item.impugnation_stats || {};
      const status = String(item.abi_status || '').toLowerCase();
      const imp_status = String(item.impugnation_status || '');
      
      return {
        client_id: item.client_id,
        name: item.client_name,
        impugnados: stats_raw.impugnados || 0,
        aptos: stats_raw.aptos || 0,
        aguardando: stats_raw.aguardando || 0,
        nao_impugnando: stats_raw.nao_impugnando || 0,
        total: item.total || 0,
        finalized: imp_status === 'Finalizou' ? 1 : 0,
        impugnating: imp_status === 'Impugnando' ? 1 : 0,
        not_started: imp_status === 'Não Iniciou' ? 1 : 0,
        not_imported: (status === 'nao importado' || status === 'não importado') ? 1 : 0
      };
    });

    const imp = [...clients]
      .map(c => ({ name: c.name, total: c.impugnados || 0, clientTotal: c.total || 1 }))
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

    const totalGlobal = clients.reduce((acc, curr) => acc + (curr.total || 0), 0);
    
    const dist = [
      { name: 'Impugnados', value: clients.reduce((acc, curr) => acc + (curr.impugnados || 0), 0) },
      { name: 'Aptos', value: clients.reduce((acc, curr) => acc + (curr.aptos || 0), 0) },
      { name: 'Aguardando', value: clients.reduce((acc, curr) => acc + (curr.aguardando || 0), 0) },
      { name: 'Não Impugnados', value: clients.reduce((acc, curr) => acc + (curr.nao_impugnando || 0), 0) },
    ].map(d => ({
      ...d,
      percentage: totalGlobal > 0 ? Math.round((d.value / totalGlobal) * 100) : 0
    })).filter(d => d.value > 0);

    const summary = {
      finalized: clients.reduce((acc, c) => acc + c.finalized, 0),
      impugnating: clients.reduce((acc, c) => acc + c.impugnating, 0),
      not_started: clients.reduce((acc, c) => acc + c.not_started, 0),
      not_imported: clients.reduce((acc, c) => acc + c.not_imported, 0),
    };

    return { topImpugnados: imp, topAguardando: agu, topNaoImpugnados: nImp, distributionData: dist, totalGlobal, summary, clients };
  }, [historicalData, selectedHistoricalAbi, topLimit]);

  const historicalSliceDetails = useMemo(() => {
    if (!selectedHistoricalSlice || !historicalDataForCharts) return [];
    let key = '';
    if (selectedHistoricalSlice === 'Impugnados') key = 'impugnados';
    else if (selectedHistoricalSlice === 'Aptos') key = 'aptos';
    else if (selectedHistoricalSlice === 'Aguardando') key = 'aguardando';
    else if (selectedHistoricalSlice === 'Não Impugnados') key = 'nao_impugnando';

    if (!key) return [];
    return [...historicalDataForCharts.clients]
      .map(c => ({ name: c.name, value: (c as any)[key] || 0, clientTotal: c.total || 1 }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [historicalDataForCharts, selectedHistoricalSlice]);

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
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-[12px] transition-all outline-none focus:outline-none active:outline-none ring-0 focus:ring-0 focus-visible:ring-0 active:ring-0 select-none",
                activeTab === 'current' 
                  ? "bg-white text-gax-blue shadow-sm border border-slate-100" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <CalendarDays size={14} />
              Visão Geral Atual
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-[12px] transition-all outline-none focus:outline-none active:outline-none ring-0 focus:ring-0 focus-visible:ring-0 active:ring-0 select-none",
                activeTab === 'history' 
                  ? "bg-white text-gax-blue shadow-sm border border-slate-100" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
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
              className="flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-gax-blue transition-all shadow-sm disabled:opacity-50 focus:outline-none active:outline-none ring-0 focus:ring-0 focus-visible:ring-0 active:ring-0"
              title="Atualizar Dados"
            >
              <Clock size={14} className={cn(loading && "animate-spin")} />
            </button>
            <button 
              onClick={() => handleExport()}
              className="flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 hover:text-gax-blue transition-all text-[11px] sm:text-[12px] shadow-sm focus:outline-none active:outline-none ring-0 focus:ring-0 focus-visible:ring-0 active:ring-0"
            >
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

            <div className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-rose-200 transition-colors">
              <div>
                <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Não Importados</h3>
                <p className="text-2xl font-black text-rose-600 tracking-tight">{currentAbiData?.not_imported || 0}</p>
              </div>
              <div className="h-10 w-10 bg-rose-50 rounded-lg flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
                <UserX size={20} />
              </div>
            </div>
          </div>

          {/* Gráfico de Evolução do ABI Atual */}
          {(currentAbiData?.evolution_timeline || []).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h4 className="text-sm font-bold flex items-center gap-2 text-slate-700">
                  <Activity size={16} className="text-gax-blue" />
                  Evolução do Ciclo
                </h4>
                
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 min-w-[200px]">
                  <Search size={12} className="text-slate-400" />
                  <select 
                    value={evolutionClientId}
                    onChange={(e) => setEvolutionClientId(e.target.value)}
                    className="bg-transparent border-none outline-none text-[11px] font-bold text-gax-blue cursor-pointer w-full"
                  >
                    <option value="global">Visão Consolidada (Geral)</option>
                    {currentAbiData?.client_details?.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={evolutionClientId === "global" ? currentAbiData.evolution_timeline : (currentAbiData.client_evolution?.[evolutionClientId] || [])} 
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorImpugnados" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAguardando" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorNaoImpugnados" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                        if (!val) return '';
                        const [y, m, d] = val.split('-');
                        return `${d}/${m}`;
                      }}
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                      width={40}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                      labelFormatter={(label) => {
                        if (!label) return '';
                        const [y, m, d] = label.split('-');
                        return `${d}/${m}/${y}`;
                      }}
                    />
                    <Area type="monotone" name="Não Impugnados" dataKey="nao_impugnando" stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#colorNaoImpugnados)" />
                    <Area type="monotone" name="Aguardando" dataKey="aguardando" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorAguardando)" />
                    <Area type="monotone" name="Impugnados" dataKey="impugnados" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorImpugnados)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Grid de Gráficos Analíticos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Gráfico de Barras - Top Clientes Impugnações */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500" />
                  Top {topLimit} Impugnações
                </h4>
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
          {/* Cards de Resumo no Topo */}
          {historicalDataForCharts && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-colors">
                <div>
                  <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Finalizados</h3>
                  <p className="text-2xl font-black text-emerald-600 tracking-tight">{historicalDataForCharts.summary.finalized}</p>
                </div>
                <div className="h-10 w-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                  <ShieldCheck size={20} />
                </div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-amber-200 transition-colors">
                <div>
                  <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Em Andamento</h3>
                  <p className="text-2xl font-black text-amber-600 tracking-tight">{historicalDataForCharts.summary.impugnating}</p>
                </div>
                <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-slate-300 transition-colors">
                <div>
                  <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Não Iniciados</h3>
                  <p className="text-2xl font-black text-slate-800 tracking-tight">{historicalDataForCharts.summary.not_started}</p>
                </div>
                <div className="h-10 w-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                  <ShieldAlert size={20} />
                </div>
              </div>
              <div className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm flex items-center justify-between group hover:border-rose-200 transition-colors">
                <div>
                  <h3 className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-1">Não Importados</h3>
                  <p className="text-2xl font-black text-rose-600 tracking-tight">{historicalDataForCharts.summary.not_imported}</p>
                </div>
                <div className="h-10 w-10 bg-rose-50 rounded-lg flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
                  <UserX size={20} />
                </div>
              </div>
            </div>
          )}

          {/* Gráfico de Evolução de Ciclos - Selecionável */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
               <h4 className="text-sm font-bold flex items-center gap-2">
                <Activity size={16} className="text-gax-blue" />
                Histórico de Volume por Ciclo
              </h4>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="h-0.5 w-4 bg-gax-blue" />
                  <span className="text-[10px] text-slate-400 font-bold">Volume Total Atendimentos</span>
                </div>
                {selectedHistoricalAbi && (
                  <div className="bg-gax-blue/10 px-3 py-1 rounded-full border border-gax-blue/20">
                    <span className="text-[10px] text-gax-blue font-black uppercase tracking-widest">ABI {selectedHistoricalAbi} Selecionado</span>
                  </div>
                )}
              </div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={evolutionData}
                  onClick={(data: any) => {
                    if (data && data.activePayload && data.activePayload[0]) {
                      const abi = data.activePayload[0].payload.rawAbi;
                      setSelectedHistoricalAbi(abi);
                    }
                  }}
                  className="cursor-pointer"
                >
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
                    cursor={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="volume" 
                    name="Atendimentos"
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} 
                    activeDot={{ r: 8, fill: '#fff', stroke: '#3b82f6', strokeWidth: 3 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-4 italic font-medium">Clique nos pontos do gráfico para visualizar os detalhes de cada ciclo.</p>
          </div>

          <div className="flex flex-col gap-5">
            {/* Header de Ações do Ciclo Selecionado */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full bg-slate-50 p-4 rounded-xl border border-slate-200">
               <div className="flex items-center gap-3">
                 <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                   {[5, 10, 20, 50].map((limit) => (
                     <button
                       key={limit}
                       onClick={() => setTopLimit(limit)}
                       className={cn(
                         "px-3 py-1 rounded-md text-[10px] font-black transition-all",
                         topLimit === limit 
                           ? "bg-gax-blue text-white shadow-sm" 
                           : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                       )}
                     >
                       TOP {limit}
                     </button>
                   ))}
                 </div>
               </div>

              {selectedHistoricalAbi && (
                <button 
                  onClick={() => handleExport(selectedHistoricalAbi)}
                  className="flex items-center justify-center gap-2 h-9 px-4 rounded-lg border border-gax-blue bg-gax-blue text-white font-bold hover:bg-gax-blue-hover transition-all text-[12px] shadow-sm w-full sm:w-auto"
                >
                  <Download size={14} />
                  Exportar Dados (ABI {selectedHistoricalAbi})
                </button>
              )}
            </div>

            {historicalDataForCharts ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-5">
                {/* Gráfico de Evolução do Ciclo Histórico */}
                {historicalEvolutionData?.timeline?.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden relative">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
                          <History size={18} className="text-gax-blue" />
                          Evolução do Ciclo {selectedHistoricalAbi}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-medium">Acompanhamento diário da situação dos atendimentos</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select 
                          value={evolutionClientId} 
                          onChange={(e) => setEvolutionClientId(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-600 outline-none hover:border-gax-blue transition-colors"
                        >
                          <option value="global">Visão Consolidada</option>
                          {historicalDataForCharts.clients.map((c: any) => (
                            <option key={c.client_id} value={c.client_id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                          data={evolutionClientId === "global" ? historicalEvolutionData.timeline : (historicalEvolutionData.client_evolution?.[evolutionClientId] || [])} 
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorImpugnadosHist" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorAguardandoHist" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorNaoImpugnadosHist" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={(val) => {
                              if (!val) return '';
                              const parts = val.split('-');
                              return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : val;
                            }}
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                            dy={10}
                          />
                          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} width={40} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                            labelFormatter={(label) => {
                              if (!label) return '';
                              const parts = label.split('-');
                              return parts.length >= 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : label;
                            }}
                          />
                          <Area type="monotone" name="Não Impugnados" dataKey="nao_impugnando" stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#colorNaoImpugnadosHist)" />
                          <Area type="monotone" name="Aguardando" dataKey="aguardando" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorAguardandoHist)" />
                          <Area type="monotone" name="Impugnados" dataKey="impugnados" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorImpugnadosHist)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Grid de Gráficos Analíticos */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <TrendingUp size={16} className="text-emerald-500" />
                        Top {topLimit} Impugnações
                      </h4>
                      <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-medium italic">Snapshot</span>
                    </div>
                    <div style={{ height: `${chartHeight}px` }} className="w-full transition-all">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historicalDataForCharts.topImpugnados} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={9} fontWeight={600} width={70} tick={{ fill: '#64748b' }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }} formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']} />
                          <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} barSize={topLimit > 10 ? 12 : 18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <Hourglass size={16} className="text-amber-500" />
                        Top {topLimit} Aguardando
                      </h4>
                    </div>
                    <div style={{ height: `${chartHeight}px` }} className="w-full transition-all">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historicalDataForCharts.topAguardando} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={9} fontWeight={600} width={70} tick={{ fill: '#64748b' }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }} formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']} />
                          <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={topLimit > 10 ? 12 : 18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <UserX size={16} className="text-slate-400" />
                        Top {topLimit} Não Impugnados
                      </h4>
                    </div>
                    <div style={{ height: `${chartHeight}px` }} className="w-full transition-all">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historicalDataForCharts.topNaoImpugnados} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={9} fontWeight={600} width={70} tick={{ fill: '#64748b' }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }} formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']} />
                          <Bar dataKey="total" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={topLimit > 10 ? 12 : 18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <LayoutGrid size={16} className="text-gax-blue" />
                        {selectedHistoricalSlice ? `Operadoras: ${selectedHistoricalSlice}` : 'Distribuição Global (Snapshot)'}
                      </h4>
                      {selectedHistoricalSlice && (
                        <button onClick={() => setSelectedHistoricalSlice(null)} className="text-[11px] text-gax-blue hover:text-blue-700 hover:bg-blue-50 transition-colors font-bold px-2 py-1 bg-slate-50 rounded-md border border-slate-200 cursor-pointer">
                          Voltar
                        </button>
                      )}
                    </div>
                    <div className="h-[280px] w-full relative">
                      {selectedHistoricalSlice ? (
                        <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                          <div style={{ height: Math.max(280, historicalSliceDetails.length * 35) }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={historicalSliceDetails} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={10} fontWeight={600} width={80} tick={{ fill: '#64748b' }} />
                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }} formatter={(value: any, name: any, props: any) => [`${value} (${((value / (props.payload.clientTotal || 1)) * 100).toFixed(0)}% do total do cliente)`, 'Qtd.']} />
                                <Bar dataKey="value" fill={DISTRIBUTION_COLORS[historicalDataForCharts.distributionData.findIndex(d => d.name === selectedHistoricalSlice) || 0] || '#94a3b8'} radius={[0, 4, 4, 0]} barSize={12} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : historicalDataForCharts.distributionData.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={historicalDataForCharts.distributionData}
                                innerRadius={70}
                                outerRadius={95}
                                paddingAngle={5}
                                dataKey="value"
                                labelLine={false}
                                className="cursor-pointer hover:opacity-90 transition-opacity outline-none"
                                onClick={(data) => setSelectedHistoricalSlice(data.name || null)}
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
                                {historicalDataForCharts.distributionData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total</p>
                              <p className="text-2xl font-black text-slate-800">
                                {historicalDataForCharts.totalGlobal.toLocaleString()}
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
                      {historicalDataForCharts.distributionData.map((item, idx) => (
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
              <div className="flex items-center justify-center h-40 text-slate-400 italic text-[13px]">
                Selecione um ABI para visualizar os dados consolidados.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
