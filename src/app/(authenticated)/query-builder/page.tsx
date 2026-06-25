"use client";

import React, { useState, useEffect } from "react";
import {
  Wrench,
  Database,
  Plus,
  BrainCircuit,
  Terminal,
  Play,
  Copy,
  Check,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  Info,
  Server,
  Key,
  X,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  Pencil
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

export default function QueryBuilderPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [isLoadingConns, setIsLoadingConns] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Connection Form State
  const [connForm, setConnForm] = useState({
    id: "",
    name: "",
    host: "",
    database: "",
    username: "",
    password: "",
    port: 1433
  });
  const [isSavingConn, setIsSavingConn] = useState(false);

  // IA Configuration State
  const [provider, setProvider] = useState<"gemini" | "claude">("gemini");
  const [modelName, setModelName] = useState<string>("Gemini 3.5 Flash");
  const [apiKey, setApiKey] = useState<string>("");
  const [reasoningLevel, setReasoningLevel] = useState<"standard" | "extended">("standard");

  // Extracted Schema State
  const [schemaText, setSchemaText] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSchemaExpanded, setIsSchemaExpanded] = useState(false);

  // Query Generation State
  const [prompt, setPrompt] = useState("");
  const [generatedSql, setGeneratedSql] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Execution Results State
  const [executionResult, setExecutionResult] = useState<{ columns: string[]; rows: any[] } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [execError, setExecError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // General Notification Banners
  const [notifySuccess, setNotifySuccess] = useState("");
  const [notifyError, setNotifyError] = useState("");

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

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    fetchConnections();
  }, []);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConn(true);
    setNotifyError("");
    setNotifySuccess("");
    try {
      // Map name to database, since we removed the first option
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
        setConnForm({ id: "", name: "", host: "", database: "", username: "", password: "", port: 1433 });
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

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setConnForm({ id: "", name: "", host: "", database: "", username: "", password: "", port: 1433 });
  };

  const handleEditConnectionClick = () => {
    const conn = connections.find(c => c.id === selectedConnId);
    if (!conn) return;
    setConnForm({
      id: conn.id,
      name: conn.name || conn.database,
      host: conn.host,
      database: conn.database,
      username: conn.username,
      password: "********", // Use masked password so backend knows to keep the old one unless changed
      port: conn.port
    });
    setIsModalOpen(true);
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
          setGeneratedSql("");
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

  const handleGenerateSql = async () => {
    if (!schemaText || !prompt.trim()) return;
    setIsGenerating(true);
    setGeneratedSql("");
    setExecutionResult(null);
    setExecError("");
    try {
      const res = await apiClient("/api/query-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          schema: schemaText,
          provider: provider,
          model_name: modelName,
          api_key: apiKey || null,
          reasoning_level: reasoningLevel
        })
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedSql(data.sql || "");
      } else {
        const errData = await res.json();
        setNotifyError(errData.detail || "Falha na geração do SQL.");
      }
    } catch (err) {
      setNotifyError("Erro ao chamar serviço de Inteligência Artificial.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteQuery = async () => {
    if (!selectedConnId || !generatedSql) return;
    setIsExecuting(true);
    setExecError("");
    setExecutionResult(null);
    setCurrentPage(1);
    try {
      const res = await apiClient("/api/query-builder/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: selectedConnId,
          sql_query: generatedSql
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

  const copyToClipboard = () => {
    if (!generatedSql) return;
    navigator.clipboard.writeText(generatedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keep model selections synchronized with provider
  const handleProviderChange = (p: "gemini" | "claude") => {
    setProvider(p);
    if (p === "gemini") {
      setModelName("Gemini 3.5 Flash");
    } else {
      setModelName("Claude Sonnet");
    }
  };

  const selectedConn = connections.find(c => c.id === selectedConnId);

  // Pagination for Results
  const totalRows = executionResult?.rows.length || 0;
  const totalPages = Math.ceil(totalRows / itemsPerPage);
  const paginatedRows = (executionResult?.rows || []).slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 pt-2 max-w-7xl mx-auto font-sans text-slate-900">
      
      {/* Alert Notifications */}
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
                Nova Conexão
              </button>
            </div>

            {isLoadingConns ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="animate-spin text-gax-blue" size={16} />
                <span className="text-xs text-slate-400 font-medium">Carregando servidores...</span>
              </div>
            ) : connections.length === 0 ? (
              <div className="py-6 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-center">
                <Server size={24} className="text-slate-300" />
                <p className="text-xs font-bold text-slate-400">Nenhuma conexão cadastrada.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Servidores Ativos</label>
                <div className="flex gap-2">
                  <select
                    value={selectedConnId}
                    onChange={(e) => {
                      setSelectedConnId(e.target.value);
                      setSchemaText("");
                      setGeneratedSql("");
                      setExecutionResult(null);
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-bold bg-white"
                  >
                    <option value="">Selecione um banco SQL Server...</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name === c.database ? `${c.database} (${c.host})` : `${c.name} (${c.host} - {c.database})`}
                      </option>
                    ))}
                  </select>

                  {selectedConnId && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleEditConnectionClick}
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
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedConn && (
            <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-200/50 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
              <span>Host: <strong className="text-slate-700">{selectedConn.host}:{selectedConn.port}</strong></span>
              <span>Banco: <strong className="text-slate-700">{selectedConn.database}</strong></span>
              <span>Usuário: <strong className="text-slate-700">{selectedConn.username}</strong></span>
            </div>
          )}
        </div>

        {/* AI Motor Settings card */}
        <div className="md:col-span-5 rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gax-blue/10 text-gax-blue shadow-inner">
                <BrainCircuit size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Motor de Inteligência Artificial</h2>
                <p className="text-[11px] text-slate-400 font-medium">Selecione o provedor e modelo LLM</p>
              </div>
            </div>

            {/* Provider Tabs */}
            <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white p-1.5 shadow-sm mb-4">
              <button
                onClick={() => handleProviderChange("gemini")}
                className={cn(
                  "flex-1 flex h-9 items-center justify-center rounded-xl transition-all font-sans text-xs font-bold",
                  provider === "gemini"
                    ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                )}
              >
                Gemini (Padrão)
              </button>
              <button
                onClick={() => handleProviderChange("claude")}
                className={cn(
                  "flex-1 flex h-9 items-center justify-center rounded-xl transition-all font-sans text-xs font-bold",
                  provider === "claude"
                    ? "bg-gax-blue text-white shadow-md shadow-gax-blue/20"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                )}
              >
                Claude
              </button>
            </div>

            {/* Model list based on provider */}
            <div className="flex flex-wrap gap-2 mb-4">
              {provider === "gemini" ? (
                <>
                  <button
                    onClick={() => setModelName("Gemini 3.5 Flash")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
                      modelName === "Gemini 3.5 Flash"
                        ? "bg-gax-blue-light border-gax-blue/30 text-gax-blue"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    Gemini 3.5 Flash
                  </button>
                  <button
                    onClick={() => setModelName("Gemini 3.1 Pro")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
                      modelName === "Gemini 3.1 Pro"
                        ? "bg-gax-blue-light border-gax-blue/30 text-gax-blue"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    Gemini 3.1 Pro
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setModelName("Claude Sonnet")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
                      modelName === "Claude Sonnet"
                        ? "bg-gax-blue-light border-gax-blue/30 text-gax-blue"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    Claude Sonnet
                  </button>
                  <button
                    onClick={() => setModelName("Claude Opus 4.8")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
                      modelName === "Claude Opus 4.8"
                        ? "bg-gax-blue-light border-gax-blue/30 text-gax-blue"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    Claude Opus 4.8
                  </button>
                </>
              )}
            </div>

            {/* Reasoning Level Selector (Gemini only) */}
            {provider === "gemini" && (
              <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nível de Raciocínio</label>
                <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white p-1.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setReasoningLevel("standard")}
                    className={cn(
                      "flex-1 flex h-9 items-center justify-center rounded-xl transition-all font-sans text-xs font-bold",
                      reasoningLevel === "standard"
                        ? "bg-slate-100 text-slate-700 shadow-inner"
                        : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    )}
                  >
                    Padrão
                  </button>
                  <button
                    type="button"
                    onClick={() => setReasoningLevel("extended")}
                    className={cn(
                      "flex-1 flex h-9 items-center justify-center rounded-xl transition-all font-sans text-xs font-bold",
                      reasoningLevel === "extended"
                        ? "bg-slate-100 text-slate-700 shadow-inner"
                        : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    )}
                  >
                    Estendido (Thinking)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* API Key input */}
          <div className="relative group w-full">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-gax-blue transition-colors" size={16} />
            <input
              type="password"
              placeholder="Chave de API (Opcional - usa do servidor se vazia)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-2xl border border-slate-200/60 bg-white px-11 py-3 text-xs text-slate-700 outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-medium placeholder:text-slate-300"
            />
          </div>
        </div>

      </div>

      {/* Database Schema Extraction Area */}
      {selectedConnId && (
        <div className="rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gax-blue/10 text-gax-blue">
                <Database size={18} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Estrutura de Tabelas</h3>
                <p className="text-xs font-bold text-slate-600">Esquema DDL extraído das tabelas (dbo)</p>
              </div>
            </div>

            <button
              onClick={handleExtractSchema}
              disabled={isExtracting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gax-blue text-white hover:bg-gax-blue-hover transition-all text-xs font-bold shadow-md shadow-gax-blue/20 disabled:opacity-50"
            >
              {isExtracting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Conectando e Lendo Banco...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Conectar e Ler Banco
                </>
              )}
            </button>
          </div>

          {schemaText && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden mt-4 bg-slate-50/50">
              <button
                onClick={() => setIsSchemaExpanded(!isSchemaExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-100/50 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
              >
                <div className="flex items-center gap-2">
                  <FileCode2 size={16} className="text-slate-400" />
                  <span>DDL do Banco ({schemaText.split("CREATE TABLE").length - 1} tabelas mapeadas)</span>
                </div>
                {isSchemaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {isSchemaExpanded && (
                <div className="p-4 border-t border-slate-200">
                  <pre className="max-h-[250px] overflow-y-auto text-[10px] font-mono text-slate-600 whitespace-pre bg-white p-4 rounded-xl border border-slate-100 shadow-inner">
                    {schemaText}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Query generation Prompt box */}
      {schemaText && (
        <div className="rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gax-blue/10 text-gax-blue">
              <BrainCircuit size={18} />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Escreva sua pergunta</h3>
              <p className="text-xs font-bold text-slate-600">A Inteligência Artificial traduzirá para SQL Server (T-SQL)</p>
            </div>
          </div>

          <textarea
            placeholder='Ex: "Busque os 10 clientes que mais possuem ABIs processados com sucesso no último mês agrupados por nome e CNPJ"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full min-h-[100px] rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-gax-blue focus:ring-4 focus:ring-gax-blue/10 transition-all font-sans text-slate-700 font-medium placeholder:text-slate-300"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
              <Info size={14} className="text-gax-blue" />
              <span>Garante segurança restrita a queries SELECT apenas (Bloqueio de escrita DML/DDL)</span>
            </div>

            <button
              onClick={handleGenerateSql}
              disabled={isGenerating || !prompt.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gax-blue text-white hover:bg-gax-blue-hover transition-all text-xs font-bold shadow-md shadow-gax-blue/20 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Gerando SQL...
                </>
              ) : (
                <>
                  <BrainCircuit size={14} />
                  Gerar Query SQL
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* SQL Output and Execute query controls */}
      {generatedSql && (
        <div className="rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-xl shadow-slate-200/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gax-blue/10 text-gax-blue">
                <Terminal size={18} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Query SQL Gerada</h3>
                <p className="text-xs font-bold text-slate-600">Código gerado pelo {modelName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/60 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all text-xs font-bold"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-500" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copiar
                  </>
                )}
              </button>

              <button
                onClick={handleExecuteQuery}
                disabled={isExecuting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all text-xs font-bold shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {isExecuting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Executar Query
              </button>
            </div>
          </div>

          <pre className="p-4 bg-slate-900 text-gax-blue-light font-mono text-xs rounded-2xl border border-slate-800 shadow-inner overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {generatedSql}
          </pre>
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

              {/* Pagination controls for SQL results */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
                  <span className="text-[11px] font-medium text-slate-400">
                    Página {currentPage} de {totalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none shrink-0"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all outline-none shrink-0"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal - Cadastrar Nova Conexão SQL Server */}
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
                onClick={handleCloseModal}
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
                  onClick={handleCloseModal}
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

    </div>
  );
}
