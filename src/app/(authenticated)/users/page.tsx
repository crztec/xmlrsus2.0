"use client";

import React, { useState, useEffect } from "react";
import { Users, Shield, Mail, Trash2, Edit2, Loader2, CheckCircle, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/apiClient";


interface User {
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  status: string;
  password?: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient("/api/users");
      const data = await res.json();
      setUsers(data);
    } catch (error: any) {
      console.error("Erro ao carregar usuários:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("gax_user_role");
    if (role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    fetchUsers();
  }, []);

  const totalUsers = users.length;
  const totalPages = Math.ceil(totalUsers / itemsPerPage);
  const paginatedUsers = users.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [users.length]);

  const handleApprove = async (email: string) => {
    if (confirm(`Aprovar o usuário ${email}?`)) {
      await apiClient(`/api/users/approve/${email}`, { method: "POST" });
      fetchUsers();
    }
  };

  const handleDelete = async (email: string) => {
    if (confirm(`Tem certeza que deseja excluir o usuário ${email}? Esta ação é permanente.`)) {
      await apiClient(`/api/users/${email}`, { method: "DELETE" });
      fetchUsers();
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsUpdating(true);
    try {
      const res = await apiClient(`/api/users/${selectedUser.email}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedUser)
      });
      if (res.ok) {
        setShowEditModal(false);
        fetchUsers();
      } else {
        alert("Erro ao atualizar usuário.");
      }
    } catch (error) {
      alert("Erro de conexão.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gax-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto">
      <div></div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-sm">
        <table className="w-full text-left font-sans text-xs">
          <thead className="bg-slate-50/30 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            <tr className="border-b border-slate-100/50">
              <th className="px-6 py-4">Usuário</th>
              <th className="px-6 py-4">E-mail</th>
              <th className="px-6 py-4">Papel</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/50">
            {paginatedUsers.map((user) => (
              <tr key={user.email} className="hover:bg-white transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gax-blue/10 to-gax-blue/5 text-gax-blue font-bold shadow-inner">
                      {(user.first_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-slate-700 group-hover:text-gax-blue transition-colors">{user.first_name} {user.last_name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500 font-medium">{user.email}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    user.role === 'admin' ? 'bg-gax-blue-light text-gax-blue border border-gax-blue/10' : 'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    <Shield size={10} />
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    user.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                  }`}>
                    <div className={cn("h-1.5 w-1.5 rounded-full", user.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500')} />
                    {user.status === 'approved' ? 'Ativo' : 'Pendente'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    {user.status === 'pending' && (
                      <button 
                        onClick={() => handleApprove(user.email)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                        title="Aprovar Usuário"
                      >
                        <CheckCircle size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => { setSelectedUser(user); setShowEditModal(true); }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-400 hover:border-gax-blue/30 hover:text-gax-blue hover:shadow-lg hover:shadow-gax-blue/10 transition-all"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(user.email)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-400 hover:border-red-100 hover:text-red-500 hover:shadow-lg hover:shadow-red-500/10 transition-all"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Controles de Paginação (Logs Reference Style) */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-white/50 px-6 py-4">
            <span className="text-xs font-medium text-slate-500">
              Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, totalUsers)} de {totalUsers} usuários
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
                disabled={currentPage === totalPages || totalUsers === 0}
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
      </div>

      {/* Modal de Edição */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Editar Usuário</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nome</label>
                  <input 
                    type="text" 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium"
                    value={selectedUser.first_name || ""}
                    onChange={(e) => setSelectedUser({...selectedUser, first_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sobrenome</label>
                  <input 
                    type="text" 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium"
                    value={selectedUser.last_name || ""}
                    onChange={(e) => setSelectedUser({...selectedUser, last_name: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">E-mail</label>
                <input 
                  type="email" 
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium"
                  value={selectedUser.email}
                  onChange={(e) => setSelectedUser({...selectedUser, email: e.target.value})}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Papel (Role)</label>
                <select 
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium"
                  value={selectedUser.role}
                  onChange={(e) => setSelectedUser({...selectedUser, role: e.target.value})}
                >
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
                <select 
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium"
                  value={selectedUser.status}
                  onChange={(e) => setSelectedUser({...selectedUser, status: e.target.value})}
                >
                  <option value="approved">Ativo</option>
                  <option value="pending">Pendente</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nova Senha (Opcional)</label>
                <input 
                  type="password" 
                  placeholder="Deixe em branco para não alterar"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10 text-slate-700 font-medium placeholder:text-slate-300"
                  value={selectedUser.password || ""}
                  onChange={(e) => setSelectedUser({...selectedUser, password: e.target.value})}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 rounded-xl bg-gax-blue py-3 text-sm font-bold text-white hover:bg-gax-blue-hover shadow-lg shadow-gax-blue/20 disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

