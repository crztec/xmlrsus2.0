from api.database import firestore_db

# Search for any log message containing "3701 aguardando"
tasks = firestore_db.collection('tasks').order_by('created_at', direction='DESCENDING').limit(50).stream()

for t in tasks:
    logs = firestore_db.collection('tasks').document(t.id).collection('logs').stream()
    for l in logs:
        msg = l.to_dict().get('message', '')
        if '3701 aguardando' in msg:
            print(f"Task: {t.id}")
            print(f"Log: {msg}")
            print("-" * 20)
