import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate('firebase-key.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

def final_fix_79():
    print("Iniciando correção final para ABI 79...")
    possiveis = ['79', 79, '79°', '79º']
    for val in possiveis:
        docs = db.collection('task_files').where('numero_abi', '==', val).stream()
        for doc in docs:
            print(f"Corrigindo documento {doc.id} (Valor: {val})")
            db.collection('task_files').document(doc.id).update({
                'status_importacao': 'ERRO',
                'error_message': 'Erro na fase de upload (Filtro de Robustez aplicado)'
            })
    print("Correção concluída.")

if __name__ == "__main__":
    final_fix_79()
