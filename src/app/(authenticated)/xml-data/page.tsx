"use client";

import React, { useState, useEffect } from "react";
import { FileText, Search, Download, Filter, Eye, Loader2, XCircle } from "lucide-react";

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
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [fileDetails, setFileDetails] = useState<XMLDetails[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch("/api/xml-data")
      .then(res => res.json())
      .then(data => {
        setXmlData(data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleExport = () => {
    window.open("/api/xml-data/export", "_blank");
  };

  const handleViewDetails = async (xml: any) => {
    setSelectedFile(xml);
    setShowModal(true);
    setIsLoadingDetails(true);
    setFileDetails([]);
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

  const filteredData = xmlData.filter(item => 
    item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.abi.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.file_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dados dos XMLs</h1>
          <p className="text-sm text-slate-500">Consulta detalhada de todos os arquivos processados</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative mr-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar ABI, Cliente ou Arquivo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 sm:w-64"
            />
          </div>
          <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50">
            <Filter size={16} />
            Filtros
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl bg-gax-blue px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-gax-blue/10 hover:bg-gax-blue-hover"
          >
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-gax-blue" size={40} />
            </div>
          ) : (
            <table className="w-full text-left font-sans text-[11px]">
              <thead className="bg-slate-50/50 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-4">Arquivo</th>
                  <th className="px-4 py-4">ABI</th>
                  <th className="px-4 py-4">Razão Social</th>
                  <th className="px-4 py-4 text-right">Valor Total</th>
                  <th className="px-4 py-4 text-center">Qtd. Atendimentos</th>
                  <th className="px-4 py-4">Competências</th>
                  <th className="px-4 py-4">Nº Processo</th>
                  <th className="px-4 py-4">Data Rec. Ofício</th>
                  <th className="px-4 py-4">Data Proc.</th>
                  <th className="px-4 py-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((xml) => (
                  <tr key={xml.id} className="group transition-colors hover:bg-slate-50/50">
                    <td className="px-4 py-3 max-w-[150px] truncate" title={xml.file_name}>
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-slate-300" />
                        <span className="text-slate-600">{xml.file_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">{xml.abi}</td>
                    <td className="px-4 py-3 font-medium text-slate-600">{xml.client}</td>
                    <td className="px-4 py-3 text-right font-bold text-gax-blue">R$ {xml.value}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{xml.quantity}</td>
                    <td className="px-4 py-3 text-slate-400">{xml.competence}</td>
                    <td className="px-4 py-3 text-slate-400">{xml.process_number}</td>
                    <td className="px-4 py-3 text-slate-400 font-medium">{xml.recebimento_oficio}</td>
                    <td className="px-4 py-3 text-[10px] text-slate-400">{xml.date}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={() => handleViewDetails(xml)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue shadow-sm"
                          title="Ver Detalhes"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={handleExport}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue shadow-sm"
                          title="Download Excel"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de Detalhes do XML */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Detalhes do Faturamento</h3>
                <p className="text-sm text-slate-500">ABI: {selectedFile?.abi} | {selectedFile?.client}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <XCircle size={28} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingDetails ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="animate-spin text-gax-blue" size={48} />
                  <p className="text-sm font-medium text-slate-400">Lendo conteúdo do XML no Storage...</p>
                </div>
              ) : fileDetails.length > 0 ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
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
                      {fileDetails.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-slate-500 font-mono">{item.beneficiario_cod}</td>
                          <td className="px-4 py-3 font-medium text-slate-700">{item.beneficiario_nome}</td>
                          <td className="px-4 py-3 text-slate-500">{item.data}</td>
                          <td className="px-4 py-3 text-slate-500 uppercase">{item.procedimento_cod}</td>
                          <td className="px-4 py-3 text-slate-600">{item.procedimento_nome}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800">
                            {item.valor ? `R$ ${item.valor}` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <FileText size={48} className="opacity-20 mb-4" />
                  <p className="font-medium">Nenhum item detalhado encontrado para este XML.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
