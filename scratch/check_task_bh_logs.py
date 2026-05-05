from api.database import firestore_db

task_id = "task_1777895591_1efc"
logs = firestore_db.collection('tasks').document(task_id).collection('logs').stream()

bh_logs = []
for l in logs:
    data = l.to_dict()
    msg = data.get('message', '')
    if 'Unimed Belo Horizonte' in msg:
        bh_logs.append((data.get('timestamp', ''), msg))

bh_logs.sort()
for t, m in bh_logs:
    print(f"{t} - {m}")
