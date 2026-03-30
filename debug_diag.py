import asyncio
import sys
import logging
from api.automation_api_check import run_api_check_for_client
from api.database import db

logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(asctime)s - %(levelname)s - %(message)s')

async def main():
    print("Iniciando depuração local do CASSEMS...")
    status, msg = await run_api_check_for_client("CASSEMS", "DEBUG-LOCAL-TASK")
    print(f"Status Final: {status}")
    print(f"Mensagem: {msg}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
