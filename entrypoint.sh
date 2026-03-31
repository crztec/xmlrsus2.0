#!/bin/bash
set -e

# Define a porta padrão se não estiver definida (Cloud Run fornece $PORT)
export PORT=${PORT:-8080}

echo "--- Iniciando GAX 2.0 ---"
echo "Porta alvo do Cloud Run: $PORT"

# Inicia o Backend FastAPI em background
echo "Iniciando Backend FastAPI na porta 8000..."
uvicorn api.main:app --host 0.0.0.0 --port 8000 &

# Aguarda um momento para o backend subir
sleep 2

# Inicia o Frontend Next.js na porta principal (Standalone Mode)
echo "Iniciando Frontend Next.js Standalone na porta $PORT..."
export HOSTNAME="0.0.0.0"
exec node server.js
