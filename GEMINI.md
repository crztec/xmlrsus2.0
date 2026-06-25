# MindSync Memory — Project Context for Antigravity / Gemini
> Project: **xmlrsus2.0-1** | ID: `96be79ca` | 0 memories | Updated: 6/25/2026

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

- **1. Strict Security: Credentials in Database Only**: Never hardcode any API keys, passwords, user profiles, or sensitive system configurations in the codebase. All external credentials (e.g. Evolution API, third party system credentials) must be stored in Firestore, and when exposed to the frontend, they must be masked (replaced with `********`). Admin authorization checks must be run dynamically on backend routes.

## 📐 Conventions

- **1. Backend Routing & Swagger Security**: FastAPI backend runs with `root_path="/api-rsus"`. Public Swagger and OpenAPI docs are disabled (`docs_url=None, openapi_url=None`). Custom `/docs` and `/openapi.json` routes are exposed and secured via HTTPBasic Auth, validating credentials against Firebase Auth REST API and verifying `admin` role in Firestore. Timezone is explicitly set to `America/Sao_Paulo`, and global exception handlers sanitize tracebacks in production.
- **2. Authentication & RBAC System**: User authentication is performed via Firebase Client Auth REST API. Session verification relies on HTTPBearer injecting the Firebase ID token verified through the Admin SDK. Authorization is Role-Based (RBAC) querying the `users` collection in Firestore. Admin checks are cached in memory (`admin_profile_cache`, 300s TTL) to prevent read flooding on every protected endpoint request.
- **3. Firestore Database Caching & Performance**: No traditional SQL database ORM is used; all operations query Firebase Firestore (via `firestore_db` client). Frequently accessed lists (like clients and stats) use in-memory `TTLCache` objects (60s-120s TTL) to minimize Firebase API usage. Writing operations must invoke `invalidate_abi_caches()` to keep read data synchronized. Thread pools are defined to run parallel reads if needed.
- **4. Playwright Robust Automation**: Automation tasks launch headless Chromium via `launch_browser_robust` implementing a retry loop (3 attempts) to mitigate SIGSEGV/crash errors in containers. Network interception blocks heavy files (images/analytics). Scrolling actions must target the modal container class (e.g. `.k-window-content` for Kendo UI) instead of standard document scrolling, and click actions must use precise interactive element selectors (e.g. `button, a, span`) rather than wildcard `*` targets to prevent headless misclicks and timeouts.
- **5. Next.js Subfolder & Client Integration**: Frontend is a Next.js App Router project deployed under reverse proxy subfolder using `basePath: '/rsus'` and rewrites targeting `/api/:path*` to bypass CORS. API communication uses the custom `apiClient` wrapper, which retrieves/renews the Firebase ID token automatically (`forceRefresh=true`), redirects to `/login` on 401, and uses exponential backoff retries for network-level failures to mitigate Cloud Run scale-to-zero cold starts.
- **6. Frontend Layout & Design Conventions (SaaS High-Density)**: New pages, tables, menus, grids, and charts must follow the Silicon Precision theme: background slate-50 (`#F8FAFC`), foreground slate-900 (`#0F172A`), brand color sky-blue (`#0EA5E9`), headings font Space Grotesk, body font Inter. Components must use rounded-2xl (cards/inputs) or rounded-3xl (modals/tables) with subtle glassmorphic styling, transition animations, and hover-state focus styles to prevent basic visual output.



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
