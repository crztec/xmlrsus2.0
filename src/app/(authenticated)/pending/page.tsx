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
    <div className="flex flex-col gap-6 p-8 pt-2 max-w-7xl mx-auto">
      <div></div>

      {users.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {users.map((user, idx) => (
            <div 
              key={user.email} 
              className="group flex items-center justify-between rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all hover:border-gax-blue/30 hover:shadow-xl hover:shadow-slate-200/50"
              style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-amber-50/10 text-amber-500 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <UserPlus size={28} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">{user.first_name} {user.last_name}</h3>
                  <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5"><Mail size={14} className="text-slate-300" /> {user.email}</span>
                    <span className="flex items-center gap-1.5"><Clock size={14} className="text-slate-300" /> {user.created_at}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleAction(user.email, 'approve')}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-95"
                  title="Aprovar"
                >
                  <Check size={24} />
                </button>
                <button 
                  onClick={() => handleAction(user.email, 'reject')}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-xl shadow-rose-500/20 transition-all hover:bg-rose-600 active:scale-95"
                  title="Recusar"
                >
                  <X size={24} />
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
