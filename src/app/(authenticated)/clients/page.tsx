"use client";

import React, { useState, useEffect } from "react";
import { Users, Search, Building2, Calendar, FileCheck, Loader2 } from "lucide-react";

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then(res => res.json())
      .then(data => {
        setClients(data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const filteredClients = clients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.cnpj.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clientes Identificados</h1>
          <p className="text-sm text-slate-500">Lista de clientes detectados nos XMLs processados</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou CNPJ..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 sm:w-80"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-gax-blue" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <div key={client.id} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-gax-blue/30 hover:shadow-md">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gax-blue-light text-gax-blue">
                  <Building2 size={24} />
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Ativo</span>
              </div>

              <h3 className="mb-1 text-lg font-bold text-slate-800 group-hover:text-gax-blue">{client.name}</h3>
              <p className="mb-6 text-xs text-slate-400">CNPJ: {client.cnpj}</p>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Calendar size={12} />
                    Última Importação
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">{client.lastImport}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <FileCheck size={12} />
                    Total Arquivos
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">{client.files} XMLs</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
