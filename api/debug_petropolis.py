import asyncio
import os
import sys

sys.path.append(os.getcwd())
import api.database as db
from api.automation_abi_check import _run_abi_check_logic, sync_to_cubeti_management

async def debug_petropolis():
    client_name = "Unimed Goiânia"
    task_id = "debug_task_local_9999"
    
    print(f"Iniciando debug para {client_name}...")
    
    client = next((c for c in db.get_all_clients() if "goi" in str(c.get('name', '')).lower()), None)
    if not client:
        print("Tentando buscar Goiânia...")
        client = next((c for c in db.get_all_clients() if "goiânia" in str(c.get('name', '')).lower()), None)
    if not client:
        print("Cliente não encontrado na base local.")
        return

    print(f"Iniciando checagem para client_id={client['id']}")

    original_run = _run_abi_check_logic
    
    async def run_wrapped(*args, **kwargs):
        return await original_run(*args, **kwargs)
        
    status, msg, err = await run_wrapped(client['id'], "105º", task_id=task_id)
    
    print(f"RESULTADO RSUS: Status={status}, Msg={msg}, Err={err}")
    
    if status == "Importado e Analisado" or "Importou e Analisou" in status:
        sync_success = await sync_to_cubeti_management(client_name, status, msg, task_id=task_id)
        print(f"RESULTADO CUBETI: Success={sync_success}")
        
if __name__ == "__main__":
    asyncio.run(debug_petropolis())
