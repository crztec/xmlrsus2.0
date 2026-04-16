"""
worker.py — Entrypoint do Google Cloud Run Job do GAX.

Este arquivo é executado como um job isolado (não como servidor HTTP).
Ele lê a variável TASK_ID do ambiente, consulta o Firestore para descobrir
o tipo da tarefa e executa a função correta.

Para disparar localmente (para testes):
    TASK_ID=task_123 python -m api.worker
"""

import asyncio
import logging
import os
import platform
import sys

# Garante que o .env seja carregado antes de qualquer import local
try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
    else:
        load_dotenv()
except ImportError:
    pass

# Compat: event loop para Windows
if platform.system() == 'Windows':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def main():
    task_id = os.environ.get("TASK_ID")
    if not task_id:
        logger.error("TASK_ID não definido. Abortando o worker.")
        sys.exit(1)

    logger.info(f"[WORKER] Iniciando processamento da tarefa: {task_id}")

    # Import aqui para garantir que o Firebase já foi inicializado via imports dos módulos
    import api.database as db

    task = db.get_task(task_id)
    if not task:
        logger.error(f"[WORKER] Tarefa '{task_id}' não encontrada no Firestore. Abortando.")
        sys.exit(1)

    task_type = task.get("type", "")
    logger.info(f"[WORKER] Tipo da tarefa: {task_type}")

    # ── MAPEAMENTO DE TIPOS → FUNÇÕES ──────────────────────────────────────────

    if task_type == "xml_import":
        # Importa a função do main.py (sem FastAPI, só a lógica pura)
        from api.main import background_worker_task
        url_sistema = task.get("url_sistema", "")
        force = task.get("force", False)
        asyncio.run(background_worker_task(task_id, url_sistema, force))

    elif task_type in ("batch_api_check", "api_check_batch"):
        from api.automation_api_check import run_batch_api_check
        client_ids = task.get("client_ids")  # Pode ser None (lote completo)
        asyncio.run(run_batch_api_check(task_id, client_ids))

    elif task_type in ("single_api_check", "api_check_single"):
        from api.automation_api_check import run_single_api_check
        client_id = task.get("client_id", "")
        asyncio.run(run_single_api_check(client_id, task_id))

    elif task_type == "abi_check_batch":
        from api.automation_abi_check import run_batch_abi_check
        client_ids = task.get("client_ids")  # Pode ser None (lote completo)
        asyncio.run(run_batch_abi_check(task_id, client_ids))

    elif task_type == "abi_check_single":
        from api.automation_abi_check import run_single_abi_check
        client_id = task.get("client_id", "")
        asyncio.run(run_single_abi_check(client_id, task_id))

    elif task_type == "impugnation_check_batch":
        from api.automation_impugnation_check import run_batch_impugnation_check
        client_ids = task.get("client_ids")
        asyncio.run(run_batch_impugnation_check(task_id, client_ids))

    elif task_type == "impugnation_check_single":
        from api.automation_impugnation_check import run_single_impugnation_check
        client_id = task.get("client_id", "")
        asyncio.run(run_single_impugnation_check(client_id, task_id))

    else:
        logger.error(f"[WORKER] Tipo de tarefa desconhecido: '{task_type}'. Encerrando sem execução.")
        db.update_task(task_id, {"status": "failed", "last_log": f"Tipo de tarefa desconhecido: {task_type}"})
        sys.exit(1)

    logger.info(f"[WORKER] Tarefa '{task_id}' concluída com sucesso.")


if __name__ == "__main__":
    main()
