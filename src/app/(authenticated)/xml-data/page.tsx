"use client";

import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Search, 
  Download, 
  Filter, 
  Eye, 
  Loader2, 
  XCircle, 
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";


interface XMLDetails {
  beneficiario_cod: string;
  beneficiario_nome: string;
  data: string;
  procedimento_cod: string;
  procedimento_nome: string;
  valor: string;
}

export default function XmlDataPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [xmlData, setXmlData] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  
  // Sorting states for clients list
  const [sortField, setSortField] = useState<string | null>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortCycle, setSortCycle] = useState(0); 
  
  
  // Pagination State for Main Table
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [fileDetails, setFileDetails] = useState<XMLDetails[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  // Pagination State for Modal
  const [modalPage, setModalPage] = useState(1);
  const modalItemsPerPage = 10;

  const [totalXmls, setTotalXmls] = useState(0);

  // Pagination State for Client Selection
  const [clientPage, setClientPage] = useState(1);
  const clientsPerPage = 10;

  useEffect(() => {
    const fetchData = async () => {
      // 1. TELA INICIAL (Sem cliente): Busca a lista de clientes apenas UMA VEZ e para por aqui.
      // Isso impede que o searchTerm dispare fetches e loading global a cada letra digitada.
      if (!selectedClient) {
        if (clients.length === 0) {
          setIsLoading(true);
          try {
            const clientRes = await apiClient("/api/clients?limit=100");
            const cls = await clientRes.json();
            setClients(cls.clients || []);
          } catch (error) {
            console.error("Erro ao carregar clientes:", error);
          } finally {
            setIsLoading(false);
          }
        }
        return; // Interrompe a execução para não buscar XMLs
      }

      // 2. TELA INTERNA (Com cliente selecionado): Busca os XMLs apenas desse cliente
      setIsLoading(true);
      try {
        // Adicionando o parâmetro client na URL para garantir que o backend filtre corretamente
        const xmlRes = await apiClient(`/api/xml-data?page=${currentPage}&limit=${itemsPerPage}&search=${encodeURIComponent(searchTerm)}&client=${encodeURIComponent(selectedClient)}`);
        const xmls = await xmlRes.json();
        setXmlData(xmls.xml_data || []);
        setTotalXmls(xmls.total || 0);
      } catch (error) {
        console.error("Erro ao carregar dados XML:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currentPage, searchTerm, selectedClient]);

  const handleExportAll = () => {
    window.open("/api/xml-data/export", "_blank");
  };

  const handleExportFile = (fileId: string) => {
    window.open(`/api/xml-data/${fileId}/export`, "_blank");
  };

  const handleViewDetails = async (xml: any) => {
    setSelectedFile(xml);
    setShowModal(true);
    setIsLoadingDetails(true);
    setFileDetails([]);
    setModalPage(1);
    try {
      const res = await apiClient(`/api/xml-data/${xml.id}/details`);
      const data = await res.json();
      setFileDetails(data);
    } catch (error) {
      console.error("Erro ao carregar detalhes:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Filter clients locally for better UX (no flicker)
  const filteredClients = clients.filter((c: any) => {
    const s = searchTerm.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(s)) || 
      (c.cnpj && c.cnpj.includes(s)) ||
      (c.group_name && c.group_name.toLowerCase().includes(s))
    );
  }).sort((a, b) => {
    if (!sortField) return 0;
    let valA = (a as any)[sortField] || "";
    let valB = (b as any)[sortField] || "";
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const handleSortOperadora = () => {
    if (sortCycle === 0) {
      setSortField("name");
      setSortOrder("asc");
      setSortCycle(1);
    } else {
      setSortField("group_name");
      setSortOrder("asc");
      setSortCycle(0);
    }
  };

  const totalClientsPages = Math.ceil(filteredClients.length / clientsPerPage);
  const paginatedClients = filteredClients.slice((clientPage - 1) * clientsPerPage, clientPage * clientsPerPage);

  useEffect(() => {
    setClientPage(1);
  }, [searchTerm]);

  // Filter XML data for the selected client
  const filteredData = xmlData; // Agora filtrado no servidor

  // Pagination Logic
  const totalPages = Math.ceil(totalXmls / itemsPerPage);
  const paginatedData = xmlData; // Já vem paginado do servidor

  const totalModalPages = Math.ceil(fileDetails.length / modalItemsPerPage);
  const paginatedDetails = fileDetails.slice((modalPage - 1) * modalItemsPerPage, modalPage * modalItemsPerPage);

  if (isLoading) {
    return (
      <div className="flex justify-center py-40">
        <Loader2 className="animate-spin text-gax-blue" size={40} />
      </div>
    );
  }

  // --- RENDERING: CLIENT SELECTION ---
  if (!selectedClient) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-8 pt-2 max-w-7xl mx-auto">
        <div></div>

        <div className="relative max-w-md">
          <label htmlFor="client-search" className="sr-only">Buscar cliente</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
          <input 
            id="client-search"
            type="text" 
            placeholder="Buscar cliente..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium placeholder:text-slate-300"
          />
        </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {paginatedClients.map((client, idx) => (
          <button
            key={client.id}
            onClick={() => {
              setSelectedClient(client.name);
              setSearchTerm("");
            }}
            className="group relative flex flex-col rounded-2xl border border-slate-200/50 bg-white/60 p-4 text-left transition-all duration-300 hover:border-gax-blue/30 hover:shadow-lg hover:shadow-slate-200/40"
            style={{ animationDelay: `${(idx % 5) * 40}ms`, animationFillMode: 'both' }}
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-gax-blue/10 group-hover:text-gax-blue transition-all duration-300 shadow-sm">
              <Building2 size={20} />
            </div>

            <div className="flex flex-col mb-4">
              <h3 className="text-sm font-bold text-slate-800 transition-colors group-hover:text-gax-blue truncate leading-snug">
                {client.name}
              </h3>
              {client.group_name && (
                <span className="inline-flex items-center rounded-full bg-gax-blue/5 px-2.5 py-0.5 text-[10px] font-bold text-gax-blue border border-gax-blue/10 w-fit">
                  {client.group_name}
                </span>
              )}
            </div>
            
            <div className="space-y-1.5 border-t border-slate-50 pt-4 mt-auto">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">ABIs Detectadas</span>
                <span className="text-[11px] font-bold text-emerald-600">
                  {client.total_abis || "0"} XMLs
                </span>
              </div>
            </div>

            <div className="absolute top-4 right-4 h-6 w-6 flex items-center justify-center rounded-lg bg-slate-50 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:bg-gax-blue/10 group-hover:text-gax-blue transition-all">
              <ChevronRight size={14} />
            </div>
          </button>
        ))}
      </div>

      {totalClientsPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-white/50 px-6 py-4 rounded-3xl shadow-sm">
          <span className="text-xs font-medium text-slate-500">
            Mostrando {(clientPage - 1) * clientsPerPage + 1} a {Math.min(clientPage * clientsPerPage, filteredClients.length)} de {filteredClients.length} clientes
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setClientPage(1)}
              disabled={clientPage === 1}
              className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
            >
              Primeira
            </button>
            <button 
              onClick={() => setClientPage(prev => Math.max(prev - 1, 1))}
              disabled={clientPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-slate-700 px-2">
              {clientPage} / {totalClientsPages || 1}
            </span>
            <button 
              onClick={() => setClientPage(prev => Math.min(prev + 1, totalClientsPages))}
              disabled={clientPage === totalClientsPages || filteredClients.length === 0}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
              aria-label="Próxima"
            >
              <ChevronRight size={16} />
            </button>
            <button 
              onClick={() => setClientPage(totalClientsPages)}
              disabled={clientPage === totalClientsPages || totalClientsPages === 0}
              className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
            >
              Última
            </button>
          </div>
        </div>
      )}
      </div>
    );
  }

  // --- RENDERING: DATA TABLE ---
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 pt-2 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 md:gap-5">
          <button 
            onClick={() => {
              setSelectedClient(null);
              setSearchTerm("");
            }}
            className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl md:rounded-2xl border border-slate-200 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue hover:shadow-lg hover:shadow-gax-blue/10 transition-all shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm md:text-base font-bold text-slate-800 truncate">{selectedClient}</h2>
            <p className="text-[10px] text-slate-400 font-medium">Dados de Faturamento XML</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="relative group w-full sm:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={18} />
            <input 
              id="abi-search"
              type="text" 
              placeholder="ABI ou Arquivo..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-2xl border border-slate-200/60 bg-white px-12 py-3.5 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 sm:w-72 transition-all font-medium placeholder:text-slate-300"
            />
          </div>
          <button 
            onClick={handleExportAll}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gax-blue px-6 py-3.5 text-xs font-bold text-white shadow-xl shadow-gax-blue/20 hover:bg-gax-blue-hover transition-all active:scale-[0.98] w-full sm:w-auto"
          >
            <Download size={18} />
            <span>Exportar Base</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-sm">
        <div className="overflow-x-auto">
          {paginatedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
              <FileText size={48} className="opacity-20 mb-4" />
              <p className="text-sm font-bold text-slate-400">Nenhum dado encontrado para os filtros atuais.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-left font-sans text-xs">
                <thead className="bg-slate-50/30 text-[9px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                  <tr className="border-b border-slate-100/50">
                    <th className="px-4 py-3 font-bold">Arquivo</th>
                    <th className="px-4 py-3 font-bold">ABI</th>
                    <th className="px-4 py-3 text-right font-bold">Valor Total</th>
                    <th className="px-4 py-3 text-center font-bold">Qtd. Proc.</th>
                    <th className="px-4 py-3 text-center font-bold">Competência</th>
                    <th className="px-4 py-3 font-bold">Nº Processo</th>
                    <th className="px-4 py-3 font-bold">Data Proc.</th>
                    <th className="px-4 py-3 text-center font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedData.map((xml) => (
                    <tr key={xml.id} className="group transition-colors hover:bg-slate-50/50 whitespace-nowrap text-[11px]">
                      <td className="px-4 py-2.5 max-w-[200px] truncate" title={xml.file_name}>
                        <div className="flex items-center gap-2">
                          <FileText size={12} className="text-slate-300 group-hover:text-gax-blue" aria-hidden="true" />
                          <span className="text-slate-600 font-medium">{xml.file_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-800">{xml.abi}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gax-blue">R$ {xml.value}</td>
                      <td className="px-4 py-2.5 text-center text-slate-500">{xml.quantity}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-bold text-slate-500">
                          {xml.competence}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{xml.process_number}</td>
                      <td className="px-4 py-2.5 text-[10px] text-slate-400">{xml.date}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => handleViewDetails(xml)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                            title="Ver Detalhes"
                            aria-label={`Ver detalhes do ABI ${xml.abi}`}
                          >
                            <Eye size={12} aria-hidden="true" />
                          </button>
                          <button 
                            onClick={() => handleExportFile(xml.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                            title="Baixar Excel deste Item"
                            aria-label={`Baixar Excel do ABI ${xml.abi}`}
                          >
                            <Download size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4">
                  <span className="text-xs font-medium text-slate-500">
                    Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, totalXmls)} de {totalXmls} registros
                  </span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                    >
                      Primeira
                    </button>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                      aria-label="Anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold text-slate-700 px-2">
                      {currentPage} / {totalPages || 1}
                    </span>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || totalXmls === 0}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                      aria-label="Próxima"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button 
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                    >
                      Última
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de Detalhes do XML */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-300"
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-modal-title"
        >
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 id="details-modal-title" className="text-xl font-bold text-slate-900">Detalhes do ABI</h3>
                <p className="text-sm text-slate-500">ABI: {selectedFile?.abi} | {selectedFile?.client}</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => handleExportFile(selectedFile?.id)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-gax-blue hover:bg-slate-50 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                  aria-label="Download Excel do faturamento"
                >
                  <Download size={14} aria-hidden="true" />
                  Baixar Excel
                </button>
                <button 
                  onClick={() => setShowModal(false)} 
                  className="text-slate-400 hover:text-slate-600 transition-all focus-visible:ring-2 focus-visible:ring-slate-200 outline-none rounded-full"
                  aria-label="Fechar modal de detalhes"
                >
                  <XCircle size={28} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 min-h-[400px]">
              {isLoadingDetails ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="animate-spin text-gax-blue" size={48} />
                  <p className="text-sm font-medium text-slate-400">Extraindo dados do XML...</p>
                </div>
              ) : fileDetails.length > 0 ? (
                <>
                  <div className="rounded-xl border border-slate-200 overflow-x-auto mb-4 hide-scrollbar">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                        <tr>
                          <th className="px-4 py-3">Cód. Benef.</th>
                          <th className="px-4 py-3">Beneficiário</th>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Cód. Proc.</th>
                          <th className="px-4 py-3">Descrição Procedimento</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                        {paginatedDetails.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 text-slate-500 font-mono">{item.beneficiario_cod}</td>
                            <td className="px-4 py-3 font-medium text-slate-700">{item.beneficiario_nome}</td>
                            <td className="px-4 py-3 text-slate-500">{item.data}</td>
                            <td className="px-4 py-3 text-slate-500 uppercase">{item.procedimento_cod}</td>
                            <td className="px-4 py-3 text-slate-600">{item.procedimento_nome}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800">
                              {item.valor ? (item.valor.includes(",") ? `R$ ${item.valor}` : `R$ ${item.valor},00`) : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalModalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/20 px-4 py-3">
                      <span className="text-[10px] font-medium text-slate-500">
                        Mostrando {(modalPage - 1) * modalItemsPerPage + 1} a {Math.min(modalPage * modalItemsPerPage, fileDetails.length)} de {fileDetails.length} itens
                      </span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setModalPage(1)}
                          disabled={modalPage === 1}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                        >
                          Primeira
                        </button>
                        <button 
                          onClick={() => setModalPage(p => Math.max(p - 1, 1))}
                          disabled={modalPage === 1}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                          aria-label="Anterior"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-[10px] font-bold text-slate-700 px-2">
                          {modalPage} / {totalModalPages || 1}
                        </span>
                        <button 
                          onClick={() => setModalPage(p => Math.min(p + 1, totalModalPages))}
                          disabled={modalPage === totalModalPages || fileDetails.length === 0}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                          aria-label="Próxima"
                        >
                          <ChevronRight size={14} />
                        </button>
                        <button 
                          onClick={() => setModalPage(totalModalPages)}
                          disabled={modalPage === totalModalPages || totalModalPages === 0}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all font-sans focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                        >
                          Última
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <FileText size={48} className="opacity-20 mb-4" />
                  <p className="font-medium">Nenhum item detalhado encontrado para este XML.</p>
                  <p className="text-[10px] mt-1">Verifique se o arquivo segue o padrão TISS/ABI.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
