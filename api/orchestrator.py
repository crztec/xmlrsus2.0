import os
import logging
import subprocess
import sys
from fastapi import HTTPException
import api.database as db

logger = logging.getLogger(__name__)

def trigger_cloud_run_job(task_id: str, background_tasks=None):
    """
    Dispara o worker em um processo isolado no servidor local (Oracle VM).
    Ignora a infraestrutura do Google Cloud Run.
    O argumento `background_tasks` é mantido para não quebrar o código existente da API.
    """
    try:
        logger.info(f"[TRIGGER] Iniciando worker em subprocess para task_id={task_id}")
        
        # Copia o ambiente atual e adiciona a variável TASK_ID
        env = os.environ.copy()
        env["TASK_ID"] = task_id
        
        # Prepara argumentos para separar o processo da API
        kwargs = {}
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        else:
            kwargs['start_new_session'] = True
            
        subprocess.Popen(
            [sys.executable, "-m", "api.worker"],
            env=env,
            **kwargs
        )
        logger.info(f"[TRIGGER] Subprocess iniciado com sucesso para {task_id}")
        
    except Exception as e:
        logger.error(f"[TRIGGER] Falha crítica no disparo local: {e}")
        db.update_task(task_id, {"status": "failed", "last_log": f"Falha ao iniciar subprocess: {str(e)[:120]}"})
        raise HTTPException(status_code=500, detail=f"Erro ao iniciar a tarefa localmente: {str(e)[:120]}")
