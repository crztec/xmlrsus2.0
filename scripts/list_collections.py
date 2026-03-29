import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

key_path = "c:/Users/Victor/.gemini/antigravity/scratch/xmlrsus2.0/firebase-key.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def list_collections():
    print("--- COLLECTIONS ---")
    collections = db.collections()
    for col in collections:
        print(f"- {col.id}")

if __name__ == "__main__":
    list_collections()
