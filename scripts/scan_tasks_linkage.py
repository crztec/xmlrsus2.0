import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

key_path = "c:/Users/Victor/.gemini/antigravity/scratch/xmlrsus2.0/firebase-key.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def scan_tasks_linkage():
    print("--- SCANNING TASKS COLLECTION ---")
    docs = db.collection('tasks').get()
    client_tasks = {}
    for doc in docs:
        d = doc.to_dict()
        client = d.get('razao_social')
        if client:
            client_tasks[client] = client_tasks.get(client, 0) + 1
            if "CAMPINAS" in client.upper() or "ERECHIM" in client.upper():
                print(f"Task ID: {doc.id} | Client: '{client}' | Status: {d.get('status')}")

    print("\n--- TASK SUMMARY BY CLIENT ---")
    for client, count in client_tasks.items():
        if "CAMPINAS" in client.upper() or "ERECHIM" in client.upper():
            print(f"Client: '{client}' -> {count} tasks")

if __name__ == "__main__":
    scan_tasks_linkage()
