"use client";

import React, { useState, useEffect } from "react";
import { UserPlus, Check, X, Mail, Clock, Loader2 } from "lucide-react";

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
      const res = await fetch("/api/users/pending");
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error("Erro ao carregar pendentes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleAction = async (email: string, action: 'approve' | 'reject') => {
    const confirmMsg = action === 'approve' ? `Aprovar cadastro de ${email}?` : `Recusar cadastro de ${email}?`;
    if (confirm(confirmMsg)) {
      try {
        const res = await fetch(`/api/users/${action}/${email}`, { method: "POST" });
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Usuários Pendentes</h1>
        <p className="text-sm text-slate-500">Novos cadastros aguardando aprovação administrativa</p>
      </div>

      {users.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {users.map((user) => (
            <div key={user.email} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-500 shadow-inner">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{user.first_name} {user.last_name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Mail size={12} /> {user.email}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {user.created_at}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleAction(user.email, 'approve')}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500 text-white shadow-lg shadow-green-500/20 transition-all hover:bg-green-600 active:scale-95"
                  title="Aprovar"
                >
                  <Check size={20} />
                </button>
                <button 
                  onClick={() => handleAction(user.email, 'reject')}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
                  title="Recusar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          ))}
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
