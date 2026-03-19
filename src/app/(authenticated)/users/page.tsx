"use client";

import React, { useState, useEffect } from "react";
import { Users, Shield, Mail, Trash2, Edit2, Loader2, CheckCircle, XCircle } from "lucide-react";

interface User {
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  status: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data);
    } catch (error: any) {
      console.error("Erro ao carregar usuários:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (email: string) => {
    if (confirm(`Aprovar o usuário ${email}?`)) {
      await fetch(`/api/users/approve/${email}`, { method: "POST" });
      fetchUsers();
    }
  };

  const handleDelete = async (email: string) => {
    if (confirm(`Tem certeza que deseja excluir o usuário ${email}? Esta ação é permanente.`)) {
      await fetch(`/api/users/${email}`, { method: "DELETE" });
      fetchUsers();
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.email}`, {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Gerenciamento de Usuários</h1>
        <p className="text-sm text-slate-500">Visualize e edite as permissões dos usuários do sistema</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left font-sans text-sm">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-6 py-4">Usuário</th>
              <th className="px-6 py-4">E-mail</th>
              <th className="px-6 py-4">Papel</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.email} className="hover:bg-slate-50/50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gax-blue-light text-gax-blue font-bold">
                      {(user.first_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-slate-700">{user.first_name} {user.last_name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{user.email}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Shield size={10} />
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    user.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {user.status === 'approved' ? 'Ativo' : 'Pendente'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    {user.status === 'pending' && (
                      <button 
                        onClick={() => handleApprove(user.email)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-100 bg-green-50 text-green-600 hover:bg-green-100 shadow-sm"
                        title="Aprovar Usuário"
                      >
                        <CheckCircle size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => { setSelectedUser(user); setShowEditModal(true); }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:text-gax-blue shadow-sm"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(user.email)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 hover:text-red-500 shadow-sm"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                    value={selectedUser.first_name || ""}
                    onChange={(e) => setSelectedUser({...selectedUser, first_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sobrenome</label>
                  <input 
                    type="text" 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                    value={selectedUser.last_name || ""}
                    onChange={(e) => setSelectedUser({...selectedUser, last_name: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">E-mail</label>
                <input 
                  type="email" 
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                  value={selectedUser.email}
                  onChange={(e) => setSelectedUser({...selectedUser, email: e.target.value})}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Papel (Role)</label>
                <select 
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
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
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-gax-blue focus:bg-white focus:ring-4 focus:ring-gax-blue/10"
                  value={selectedUser.status}
                  onChange={(e) => setSelectedUser({...selectedUser, status: e.target.value})}
                >
                  <option value="approved">Ativo</option>
                  <option value="pending">Pendente</option>
                </select>
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

