"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: { label: string; active?: boolean }[];
}

export default function MainLayout({ children, title, breadcrumb }: MainLayoutProps) {
  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Sub-Header / Breadcrumbs */}
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex flex-col">
          {breadcrumb && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              {breadcrumb.map((item, idx) => (
                <React.Fragment key={idx}>
                  <span className={cn(item.active && "text-slate-600")}>{item.label}</span>
                  {idx < breadcrumb.length - 1 && <span>/</span>}
                </React.Fragment>
              ))}
            </div>
          )}
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Sistema Online</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
