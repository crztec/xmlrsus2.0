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

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [xmlRes, clientRes] = await Promise.all([
          fetch("/api/xml-data"),
          fetch("/api/clients")
        ]);
        const xmls = await xmlRes.json();
        const cls = await clientRes.json();
        setXmlData(xmls);
        setClients(cls);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

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
      const res = await fetch(`/api/xml-data/${xml.id}/details`);
      const data = await res.json();
      setFileDetails(data);
    } catch (error) {
      console.error("Erro ao carregar detalhes:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Filter clients for the selection screen
  const filteredClients = clients.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter XML data for the selected client
  const filteredData = xmlData.filter(item => {
    const matchesClient = !selectedClient || item.client === selectedClient;
    const matchesSearch = !searchTerm || (
      item.abi?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.file_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return matchesClient && matchesSearch;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dados XML</h1>
          <p className="text-sm text-slate-500">Selecione um cliente para visualizar os ABIs</p>
        </div>

        <div className="relative max-w-md">
          <label htmlFor="client-search" className="sr-only">Buscar cliente</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
          <input 
            id="client-search"
            type="text" 
            placeholder="Buscar cliente..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map(client => (
            <button
              key={client.id}
              onClick={() => {
                setSelectedClient(client.name);
                setSearchTerm(""); // Clear search when client selected
              }}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-gax-blue/30 hover:shadow-md group focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
              aria-label={`Selecionar cliente ${client.name}`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gax-blue-light text-gax-blue group-hover:scale-110 transition-transform">
                  <Building2 size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-700">{client.name}</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                    {client.total_abis || "0"} ABIs Identificadas
                  </p>
                </div>
              </div>
              <ChevronRight className="text-slate-200 group-hover:text-gax-blue transition-colors" size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- RENDERING: DATA TABLE ---
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setSelectedClient(null);
              setSearchTerm("");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-slate-200 outline-none"
            aria-label="Voltar para seleção de clientes"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{selectedClient}</h1>
            <p className="text-sm text-slate-500">Listagem de ABIs e arquivos relacionados</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative mr-2">
            <label htmlFor="abi-search" className="sr-only">Buscar ABI ou arquivo</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
            <input 
              id="abi-search"
              type="text" 
              placeholder="Buscar ABI ou arquivo..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 sm:w-64 transition-all font-sans"
            />
          </div>
          <button 
            onClick={handleExportAll}
            className="flex items-center gap-2 rounded-xl bg-gax-blue px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-gax-blue/10 hover:bg-gax-blue-hover focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none transition-all"
            aria-label="Exportar todos os dados para Excel"
          >
            <Download size={16} aria-hidden="true" />
            Exportar Geral
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {paginatedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
              <FileText size={48} className="opacity-20 mb-4" aria-hidden="true" />
              <p className="text-sm font-medium">Nenhum dado encontrado para os filtros atuais.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-left font-sans text-[11px]">
                <thead className="bg-slate-50/50 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-4">Arquivo</th>
                    <th className="px-4 py-4">ABI</th>
                    <th className="px-4 py-4 text-right">Valor Total</th>
                    <th className="px-4 py-4 text-center">Qtd. Proc.</th>
                    <th className="px-4 py-4 text-center">Competências</th>
                    <th className="px-4 py-4">Nº Processo</th>
                    <th className="px-4 py-4">Data Proc.</th>
                    <th className="px-4 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedData.map((xml) => (
                    <tr key={xml.id} className="group transition-colors hover:bg-slate-50/50">
                      <td className="px-4 py-3 max-w-[200px] truncate" title={xml.file_name}>
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-slate-300 group-hover:text-gax-blue" aria-hidden="true" />
                          <span className="text-slate-600 font-medium">{xml.file_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800">{xml.abi}</td>
                      <td className="px-4 py-3 text-right font-bold text-gax-blue">R$ {xml.value}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{xml.quantity}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                          {xml.competence}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{xml.process_number}</td>
                      <td className="px-4 py-3 text-[10px] text-slate-400">{xml.date}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => handleViewDetails(xml)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                            title="Ver Detalhes"
                            aria-label={`Ver detalhes do ABI ${xml.abi}`}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                          <button 
                            onClick={() => handleExportFile(xml.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                            title="Baixar Excel deste Item"
                            aria-label={`Baixar Excel do ABI ${xml.abi}`}
                          >
                            <Download size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/30 px-6 py-4">
                  <span className="text-xs text-slate-500 font-medium" aria-live="polite">
                    Mostrando {paginatedData.length} de {filteredData.length} registros (ABI/Arquivo)
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
                      aria-label="Página anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold text-slate-700 px-2">
                      {currentPage} / {totalPages || 1}
                    </span>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || filteredData.length === 0}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                      aria-label="Próxima página"
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
                  <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Cód. Benef.</th>
                          <th className="px-4 py-3">Beneficiário</th>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Cód. Proc.</th>
                          <th className="px-4 py-3">Descrição Procedimento</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
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
                    <div className="flex items-center justify-between border-t border-slate-50 bg-slate-50/20 px-4 py-3">
                      <span className="text-[10px] text-slate-500 font-medium">
                        Pagina {modalPage} de {totalModalPages} ({fileDetails.length} itens)
                      </span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setModalPage(1)}
                          disabled={modalPage === 1}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                          title="Primeira página"
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
                        <span className="text-[10px] font-bold text-slate-700 px-2 leading-none">
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
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all focus-visible:ring-2 focus-visible:ring-gax-blue/20 outline-none"
                          title="Última página"
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
