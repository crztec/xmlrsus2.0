"use client";

import React, { useState, useEffect } from "react";
import { 
  Send, 
  History, 
  Plus, 
  Trash2, 
  Save, 
  Users as UsersIcon, 
  ShieldAlert, 
  FileWarning, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  RefreshCw,
  Copy,
  MessageSquare,
  Search,
  Pencil,
  ChevronDown,
  X,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  content: string;
}

interface MessageLog {
  id?: string;
  created_at: string;
  client_name: string;
  recipient: string;
  message: string;
  status: "SUCCESS" | "ERROR";
  error_details?: string;
}

interface WhatsAppContact {
  number: string;
  label: string;
}

interface ClientSummary {
  id: string;
  name: string;
  api_status: string;
  abi_status: string;
  whatsapp_numbers: (string | WhatsAppContact)[];
}

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  
  // New Message State
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({
    api_offline: false,
    abi_pending: false,
    abi_missing_analysis: false,
    abi_failed_analysis: false,
    client_ids: [] as string[]
  });
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{success: boolean, message: string} | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [isClientsModalOpen, setIsClientsModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSavingQuickContact, setIsSavingQuickContact] = useState<string | null>(null);
  const [localModalClients, setLocalModalClients] = useState<ClientSummary[]>([]);
  const [isSavingAllContacts, setIsSavingAllContacts] = useState(false);

  // Template Management
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template>>({ name: "", content: "" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const logsPerPage = 10;

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [templRes, clientRes] = await Promise.all([
        fetch("/api/messages/templates"),
        fetch("/api/clients?limit=1000")
      ]);
      
      const templData = await templRes.json();
      const clientData = await clientRes.json();
      
      setTemplates(Array.isArray(templData) ? templData : []);
      setClients(clientData.clients || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async (page: number) => {
    setIsLogsLoading(true);
    try {
      const res = await fetch(`/api/messages/logs?page=${page}&limit=${logsPerPage}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotalLogs(data.total || 0);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Mensagens & Broadcast - GAX";
    fetchData();
    // Re-set title if it gets lost during hydration/navigation
    const timer = setTimeout(() => {
      document.title = "Mensagens & Broadcast - GAX";
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      fetchLogs(currentPage);
    }
  }, [activeTab, currentPage]);

  useEffect(() => {
    if (isClientsModalOpen) {
      // Inicializa o estado local do modal com os clientes filtrados atuais
      setLocalModalClients(JSON.parse(JSON.stringify(targetClients)));
    }
  }, [isClientsModalOpen]);

  // Filtering Logic
  const targetClients = clients.filter(c => {
    // Se selecionou cliente específico, ignora outros filtros
    if (filters.client_ids.length > 0) {
      return filters.client_ids.includes(c.id);
    }
    
    const hasAnyCheckbox = filters.api_offline || filters.abi_pending || filters.abi_missing_analysis || filters.abi_failed_analysis;
    
    // Se nenhum filtro for selecionado, retorna vazio (conforme pedido do usuário: "mostrar 60 mas não selecionei nada")
    if (!hasAnyCheckbox) return false;
    
    const abi_s = (c.abi_status || "").toLowerCase();
    
    // ABI: Pendente Importação -> Nao Importado
    const isPending = abi_s === "nao importado";
    // ABI: Falta Analisar -> Importado, falta analisar
    const isMissing = abi_s === "importado, falta analisar";
    // ABI: Falha na Análise -> Falha ou Falha na Análise
    const isFailed = abi_s === "falha" || abi_s === "falha na análise" || abi_s.includes("erro");

    const matchesApi = filters.api_offline ? c.api_status === "offline" : false;
    const matchesPending = filters.abi_pending ? isPending : false;
    const matchesMissing = filters.abi_missing_analysis ? isMissing : false;
    const matchesFailed = filters.abi_failed_analysis ? isFailed : false;
    
    return matchesApi || matchesPending || matchesMissing || matchesFailed;
  });

  const totalNumbers = targetClients.reduce((acc, c) => acc + (c.whatsapp_numbers?.length || 0), 0);

  const handleSendBroadcast = async () => {
    if (!message || totalNumbers === 0) return;
    
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/messages/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, message })
      });
      const data = await res.json();
      
      if (res.ok) {
        setSendResult({ success: true, message: data.message });
        setMessage("");
      } else {
        setSendResult({ success: false, message: data.detail || "Erro ao disparar mensagens." });
      }
    } catch (err) {
      setSendResult({ success: false, message: "Erro de conexão com o servidor." });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate.name || !editingTemplate.content) return;
    
    try {
      const res = await fetch("/api/messages/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingTemplate)
      });
      if (res.ok) {
        fetchData();
        setIsTemplateModalOpen(false);
        setEditingTemplate({ name: "", content: "" });
        setSelectedTemplateId(null); // Reset selection after editing/saving
      }
    } catch (err) {
      console.error("Erro ao salvar template:", err);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Excluir este template?")) return;
    try {
      const res = await fetch(`/api/messages/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
        if (selectedTemplateId === id) setSelectedTemplateId(null);
      }
    } catch (err) {
      console.error("Erro ao deletar:", err);
    }
  };

  const handleUpdateQuickContact = async (clientId: string, updatedNumbers: WhatsAppContact[]) => {
    // Agora apenas atualiza o estado local do modal
    setLocalModalClients(prev => prev.map(c => 
      c.id === clientId ? { ...c, whatsapp_numbers: updatedNumbers } : c
    ));
  };

  const handleSaveAllContacts = async () => {
    setIsSavingAllContacts(true);
    try {
      // Identifica apenas os clientes que sofreram alteração para economizar requisições
      const modifiedClients = localModalClients.filter(localC => {
        const originalC = clients.find(c => c.id === localC.id);
        return JSON.stringify(localC.whatsapp_numbers) !== JSON.stringify(originalC?.whatsapp_numbers);
      });

      if (modifiedClients.length > 0) {
        await Promise.all(modifiedClients.map(c => 
          fetch(`/api/clients/${c.id}/whatsapp`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ whatsapp_numbers: c.whatsapp_numbers })
          })
        ));

        // Atualiza o estado global uma única vez
        setClients(prev => prev.map(c => {
          const updated = localModalClients.find(lc => lc.id === c.id);
          return updated ? { ...c, whatsapp_numbers: updated.whatsapp_numbers } : c;
        }));
      }

      setIsClientsModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar contatos:", err);
      alert("Erro ao salvar alguns contatos. Tente novamente.");
    } finally {
      setIsSavingAllContacts(false);
    }
  };

  // Helper component for smooth typing in modal
  const QuickContactField = ({ 
    initialValue, 
    onSave, 
    placeholder, 
    className 
  }: { 
    initialValue: string, 
    onSave: (val: string) => void, 
    placeholder: string,
    className: string 
  }) => {
    const [localValue, setLocalValue] = useState(initialValue);
    
    // Update local value if initialValue changes (from external sync)
    useEffect(() => {
      setLocalValue(initialValue);
    }, [initialValue]);

    return (
      <input 
        className={className}
        value={localValue}
        placeholder={placeholder}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== initialValue) {
            // Pequeno delay para permitir que o browser processe a troca de foco (clique no próximo campo)
            // antes que o re-render pesado da página ocorra.
            setTimeout(() => {
              onSave(localValue);
            }, 100);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    );
  };

  // Memoized card for the modal to prevent flicker/focus loss on other cards
  const ClientContactCard = React.memo(({ 
    client, 
    handleUpdateQuickContact, 
    isSaving 
  }: { 
    client: ClientSummary, 
    handleUpdateQuickContact: (id: string, nums: WhatsAppContact[]) => void,
    isSaving: boolean
  }) => {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800">{client.name}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                "text-[9px] font-bold uppercase border px-1.5 py-0.5 rounded-md",
                client.abi_status === "Importado e Analisado" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                client.abi_status === "Importado, falta analisar" ? "bg-blue-50 text-blue-700 border-blue-100" :
                client.abi_status === "Nao Importado" ? "bg-slate-50 text-slate-500 border-slate-200" :
                "bg-amber-50 text-amber-700 border-amber-100"
              )}>
                {client.abi_status || "Desconhecido"}
              </span>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          {(client.whatsapp_numbers || []).map((contact: any, idx: number) => {
            const contactObj = typeof contact === 'string' ? { number: contact, label: "" } : contact;
            return (
              <div key={idx} className="flex items-center gap-2 group/item">
                <div className="flex-[2] relative overflow-hidden rounded-lg border border-slate-100 focus-within:border-gax-blue transition-colors">
                   <QuickContactField 
                      className="w-full bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-900 outline-none"
                      initialValue={contactObj.label}
                      placeholder="Etiqueta/Nome"
                      onSave={(newVal) => {
                        const newContacts = [...client.whatsapp_numbers.map((c: any) => typeof c === 'string' ? {number: c, label: ""} : {...c})];
                        newContacts[idx].label = newVal;
                        handleUpdateQuickContact(client.id, newContacts);
                      }}
                   />
                </div>
                <div className="flex-[3] relative overflow-hidden rounded-lg border border-slate-100 focus-within:border-gax-blue transition-colors">
                   <QuickContactField 
                      className="w-full bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-900 outline-none"
                      initialValue={contactObj.number}
                      placeholder="WhatsApp"
                      onSave={(newVal) => {
                        const newContacts = [...client.whatsapp_numbers.map((c: any) => typeof c === 'string' ? {number: c, label: ""} : {...c})];
                        newContacts[idx].number = newVal;
                        handleUpdateQuickContact(client.id, newContacts);
                      }}
                   />
                </div>
                {isSaving && (
                  <Loader2 size={12} className="animate-spin text-gax-blue opacity-50" />
                )}
              </div>
            );
          })}
          {(!client.whatsapp_numbers || client.whatsapp_numbers.length === 0) && (
            <p className="text-[10px] text-slate-400 italic">Sem contatos configurados.</p>
          )}
        </div>
      </div>
    );
  });

  return (
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      {/* Tab Switcher */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white/70 backdrop-blur-md p-1.5 shadow-sm w-fit sticky top-0 z-30">
        <button
          onClick={() => setActiveTab("new")}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-bold text-xs",
            activeTab === "new" 
              ? "bg-gax-blue text-white shadow-lg shadow-gax-blue/30" 
              : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          )}
        >
          <Send size={15} />
          Nova Mensagem
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-bold text-xs",
            activeTab === "history" 
              ? "bg-gax-blue text-white shadow-lg shadow-gax-blue/30" 
              : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          )}
        >
          <History size={15} />
          Histórico de Envios
        </button>
      </div>

      {activeTab === "new" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Filters and Target Summary */}
          <div className="lg:col-span-1 space-y-6">
            <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Filter size={16} className="text-gax-blue" />
                Filtros Inteligentes
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Clientes / Grupos Selecionados</label>
                  <div className="relative">
                    <div 
                      className={cn(
                        "flex items-center rounded-2xl border border-slate-200 bg-white transition-all shadow-sm focus-within:ring-4 focus-within:ring-gax-blue/10 focus-within:border-gax-blue",
                        isSearchOpen && "rounded-b-none border-b-transparent ring-4 ring-gax-blue/5 border-gax-blue"
                      )}
                    >
                      <div 
                        className="flex flex-1 items-center px-3 py-2.5 cursor-text" 
                        onClick={() => !isSearchOpen && setIsSearchOpen(true)}
                      >
                         <Search size={14} className={cn("mr-2 transition-colors", isSearchOpen || filters.client_ids.length > 0 ? "text-gax-blue" : "text-slate-300")} />
                         <input 
                            type="text" 
                            placeholder={
                              filters.client_ids.length === 0 
                                ? "Pesquisar por nome..." 
                                : filters.client_ids.length === 1
                                  ? clients.find(c => c.id === filters.client_ids[0])?.name
                                  : `${filters.client_ids.length} clientes selecionados`
                            } 
                            value={clientSearch}
                            onChange={(e) => {
                              setClientSearch(e.target.value);
                              if (!isSearchOpen) setIsSearchOpen(true);
                            }}
                            onFocus={() => setIsSearchOpen(true)}
                            className="bg-transparent text-[11px] font-bold outline-none text-slate-700 placeholder:text-slate-400 w-full"
                         />
                      </div>
                      
                      <div className="flex items-center gap-1 pr-3 border-l border-slate-50 ml-2 py-1">
                        {filters.client_ids.length > 0 && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilters({...filters, client_ids: []});
                              setClientSearch("");
                            }}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSearchOpen(!isSearchOpen);
                          }}
                          className="p-1"
                        >
                          <ChevronDown 
                            size={14} 
                            className={cn("text-slate-300 transition-transform duration-200", isSearchOpen && "rotate-180")} 
                          />
                        </button>
                      </div>
                    </div>

                    {/* Droppable List */}
                    {isSearchOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setIsSearchOpen(false)}
                        />
                        <div className="absolute left-0 right-0 top-full z-20 overflow-hidden rounded-b-2xl border-x border-b border-gax-blue bg-white shadow-2xl animate-in slide-in-from-top-1 duration-200">
                           <div className="p-2 border-b border-slate-50 flex items-center justify-between">
                              <button 
                                onClick={() => {
                                  if (filters.client_ids.length === clients.length) {
                                    setFilters({...filters, client_ids: []});
                                  } else {
                                    setFilters({...filters, client_ids: clients.map(c => c.id)});
                                  }
                                }}
                                className="text-[10px] font-bold text-gax-blue hover:underline px-2 py-1"
                              >
                                {filters.client_ids.length === clients.length ? "Desmarcar Todos" : "Selecionar Todos"}
                              </button>
                              <span className="text-[10px] text-slate-400 px-2">{filters.client_ids.length} selecionados</span>
                           </div>
                          
                          <div className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                            {clients
                              .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                              .map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => {
                                    const newIds = filters.client_ids.includes(c.id)
                                      ? filters.client_ids.filter(id => id !== c.id)
                                      : [...filters.client_ids, c.id];
                                    setFilters({...filters, client_ids: newIds});
                                  }}
                                  className={cn(
                                    "flex w-full items-center px-4 py-2.5 text-left text-[11px] font-bold transition-all border-b last:border-b-0 border-slate-50 gap-3",
                                    filters.client_ids.includes(c.id) ? "bg-gax-blue/5 text-gax-blue" : "text-slate-600 hover:bg-slate-50"
                                  )}
                                >
                                  <div className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                    filters.client_ids.includes(c.id) ? "bg-gax-blue border-gax-blue" : "border-slate-300 bg-white"
                                  )}>
                                    {filters.client_ids.includes(c.id) && <X size={10} className="text-white" />}
                                  </div>
                                  {c.name}
                                </button>
                              ))}
                            {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                              <div className="p-4 text-center text-[10px] text-slate-400 italic">Nenhum cliente encontrado</div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className={cn("space-y-3", filters.client_ids.length > 0 ? "opacity-30 pointer-events-none" : "")}>
                   <div className="flex items-center gap-3">
                    <input 
                      id="f-api" 
                      type="checkbox" 
                      checked={filters.api_offline} 
                      onChange={(e) => setFilters({...filters, api_offline: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-api" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <ShieldAlert size={14} className="text-rose-500" />
                      API Offline (Erro)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      id="f-pending" 
                      type="checkbox" 
                      checked={filters.abi_pending} 
                      onChange={(e) => setFilters({...filters, abi_pending: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-pending" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <Loader2 size={14} className="text-amber-500" />
                      ABI: Pendente Importação
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      id="f-missing" 
                      type="checkbox" 
                      checked={filters.abi_missing_analysis} 
                      onChange={(e) => setFilters({...filters, abi_missing_analysis: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-missing" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <AlertCircle size={14} className="text-orange-500" />
                      ABI: Falta Analisar
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      id="f-failed" 
                      type="checkbox" 
                      checked={filters.abi_failed_analysis} 
                      onChange={(e) => setFilters({...filters, abi_failed_analysis: e.target.checked})}
                      className="h-4 w-4 rounded border-slate-300 text-gax-blue focus:ring-gax-blue"
                    />
                    <label htmlFor="f-failed" className="text-xs font-medium text-slate-600 flex items-center gap-2">
                      <XCircle size={14} className="text-red-500" />
                      ABI: Falha na Análise
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm border-dashed relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gax-blue/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-700"></div>
              <h3 className="text-xs font-bold text-gax-blue mb-2 relative z-10 uppercase tracking-tight">Resumo do Destinatário</h3>
              <div className="flex items-end gap-2 relative z-10">
                <span className="text-4xl font-black text-gax-blue">{targetClients.length}</span>
                <span className="text-xs font-bold text-slate-500 mb-1.5">Clientes selecionados</span>
              </div>
              <button 
                onClick={() => setIsClientsModalOpen(true)}
                disabled={targetClients.length === 0}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gax-blue/5 text-[11px] text-gax-blue font-bold hover:bg-gax-blue hover:text-white transition-all group disabled:opacity-50 relative z-10"
              >
                <UsersIcon size={14} className="group-hover:scale-110 transition-transform" />
                <span>{totalNumbers} contatos encontrados</span>
              </button>
            </section>
          </div>

          {/* Right Column: Templates and Composer */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Template Manager */}
            <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <LayoutGrid size={16} className="text-gax-blue" />
                  Templates Salvos
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    setEditingTemplate({ name: "", content: "" });
                    setIsTemplateModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gax-blue/5 text-[10px] font-bold text-gax-blue hover:bg-gax-blue hover:text-white transition-all shadow-sm"
                >
                  <Plus size={14} />
                  Novo Template
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {templates.map(t => (
                  <div 
                    key={t.id} 
                    className={cn(
                      "group relative flex shrink-0 flex-col gap-3 rounded-2xl border p-4 transition-all cursor-pointer w-[210px]",
                      selectedTemplateId === t.id 
                        ? "border-gax-blue bg-gax-blue/[0.04] ring-2 ring-gax-blue/20" 
                        : "border-slate-100 bg-slate-50/50 hover:border-gax-blue/30 hover:bg-white hover:shadow-md hover:-translate-y-0.5"
                    )}
                    onClick={() => {
                      setEditingTemplate(t);
                      setIsTemplateModalOpen(true);
                    }}
                  >
                    <div className="flex items-center justify-between">
                       <span className={cn("truncate text-xs font-bold pr-4", selectedTemplateId === t.id ? "text-gax-blue" : "text-slate-800")}>{t.name}</span>
                       <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-100 p-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTemplate(t);
                              setIsTemplateModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-gax-blue transition-colors"
                            title="Editar"
                          ><Pencil size={12} /></button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(t.id);
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                            title="Excluir"
                          ><Trash2 size={12} /></button>
                       </div>
                    </div>
                    <p className="line-clamp-3 text-[10px] text-slate-500 leading-relaxed min-h-[45px]">
                      {t.content}
                    </p>
                    <div className="mt-auto pt-3 flex items-center justify-between">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setMessage(t.content);
                          setSelectedTemplateId(t.id);
                        }}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all",
                          selectedTemplateId === t.id 
                            ? "bg-gax-blue text-white shadow-sm" 
                            : "bg-white border border-slate-200 text-gax-blue hover:bg-gax-blue hover:text-white"
                        )}
                      >
                        {selectedTemplateId === t.id ? "✓ Ativo" : "Usar Agora"}
                      </button>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-xs text-slate-300 italic py-4">Nenhum template cadastrado.</p>
                )}
              </div>
            </section>

            {/* Composer */}
            <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <MessageSquare size={16} className="text-gax-blue" />
                Compor Mensagem
              </h3>
              
              <div className="relative">
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full min-h-[220px] rounded-2xl border border-slate-200 bg-slate-50/30 p-5 text-sm outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 resize-none"
                  placeholder="Digite sua mensagem de broadcast aqui..."
                  maxLength={4000}
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-4">
                  <span className={cn(
                    "text-[10px] font-bold",
                    message.length > 3900 ? "text-rose-500" : "text-slate-400"
                  )}>
                    {message.length} / 4000
                  </span>
                </div>
              </div>

              {sendResult && (
                <div className={cn(
                  "mt-4 rounded-xl p-3 text-xs font-bold border flex items-center gap-2 animate-in slide-in-from-top-2",
                  sendResult.success ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                )}>
                  {sendResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {sendResult.message}
                </div>
              )}

              <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
                 <button 
                  onClick={handleSendBroadcast}
                  disabled={isSending || !message || totalNumbers === 0}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gax-blue py-3.5 text-sm font-bold text-white shadow-xl shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover active:scale-[0.98] disabled:opacity-50"
                >
                  {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  {isSending ? "Iniciando Disparo..." : "Enviar Broadcast Agora"}
                </button>
                <div className="text-[10px] text-slate-400 italic text-center sm:text-left leading-tight hidden sm:block">
                  Atenção: O disparo será realizado em lote respeitando intervalos para evitar o bloqueio da conta.
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
           {/* Summary Stats for History - Optional but looks premium */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-3xl border border-slate-200/60 bg-white p-4 shadow-sm flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gax-blue/10 text-gax-blue">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total de Envios</p>
                  <p className="text-xl font-bold text-slate-800">{totalLogs}</p>
                </div>
              </div>
              {/* More stats could go here */}
           </div>

           <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-sm">
             <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data / Hora</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Destinatário</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Mensagem (Resumo)</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {isLogsLoading ? (
                     <tr><td colSpan={4} className="px-6 py-20 text-center"><Loader2 className="animate-spin inline text-gax-blue" size={32} /></td></tr>
                   ) : logs.map((log, idx) => (
                      <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs font-medium text-slate-500">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{log.client_name}</span>
                            <span className="text-[10px] font-medium text-slate-400 tracking-tight">{log.recipient}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="max-w-[300px] truncate text-xs text-slate-600 font-medium" title={log.message}>
                            {log.message}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                             <span className={cn(
                               "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border",
                               log.status === "SUCCESS" 
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100/50" 
                                : "bg-rose-50 text-rose-600 border-rose-100/50"
                             )}>
                               {log.status === "SUCCESS" ? "Enviado" : "Erro"}
                             </span>
                             {log.error_details && (
                               <span title={log.error_details}>
                                 <ShieldAlert size={14} className="text-rose-400" />
                               </span>
                             )}
                          </div>
                        </td>
                      </tr>
                   ))}
                   {!isLogsLoading && logs.length === 0 && (
                     <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-400 italic">Nenhum disparo registrado ainda.</td></tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>

            {/* Paginação */}
            <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
               <span className="text-xs font-medium text-slate-500">
                 {totalLogs > 0 ? (
                   `Mostrando ${(currentPage - 1) * logsPerPage + 1} a ${Math.min(currentPage * logsPerPage, totalLogs)} de ${totalLogs} registros`
                 ) : (
                   "Sem registros para mostrar"
                 )}
               </span>
               <div className="flex items-center gap-2">
                 <button 
                   onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                   disabled={currentPage === 1 || totalLogs === 0}
                   className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm hover:shadow-md"
                 >
                   <ChevronLeft size={20} />
                 </button>
                 <span className="text-xs font-bold text-slate-700 px-3 bg-slate-50 py-2 rounded-lg border border-slate-100">
                    {currentPage} / {Math.max(1, Math.ceil(totalLogs / logsPerPage))}
                 </span>
                 <button 
                   onClick={() => setCurrentPage(prev => prev + 1)}
                   disabled={currentPage >= Math.ceil(totalLogs / logsPerPage) || totalLogs === 0}
                   className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm hover:shadow-md"
                 >
                   <ChevronRight size={20} />
                 </button>
               </div>
            </div>
        </div>
      )}

      {/* Template Edit Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-800">
                {editingTemplate.id ? "Editar Template" : "Novo Template"}
              </h3>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nome do Template</label>
                <input 
                  type="text"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-bold"
                  placeholder="Ex: Aviso de Importação"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conteúdo da Mensagem</label>
                <textarea 
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})}
                  className="w-full min-h-[150px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans resize-none"
                  placeholder="Digite o texto do template..."
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-6 py-2 rounded-xl text-slate-500 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveTemplate}
                className="px-6 py-2 rounded-xl bg-gax-blue text-white text-xs font-bold shadow-lg shadow-gax-blue/20 hover:bg-gax-blue-hover transition-all"
              >
                Salvar Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clients List Modal */}
      {isClientsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Lista de Destinatários</h3>
                <p className="text-xs text-slate-400 font-medium">Contatos selecionados com base nos filtros atuais</p>
              </div>
              <button 
                onClick={() => setIsClientsModalOpen(false)} 
                className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-100"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {localModalClients.map(client => (
                  <ClientContactCard 
                    key={client.id}
                    client={client}
                    handleUpdateQuickContact={handleUpdateQuickContact}
                    isSaving={false} // Não mostramos loader individual mais, pois o salvamento é global
                  />
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 flex justify-end bg-white">
               <button 
                  onClick={handleSaveAllContacts}
                  disabled={isSavingAllContacts}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-2xl bg-gax-blue text-white text-xs font-bold shadow-lg shadow-gax-blue/20 hover:bg-gax-blue-hover transition-all disabled:opacity-50"
               >
                  {isSavingAllContacts ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      Concluído
                    </>
                  )}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
