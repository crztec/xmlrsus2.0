# Dockerfile para GAX 2.0 (Next.js + FastAPI) - Otimizado

# --- Estágio 1: Build do Frontend (Next.js) ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Cache das dependências do Node
COPY package*.json ./
RUN npm ci --silent

# Build do Next.js copiando APENAS o necessário para o frontend
# Assim, se alterarmos um arquivo Python na pasta api/, o cache do NPM não será quebrado!
COPY tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs ./
COPY public ./public
COPY src ./src
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# --- Estágio 2: Runtime Final ---
# Usamos a imagem oficial do Playwright que já vem com Python 3.10+, Browsers e Dependências de Sistema OS
FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy
WORKDIR /app

# Instala Node.js 20 para rodar o Next.js (via repositórios oficiais para ser mais rápido)
RUN apt-get update && apt-get install -y ca-certificates curl gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    NODE_MAJOR=20 && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && apt-get install nodejs -y && \
    rm -rf /var/lib/apt/lists/*

# Copia Frontend Build da etapa anterior
COPY --from=frontend-builder /app/frontend/.next /app/.next
COPY --from=frontend-builder /app/frontend/public /app/public
COPY --from=frontend-builder /app/frontend/package*.json /app/
COPY --from=frontend-builder /app/frontend/node_modules /app/node_modules

# Instala Dependências do Backend
COPY api/requirements.txt ./api/
# Browsers já estão na imagem base, então não precisamos de 'playwright install'
RUN pip install --no-cache-dir -r api/requirements.txt

# Copia Código do Backend
COPY api ./api

# Expondo portas (Next: 3000, API: 8000)
EXPOSE 3000
EXPOSE 8000

# script de inicialização
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/entrypoint.sh"]
