import asyncio
import os
import sys

# Garante que o diretório raiz está no path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from api.automation_api_check import run_single_api_check

async def test_cassems():
    print("Iniciando teste de checagem da API CASSEMS...")
    await run_single_api_check("CASSEMS", task_id="teste_local")
    print("Teste finalizado. Verifique os logs acima para o resultado.")

if __name__ == "__main__":
    asyncio.run(test_cassems())
