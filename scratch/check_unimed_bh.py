from api.database import firestore_db
docs = firestore_db.collection('client_configs').stream()
for doc in docs:
    data = doc.to_dict()
    name = str(data.get('name') or data.get('razao_social') or "").lower()
    if 'belo horizonte' in name:
        print(f"ID: {doc.id}")
        print(f"Name: {data.get('name')}")
        print(f"Stats: {data.get('impugnation_stats')}")
        print(f"Last Check: {data.get('impugnation_last_check')}")
        print("-" * 20)
