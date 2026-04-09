"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, ScrollText } from "lucide-react";

export default function PoliticaPrivacidadePage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-gax-blue/10 selection:text-gax-blue">
      {/* Header Fixo de Navegação */}
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
              <ScrollText size={32} />
            </div>
            <h1 className="text-4xl font-display font-black tracking-tight text-slate-900 md:text-5xl">
              Política de <span className="text-gax-blue">Privacidade</span>
            </h1>
            <p className="mt-4 text-sm font-medium text-slate-400">
              Última atualização: {new Date().toLocaleDateString('pt-BR')}
            </p>
          </header>

          <div className="prose prose-slate max-w-none space-y-10">
            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">1. Introdução</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
              </p>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">2. Coleta de Dados</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Suscipit taciti nam per sem sodales mentesque ut pellentesque, curabitur habitant turpis est nulla donec justo, ac integer morbi imperdiet quis interdum nostra. 
              </p>
              <ul className="mt-6 list-inside list-disc space-y-3 text-slate-600 font-medium ml-2">
                <li>Dados de identificação (nome, e-mail, etc.)</li>
                <li>Metadados de arquivos XML processados</li>
                <li>Logs de acesso e atividades no sistema</li>
                <li>Preferências de navegação e cookies essenciais</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">3. Uso das Informações</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Amet feugiat taciti ut donec nisl molestie purus, scelerisque nisl himenaeos quisque litora ad, primis dapibus lorem litora etiam proin.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">4. Segurança</h2>
              <p className="mt-4 leading-relaxed text-slate-600 font-medium">
                Est praesent platea lectus curabitur phasellus diam fames rhoncus nisl, dictumst tristique sociosqu curae hac nam taciti nam, non in ac interdum porta pretium molestie scelerisque.
              </p>
            </section>

            <section className="rounded-2xl bg-slate-50 p-8 border border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Dúvidas sobre Privacidade?</h2>
              <p className="mt-2 text-sm text-slate-500 font-medium leading-relaxed">
                Se você tiver qualquer dúvida sobre como tratamos seus dados, entre em contato através do canal de suporte oficial do sistema GAX.
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
