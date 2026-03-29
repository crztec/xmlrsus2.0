import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

key_path = "c:/Users/Victor/.gemini/antigravity/scratch/xmlrsus2.0/firebase-key.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def merge_clients():
    print("--- STARTING MERGE OPERATION ---")

    mapping = [
        {
            "formal_id": "UNIMED CAMPINAS - COOPERATIVA DE TRABALHO M\u00c9DICO",
            "simple_id": "Unimed Campinas",
            "canonical_name": "Unimed Campinas"
        },
        {
            "formal_id": "UNIMED ERECHIM - COOPERATIVA DE SERVI\u00c7OS DE SA\u00daDE LTDA.",
            "simple_id": "Unimed Erechim",
            "canonical_name": "Unimed Erechim"
        }
    ]

    for item in mapping:
        f_id = item["formal_id"]
        s_id = item["simple_id"]
        canon = item["canonical_name"]

        print(f"\nProcessing: {canon}")

        # 1. Merge client_configs
        f_ref = db.collection('client_configs').document(f_id)
        s_ref = db.collection('client_configs').document(s_id)

        f_doc = f_ref.get()
        s_doc = s_ref.get()

        if f_doc.exists:
            fd = f_doc.to_dict()
            print(f"  Copying status from formal doc...")
            update_data = {
                'api_status': fd.get('api_status'),
                'api_last_check': fd.get('api_last_check'),
                'api_last_message': fd.get('api_last_message'),
                'name': canon,
                'razao_social': canon
            }
            # Preserve URL if simpler doc doesn't have it or if formal is better
            if fd.get('url_sistema') and not s_doc.to_dict().get('url_sistema'):
                 update_data['url_sistema'] = fd.get('url_sistema')

            s_ref.set(update_data, merge=True)
            print(f"  Deleting formal doc {f_id}...")
            f_ref.delete()
        else:
            print(f"  Formal doc {f_id} not found. Skipping config merge.")

        # 2. Update tasks collection (linking history)
        print(f"  Updating tasks linked to '{f_id}'...")
        tasks = db.collection('tasks').where('razao_social', '==', f_id).get()
        count = 0
        for task in tasks:
            task.reference.update({'razao_social': canon})
            count += 1
        print(f"  Updated {count} tasks.")

        # 3. Update task_files collection (direct client field)
        print(f"  Updating task_files linked to '{f_id}'...")
        files = db.collection('task_files').where('client', '==', f_id).get()
        fcount = 0
        for file in files:
            file.reference.update({'client': canon})
            fcount += 1
        print(f"  Updated {fcount} task_files.")

    print("\n--- MERGE COMPLETE ---")

if __name__ == "__main__":
    merge_clients()
