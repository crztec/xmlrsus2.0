import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

key_path = "c:/Users/Victor/.gemini/antigravity/scratch/xmlrsus2.0/firebase-key.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def deep_scan():
    print("--- DEEP SCAN: CAMPINAS & ERECHIM ---")
    docs = db.collection('client_configs').get()
    found_any = False
    for doc in docs:
        d = doc.to_dict()
        # Search in all string values
        match = False
        full_text = ""
        for k, v in d.items():
            if isinstance(v, str):
                full_text += " " + v.upper()
        
        if doc.id.upper().find("CAMPINAS") != -1 or doc.id.upper().find("ERECHIM") != -1 or \
           full_text.find("CAMPINAS") != -1 or full_text.find("ERECHIM") != -1:
            print(f"ID: {doc.id}")
            print(f"Data: {json.dumps(d, indent=2)}")
            print("-" * 30)
            found_any = True
    
    if not found_any:
        print("No matching clients found in deep scan.")

if __name__ == "__main__":
    deep_scan()
