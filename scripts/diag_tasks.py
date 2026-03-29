import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

key_path = "c:/Users/Victor/.gemini/antigravity/scratch/xmlrsus2.0/firebase-key.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def diagnostic_task(task_id):
    print(f"--- DIAGNOSTIC FOR TASK: {task_id} ---")
    doc_ref = db.collection('tasks').document(task_id)
    doc = doc_ref.get()

    if not doc.exists:
        print("Task not found.")
        return

    task_data = doc.to_dict()
    print(f"Status: {task_data.get('status')}")
    print(f"Type: {task_data.get('type')}")
    print(f"Last Log: {task_data.get('last_log')}")

    print("\n--- LOGS ---")
    logs = doc_ref.collection('logs').get()
    sorted_logs = sorted([l.to_dict() for l in logs], key=lambda x: x.get('timestamp', ''))
    for ld in sorted_logs:
        print(f"[{ld.get('timestamp')}] {ld.get('level')}: {ld.get('message')}")

if __name__ == "__main__":
    # Verificando a última tarefa de api_check que vimos no scan anterior
    diagnostic_task("task_1774584591_c9ca")
