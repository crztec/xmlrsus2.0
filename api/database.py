import os
import sys
import logging
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, storage

# Configure standard logging to output to stdout (which Cloud Run captures)
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# O nome do bucket do Firebase Storage 
FIREBASE_STORAGE_BUCKET = os.environ.get('FIREBASE_STORAGE_BUCKET', 'xmlrsus.firebasestorage.app')

# Initialize Firebase only once
firestore_db = None

if not firebase_admin._apps:
    logger.info("Initializing Firebase Admin SDK...")
    try:
        # 1. Tenta ADC (Application Default Credentials) - Funciona nativo no Cloud Run
        # 2. Tenta firebase-key.json se o anterior falhar ou se estiver rodando local sem ADC configurada
        cred = None
        try:
            cred = credentials.ApplicationDefault()
            # Testamos se o cred é válido tentando inicializar (ele só valida ao usar)
            firebase_admin.initialize_app(cred, {
                'storageBucket': FIREBASE_STORAGE_BUCKET.replace("gs://", "")
            })
            logger.info("Firebase Admin inicializado via ADC.")
        except Exception as adc_err:
            logger.info(f"ADC não disponível ou falhou: {adc_err}. Tentando chave local...")
            if os.path.exists('firebase-key.json'):
                cred = credentials.Certificate('firebase-key.json')
                firebase_admin.initialize_app(cred, {
                    'storageBucket': FIREBASE_STORAGE_BUCKET.replace("gs://", "")
                })
                logger.info("Firebase Admin inicializado via firebase-key.json.")
            else:
                # Se tudo falhar, inicializa sem credenciais explícitas (pode funcionar se o gcloud estiver logado)
                firebase_admin.initialize_app(options={
                    'storageBucket': FIREBASE_STORAGE_BUCKET.replace("gs://", "")
                })
                logger.info("Firebase Admin inicializado por padrão (sem credenciais explícitas).")

    except Exception as e:
        logger.error(f"Erro crítico na inicialização do Firebase Admin: {e}")

if not firestore_db:
    try:
        # No Cloud Run, o Firestore client detecta o projeto automaticamente se não passarmos nada
        firestore_db = firestore.client()
        logger.info("Firestore client inicializado com sucesso.")
    except Exception as e:
        logger.error(f"Falha ao inicializar Firestore client: {e}")
        firestore_db = None

def upload_xml_to_storage(task_id, filename, file_content_bytes):
    """
    Uploads the XML file content to Firebase Storage and returns the file path.
    """
    bucket = storage.bucket()
    import uuid
    unique_id = str(uuid.uuid4())[:8]
    clean_filename = filename.replace("/", "_").replace("\\", "_")
    destination_blob_name = f"tasks/{task_id}/{unique_id}_{clean_filename}"
    
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_string(file_content_bytes, content_type='application/xml')
    
    logger.info(f"File uploaded to Storage successfully: {destination_blob_name}")
    return destination_blob_name

def download_xml_from_storage(storage_path, local_destination_path):
    """
    Downloads the XML file from Firebase Storage to a local path.
    """
    try:
        bucket = storage.bucket()
        blob = bucket.blob(storage_path)
        blob.download_to_filename(local_destination_path)
        logger.info(f"File downloaded successfully to {local_destination_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to download {storage_path} from Storage: {e}")
        return False

def delete_xml_from_storage(storage_path):
    """
    Deletes the XML file from Firebase Storage to free up space.
    """
    if not storage_path:
        return
    try:
        bucket = storage.bucket()
        blob = bucket.blob(storage_path)
        if blob.exists():
            blob.delete()
            logger.info(f"File deleted successfully from Storage: {storage_path}")
    except Exception as e:
        logger.error(f"Failed to delete {storage_path} from Storage: {e}")

def init_db():
    pass

