import api.database as db
from datetime import datetime, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def cleanup_stale_tasks():
    print("Iniciando limpeza de tarefas paradas (stale)...")
    
    # Define o limite de tempo (1 hora atrás)
    limit_time = datetime.now() - timedelta(hours=1)
    limit_str = limit_time.strftime("%Y-%m-%d %H:%M:%S")
    
    print(f"Buscando tarefas 'running' criadas antes de: {limit_str}")
    
    # Busca todas as tarefas em execução
    tasks_ref = db.firestore_db.collection('tasks').where('status', '==', 'running').get()
    
    count = 0
    for doc in tasks_ref:
        data = doc.to_dict()
        created_at = data.get('created_at', '')
        
        # Se a tarefa for mais antiga que 1 hora, marcamos como falha/expirada
        if created_at < limit_str:
            print(f"Limpando tarefa STALE: {doc.id} | Criada em: {created_at}")
            
            # Atualiza o status
            db.update_task(doc.id, {
                'status': 'failed',
                'last_log': 'Tarefa interrompida automaticamente por expiração (sessão antiga).',
                'completed_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            
            # Adiciona log final
            db.add_log(doc.id, "Tarefa marcada como FALHA por expiração (sessão inativa por mais de 1h).", "ERROR")
            count += 1
            
    print(f"Limpeza concluída. {count} tarefas foram encerradas.")

if __name__ == "__main__":
    cleanup_stale_tasks()
