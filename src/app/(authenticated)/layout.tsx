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

  useEffect(() => {
    if (typeof window !== "undefined") {
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
