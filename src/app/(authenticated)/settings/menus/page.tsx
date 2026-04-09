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
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icon registry — maps string keys to Lucide components
const ICON_MAP: Record<string, React.ReactNode> = {
  CloudUpload: <CloudUpload size={18} />,
  FileText: <FileText size={18} />,
  ClipboardList: <ClipboardList size={18} />,
  Users: <Users size={18} />,
  UserPlus: <UserPlus size={18} />,
  Settings: <Settings size={18} />,
  Puzzle: <Puzzle size={18} />,
  Shield: <Shield size={18} />,
  Palette: <Palette size={18} />,
  ScrollText: <ScrollText size={18} />,
  Lock: <Lock size={18} />,
  LayoutDashboard: <LayoutDashboard size={18} />,
  LayoutGrid: <LayoutGrid size={18} />,
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

function DraggableItem({
  item,
  index,
  sectionKey,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  editingKey,
  editValue,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  dragOverIndex,
}: {
  item: MenuItem;
  index: number;
  sectionKey: string;
  onDragStart: (section: string, index: number) => void;
  onDragOver: (e: React.DragEvent, section: string, index: number) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, section: string, index: number) => void;
  editingKey: string | null;
  editValue: string;
  onEditStart: (key: string, label: string) => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  dragOverIndex: { section: string; index: number } | null;
}) {
  const isEditing = editingKey === item.key;
  const isDragOver = dragOverIndex?.section === sectionKey && dragOverIndex?.index === index;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      draggable={!isEditing}
      onDragStart={() => onDragStart(sectionKey, index)}
      onDragOver={(e) => onDragOver(e, sectionKey, index)}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop(e, sectionKey, index)}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3.5 transition-all cursor-grab active:cursor-grabbing group",
        isDragOver
          ? "border-gax-blue bg-gax-blue/5 shadow-md shadow-gax-blue/10 scale-[1.02]"
          : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm",
        isEditing && "ring-2 ring-gax-blue/20 border-gax-blue"
      )}
    >
      {/* Drag Handle */}
      <div className="text-slate-300 group-hover:text-slate-400 transition-colors cursor-grab">
        <GripVertical size={16} />
      </div>

      {/* Icon */}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-500 shrink-0">
        {ICON_MAP[item.icon] || <Settings size={18} />}
      </div>

      {/* Label */}
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditSave();
              if (e.key === "Escape") onEditCancel();
            }}
            className="flex-1 rounded-lg border border-gax-blue/30 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-gax-blue/10 transition-all"
          />
          <button
            onClick={onEditSave}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gax-blue text-white hover:bg-gax-blue-hover transition-all active:scale-90"
          >
            <Check size={12} />
          </button>
          <button
            onClick={onEditCancel}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all active:scale-90"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-700">{item.label}</span>
            <span className="text-[9px] font-medium text-slate-300 uppercase tracking-wider">{item.key}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditStart(item.key, item.label);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-50 hover:text-gax-blue transition-all opacity-0 group-hover:opacity-100"
            title="Editar nome"
          >
            <Pencil size={12} />
          </button>
        </div>
      )}

      {/* Admin Badge */}
      {item.isAdmin && (
        <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
          Admin
        </span>
      )}
    </div>
  );
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

  // Drag state
  const [dragSource, setDragSource] = useState<{ section: string; index: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ section: string; index: number } | null>(null);

  // Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Section title editing
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
  const [sectionEditValue, setSectionEditValue] = useState("");

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

  const DEFAULT_SECTION_LABELS = {
    main_title: "Importação",
    admin_title: "Administração",
    config_title: "Configuração",
  };

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/menu-config");
      const data = await res.json();
      // Clean metadata fields
      delete data.updated_at;
      delete data.saved_as_default_at;
      // Ensure all fields exist with defaults
      const normalized: MenuConfig = {
        main_menu: Array.isArray(data.main_menu) ? data.main_menu : [],
        admin_menu: Array.isArray(data.admin_menu) ? data.admin_menu : [],
        config_menu: Array.isArray(data.config_menu) ? data.config_menu : [],
        section_labels: {
          ...DEFAULT_SECTION_LABELS,
          ...(data.section_labels || {}),
        },
      };
      setConfig(normalized);
      setHasChanges(false);
    } catch (err) {
      showError("Erro ao carregar configuração de menus.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    fetchConfig();
  }, [fetchConfig]);

  // --- Drag & Drop ---
  const handleDragStart = (section: string, index: number) => {
    setDragSource({ section, index });
  };

  const handleDragOver = (e: React.DragEvent, section: string, index: number) => {
    e.preventDefault();
    if (dragSource && dragSource.section === section) {
      setDragOverTarget({ section, index });
    }
  };

  const handleDrop = (e: React.DragEvent, section: string, index: number) => {
    e.preventDefault();
    if (!dragSource || !config || dragSource.section !== section) return;

    const sectionKey = section as keyof Pick<MenuConfig, "main_menu" | "admin_menu" | "config_menu">;
    const items = [...config[sectionKey]];
    const [removed] = items.splice(dragSource.index, 1);
    items.splice(index, 0, removed);

    // Update order values
    const reordered = items.map((item, i) => ({ ...item, order: i }));

    setConfig({ ...config, [sectionKey]: reordered });
    setHasChanges(true);
    setDragSource(null);
    setDragOverTarget(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverTarget(null);
  };

  // --- Inline Editing ---
  const handleEditStart = (key: string, label: string) => {
    setEditingKey(key);
    setEditValue(label);
  };

  const handleEditSave = () => {
    if (!config || !editingKey) return;

    const updateSection = (items: MenuItem[]) =>
      items.map((item) => (item.key === editingKey ? { ...item, label: editValue.trim() || item.label } : item));

    setConfig({
      ...config,
      main_menu: updateSection(config.main_menu),
      admin_menu: updateSection(config.admin_menu),
      config_menu: updateSection(config.config_menu),
    });
    setHasChanges(true);
    setEditingKey(null);
    setEditValue("");
  };

  const handleEditCancel = () => {
    setEditingKey(null);
    setEditValue("");
  };

  // --- Section Title Editing ---
  const handleSectionEditStart = (key: string, currentLabel: string) => {
    setEditingSectionKey(key);
    setSectionEditValue(currentLabel);
  };

  const handleSectionEditSave = () => {
    if (!config || !editingSectionKey) return;
    setConfig({
      ...config,
      section_labels: {
        ...config.section_labels,
        [editingSectionKey]: sectionEditValue.trim() || config.section_labels[editingSectionKey as keyof typeof config.section_labels],
      },
    });
    setHasChanges(true);
    setEditingSectionKey(null);
    setSectionEditValue("");
  };

  const handleSectionEditCancel = () => {
    setEditingSectionKey(null);
    setSectionEditValue("");
  };

  // --- Save / Default / Restore ---
  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/menu-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        showSuccess("Configuração de menus salva com sucesso!");
        setHasChanges(false);
      } else {
        showError("Erro ao salvar configuração.");
      }
    } catch (err) {
      showError("Erro de conexão com o servidor.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDefault = async () => {
    if (!config) return;
    if (!confirm("Deseja salvar a configuração atual como o novo padrão do sistema?")) return;
    setIsSavingDefault(true);
    try {
      // First save the active config
      await fetch("/api/menu-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      // Then save as default
      const res = await fetch("/api/menu-config/set-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        showSuccess("Configuração salva como novo padrão do sistema!");
        setHasChanges(false);
      } else {
        showError("Erro ao salvar padrão.");
      }
    } catch (err) {
      showError("Erro de conexão com o servidor.");
    } finally {
      setIsSavingDefault(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm("Deseja restaurar os menus ao padrão? Todas as alterações não salvas serão perdidas.")) return;
    setIsRestoring(true);
    try {
      const res = await fetch("/api/menu-config/restore-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showSuccess("Menus restaurados ao padrão!");
        await fetchConfig();
      } else {
        showError("Erro ao restaurar padrão.");
      }
    } catch (err) {
      showError("Erro de conexão com o servidor.");
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading || !config) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-gax-blue" size={48} />
        <p className="text-sm font-medium text-slate-400">Carregando configuração de menus...</p>
      </div>
    );
  }

  const sections = [
    { key: "main_menu" as const, titleKey: "main_title", items: config.main_menu },
    { key: "admin_menu" as const, titleKey: "admin_title", items: config.admin_menu },
    { key: "config_menu" as const, titleKey: "config_title", items: config.config_menu },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {successMessage && (
          <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 animate-in fade-in slide-in-from-right-2 duration-300 mr-auto">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="text-[11px] font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100 animate-in fade-in slide-in-from-right-2 duration-300 mr-auto">
            {errorMessage}
          </div>
        )}

        <button
          onClick={handleRestore}
          disabled={isRestoring}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all disabled:opacity-50 active:scale-95"
        >
          {isRestoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          Restaurar Padrão
        </button>

        <button
          onClick={handleSaveDefault}
          disabled={isSavingDefault || !hasChanges}
          className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-bold text-amber-600 hover:bg-amber-100 transition-all disabled:opacity-50 active:scale-95"
        >
          {isSavingDefault ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
          Salvar como Padrão
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="flex items-center gap-2 rounded-xl bg-gax-blue px-5 py-2.5 text-[11px] font-bold text-white shadow-xl shadow-gax-blue/20 transition-all hover:bg-gax-blue-hover disabled:opacity-50 active:scale-95"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar Alterações
        </button>
      </div>

      {/* Unsaved Changes Warning */}
      {hasChanges && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-5 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <span className="text-[11px] font-bold text-amber-700">
            Você tem alterações não salvas. Clique em &ldquo;Salvar Alterações&rdquo; para aplicar.
          </span>
        </div>
      )}

      {/* Menu Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {sections.map((section) => {
          const sectionLabel = config.section_labels[section.titleKey as keyof typeof config.section_labels];
          const isEditingSection = editingSectionKey === section.titleKey;

          return (
            <div
              key={section.key}
              className="flex flex-col rounded-[2rem] border border-slate-200/60 bg-white/70 p-6 shadow-sm backdrop-blur-sm"
            >
              {/* Section Header */}
              <div className="flex items-center justify-between mb-5">
                {isEditingSection ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={sectionEditValue}
                      onChange={(e) => setSectionEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSectionEditSave();
                        if (e.key === "Escape") handleSectionEditCancel();
                      }}
                      className="flex-1 rounded-lg border border-gax-blue/30 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-gax-blue/10"
                      autoFocus
                    />
                    <button onClick={handleSectionEditSave} className="flex h-7 w-7 items-center justify-center rounded-lg bg-gax-blue text-white hover:bg-gax-blue-hover transition-all active:scale-90">
                      <Check size={12} />
                    </button>
                    <button onClick={handleSectionEditCancel} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all active:scale-90">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 group cursor-pointer" onClick={() => handleSectionEditStart(section.titleKey, sectionLabel)}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gax-blue/10 to-gax-blue/5 text-gax-blue">
                      <Settings size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 tracking-tight">{sectionLabel}</h3>
                      <p className="text-[9px] font-medium text-slate-300">{section.items.length} itens</p>
                    </div>
                    <Pencil size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="space-y-2">
                {section.items
                  .sort((a, b) => a.order - b.order)
                  .map((item, idx) => (
                    <DraggableItem
                      key={item.key}
                      item={item}
                      index={idx}
                      sectionKey={section.key}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      onDrop={handleDrop}
                      editingKey={editingKey}
                      editValue={editValue}
                      onEditStart={handleEditStart}
                      onEditChange={setEditValue}
                      onEditSave={handleEditSave}
                      onEditCancel={handleEditCancel}
                      dragOverIndex={dragOverTarget}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
