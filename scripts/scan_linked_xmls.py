import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

key_path = "c:/Users/Victor/.gemini/antigravity/scratch/xmlrsus2.0/firebase-key.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def scan_linked_xmls():
    print("--- SCANNING TARGET CLIENTS IN task_files ---")
    targets = [
        "UNIMED CAMPINAS - COOPERATIVA DE TRABALHO M\u00c9DICO",
        "UNIMED ERECHIM - COOPERATIVA DE SERVI\u00c7OS DE SA\u00daDE LTDA.",
        "Unimed Campinas",
        "Unimed Erechim"
    ]
    
    # We'll check both 'client' field (usually Razao Social) and potentially 'client_id' if it exists
    docs = db.collection('task_files').get()
    counts = {t: 0 for t in targets}
    other_found = {}
    
    for doc in docs:
        d = doc.to_dict()
        client_val = str(d.get('client', ''))
        if client_val in counts:
            counts[client_val] += 1
        elif "CAMPINAS" in client_val.upper() or "ERECHIM" in client_val.upper():
            other_found[client_val] = other_found.get(client_val, 0) + 1
            
    for t, count in counts.items():
        print(f"Client: '{t}' -> {count} XML files")
    
    if other_found:
        print("\n--- OTHER VARIANTS FOUND ---")
        for variant, count in other_found.items():
            print(f"Variant: '{variant}' -> {count} XML files")

if __name__ == "__main__":
    scan_linked_xmls()
