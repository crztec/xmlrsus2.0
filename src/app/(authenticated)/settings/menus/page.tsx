"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CloudUpload,
  FileText,
  ClipboardList,
  Users,
  UserPlus,
  Settings,
  Puzzle,
  Shield,
  Palette,
  ScrollText,
  Lock,
  LayoutDashboard,
  LayoutGrid,
  GripVertical,
  Pencil,
  Check,
  X,
  Loader2,
  RotateCcw,
  Save,
  Star,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ReactNode> = {
  CloudUpload: <CloudUpload size={16} />,
  FileText: <FileText size={16} />,
  ClipboardList: <ClipboardList size={16} />,
  Users: <Users size={16} />,
  UserPlus: <UserPlus size={16} />,
  Settings: <Settings size={16} />,
  Puzzle: <Puzzle size={16} />,
  Shield: <Shield size={16} />,
  Palette: <Palette size={16} />,
  ScrollText: <ScrollText size={16} />,
  Lock: <Lock size={16} />,
  LayoutDashboard: <LayoutDashboard size={16} />,
  LayoutGrid: <LayoutGrid size={16} />,
};

const HARDCODED_DEFAULTS = {
  main_menu: [
    { key: "dashboard", label: "Enviar ABIs", icon: "CloudUpload", order: 0 },
    { key: "xml-data", label: "Dados ABIs", icon: "FileText", order: 1 },
    { key: "check-imports", label: "Checar Importações", icon: "Shield", order: 2 },
    { key: "logs", label: "Histórico de Importações", icon: "ClipboardList", order: 3 },
    { key: "api-checks", label: "Checar APIs", icon: "Puzzle", order: 4 },
  ],
  admin_menu: [
    { key: "clients", label: "Clientes", icon: "Users", order: 0, isAdmin: true },
    { key: "users", label: "Usuários", icon: "Users", order: 1, isAdmin: true },
    { key: "groups", label: "Grupos", icon: "LayoutDashboard", order: 2, isAdmin: true },
    { key: "pending", label: "Pendentes", icon: "UserPlus", order: 3, isAdmin: true },
  ],
  config_menu: [
    { key: "integrations", label: "Integrações", icon: "Puzzle", order: 0, isAdmin: true },
    { key: "audit", label: "Logs do Sistema", icon: "ScrollText", order: 1, isAdmin: true },
    { key: "access-control", label: "Controle de Acessos", icon: "Lock", order: 2, isAdmin: true },
    { key: "messages", label: "Mensagens", icon: "FileText", order: 3, isAdmin: true },
    { key: "branding", label: "Identidade Visual", icon: "Palette", order: 4, isAdmin: true },
    { key: "menus", label: "Gerenciar Menus", icon: "LayoutGrid", order: 5, isAdmin: true },
  ],
  section_labels: {
    main_title: "Importação",
    admin_title: "Administração",
    config_title: "Configuração",
  },
};

interface MenuItem {
  key: string;
  label: string;
  icon: string;
  order: number;
  isAdmin?: boolean;
}

interface MenuConfig {
  main_menu: MenuItem[];
  admin_menu: MenuItem[];
  config_menu: MenuItem[];
  section_labels: {
    main_title: string;
    admin_title: string;
    config_title: string;
  };
}

