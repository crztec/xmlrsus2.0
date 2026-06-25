"use client";

import React, { useState, useEffect } from "react";
import { UserPlus, Check, X, Mail, Clock, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";


interface PendingUser {
  email: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
}

export default function PendingUsersPage() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPending = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient("/api/users/pending");
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error("Erro ao carregar pendentes:", error);
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
    fetchPending();
  }, []);

  const handleAction = async (email: string, action: 'approve' | 'reject') => {
    const confirmMsg = action === 'approve' ? `Aprovar cadastro de ${email}?` : `Recusar cadastro de ${email}?`;
    if (confirm(confirmMsg)) {
      try {
        const res = await apiClient(`/api/users/${action}/${email}`, { method: "POST" });
        if (res.ok) {
          fetchPending();
        } else {
          alert("Erro ao realizar ação.");
        }
      } catch (error) {
        alert("Erro de conexão.");
      }
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
    <div className="flex flex-col gap-6 p-4 md:p-8 pt-2 max-w-7xl mx-auto">


      {users.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-sm">
          <table className="w-full text-left font-sans text-xs">
            <thead className="bg-slate-50/30 text-[9px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap border-b border-slate-100/50">
              <tr>
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50">
              {users.map((user) => (
                <tr key={user.email} className="hover:bg-white transition-colors group whitespace-nowrap text-[11px]">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gax-blue/10 to-gax-blue/5 text-gax-blue font-bold shadow-inner text-[10px]">
                        {(user.first_name || user.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-slate-700 group-hover:text-gax-blue transition-colors">
                        {user.first_name || "Usuário"} {user.last_name || ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-slate-500 font-medium">{user.email}</td>
                  <td className="px-5 py-2.5 text-slate-400 font-medium">{user.created_at}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => handleAction(user.email, 'approve')}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                        title="Aprovar Usuário"
                      >
                        <Check size={12} />
                      </button>
                      <button 
                        onClick={() => handleAction(user.email, 'reject')}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                        title="Recusar Usuário"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-100 py-20 text-slate-300">
          <UserPlus size={64} className="opacity-10" />
          <p className="mt-4 font-medium text-slate-400">Nenhum cadastro pendente</p>
        </div>
      )}
    </div>
  );
}
