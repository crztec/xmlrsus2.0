"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";

export default function TermosUsoPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-gax-blue/10 selection:text-gax-blue">
      {/* Header Fixo */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link 
            href="/login" 
            className="flex items-center gap-2 text-sm font-bold text-slate-500 transition-colors hover:text-gax-blue"
          >
            <ChevronLeft size={18} />
            Voltar para o Login
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gax-blue p-1 shadow-lg shadow-gax-blue/20">
              <img src="/Imagens/Glogo.png" alt="Logo" className="brightness-0 invert" />
            </div>
            <span className="text-lg font-black tracking-tight text-slate-800">GAX</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <article className="rounded-[2.5rem] border border-slate-200/60 bg-white p-10 shadow-xl shadow-slate-200/30 md:p-16">
          <header className="mb-12 border-b border-slate-100 pb-12">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gax-blue/5 text-gax-blue">
              <FileText size={32} />
            </div>
            <h1 className="text-4xl font-display font-black tracking-tight text-slate-900 md:text-5xl">
              Termos de <span className="text-gax-blue">Uso</span>
            </h1>
            <p className="mt-4 text-sm font-medium text-slate-400">
              Última atualização: {new Date().toLocaleDateString('pt-BR')}
            </p>
          </header>

          <div className="prose prose-slate max-w-none space-y-10">
            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">1. Aceitação dos Termos</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ao acessar o GAX, você concorda em cumprir estes termos de serviço.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">2. Uso da Licença</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                É concedida permissão para o uso das ferramentas de gestão XML de acordo com as permissões de acesso atribuídas ao seu usuário. Esta é a concessão de uma licença, não uma transferência de título.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">3. Isenção de Responsabilidade</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Os materiais no sistema GAX são fornecidos "como estão". Não oferecemos garantias, expressas ou implícitas, e por este meio isentamos e negamos todas as outras garantias, incluindo, sem limitação, garantias implícitas.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">4. Limitações</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Em nenhum caso o GAX ou seus fornecedores serão responsáveis por quaisquer danos decorrentes do uso ou da incapacidade de usar os materiais no sistema.
              </p>
            </section>

            <section className="rounded-2xl bg-slate-50 p-8 border border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Rescisão</h2>
              <p className="mt-2 text-sm text-slate-500 font-medium leading-relaxed">
                Podemos encerrar ou suspender seu acesso imediatamente, sem aviso prévio ou responsabilidade, por qualquer motivo, inclusive, sem limitação, se você violar os Termos.
              </p>
            </section>
          </div>
        </article>

        <footer className="mt-12 text-center text-[13px] font-bold text-slate-400">
          © {new Date().getFullYear()} GAX Gestão de Arquivos XML • Todos os direitos reservados.
        </footer>
      </main>
    </div>
  );
}
