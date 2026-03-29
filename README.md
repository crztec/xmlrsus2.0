# GAX - Gestão de Atendimentos XML

O **GAX** é uma plataforma robusta de monitoramento e automação para o ecossistema do **Ressarcimento ao SUS (RSUS)**. Desenvolvido para centralizar e automatizar tarefas críticas, o GAX garante que a comunicação entre prestadores e o portal RSUS seja estável, eficiente e transparente.

## 🚀 Principais Funcionalidades

### 1. Monitoramento de APIs RSUS
- **Dashboards em Tempo Real**: Visualize o status "Online/Offline" de diversos portais de clientes (CASSEMS, FSFX, etc).
- **Robô de Verificação (API Check)**: Automação baseada em Playwright que realiza login end-to-end e navegação profunda para validar a saúde da conexão.
- **Resiliência Avançada**: Implementação de técnicas como "Triple Jump" (salto de navegação direta) e execução *frame-aware* para superar instabilidades nos portais governamentais.

### 2. Automação de Importação XML
- Processamento automático de arquivos XML para o portal RSUS.
- Sincronização de dados ABI e Atendimentos.

### 3. Console Técnico
- Logs detalhados e em tempo real exibidos diretamente no dashboard.
- Diferenciação inteligente de status: Identifique se uma falha é de navegação (Erro) ou indisponibilidade real do portal (Offline).

### 4. Configuração e Segurança
- Gestão centralizada de credenciais RSUS por cliente.
- Integração nativa com auditoria de logs de acesso.

## 🛠️ Tecnologias Utilizadas

### Frontend
- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
- **Estilização**: [Tailwind CSS](https://tailwindcss.com/)
- **Componentes**: [Lucide React](https://lucide.dev/) para iconografia.
- **Estado/Dados**: [Firebase SDK](https://firebase.google.com/docs/web/setup)

### Backend & Automação
- **API**: [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **Engine de Automação**: [Playwright](https://playwright.dev/python/) (Modo Async)
- **Banco de Dados**: [Google Cloud Firestore](https://firebase.google.com/docs/firestore) NoSQL.
- **Infraestrutura**: [Google Cloud Run](https://cloud.google.com/run) & [Cloud Build](https://cloud.google.com/build).

## 📦 Estrutura do Projeto

- `/api`: Servidor backend FastAPI e lógica de automação dos robôs.
- `/src`: Frontend Next.js organizado por componentes e rotas autenticadas.
- `/scripts`: Utilitários de diagnóstico, auditoria e limpeza de tarefas.
- `/public`: Ativos estáticos e recursos visuais.

## 🛠️ Configuração de Desenvolvimento

1. **Frontend**:
   ```bash
   npm install
   npm run dev
   ```

2. **Backend**:
   ```bash
   pip install -r api/requirements.txt
   uvicorn api.main:app --reload
   ```

---
*GAX - Automação inteligente para o Ressarcimento ao SUS.*
