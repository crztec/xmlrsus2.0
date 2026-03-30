import api.database as db
import logging
import sys

# Suppress Firestore logs to see our output clearly
logging.getLogger('google.cloud.firestore').setLevel(logging.WARNING)

def diag():
    print("Checking last 10 tasks in Firestore...")
    tasks_ref = db.firestore_db.collection('tasks').order_by('created_at', direction='DESCENDING').limit(10).get()
    if not tasks_ref:
        print("No tasks found in the database.")
        return
    for doc in tasks_ref:
        data = doc.to_dict()
        print(f"ID: {doc.id} | Type: {data.get('type')} | Status: {data.get('status')} | Created: {data.get('created_at')}")

if __name__ == "__main__":
    diag()
