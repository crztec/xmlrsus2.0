import os
import logging
import requests
from fastapi import HTTPException
import api.database as db

logger = logging.getLogger(__name__)

def trigger_cloud_run_job(task_id: str, background_tasks=None):
    """
    Dispara um job no Google Cloud Run ou delega para execução local (fallback).
    """
    try:
        project = os.environ.get("GCP_PROJECT", "xmlrsus")
        region  = os.environ.get("GCP_REGION", "us-central1")
        
        # Conexão real na nuvem via Metadata Server
        metadata_url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https://www.googleapis.com/auth/cloud-platform"
        try:
            token_resp = requests.get(metadata_url, headers={"Metadata-Flavor": "Google"}, timeout=2)
            if token_resp.status_code == 200:
                access_token = token_resp.json().get("access_token")

                # Obtém o Project ID real dinamicamente do Metadata Server
                try:
                    project_resp = requests.get("http://metadata.google.internal/computeMetadata/v1/project/project-id", headers={"Metadata-Flavor": "Google"}, timeout=2)
                    if project_resp.status_code == 200:
                        project = project_resp.text.strip()
                        logger.info(f"[TRIGGER] Project ID dinâmico resolvido: {project}")
                except Exception as proj_err:
                    logger.warning(f"[TRIGGER] Falha ao obter Project ID dinâmico (usando '{project}'): {proj_err}")

                # Obtém a Região real dinamicamente do Metadata Server
                try:
                    region_resp = requests.get("http://metadata.google.internal/computeMetadata/v1/instance/region", headers={"Metadata-Flavor": "Google"}, timeout=2)
                    if region_resp.status_code == 200:
                        region_full = region_resp.text.strip()
                        # Formato retornado: projects/PROJECT_NUM/regions/REGION_NAME
                        region = region_full.split('/')[-1]
                        logger.info(f"[TRIGGER] Região dinâmica resolvida: {region}")
                except Exception as reg_err:
                    logger.warning(f"[TRIGGER] Falha ao obter Região dinâmica (usando '{region}'): {reg_err}")

                # Chamada REST para disparar o Job
                url = f"https://{region}-run.googleapis.com/v2/projects/{project}/locations/{region}/jobs/gax-worker-job:run"
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                }
                data = {
                    "overrides": {
                        "containerOverrides": [{"env": [{"name": "TASK_ID", "value": task_id}]}]
                    }
                }

                response = requests.post(url, headers=headers, json=data, timeout=10)
                
                if response.status_code == 200:
                    logger.info(f"[TRIGGER] Job disparado com sucesso via Metadata Server para task_id={task_id}")
                    return
                else:
                    raise Exception(f"Erro {response.status_code}: {response.text}")
            else:
                # Se não é 200, provavelmente não estamos na nuvem
                raise requests.exceptions.ConnectionError()
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # Fallback para modo local
            logger.info(f"[TRIGGER FALLBACK] Modo local (sem metadata server). Delegando ao processamento assíncrono...")
            if background_tasks:
                _execute_local_fallback(task_id, background_tasks)
            return

    except Exception as e:
        logger.error(f"[TRIGGER] Falha crítica no disparo: {e}")
        db.update_task(task_id, {"status": "failed", "last_log": f"Falha ao enfileirar o job: {str(e)[:120]}"})
        raise HTTPException(status_code=500, detail=f"Erro ao enfileirar o job: {str(e)[:120]}")

def _execute_local_fallback(task_id: str, background_tasks):
    """
    Execução simulada do worker em modo local usando BackgroundTasks do FastAPI.
    """
    task = db.get_task(task_id)
    if not task: return
    t_type = task.get("type", "")
    
    if "abi_check" in t_type:
        from api.automation_abi_check import run_batch_abi_check, run_single_abi_check
        if t_type == "abi_check_single":
            background_tasks.add_task(run_single_abi_check, task.get("client_id"), task_id)
        else:
            background_tasks.add_task(run_batch_abi_check, task_id, task.get("client_ids"))
    elif "impugnation" in t_type:
        from api.automation_impugnation_check import run_batch_impugnation_check, run_single_impugnation_check
        if t_type == "impugnation_check_single":
            background_tasks.add_task(run_single_impugnation_check, task.get("client_id"), task_id)
        else:
            background_tasks.add_task(run_batch_impugnation_check, task_id, task.get("client_ids"))
    elif "api_check" in t_type:
        from api.automation_api_check import run_batch_api_check, run_single_api_check
        if t_type == "api_check_single":
            background_tasks.add_task(run_single_api_check, task.get("client_id"), task_id)
        else:
            background_tasks.add_task(run_batch_api_check, task_id, task.get("client_ids"))
    elif t_type == "xml_import":
        from api.automation_xml_import import background_worker_task
        background_tasks.add_task(
            background_worker_task,
            task_id,
            task.get("url_sistema", ""),
            task.get("force", False)
        )
