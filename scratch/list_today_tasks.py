from api.database import firestore_db
from datetime import datetime, timezone, timedelta

tasks = firestore_db.collection('tasks').order_by('created_at', direction='DESCENDING').limit(20).stream()

for t in tasks:
    data = t.to_dict()
    print(f"ID: {t.id}")
    print(f"Type: {data.get('type')}")
    print(f"Created: {data.get('created_at')}")
    print(f"Status: {data.get('status')}")
    print("-" * 20)