export default function MenusPage() {
  const [config, setConfig] = useState<MenuConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
  const [sectionEditValue, setSectionEditValue] = useState("");

  // Drag state
  const [dragSource, setDragSource] = useState<{ section: string; index: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ section: string; index: number } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage("");
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setSuccessMessage("");
    setTimeout(() => setErrorMessage(""), 5000);
  };

  const normalize = (data: any): MenuConfig => {
    const sort = (items: any[]) => [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
    return {
      main_menu: sort(Array.isArray(data.main_menu) && data.main_menu.length > 0 ? data.main_menu : HARDCODED_DEFAULTS.main_menu),
      admin_menu: sort(Array.isArray(data.admin_menu) && data.admin_menu.length > 0 ? data.admin_menu : HARDCODED_DEFAULTS.admin_menu),
      config_menu: sort(Array.isArray(data.config_menu) && data.config_menu.length > 0 ? data.config_menu : HARDCODED_DEFAULTS.config_menu),
      section_labels: { ...HARDCODED_DEFAULTS.section_labels, ...(data.section_labels || {}) },
    };
  };

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/menu-config");
      const data = await res.json();
      delete data.updated_at;
      delete data.saved_as_default_at;
      setConfig(normalize(data));
      setHasChanges(false);
    } catch {
      showError("Erro ao carregar configuração de menus.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") { window.location.href = "/dashboard"; return; }
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (editingKey && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingKey]);

  // --- Drag & Drop ---
  const handleDragStart = (section: string, index: number) => setDragSource({ section, index });
  const handleDragOver = (e: React.DragEvent, section: string, index: number) => {
    e.preventDefault();
    if (dragSource?.section === section) setDragOverTarget({ section, index });
  };
  const handleDrop = (e: React.DragEvent, section: string, index: number) => {
    e.preventDefault();
    if (!dragSource || !config || dragSource.section !== section) return;
    const sectionKey = section as "main_menu" | "admin_menu" | "config_menu";
    const items = [...config[sectionKey]];
    const [removed] = items.splice(dragSource.index, 1);
    items.splice(index, 0, removed);
    setConfig({ ...config, [sectionKey]: items.map((item, i) => ({ ...item, order: i })) });
    setHasChanges(true);
    setDragSource(null);
    setDragOverTarget(null);
  };
  const handleDragEnd = () => { setDragSource(null); setDragOverTarget(null); };

  // --- Move Up/Down ---
  const moveItem = (sectionKey: "main_menu" | "admin_menu" | "config_menu", index: number, direction: -1 | 1) => {
    if (!config) return;
    const items = [...config[sectionKey]];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    setConfig({ ...config, [sectionKey]: items.map((item, i) => ({ ...item, order: i })) });
    setHasChanges(true);
  };

  // --- Inline Editing ---
  const handleEditStart = (key: string, label: string) => { setEditingKey(key); setEditValue(label); };
  const handleEditSave = () => {
    if (!config || !editingKey) return;
    const update = (items: MenuItem[]) => items.map(item => item.key === editingKey ? { ...item, label: editValue.trim() || item.label } : item);
    setConfig({ ...config, main_menu: update(config.main_menu), admin_menu: update(config.admin_menu), config_menu: update(config.config_menu) });
    setHasChanges(true);
    setEditingKey(null);
  };
  const handleEditCancel = () => { setEditingKey(null); setEditValue(""); };

  // --- Section Title Editing ---
  const handleSectionEditStart = (key: string, label: string) => { setEditingSectionKey(key); setSectionEditValue(label); };
  const handleSectionEditSave = () => {
    if (!config || !editingSectionKey) return;
    setConfig({
      ...config,
      section_labels: { ...config.section_labels, [editingSectionKey]: sectionEditValue.trim() || config.section_labels[editingSectionKey as keyof typeof config.section_labels] },
    });
    setHasChanges(true);
    setEditingSectionKey(null);
  };
  const handleSectionEditCancel = () => { setEditingSectionKey(null); setSectionEditValue(""); };

  // --- Save / Default / Restore ---
  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/menu-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      if (res.ok) { 
        showSuccess("Configuração salva com sucesso!"); 
        setHasChanges(false); 
      } else {
        const errorData = await res.json().catch(() => ({}));
        showError(errorData.detail || "Erro ao salvar configuração de menus.");
      }
    } catch { showError("Erro de conexão."); }
    finally { setIsSaving(false); }
  };

  const handleSaveDefault = async () => {
    if (!config || !confirm("Deseja salvar a configuração atual como o novo padrão do sistema?")) return;
    setIsSavingDefault(true);
    try {
      await fetch("/api/menu-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const res = await fetch("/api/menu-config/set-default", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      if (res.ok) { showSuccess("Configuração salva como padrão!"); setHasChanges(false); }
      else showError("Erro ao salvar padrão.");
    } catch { showError("Erro de conexão."); }
    finally { setIsSavingDefault(false); }
  };

  const handleRestore = async () => {
    if (!confirm("Restaurar menus ao padrão? Alterações não salvas serão perdidas.")) return;
    setIsRestoring(true);
    try {
      const res = await fetch("/api/menu-config/restore-default", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (res.ok) { showSuccess("Menus restaurados!"); await fetchConfig(); }
      else showError("Erro ao restaurar.");
    } catch { showError("Erro de conexão."); }
    finally { setIsRestoring(false); }
  };

  if (isLoading || !config) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-gax-blue" size={48} />
        <p className="text-sm font-medium text-slate-400">Carregando configuração de menus...</p>
      </div>
    );
  }

  const sections: { key: "main_menu" | "admin_menu" | "config_menu"; titleKey: "main_title" | "admin_title" | "config_title"; items: MenuItem[] }[] = [
    { key: "main_menu", titleKey: "main_title", items: config.main_menu },
    { key: "admin_menu", titleKey: "admin_title", items: config.admin_menu },
    { key: "config_menu", titleKey: "config_title", items: config.config_menu },
  ];

  return (
    <div className="flex flex-col gap-5 p-8 pt-2 max-w-3xl mx-auto animate-in fade-in duration-500">
      {/* Feedback Messages */}
      {successMessage && (
        <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-top-2 duration-300">
          ✓ {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="text-[11px] font-bold text-rose-600 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 animate-in fade-in slide-in-from-top-2 duration-300">
          {errorMessage}
        </div>
      )}

      {/* Vertical List */}
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        {sections.map((section, sIdx) => {
          const sectionLabel = config.section_labels[section.titleKey];
          const isEditingSection = editingSectionKey === section.titleKey;
          const sortedItems = section.items; // Already sorted in state

          return (
            <React.Fragment key={section.key}>
              {/* Section Separator */}
              {sIdx > 0 && <div className="h-px bg-slate-100" />}

              {/* Section Title Row */}
              <div className="flex items-center justify-between px-6 py-3 bg-slate-50/50">
                {isEditingSection ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={sectionEditValue}
                      onChange={(e) => setSectionEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSectionEditSave(); if (e.key === "Escape") handleSectionEditCancel(); }}
                      className="flex-1 max-w-xs rounded-lg border border-gax-blue/30 bg-white px-3 py-1 text-xs font-black uppercase tracking-widest text-slate-700 outline-none focus:ring-2 focus:ring-gax-blue/10"
                      autoFocus
                    />
                    <button onClick={handleSectionEditSave} className="flex h-6 w-6 items-center justify-center rounded-md bg-gax-blue text-white hover:bg-gax-blue-hover transition-all"><Check size={10} /></button>
                    <button onClick={handleSectionEditCancel} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-200 text-slate-500 hover:bg-slate-300 transition-all"><X size={10} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSectionEditStart(section.titleKey, sectionLabel)}
                    className="flex items-center gap-2 group"
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{sectionLabel}</span>
                    <Pencil size={9} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                <span className="text-[9px] font-bold text-slate-300">{sortedItems.length} itens</span>
              </div>

              {/* Menu Items */}
              {sortedItems.map((item, idx) => {
                const isEditing = editingKey === item.key;
                const isDragOver = dragOverTarget?.section === section.key && dragOverTarget?.index === idx;

                return (
                  <div
                    key={item.key}
                    draggable={!isEditing}
                    onDragStart={() => handleDragStart(section.key, idx)}
                    onDragOver={(e) => handleDragOver(e, section.key, idx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, section.key, idx)}
                    className={cn(
                      "flex items-center gap-3 px-6 py-2.5 border-t border-slate-100/60 transition-all group cursor-grab active:cursor-grabbing",
                      isDragOver && "bg-gax-blue/5 border-l-2 border-l-gax-blue",
                      !isDragOver && "hover:bg-slate-50/50"
                    )}
                  >
                    {/* Drag Handle */}
                    <div className="text-slate-200 group-hover:text-slate-400 transition-colors shrink-0">
                      <GripVertical size={14} />
                    </div>

                    {/* Up/Down Arrows */}
                    <div className="flex flex-col shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveItem(section.key, idx, -1); }}
                        disabled={idx === 0}
                        className="text-slate-300 hover:text-gax-blue disabled:opacity-20 transition-colors p-0.5"
                        title="Mover para cima"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveItem(section.key, idx, 1); }}
                        disabled={idx === sortedItems.length - 1}
                        className="text-slate-300 hover:text-gax-blue disabled:opacity-20 transition-colors p-0.5"
                        title="Mover para baixo"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>

                    {/* Icon */}
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400 shrink-0 border border-slate-100">
                      {ICON_MAP[item.icon] || <Settings size={16} />}
                    </div>

                    {/* Label */}
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") handleEditCancel(); }}
                          className="flex-1 rounded-lg border border-gax-blue/30 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-gax-blue/10"
                        />
                        <button onClick={handleEditSave} className="flex h-6 w-6 items-center justify-center rounded-md bg-gax-blue text-white hover:bg-gax-blue-hover transition-all"><Check size={10} /></button>
                        <button onClick={handleEditCancel} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-200 text-slate-500 hover:bg-slate-300 transition-all"><X size={10} /></button>
                      </div>
                    ) : (
                      <span className="flex-1 text-xs font-semibold text-slate-600">{item.label}</span>
                    )}

                    {/* Admin Badge */}
                    {item.isAdmin && (
                      <span className="text-[7px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 shrink-0">
                        Admin
                      </span>
                    )}

                    {/* Edit Button */}
                    {!isEditing && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditStart(item.key, item.label); }}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-gax-blue transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        title="Renomear"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
              </React.Fragment>
            );
          })}

          {/* Action Bar (integrated at bottom of card) */}
          <div className="flex items-center justify-end gap-3 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100 px-6 py-4">
            {hasChanges && (
              <div className="flex items-center gap-1.5 mr-auto">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-bold text-amber-600">Alterações não salvas</span>
              </div>
            )}

            <button
              onClick={handleRestore}
              disabled={isRestoring}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-95"
            >
              {isRestoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Restaurar Padrão
            </button>

            <button
              onClick={handleSaveDefault}
              disabled={isSavingDefault || !hasChanges}
              className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[10px] font-bold text-amber-600 hover:bg-amber-100 transition-all disabled:opacity-50 active:scale-95"
            >
              {isSavingDefault ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
              Salvar como Padrão
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex items-center gap-1.5 rounded-xl bg-gax-blue px-5 py-2 text-[10px] font-bold text-white shadow-lg shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50 active:scale-95"
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    );
}
