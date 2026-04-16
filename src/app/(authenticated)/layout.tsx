"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";
import UserProfileModal from "@/components/UserProfileModal";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userInfo, setUserInfo] = useState({ name: "", email: "" });
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("gax_auth_token");
      
      if (!token || token === "null" || token === "undefined") {
        setIsAuthorized(false);
        window.location.href = "/login";
        return;
      }

      setIsAuthorized(true);
      setUserInfo({
        name: localStorage.getItem("gax_user_name") || "Usuário",
        email: localStorage.getItem("gax_user_email") || "..."
      });
    }

    const handleUpdate = (e: any) => {
      setUserInfo(e.detail);
    };
    window.addEventListener('profile-updated', handleUpdate);
    return () => window.removeEventListener('profile-updated', handleUpdate);
  }, []);

  // Se não estiver autorizado ou ainda estiver verificando, não renderiza nada
  // Isso impede que o dashboard seja visível mesmo que por um milissegundo
  if (isAuthorized === null || isAuthorized === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gax-blue border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex bg-white relative">
      <Sidebar onOpenProfile={() => setIsProfileOpen(true)} />
      <MainLayout>
        {children}
      </MainLayout>
      
      <UserProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)}
        userEmail={userInfo.email}
        userName={userInfo.name}
      />
    </div>
  );
}