# --- RBAC & USER MANAGEMENT ---
def create_user_profile(email, first_name="", last_name=""):
    """Creates a user document in Firestore. Forces 'admin'/'approved' for the master email."""
    if not email: return
    
    doc_ref = firestore_db.collection('users').document(email)
    doc = doc_ref.get()
    
    if not doc.exists:
        if email.lower() == "victor@cubeti.com.br":
            role = "admin"
            status = "approved"
        else:
            role = "user"
            status = "pending"
            
        doc_ref.set({
            'email': email,
            'first_name': first_name,
            'last_name': last_name,
            'role': role,
            'status': status,
            'created_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

def update_user_profile(current_email, new_email, first_name, last_name, role=None, status=None):
    if not current_email: return False
    try:
        old_doc_ref = firestore_db.collection('users').document(current_email)
        doc = old_doc_ref.get()
        if not doc.exists: return False
        
        data = doc.to_dict()
        data['first_name'] = first_name
        data['last_name'] = last_name
        if role: data['role'] = role
        if status: data['status'] = status
        
        if new_email and new_email != current_email:
            data['email'] = new_email
            new_doc_ref = firestore_db.collection('users').document(new_email)
            new_doc_ref.set(data)
            old_doc_ref.delete()
        else:
            old_doc_ref.update({
                'first_name': first_name, 
                'last_name': last_name,
                'role': data['role'],
                'status': data['status']
            })
        return True
    except Exception as e:
        logger.error(f"Failed to update user profile in Firestore: {e}")
        return False

def get_user_profile(email):
    if not email: return None
    doc = firestore_db.collection('users').document(email).get()
    if doc.exists: return doc.to_dict()
    return None

def get_all_users():
    users = []
    docs = firestore_db.collection('users').stream()
    for doc in docs:
        data = doc.to_dict()
        data['id'] = doc.id
        users.append(data)
    return users

def get_all_users_by_status(status):
    return [u for u in get_all_users() if u.get('status') == status]

def get_pending_users():
    return get_all_users_by_status('pending')

def get_all_clients():
    clients = []
    docs = firestore_db.collection('client_configs').stream()
    for doc in docs:
        data = doc.to_dict()
        data['id'] = doc.id
        if 'name' not in data and 'razao_social' in data: data['name'] = data['razao_social']
        elif 'name' not in data: data['name'] = doc.id
        clients.append(data)
    return clients

def get_all_xml_data():
    xml_data_list = []
    docs = firestore_db.collection('task_files').order_by('data_processamento', direction=firestore.Query.DESCENDING).limit(500).stream()
    
    seen_abis = set()
    for doc in docs:
        data = doc.to_dict()
        abi = data.get("numero_abi") or doc.id
        
        # Deduplicação: Mantém apenas a entrada mais recente para cada ABI
        if abi not in seen_abis:
            seen_abis.add(abi)
            xml_data_list.append({
                "id": doc.id,
                "file_name": data.get("nome_arquivo") or "-",
                "abi": abi,
                "client": data.get("razao_social") or "Desconhecido",
                "competence": data.get("competencias") or "-",
                "value": data.get("valor_total_processo") or "0,00",
                "quantity": data.get("quantidade_processo") or "0",
                "process_number": data.get("numero_processo") or "-",
                "transaction_date": data.get("data_registro_transacao") or "-",
                "recebimento_oficio": data.get("data_recebimento_oficio") or "-",
                "date": data.get("data_processamento") or data.get("data_registro_transacao") or "-",
                "status": "Importado" if data.get("status_importacao") == "SUCESSO" else "Pendente" if data.get("status_importacao") == "Pendente" else "Erro",
                "storage_path": data.get("storage_path", "")
            })
            
    # Ordenação por ABI Decrescente (Numérica)
    def extract_num(s):
        import re
        m = re.search(r'(\d+)', str(s))
        return int(m.group(1)) if m else 0
        
    xml_data_list.sort(key=lambda x: extract_num(x['abi']), reverse=True)
    return xml_data_list

def update_user_status(email, new_status):
    if not email: return
    firestore_db.collection('users').document(email).update({'status': new_status})
    
def update_user_role(email, new_role):
    if not email: return
    firestore_db.collection('users').document(email).update({'role': new_role})
    
def delete_user_profile(email):
    if not email: return
    firestore_db.collection('users').document(email).delete()
    try:
        from firebase_admin import auth as admin_auth
        user_record = admin_auth.get_user_by_email(email)
        admin_auth.delete_user(user_record.uid)
        logger.info(f"User {email} completely deleted from Auth and Firestore.")
    except Exception as e:
        logger.error(f"Failed to delete {email} from Firebase Auth: {e}")

def get_branding():
    try:
        doc = firestore_db.collection('system_settings').document('branding').get()
        if doc.exists: return doc.to_dict()
    except Exception as e:
        logger.error(f"Erro ao buscar branding: {e}")
    return {}

def save_branding(system_name, logo_base64=None):
    try:
        data = {'system_name': system_name}
        if logo_base64: data['logo_base64'] = logo_base64
        firestore_db.collection('system_settings').document('branding').set(data, merge=True)
    except Exception as e:
        logger.error(f"Erro ao salvar branding: {e}")

def get_last_url_for_client(razao_social):
    if not razao_social: return ""
    try:
        doc = firestore_db.collection('client_configs').document(razao_social).get()
        if doc.exists: return doc.to_dict().get('url_sistema', '')
        from google.cloud.firestore_v1.base_query import FieldFilter
        from firebase_admin import firestore
        docs = firestore_db.collection('tasks') \
            .where(filter=FieldFilter("razao_social", "==", razao_social)) \
            .order_by("created_at", direction=firestore.Query.DESCENDING) \
            .limit(1).stream()
        for d in docs: return d.to_dict().get('url_sistema', '')
    except Exception as e:
        print(f"Erro ao buscar última URL para {razao_social}: {e}")
    return ""

def save_client_config(razao_social, url_sistema):
    if not razao_social: return
    try:
        firestore_db.collection('client_configs').document(razao_social).set({
            'url_sistema': url_sistema,
            'updated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True)
    except Exception as e:
        logger.error(f"Erro ao salvar configuração do cliente {razao_social}: {e}")

def create_task(url_sistema, usuario, senha, razao_social=""):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    task_ref = firestore_db.collection('tasks').document()
    task_data = {
        'status': 'PENDENTE',
        'created_at': now,
        'updated_at': now,
        'url_sistema': url_sistema,
        'usuario': usuario,
        'senha': senha,
        'razao_social': razao_social,
        'total_arquivos': 0,
        'arquivos_processados': 0,
        'error_message': '',
        'logs': []
    }
    task_ref.set(task_data)
    return task_ref.id

def add_file_to_task(task_id, file_info):
    file_ref = firestore_db.collection('task_files').document()
    file_data = {
        'task_id': task_id,
        'nome_arquivo': file_info.get('Nome do Arquivo', ''),
        'numero_abi': file_info.get('Número ABI', ''),
        'numero_processo': file_info.get('Número do Processo', ''),
        'data_registro_transacao': file_info.get('Data de Registro da Transação', ''),
        'data_recebimento_oficio': file_info.get('Data Recebimento Ofício', ''),
        'competencias': file_info.get('Datas de Competência', ''),
        'quantidade_processo': file_info.get('Quantidade de Processo', ''),
        'valor_total_processo': file_info.get('Valor Total do Processo', ''),
        'status_importacao': 'Pendente',
        'data_processamento': '',
        'error_message': '',
        'storage_path': file_info.get('storage_path', '')
    }
    file_ref.set(file_data)

def add_files_to_task_bulk(task_id, files_info_list):
    if not files_info_list: return
    for i in range(0, len(files_info_list), 500):
        batch = firestore_db.batch()
        chunk = files_info_list[i:i + 500]
        for file_info in chunk:
            file_ref = firestore_db.collection('task_files').document()
            file_data = {
                'task_id': task_id,
                'nome_arquivo': file_info.get('Nome do Arquivo', '') or file_info.get('nome_arquivo', ''),
                'numero_abi': file_info.get('Número ABI', '') or file_info.get('numero_abi', ''),
                'numero_processo': file_info.get('Número do Processo', '') or file_info.get('numero_processo', ''),
                'data_registro_transacao': file_info.get('Data de Registro da Transação', '') or file_info.get('data_registro_transacao', ''),
                'competencias': file_info.get('Datas de Competência', '') or file_info.get('competencias', ''),
                'data_recebimento_oficio': file_info.get('Data Recebimento Ofício', '') or file_info.get('data_recebimento_oficio', ''),
                'quantidade_processo': file_info.get('Quantidade de Processo', '') or file_info.get('quantidade_processo', ''),
                'valor_total_processo': file_info.get('Valor Total do Processo', '') or file_info.get('valor_total_processo', ''),
                'status_importacao': 'Pendente',
                'data_processamento': '',
                'error_message': '',
                'storage_path': file_info.get('storage_path', ''),
                'razao_social': file_info.get('razao_social', '')
            }
            batch.set(file_ref, file_data)
        batch.commit()

def update_task_total_files(task_id, total):
    firestore_db.collection('tasks').document(task_id).update({
        'total_arquivos': total,
        'updated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

def add_log(task_id, level, message):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_data = {
        'timestamp': now, 'level': level, 'message': message,
        'timestamp_ms': datetime.now().timestamp() * 1000
    }
    firestore_db.collection('tasks').document(task_id).update({
        'logs': firestore.ArrayUnion([log_data])
    })

def get_pending_task():
    results = firestore_db.collection('tasks').where('status', '==', 'PENDENTE').limit(1).stream()
    task_doc = None
    for doc in results:
        task_doc = doc
        break
    if task_doc:
        task_ref = firestore_db.collection('tasks').document(task_doc.id)
        task_ref.update({
            'status': 'EM ANDAMENTO',
            'updated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        task_data = task_doc.to_dict()
        task_data['id'] = task_doc.id
        return task_data
    return None

def get_tasks_for_dashboard(limit=5):
    docs = firestore_db.collection('tasks').order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit).stream()
    return [{**doc.to_dict(), 'id': doc.id} for doc in docs]

def get_files_for_task(task_id):
    docs = firestore_db.collection('task_files').where('task_id', '==', task_id).stream()
    return [{**doc.to_dict(), 'id': doc.id} for doc in docs]

def get_logs_for_task(task_id, limit=50):
    try:
        task_doc = firestore_db.collection('tasks').document(task_id).get()
        if not task_doc.exists: return []
        logs = task_doc.to_dict().get('logs', [])
        logs.sort(key=lambda x: x.get('timestamp_ms', 0), reverse=True)
        return logs[:limit]
    except Exception as e:
        logger.error(f"Erro ao recuperar logs: {e}")
        return []

def clear_import_logs():
    try:
        tasks = firestore_db.collection('tasks').stream()
        batch = firestore_db.batch()
        count = 0
        for doc in tasks:
            batch.update(doc.reference, {'logs': []})
            count += 1
            if count >= 500:
                batch.commit()
                batch = firestore_db.batch()
                count = 0
        if count > 0: batch.commit()
        return True
    except Exception as e:
        logger.error(f"Erro ao limpar logs: {e}")
        return False

def reset_system_database():
    try:
        for coll in ['client_configs', 'tasks', 'task_files']:
            docs = firestore_db.collection(coll).limit(500).stream()
            while True:
                batch = firestore_db.batch()
                count = 0
                for doc in docs:
                    batch.delete(doc.reference)
                    count += 1
                if count == 0: break
                batch.commit()
                docs = firestore_db.collection(coll).limit(500).stream()
        return True
    except Exception as e:
        logger.error(f"Erro ao resetar banco: {e}")
        return False
