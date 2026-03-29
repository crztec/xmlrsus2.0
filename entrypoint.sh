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

# Inicia o Frontend Next.js na porta principal
# O Next.js vai agir como proxy para o backend na porta 8000
echo "Iniciando Frontend Next.js na porta $PORT..."
export HOSTNAME="0.0.0.0"
exec npm start
