# GAX - Gestão de Atendimentos XML

O **GAX** é uma plataforma robusta de monitoramento e automação para o ecossistema do **Ressarcimento ao SUS (RSUS)**. Desenvolvido para centralizar e automatizar tarefas críticas, o GAX garante que a comunicação entre prestadores e o portal RSUS seja estável, eficiente e transparente.

## 🚀 Principais Funcionalidades

### 1. Monitoramento de APIs RSUS
- **Dashboards em Tempo Real**: Visualize o status "Online/Offline" de diversos portais de clientes.
- **Robô de Verificação (API Check)**: Automação baseada em Playwright que realiza login end-to-end e navegação profunda para validar a saúde da conexão.
- **Resiliência Avançada**: Técnicas como "Triple Jump" e execução *frame-aware* para superar instabilidades.

### 2. Automação de Importação XML
- Processamento automático e em massa de arquivos XML para o portal RSUS.
- Sincronização inteligente de dados ABI e Atendimentos.
- **Pre-check de Duplicidade**: Evita o re-upload de ABIs já processadas.

### 3. Console Técnico & Auditoria
- Logs detalhados em tempo real diretamente no dashboard.
- **Audit Logs**: Registro completo de todas as ações administrativas para conformidade e segurança.

### 4. Segurança Zero Trust (JWT)
- **Autenticação Robusta**: Integração com Firebase Auth (E-mail/Senha e Google).
- **Autorização Granular**: Middleware `require_admin` no backend que valida tokens JWT e permissões de administrador.
- **Persistence Fallback**: O `apiClient` sincroniza tokens entre o SDK do Firebase e o `localStorage` para garantir persistência total da sessão.

## 🛠️ Tecnologias Utilizadas

### Frontend
- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Comunicação**: `apiClient.ts` (Wrapper autenticado para chamadas backend)
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
- **Estilização**: Modern Vanilla CSS & Tailwind.

### Backend & Automação
- **API**: [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **Performance**: `TTLCache` para caching de autorização e otimização de consultas Firestore.
- **Engine**: [Playwright](https://playwright.dev/python/) (Modo Operação Assíncrona).
- **Banco de Dados**: Google Cloud Firestore.

## 📐 Regras de Roteamento (Importante!)

O projeto utiliza uma arquitetura de proxy via Next.js:
1. Todas as chamadas do frontend usam o prefixo `/api/` (Ex: `apiClient("/api/clients")`).
2. O Next.js (`next.config.ts`) **remove** o prefixo `/api/` ao encaminhar para o Python.
3. **Regra de Ouro**: No `main.py`, os decorators **NUNCA** devem usar o prefixo `/api/`. Use apenas `@app.get("/clients")`.

## 📦 Estrutura do Projeto

- `/api`: Servidor backend FastAPI e lógica de automação.
- `/src`: Frontend Next.js (Componentes, Hooks e Libs).
- `/src/lib/apiClient.ts`: Ponto central de comunicação autenticada.
- `/public`: Ativos estáticos e recursos visuais.

---
*GAX - Automação inteligente para o Ressarcimento ao SUS.*
