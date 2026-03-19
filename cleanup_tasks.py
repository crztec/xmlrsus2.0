import os
import firebase_admin
from firebase_admin import credentials, firestore
import json

# Tenta carregar a chave
key_path = "api/firebase-key.json"
if not os.path.exists(key_path):
    # Se estiver no root do projeto
    key_path = "firebase-key.json"

if os.path.exists(key_path):
    cred = credentials.Certificate(key_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
else:
    # Tenta inicialização padrão
    if not firebase_admin._apps:
        firebase_admin.initialize_app()

db = firestore.client()

def clear_stuck_tasks():
    print("Buscando tarefas PENDENTE ou EM ANDAMENTO...")
    tasks = db.collection('tasks').where('status', 'in', ['PENDENTE', 'EM ANDAMENTO']).stream()
    count = 0
    for doc in tasks:
        print(f"Cancelando tarefa: {doc.id}")
        doc.reference.update({
            'status': 'ERRO',
            'error_message': 'Cancelado manualmente para destravar interface.'
        })
        count += 1
    print(f"Total de {count} tarefas canceladas.")

if __name__ == "__main__":
    clear_stuck_tasks()
