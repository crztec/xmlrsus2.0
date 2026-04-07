import os
import sys

sys.path.append(os.getcwd())
from api import database as db

def stop_all_running_tasks():
    print("Buscando tasks rodando...")
    docs = db.firestore_db.collection('tasks').where('status', '==', 'running').get()
    count = 0
    for doc in docs:
        db.firestore_db.collection('tasks').document(doc.id).update({'status': 'stopped'})
        count += 1
        print(f"Task {doc.id} parada.")
        
    # Tentar também status = 'pending' ou 'running' que estejam ativas
    print(f"Total de tasks running paradas: {count}")

if __name__ == "__main__":
    stop_all_running_tasks()
