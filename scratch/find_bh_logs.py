from api.database import firestore_db
from datetime import datetime, timedelta

# Search for logs containing "Unimed Belo Horizonte" in the last hour
now = datetime.now()
tasks = firestore_db.collection('tasks').order_by('created_at', direction='DESCENDING').limit(20).stream()

for t in tasks:
    data = t.to_dict()
    logs = firestore_db.collection('tasks').document(t.id).collection('logs').stream()
    for l in logs:
        log_data = l.to_dict()
        msg = log_data.get('message', '')
        if 'Unimed Belo Horizonte' in msg:
            print(f"Task: {t.id} ({data.get('type')}) - Status: {data.get('status')}")
            print(f"Log: {log_data.get('timestamp')} - {msg}")
            if 'IMPUGNANDO!' in msg:
                 print(f"FOUND FINAL LOG: {msg}")
