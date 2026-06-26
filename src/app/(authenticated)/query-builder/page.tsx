"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Wrench, Database, Plus, BrainCircuit, Terminal, Play, Copy, Check,
  Loader2, Trash2, ChevronDown, ChevronUp, AlertCircle, Sparkles,
  Info, Server, Key, X, FileCode2, ChevronLeft, ChevronRight, Pencil,
  MessageSquare, Send, Save, Bookmark
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/apiClient";

interface Connection {
  id: string;
  name: string;
  host: string;
  database: string;
  username: string;
  port: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SavedQuery {
  id: string;
  connection_id: string;
  name: string;
  sql_query: string;
  created_by: string;
  created_at: string;
}

export default function QueryBuilderPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [isLoadingConns, setIsLoadingConns] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSavedQueriesModalOpen, setIsSavedQueriesModalOpen] = useState(false);
  const [isSaveQueryModalOpen, setIsSaveQueryModalOpen] = useState(false);
  
  // Connection Form State
  const [connForm, setConnForm] = useState({
    id: "", name: "", host: "", database: "", username: "", password: "", port: 1433
  });
  const [isSavingConn, setIsSavingConn] = useState(false);

  // IA Configuration State
  const [provider, setProvider] = useState<"gemini" | "claude" | "openai" | "deepseek">("gemini");
  const [modelName, setModelName] = useState<string>("gemini-3.5-flash");
  const [apiKey, setApiKey] = useState<string>("");
  const [reasoningLevel, setReasoningLevel] = useState<"standard" | "extended">("standard");

  // Extracted Schema State
  const [schemaText, setSchemaText] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSchemaExpanded, setIsSchemaExpanded] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Saved Queries State
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [newQueryName, setNewQueryName] = useState("");
  const [queryToSave, setQueryToSave] = useState("");
  const [isSavingQuery, setIsSavingQuery] = useState(false);
  
  // Copy state for multiple SQL blocks
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  // Execution Results State
  const [executionResult, setExecutionResult] = useState<{ columns: string[]; rows: any[] } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execError, setExecError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // General Notification Banners
  const [notifySuccess, setNotifySuccess] = useState("");
  const [notifyError, setNotifyError] = useState("");

  const currentUserEmail = typeof window !== "undefined" ? localStorage.getItem("gax_user_email") || "" : "";

  const fetchConnections = async () => {
    setIsLoadingConns(true);
    try {
      const res = await apiClient("/api/settings/sql-connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar conexões:", err);
    } finally {
      setIsLoadingConns(false);
    }
  };

  const fetchSavedQueries = async (connId: string) => {
    if (!connId) return;
    setIsLoadingSaved(true);
    try {
      const res = await apiClient(`/api/query-builder/saved?connection_id=${connId}`);
      if (res.ok) {
        const data = await res.json();
        setSavedQueries(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar queries salvas:", err);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    fetchConnections();
    
    // Carregar chat salvo
    const savedChat = localStorage.getItem("query_builder_chat");
    if (savedChat) {
      try {
        setMessages(JSON.parse(savedChat));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (selectedConnId) {
      fetchSavedQueries(selectedConnId);
      // Reset chat and schema when changing connections
      setSchemaText("");
      setExecutionResult(null);
    }
  }, [selectedConnId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isGenerating]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("query_builder_chat", JSON.stringify(messages));
    } else {
      localStorage.removeItem("query_builder_chat");
    }
  }, [messages]);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConn(true);
    setNotifyError("");
    setNotifySuccess("");
    try {
      const payload = {
        ...connForm,
        name: connForm.database,
        port: connForm.port ? Number(connForm.port) : 1433,
        id: connForm.id || undefined
      };
      const res = await apiClient("/api/settings/sql-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setNotifySuccess(connForm.id ? "Conexão atualizada com sucesso!" : "Conexão salva com sucesso!");
        setIsModalOpen(false);
        fetchConnections();
        if (data.id) setSelectedConnId(data.id);
      } else {
        const errData = await res.json();
        setNotifyError(errData.detail || "Erro ao salvar conexão.");
      }
    } catch (err) {
      setNotifyError("Erro de comunicação com o servidor.");
    } finally {
      setIsSavingConn(false);
    }
  };

  const handleDeleteConnection = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Deseja realmente excluir esta conexão do SQL Server?")) return;
    setNotifyError("");
    setNotifySuccess("");
    try {
      const res = await apiClient(`/api/settings/sql-connections/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setNotifySuccess("Conexão removida com sucesso.");
        if (selectedConnId === id) {
          setSelectedConnId("");
          setSchemaText("");
          setMessages([]);
          setExecutionResult(null);
        }
        fetchConnections();
      }
    } catch (err) {
      setNotifyError("Erro ao deletar conexão.");
    }
  };

  const handleExtractSchema = async () => {
    if (!selectedConnId) return;
    setIsExtracting(true);
    setNotifyError("");
    setSchemaText("");
    setExecutionResult(null);
    try {
      const res = await apiClient(`/api/settings/sql-connections/${selectedConnId}/extract-schema`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setSchemaText(data.schema || "");
        setIsSchemaExpanded(true);
        setNotifySuccess("Esquema do banco extraído com sucesso!");
      } else {
        const errData = await res.json();
        setNotifyError(errData.detail || "Falha ao ler o banco de dados.");
      }
    } catch (err) {
      setNotifyError("Erro ao conectar com o banco de dados SQL Server.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    if (!schemaText) {
      // Just a warning to the user if they try to ask for queries without schema
      // We still allow the message to go through so they can chat.
      console.warn("Nenhum esquema extraído. A IA pode não conseguir gerar queries específicas.");
    }
    
    const newMessage: ChatMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...messages, newMessage];
    
    setMessages(updatedMessages);
    setChatInput("");
    setIsGenerating(true);
    setNotifyError("");
    
    try {
      const res = await apiClient("/api/query-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          schema: schemaText,
          provider: provider,
          model_name: modelName,
          api_key: apiKey || null,
          reasoning_level: reasoningLevel
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessages([...updatedMessages, { role: "assistant", content: data.response }]);
      } else {
        const errData = await res.json();
        setNotifyError(errData.detail || "Falha na geração da resposta.");
      }
    } catch (err) {
      setNotifyError("Erro ao chamar serviço de Inteligência Artificial.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteQuery = async (sql: string) => {
    if (!selectedConnId || !sql.trim()) return;
    setIsExecuting(true);
    setExecError("");
    setExecutionResult(null);
    setCurrentPage(1);
    
    setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);

    try {
      const res = await apiClient("/api/query-builder/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: selectedConnId,
          sql_query: sql.trim()
        })
      });
      if (res.ok) {
        const data = await res.json();
        setExecutionResult({
          columns: data.columns || [],
          rows: data.rows || []
        });
      } else {
        const errData = await res.json();
        setExecError(errData.detail || "Erro ao executar query.");
      }
    } catch (err) {
      setExecError("Erro ao conectar com o banco para execução.");
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSaveQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQueryName.trim() || !queryToSave.trim()) return;
    
    setIsSavingQuery(true);
    setNotifyError("");
    try {
      const res = await apiClient("/api/query-builder/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: selectedConnId,
          name: newQueryName.trim(),
          sql_query: queryToSave.trim()
        })
      });
      
      if (res.ok) {
        setNotifySuccess("Consulta salva com sucesso!");
        setIsSaveQueryModalOpen(false);
        setNewQueryName("");
        setQueryToSave("");
        fetchSavedQueries(selectedConnId);
      } else {
        const errData = await res.json();
        setNotifyError(errData.detail || "Erro ao salvar query.");
      }
    } catch (err) {
      setNotifyError("Erro de comunicação com o servidor.");
    } finally {
      setIsSavingQuery(false);
    }
  };

  const handleDeleteSavedQuery = async (queryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Deseja excluir esta query salva?")) return;
    
    try {
      const res = await apiClient(`/api/query-builder/saved/${queryId}`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        setNotifySuccess("Consulta excluída com sucesso.");
        fetchSavedQueries(selectedConnId);
      } else {
        const errData = await res.json();
        setNotifyError(errData.detail || "Erro ao excluir query.");
      }
    } catch (err) {
      setNotifyError("Erro de comunicação com o servidor.");
    }
  };

  const renderChatMessage = (msg: ChatMessage, msgIndex: number) => {
    if (msg.role === "user") {
      return (
        <div key={msgIndex} className="flex justify-end mb-4">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gax-blue text-white px-5 py-3 shadow-md shadow-gax-blue/20">
            <p className="text-[13px] font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          </div>
        </div>
      );
    }

    const parts = msg.content.split(/```(?:sql)?\n([\s\S]*?)```/i);
    
    return (
      <div key={msgIndex} className="flex justify-start mb-6">
        <div className="max-w-[95%] w-full rounded-3xl rounded-tl-sm border border-slate-200/60 bg-white shadow-xl shadow-slate-200/20 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
            <BrainCircuit size={16} className="text-gax-blue" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{modelName}</span>
          </div>
          
          <div className="p-5 text-[13px] font-medium text-slate-700 leading-relaxed">
            {parts.map((part, index) => {
              if (index % 2 === 0) {
                if (!part.trim()) return null;
                return <p key={index} className="whitespace-pre-wrap mb-4 last:mb-0">{part.trim()}</p>;
              } else {
                const sqlCode = part.trim();
                const blockId = `msg-${msgIndex}-code-${index}`;
                return (
                  <div key={index} className="my-4 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-inner">
                    <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700/50 gap-2">
                      <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-gax-blue-light" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">SQL Gerado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(sqlCode, blockId)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white transition-all text-[11px] font-bold"
                        >
                          {copiedIndex === blockId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          {copiedIndex === blockId ? "Copiado!" : "Copiar"}
                        </button>
                        <button
                          onClick={() => {
                            setQueryToSave(sqlCode);
                            setIsSaveQueryModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 hover:text-white transition-all text-[11px] font-bold"
                        >
                          <Save size={12} />
                          Salvar
                        </button>
                        <button
                          onClick={() => handleExecuteQuery(sqlCode)}
                          disabled={isExecuting}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all text-[11px] font-bold shadow-sm disabled:opacity-50"
                        >
                          {isExecuting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          Executar
                        </button>
                      </div>
                    </div>
                    <pre className="p-4 text-gax-blue-light font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {sqlCode}
                    </pre>
                  </div>
                );
              }
            })}
          </div>
        </div>
      </div>
    );
  };

  const selectedConn = connections.find(c => c.id === selectedConnId);
  const totalRows = executionResult?.rows.length || 0;
  const totalPages = Math.ceil(totalRows / itemsPerPage);
  const paginatedRows = (executionResult?.rows || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 pt-2 max-w-7xl mx-auto font-sans text-slate-900 pb-32">
      {notifySuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-xs font-bold shadow-sm transition-all animate-fadeIn">
          <Check size={18} />
          <div className="flex-1">{notifySuccess}</div>
          <button onClick={() => setNotifySuccess("")} className="hover:text-emerald-900"><X size={14} /></button>
        </div>
      )}
      {notifyError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-xs font-bold shadow-sm transition-all animate-fadeIn">
          <AlertCircle size={18} />
          <div className="flex-1">{notifyError}</div>
          <button onClick={() => setNotifyError("")} className="hover:text-rose-900"><X size={14} /></button>
        </div>
      )}

      {/* Grid Layout containing Server selector and LLM Settings */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* SQL Server Connection Selector card */}
        <div className="md:col-span-7 rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gax-blue/10 text-gax-blue shadow-inner">
                  <Database size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Conexão SQL Server</h2>
                  <p className="text-[11px] text-slate-400 font-medium">Selecione ou crie conexões de banco de dados</p>
                </div>
              </div>
              
              <button
                onClick={() => {
                  setConnForm({ id: "", name: "", host: "", database: "", username: "", password: "", port: 1433 });
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gax-blue/10 text-gax-blue hover:bg-gax-blue hover:text-white transition-all text-xs font-bold shadow-sm"
              >
                <Plus size={14} />
                Nova
              </button>
            </div>

            {isLoadingConns ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="animate-spin text-gax-blue" size={16} />
                <span className="text-xs text-slate-400 font-medium">Carregando servidores...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Servidores Ativos</label>
                <div className="flex gap-2">
                  <select
                    value={selectedConnId}
                    onChange={(e) => setSelectedConnId(e.target.value)}
                    className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-bold bg-white"
                  >
                    <option value="">Selecione um banco SQL Server...</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name === c.database ? `${c.database} (${c.host})` : `${c.name} (${c.host} - ${c.database})`}
                      </option>
                    ))}
                  </select>

                  {selectedConnId && (
                    <>
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.id === selectedConnId);
                          if (conn) {
                            setConnForm({
                              id: conn.id, name: conn.name || conn.database, host: conn.host, database: conn.database, username: conn.username, password: "********", port: conn.port
                            });
                            setIsModalOpen(true);
                          }
                        }}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all shadow-sm shrink-0 active:scale-95"
                        title="Editar Conexão"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteConnection(selectedConnId, e)}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm shrink-0 active:scale-95"
                        title="Excluir Conexão"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={() => setIsSavedQueriesModalOpen(true)}
                        className="flex items-center justify-center h-11 w-11 md:w-auto md:px-4 gap-1.5 rounded-2xl bg-slate-800 text-white hover:bg-slate-700 transition-all text-xs font-bold shadow-md shadow-slate-800/20 shrink-0"
                        title="Consultas Salvas"
                      >
                        <Bookmark size={14} />
                        <span className="hidden md:inline">Salvas ({savedQueries.length})</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          {selectedConn && (
            <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-200/50 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
              <span>Host: <strong className="text-slate-700">{selectedConn.host}:{selectedConn.port}</strong></span>
              <span>Banco: <strong className="text-slate-700">{selectedConn.database}</strong></span>
            </div>
          )}
        </div>

        {/* AI Motor Settings card */}
        <div className="md:col-span-5 rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gax-blue/10 text-gax-blue shadow-inner">
                <BrainCircuit size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Motor de Inteligência Artificial</h2>
                <p className="text-[11px] text-slate-400 font-medium">Selecione o provedor, modelo e raciocínio</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white p-1.5 shadow-sm mb-4 overflow-x-auto">
              <button
                onClick={() => { setProvider("gemini"); setModelName("gemini-3.5-flash"); }}
                className={cn("flex-1 min-w-[70px] flex h-9 items-center justify-center rounded-xl transition-all font-sans text-[11px] font-bold",
                  provider === "gemini" ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" : "text-slate-400 hover:bg-slate-50")}
              >Gemini</button>
              <button
                onClick={() => { setProvider("claude"); setModelName("Claude 3.5 Sonnet"); }}
                className={cn("flex-1 min-w-[70px] flex h-9 items-center justify-center rounded-xl transition-all font-sans text-[11px] font-bold",
                  provider === "claude" ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" : "text-slate-400 hover:bg-slate-50")}
              >Claude</button>
              <button
                onClick={() => { setProvider("openai"); setModelName("GPT-4o"); }}
                className={cn("flex-1 min-w-[70px] flex h-9 items-center justify-center rounded-xl transition-all font-sans text-[11px] font-bold",
                  provider === "openai" ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" : "text-slate-400 hover:bg-slate-50")}
              >OpenAI</button>
              <button
                onClick={() => { setProvider("deepseek"); setModelName("DeepSeek Chat (V3)"); }}
                className={cn("flex-1 min-w-[70px] flex h-9 items-center justify-center rounded-xl transition-all font-sans text-[11px] font-bold",
                  provider === "deepseek" ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20" : "text-slate-400 hover:bg-slate-50")}
              >DeepSeek</button>
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Modelo</label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-[11px] outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-bold bg-white"
                >
                  {provider === "gemini" && (
                    <>
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                      <option value="gemini-3.1-pro">Gemini 3.1 Pro</option>
                      <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                      <option value="gemini-3.0-flash">Gemini 3 Flash</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                      <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    </>
                  )}
                  {provider === "claude" && (
                    <>
                      <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
                      <option value="Claude 3 Opus">Claude 3 Opus</option>
                    </>
                  )}
                  {provider === "openai" && (
                    <>
                      <option value="GPT-4o">GPT-4o</option>
                      <option value="GPT-4o-mini">GPT-4o-mini</option>
                      <option value="o1">o1</option>
                      <option value="o1-mini">o1-mini</option>
                      <option value="o3-mini">o3-mini</option>
                    </>
                  )}
                  {provider === "deepseek" && (
                    <>
                      <option value="DeepSeek Chat (V3)">DeepSeek Chat (V3)</option>
                      <option value="DeepSeek Reasoner (R1)">DeepSeek Reasoner (R1)</option>
                    </>
                  )}
                </select>
              </div>
              
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Raciocínio</label>
                <select
                  value={reasoningLevel}
                  onChange={(e) => setReasoningLevel(e.target.value as any)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-[11px] outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-bold bg-white"
                >
                  <option value="standard">Padrão</option>
                  <option value="extended">Avançado (Alto Esforço)</option>
                </select>
              </div>
            </div>
        </div>
      </div>

      {/* Schema Extraction Area */}
      {selectedConnId && !schemaText && (
        <div className="rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-8 shadow-xl shadow-slate-200/20 text-center flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gax-blue/10 text-gax-blue mb-2">
            <Database size={32} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Extração de Esquema Necessária</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 max-w-md mx-auto">
              Para que a Inteligência Artificial possa gerar queries precisas e conversar com o contexto correto, precisamos mapear as tabelas e colunas do seu banco de dados.
            </p>
          </div>
          <button
            onClick={handleExtractSchema}
            disabled={isExtracting}
            className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gax-blue text-white hover:bg-gax-blue-hover transition-all text-sm font-bold shadow-lg shadow-gax-blue/30 disabled:opacity-50 mt-2"
          >
            {isExtracting ? (
              <><Loader2 size={18} className="animate-spin" /> Conectando e Mapeando...</>
            ) : (
              <><Sparkles size={18} /> Iniciar Mapeamento do Banco</>
            )}
          </button>
        </div>
      )}

      {/* Chat UI */}
      {schemaText && (
        <div className="flex flex-col rounded-3xl border border-slate-200/60 bg-slate-50/50 backdrop-blur-sm shadow-xl shadow-slate-200/20 overflow-hidden h-[600px]">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gax-blue/10 text-gax-blue">
                <MessageSquare size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Assistente DBA</h3>
                <p className="text-[11px] font-medium text-slate-400">Converse com a IA para gerar queries ou tirar dúvidas.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if(confirm("Deseja realmente limpar o histórico do chat?")) {
                    setMessages([]);
                    setExecutionResult(null);
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-500 hover:bg-rose-50 transition-all"
              >
                Limpar Chat
              </button>
              <button
                onClick={() => setIsSchemaExpanded(!isSchemaExpanded)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all"
              >
                <FileCode2 size={14} />
                Esquema DDL
                {isSchemaExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {/* Expanded Schema */}
          {isSchemaExpanded && (
            <div className="p-4 border-b border-slate-200 bg-slate-100/50">
              <pre className="max-h-[150px] overflow-y-auto text-[10px] font-mono text-slate-600 whitespace-pre bg-white p-4 rounded-xl border border-slate-200 shadow-inner">
                {schemaText}
              </pre>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                <BrainCircuit size={48} className="text-gax-blue mb-4 opacity-50" />
                <p className="text-sm font-bold text-slate-600">Esquema mapeado com sucesso!</p>
                <p className="text-xs font-medium text-slate-400 mt-2 max-w-sm">
                  Descreva o que você deseja buscar no banco de dados. Ex: "Busque os 10 clientes mais recentes cadastrados."
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg, idx) => renderChatMessage(msg, idx))}
                {isGenerating && (
                  <div className="flex justify-start mb-6">
                    <div className="rounded-3xl rounded-tl-sm border border-slate-200/60 bg-white shadow-md p-4 flex items-center gap-3 text-slate-500">
                      <Loader2 size={16} className="animate-spin text-gax-blue" />
                      <span className="text-xs font-bold">A IA está processando sua solicitação...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-200/60">
            <div className="relative">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Escreva sua instrução ou pergunta (Shift+Enter para pular linha)..."
                className="w-full min-h-[60px] max-h-[150px] rounded-2xl border border-slate-200 pl-4 pr-14 py-4 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium placeholder:text-slate-300 resize-none shadow-sm"
                rows={1}
              />
              <button
                onClick={handleSendMessage}
                disabled={isGenerating || !chatInput.trim()}
                className="absolute right-3 bottom-3 p-2.5 rounded-xl bg-gax-blue text-white hover:bg-gax-blue-hover transition-all shadow-md disabled:opacity-40 disabled:hover:bg-gax-blue"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-2 flex items-center gap-1.5 justify-center">
              <Info size={12} className="text-gax-blue" />
              Regras de segurança bloqueiam queries destrutivas (DML/DDL). Apenas SELECTs são permitidos.
            </p>
          </div>
        </div>
      )}

      {/* Database Execution Error Banners */}
      {execError && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-xs font-bold shadow-sm transition-all animate-fadeIn">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-black text-rose-800 uppercase tracking-wide mb-1">Erro de Execução SQL</h4>
            <p className="font-medium text-rose-600 leading-normal">{execError}</p>
          </div>
        </div>
      )}

      {/* Query Execution Result Grid/Table */}
      {executionResult && (
        <div className="rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gax-blue/10 text-gax-blue">
                <Database size={18} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Resultados da Execução</h3>
                <p className="text-xs font-bold text-slate-600">Mostrando registros retornados do SQL Server (Limite: 100 registros)</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              {totalRows} registros encontrados
            </span>
          </div>

          {totalRows === 0 ? (
            <div className="py-12 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-center bg-white">
              <Database size={24} className="text-slate-300 animate-pulse" />
              <p className="text-xs font-bold text-slate-400">Nenhum resultado retornado para esta consulta.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-sans text-slate-700">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 whitespace-nowrap">
                        {executionResult.columns.map((col, idx) => (
                          <th key={idx} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/50 transition-all duration-150">
                          {executionResult.columns.map((col, cIdx) => (
                            <td key={cIdx} className="px-4 py-3 font-medium text-slate-600 truncate max-w-[200px]" title={String(row[col] ?? "")}>
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : <em className="text-slate-300 font-normal">NULL</em>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
                  <span className="text-[11px] font-medium text-slate-400">Página {currentPage} de {totalPages}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none shrink-0"><ChevronLeft size={16} /></button>
                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none shrink-0"><ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal - Conexão SQL */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={20} className="text-gax-blue animate-pulse" />
                <h3 className="text-lg font-bold text-slate-800">
                  {connForm.id ? "Editar Conexão SQL Server" : "Nova Conexão SQL Server"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveConnection} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Host / IP</label>
                  <input
                    type="text"
                    placeholder="192.168.0.1 ou server.local"
                    value={connForm.host}
                    onChange={(e) => setConnForm({ ...connForm, host: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Porta</label>
                  <input
                    type="number"
                    placeholder="1433"
                    value={connForm.port || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setConnForm({ ...connForm, port: val === "" ? "" as any : parseInt(val) || 0 });
                    }}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Banco de Dados</label>
                <input
                  type="text"
                  placeholder="Nome da database"
                  value={connForm.database}
                  onChange={(e) => setConnForm({ ...connForm, database: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usuário</label>
                <input
                  type="text"
                  placeholder="SQL Login username"
                  value={connForm.username}
                  onChange={(e) => setConnForm({ ...connForm, username: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Senha</label>
                <input
                  type="password"
                  placeholder="Password"
                  value={connForm.password}
                  onChange={(e) => setConnForm({ ...connForm, password: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium"
                  required
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingConn}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gax-blue text-white hover:bg-gax-blue-hover transition-all text-xs font-bold shadow-md shadow-gax-blue/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingConn && <Loader2 size={14} className="animate-spin" />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Modal - Consultas Salvas */}
      {isSavedQueriesModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setIsSavedQueriesModalOpen(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-white shadow-md">
                  <Bookmark size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Consultas Salvas (Globais)</h3>
                  <p className="text-[11px] font-medium text-slate-500">Banco: {selectedConn?.database}</p>
                </div>
              </div>
              <button onClick={() => setIsSavedQueriesModalOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              {isLoadingSaved ? (
                <div className="flex justify-center p-12"><Loader2 size={32} className="animate-spin text-gax-blue" /></div>
              ) : savedQueries.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-12">
                  <Bookmark size={48} className="text-slate-200 mb-4" />
                  <p className="text-sm font-bold text-slate-400">Nenhuma consulta salva para este banco de dados.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {savedQueries.map(q => (
                    <div key={q.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">{q.name}</h4>
                          <p className="text-[10px] font-medium text-slate-400">Criado por: {q.created_by} em {new Date(q.created_at).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}).replace(',', ' as')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              handleExecuteQuery(q.sql_query);
                              setIsSavedQueriesModalOpen(false);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all text-[11px] font-bold shadow-sm"
                          >
                            <Play size={12} /> Executar
                          </button>
                          {currentUserEmail === q.created_by && (
                            <button
                              onClick={(e) => handleDeleteSavedQuery(q.id, e)}
                              className="flex items-center justify-center h-8 w-8 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                              title="Excluir (apenas criador)"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <pre className="p-3 bg-slate-900 text-gax-blue-light font-mono text-[10px] rounded-xl overflow-x-auto whitespace-pre-wrap max-h-32 shadow-inner">
                        {q.sql_query}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal - Salvar Query */}
      {isSaveQueryModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setIsSaveQueryModalOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Save size={20} className="text-gax-blue" />
                Salvar Consulta
              </h3>
              <button onClick={() => setIsSaveQueryModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveQuerySubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nome da Consulta</label>
                <input
                  type="text"
                  placeholder="Ex: Faturamento Mensal por Cliente"
                  value={newQueryName}
                  onChange={(e) => setNewQueryName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-bold"
                  required
                  autoFocus
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsSaveQueryModalOpen(false)} className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all text-xs font-bold">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingQuery || !newQueryName.trim()} className="flex-1 px-4 py-3 rounded-2xl bg-gax-blue text-white hover:bg-gax-blue-hover transition-all text-xs font-bold shadow-md shadow-gax-blue/20 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSavingQuery && <Loader2 size={14} className="animate-spin" />}
                  Salvar Query
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
