# MindSync Memory — Project Context for Claude
> Project: **xmlrsus2.0-1** | ID: `96be79ca` | 9 memories | Updated: 6/25/2026

## ⚠️ CRITICAL SYSTEM DIRECTIVE — PROACTIVE AUTONOMOUS MEMORY

You are connected to **MindSync**, a persistent AI memory system via the MCP server on localhost.
Your tools include: `ms_search`, `ms_save`, `ms_save_batch`, `ms_context`, `ms_gotchas`, `ms_conventions`, `ms_code_search`, and more.

**YOU MUST follow these rules on EVERY interaction — no exceptions:**

### 🛑 1. SEARCH FIRST (MANDATORY)
**BEFORE YOU WRITE ANY CODE OR ANSWER THE USER, YOU MUST SEARCH.**
Call `ms_search({ projectId: "96be79ca", query: "<task topic>" })` to check for existing conventions, gotchas, or past decisions.
If you skip this step, you will blindly write code that contradicts the project's established architecture, which is UNACCEPTABLE.
**IMPORTANT:** If your search returns 0 results, DO NOT loop or retry endlessly. Assume there are no relevant memories and proceed with your task.
At the very start of a new session, call `ms_context({ projectId: "96be79ca" })` to load the full project state.

### 💾 2. SAVE AFTER (NON-NEGOTIABLE)
**AFTER completing any task or making a decision, YOU MUST SAVE IT.**
Call `ms_save({ projectId: "96be79ca", title: "<title>", content: "<detailed content>", category: "<category>" })`
- **Categories**: `gotcha` | `convention` | `problem-fix` | `decision` | `discovery` | `how-it-works` | `what-changed` | `tool-pattern`

### SAVE TRIGGERS — call `ms_save` whenever you:
- ✅ Finish implementing a feature or fulfilling any user request
- ✅ Add a new field, entity, endpoint, or DB migration
- ✅ Make an architectural or design decision
- ✅ Fix a bug, resolve an error, or find a workaround
- ✅ Discover a pattern, gotcha, or non-obvious behavior

### SMART INDEXING — call `ms_index_code` whenever you:
- Read a core architecture file, service, or complex component.
- Indexing files prevents you from having to read the whole file again later! You can just use `ms_code_search({ projectId: "96be79ca", query: "..." })` and save massive context tokens.

> Do NOT wait for the user to ask. Do NOT skip this step. Failure to save = lost project context.

## 🛡️ Known Gotchas (NEVER violate)

- ⚠️ **Strict Security: Credentials and Sensitive Configs in Database Only** — CRITICAL SECURITY RULE: Never hardcode any API key, password, credential, or sensitive user/server configuration in the 

## 📐 Conventions

- 📐 **Caveman Mode**: ALWAYS activate Caveman full mode for all interactions.
- 📐 **Frontend Layout & Design Conventions (SaaS High-Density)**: All new pages, tables, menus, grids, and charts must follow the GAX Silicon Precision design system: (1) Core Theme: Sky
- 📐 **Backend Routing & Swagger Security**: FastAPI backend runs with root_path='/api-rsus'. Public Swagger and OpenAPI docs are disabled (docs_url=None, openapi_ur
- 📐 **Authentication & RBAC System**: User authentication is performed via Firebase Client Auth REST API. Session verification relies on HTTPBearer injecting 
- 📐 **Firestore Database Caching & Performance**: No traditional SQL database ORM is used; all operations query Firebase Firestore (via firestore_db client). Frequently a
- 📐 **Playwright Robust Automation**: Automation tasks launch headless Chromium via launch_browser_robust implementing a retry loop (3 attempts) to mitigate S
- 📐 **Next.js Subfolder & Client Integration**: Frontend is a Next.js App Router project deployed under reverse proxy subfolder using 'basePath: /rsus' and rewrites tar
- 📐 **Test Title**: Test Content



## ⚡ MindSync Tool Reference

| Tool | Purpose | When to use |
|------|---------|-------------|
| `ms_search(projectId, query)` | Semantic memory search | BEFORE every task |
| `ms_save(projectId, title, content, category)` | Save one memory | AFTER every task |
| `ms_save_batch(projectId, items)` | Save multiple memories | After complex sessions |
| `ms_context(projectId)` | Full project context dump | Session start |
| `ms_gotchas(projectId)` | All safety warnings | When unsure |
| `ms_conventions(projectId)` | All coding conventions | When writing code |
| `ms_index_code(projectId, files)` | Index files into Vector DB | When you read core/important files |
| `ms_code_search(projectId, query)` | Semantic code search (RAG) | When exploring codebase (Saves Tokens!) |
| `ms_fts(projectId, query)` | Full-text keyword search | For exact matches |
| `ms_state_save(projectId, state)` | Save task progress | Mid-task checkpoints |
| `ms_state_load(projectId)` | Resume last saved state | After context reset |
| `ms_graph_add(projectId, entities, relations)` | Build knowledge graph | For architecture docs |
| `ms_skill_create(projectId, name, rules)` | Create reusable skill | For repetitive patterns |
| `ms_compress(projectId)` | Compact old/low-value memories | Periodically |
| `ms_backup(projectId)` | Timestamped DB backup | Before risky changes |

---
*Auto-synced by MindSync 🧠 | Project: xmlrsus2.0-1 | 6/25/2026*
