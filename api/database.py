import logging
import os
import secrets
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, firestore, storage

# Configure standard logging to output to stdout (which Cloud Run captures)
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# O nome do bucket do Firebase Storage
FIREBASE_STORAGE_BUCKET = os.environ.get('FIREBASE_STORAGE_BUCKET', 'xmlrsus.firebasestorage.app')

# Initialize Firebase only once
firestore_db = None

def get_now_br():
    """Returns current datetime in UTC-3 (Brazil/Sao Paulo)"""
    return datetime.now(timezone(timedelta(hours=-3)))

if not firebase_admin._apps:
    logger.info("Initializing Firebase Admin SDK...")
    try:
        # 1. Tenta PRIMEIRO o arquivo local se existir (melhor para dev/local)
        if os.path.exists('firebase-key.json'):
            cred = credentials.Certificate('firebase-key.json')
            firebase_admin.initialize_app(cred, {
                'storageBucket': FIREBASE_STORAGE_BUCKET.replace("gs://", "")
            })
            logger.info("Firebase Admin inicializado via firebase-key.json.")
        else:
            # 2. Tenta ADC (Application Default Credentials) - Funciona nativo no Cloud Run
            try:
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred, {
                    'storageBucket': FIREBASE_STORAGE_BUCKET.replace("gs://", "")
                })
                logger.info("Firebase Admin inicializado via ADC.")
            except Exception as adc_err:
                logger.info(f"ADC não disponível ou falhou: {adc_err}. Inicializando por padrão...")
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

def upload_screenshot(screenshot_path, img_bytes):
    """
    Uploads a screenshot (PNG) to Firebase Storage for debugging.
    """
    try:
        bucket = storage.bucket()
        blob = bucket.blob(screenshot_path)
        blob.upload_from_string(img_bytes, content_type='image/png')
        logger.info(f"Screenshot uploaded: {screenshot_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to upload screenshot: {e}")
        return False

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

def get_friendly_error(technical_error):
    """
    Maps technical error messages from Playwright/Portal to user-friendly ones.
    """
    if not technical_error: return ""
    te = str(technical_error).lower()

    # Erros de Autenticação/Firebase
    if "at least 6 characters" in te:
        return "A senha deve conter pelo menos 6 caracteres."
    if "invalid password" in te:
        return "Senha inválida ou mal formatada."
    if "user not found" in te:
        return "Usuário não encontrado."
    if "wrong password" in te:
        return "Senha incorreta."

    # Erros do Portal RSUS/Playwright
    if "timeout" in te:
        return "O portal demorou muito para responder. Tente novamente."
    if "login failed" in te or "credenciais" in te or "senha" in te:
        return "Usuário ou senha incorretos para o portal RSUS."
    if "selector" in te or "element" in te or "invisible" in te or "not found" in te:
        return "O portal RSUS mudou ou está lento (Campo não encontrado). Tente novamente."
    if "already imported" in te or "duplicidade" in te or "já foi importada" in te:
        return "Esta ABI já foi importada anteriormente no portal."
    if "net::err" in te or "connection" in te:
        return "Erro de conexão com o portal. Verifique sua internet."

    # Fallback para o erro original mas sem o rastro técnico se for muito longo
    return str(technical_error)[:100]

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

# --- VERIFICATION CODES ---
def save_verification_code(email, code, action_type):
    """Saves a 6-digit code for email/password change. Expires in 1 minute."""
    try:
        expires_at = int((get_now_br() + timedelta(minutes=1)).timestamp())
        firestore_db.collection('verification_codes').document(email).set({
            'code': str(code),
            'type': action_type,
            'expires_at': expires_at
        })
        return True
    except Exception as e:
        logger.error(f"Failed to save verification code: {e}")
        return False

def verify_code(email, code, action_type):
    """Checks if the code is valid for the given email and type."""
    try:
        doc_ref = firestore_db.collection('verification_codes').document(email)
        doc = doc_ref.get()
        if not doc.exists: return False

        data = doc.to_dict()
        now_ts = int(get_now_br().timestamp())

        if data['code'] == str(code) and data['type'] == action_type and now_ts <= data['expires_at']:
            # Deleta pós uso único
            doc_ref.delete()
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to verify code: {e}")
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
    """Returns all clients from client_configs, deduplicated by normalized Name + CNPJ."""
    docs = firestore_db.collection('client_configs').stream()
    clients = []
    seen_keys = set()
    
    def normalize_name(name):
        if not name: return ""
        n = name.upper().strip()
        # Remove sufixos comuns que causam duplicidade
        n = n.split(" - ")[0] # "Unimed Erechim - COOPERATIVA" -> "UNIMED ERECHIM"
        n = n.replace("COOPERATIVA DE TRABALHO", "").strip()
        return n

def get_clients_paginated(page=1, limit=10, search=""):
    """Recupera clientes com paginação e busca opcional."""
    try:
        query = firestore_db.collection('client_configs')
        
        # Se houver busca, o Firestore tem limitações (precisa de índices complexos para busca parcial).
        # Por enquanto, carregaremos uma fatia maior e filtraremos para manter a simplicidade,
        # ou usaremos prefix query se o usuário digitar o início do nome.
        
        all_docs = query.get()
        clients = []
        seen_keys = set()
        
        def normalize_name(n):
            if not n: return ""
            return "".join(c for c in n.lower() if c.isalnum())

        for doc in all_docs:
            data = doc.to_dict()
            name = data.get('name') or data.get('razao_social') or doc.id
            cnpj = data.get('cnpj', '')
            
            # Deduplicação agressiva em tempo de execução (enquanto a base não é limpa permanentemente)
            norm = normalize_name(name)
            key = f"{norm}_{cnpj}"
            if key in seen_keys: continue
            seen_keys.add(key)
            
            if search and search.lower() not in name.lower() and search not in cnpj:
                continue
                
            clients.append({
                'id': doc.id,
                'name': name,
                'cnpj': cnpj,
                'url_sistema': data.get('url_sistema', ''),
                'api_status': data.get('api_status', 'unknown'),
                'api_last_check': data.get('api_last_check', '-'),
                'api_last_message': data.get('api_last_message', ''),
                'total_abis': data.get('total_abis', 0)
            })
            
        clients.sort(key=lambda x: x['name'])
        
        total = len(clients)
        start = (page - 1) * limit
        end = start + limit
        
        return clients[start:end], total
    except Exception as e:
        logger.error(f"Erro na paginação de clientes: {e}")
        return [], 0

def get_client_config(client_id):
    """Returns a single client config by ID."""
    doc = firestore_db.collection('client_configs').document(client_id).get()
    if doc.exists:
        data = doc.to_dict()
        data['id'] = doc.id
        return data
    return None

def create_task(task_type, description="", url_sistema="", usuario="", senha="", razao_social=""):
    """
    Cria uma nova tarefa no Firestore.
    Suporta campos de progresso para checagem em lote.
    """
    task_id = f"task_{int(time.time())}_{secrets.token_hex(2)}"
    now = get_now_br()
    
    task_data = {
        'id': task_id,
        'type': task_type,
        'description': description,
        'status': 'running',
        'created_at': now.strftime("%Y-%m-%d %H:%M:%S"),
        'updated_at': now.strftime("%Y-%m-%d %H:%M:%S"),
        'url_sistema': url_sistema,
        'usuario': usuario,
        'senha': senha,
        'razao_social': razao_social,
        'current': 0,
        'total': 0,
        'current_client': '',
        'last_log': ''
    }
    
    # Compatibilidade com campos antigos do XML
    if task_type == "xml_import":
        task_data['total_arquivos'] = 0
        task_data['arquivos_processados'] = 0
        task_data['status'] = 'PENDENTE' # This will override 'running' if xml_import

    firestore_db.collection('tasks').document(task_id).set(task_data)
    return task_id

def update_task(task_id, data):
    """Updates task status/metadata."""
    firestore_db.collection('tasks').document(task_id).set(data, merge=True)

def add_log(task_id, message, level="INFO"):
    """Adiciona um log a uma tarefa e atualiza o log resumido."""
    try:
        now = get_now_br()
        timestamp = now.strftime("%H:%M:%S")
        
        log_entry = {
            'timestamp': timestamp,
            'message': message,
            'level': level.upper()
        }
        
        task_ref = firestore_db.collection('tasks').document(task_id)
        task_ref.collection('logs').add(log_entry)
        
        # Atualiza o último log na tarefa (para log resumido na UI)
        task_ref.update({
            'last_log': message,
            'updated_at': now.strftime("%Y-%m-%d %H:%M:%S")
        })
        
        # Atualiza status se for conclusão (apenas para tipos legados ou logs explícitos)
        # O robô de monitoramento de API gerencia o próprio status agora.
        if ("finalizada" in message.lower() or "concluída" in message.lower()) and "api_check" not in task_id:
            task_ref.update({'status': 'completed'})
            
    except Exception as e:
        logger.error(f"Erro ao adicionar log à tarefa {task_id}: {e}")
        return False

def get_task_logs(task_id):
    """Recupera todos os logs de uma tarefa específica, ordenados por tempo."""
    try:
        logs_ref = firestore_db.collection('tasks').document(task_id).collection('logs')
        # Como o Firestore não garante ordem de inserção em subcoleções sem um campo de ordenação robusto,
        # e aqui estamos usando um timestamp de string (HH:MM:SS), 
        # para uma checagem rápida isso deve bastar, mas em lote pode precisar de mais precisão.
        docs = logs_ref.order_by('timestamp').get()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        logger.error(f"Erro ao recuperar logs da tarefa {task_id}: {e}")
        return []

def update_client_config(client_id, update_data):
    """
    Updates client configuration metadata like Name, CNPJ, ANS, Address and System URL.
    """
    if not client_id: return False
    try:
        # Normaliza chaves para garantir consistência no Firestore
        clean_data = {
            'name': update_data.get('name', update_data.get('razao_social', '')),
            'razao_social': update_data.get('name', update_data.get('razao_social', '')),
            'cnpj': update_data.get('cnpj', ''),
            'registro_ans': update_data.get('registro_ans', ''),
            'endereco': update_data.get('endereco', ''),
            'url_sistema': update_data.get('url_sistema', ''),
            'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        }
        firestore_db.collection('client_configs').document(client_id).set(clean_data, merge=True)
        return True
    except Exception as e:
        logger.error(f"Erro ao atualizar cliente {client_id}: {e}")
        return False

def update_client_api_status(client_id, status, message, task_id=None, screenshot_url=None):
    """Updates the API monitoring status for a client, maintaining history and forensics."""
    if not client_id: return False
    try:
        client_ref = firestore_db.collection('client_configs').document(client_id)
        doc = client_ref.get()
        
        # Gerenciamento de histórico (últimos 10 status)
        client_doc = client_ref.get()
        
        update_data = {
            'api_status': status,
            'api_last_message': message,
            'api_last_check': firestore.SERVER_TIMESTAMP
        }
        
        if task_id:
            update_data['api_last_task_id'] = task_id
        if screenshot_url:
            update_data['api_last_screenshot_url'] = screenshot_url
        
        # Gerenciar Histórico Simples no documento principal (para performance na lista)
        if client_doc.exists:
            history = client_doc.to_dict().get('api_status_history', [])
            history.append(status)
            if len(history) > 15: # Aumentado para 15 conforme solicitado
                history = history[-15:]
            update_data['api_status_history'] = history
        
        client_ref.update(update_data)
        
        # Gravar na sub-coleção 'history' para auditoria detalhada e gráficos
        client_ref.collection('history').add({
            'status': status,
            'message': message,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'task_id': task_id,
            'screenshot_url': screenshot_url
        })
        
        return True
    except Exception as e:
        logger.error(f"Erro ao atualizar status do cliente {client_id}: {e}")
        return False

def save_rsus_credentials(cred_type, username, password):
    """Saves global RSUS credentials (general or unimed_vitoria)."""
    try:
        firestore_db.collection('system_settings').document('rsus_credentials').set({
            cred_type: {
                'username': username,
                'password': password,
                'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
            }
        }, merge=True)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar credenciais RSUS ({cred_type}): {e}")
        return False

def get_rsus_credentials(cred_type):
    """Retrieves global RSUS credentials by type."""
    try:
        doc = firestore_db.collection('system_settings').document('rsus_credentials').get()
        if doc.exists:
            creds = doc.to_dict()
            return creds.get(cred_type)
    except Exception as e:
        logger.error(f"Erro ao buscar credenciais RSUS ({cred_type}): {e}")
    return None

def get_xml_data_paginated(page=1, limit=10, search=""):
    """Recupera metadados de XML com paginação e busca, com deduplicação por ABI."""
    try:
        # Pega os 500 mais recentes e deduplica (para manter performance)
        # Em um sistema com milhões de registros, precisaríamos de uma coleção 'abis' única.
        docs = firestore_db.collection('task_files').order_by('data_processamento', direction=firestore.Query.DESCENDING).limit(1000).get()
        
        xml_list = []
        seen_abis = set()
        
        for doc in docs:
            d = doc.to_dict()
            abi = d.get("numero_abi") or doc.id
            file_name = d.get("nome_arquivo") or "-"
            client = d.get("razao_social") or "Desconhecido"
            
            if abi in seen_abis: continue
            
            if search:
                s = search.lower()
                if s not in abi.lower() and s not in file_name.lower() and s not in client.lower():
                    continue
            
            seen_abis.add(abi)
            xml_list.append({
                "id": doc.id,
                "file_name": file_name,
                "abi": abi,
                "client": client,
                "competence": d.get("competencias") or "-",
                "value": d.get("valor_total_processo") or "0,00",
                "quantity": d.get("quantidade_processo") or "0",
                "process_number": d.get("numero_processo") or "-",
                "transaction_date": d.get("data_registro_transacao") or "-",
                "date": d.get("data_processamento") or d.get("data_registro_transacao") or "-",
                "status": "Importado" if d.get("status_importacao") == "SUCESSO" else "Pendente" if d.get("status_importacao") == "Pendente" else "Erro",
                "storage_path": d.get("storage_path", "")
            })

        total = len(xml_list)
        start = (page - 1) * limit
        end = start + limit
        
        return xml_list[start:end], total
    except Exception as e:
        logger.error(f"Erro na paginação de XML: {e}")
        return [], 0

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

def check_abi_already_imported(razao_social, numero_abi):
    """
    Checks if an ABI has already been successfully imported for a specific client.
    Normaliza o número para evitar erros com sufixos tipo '72°'
    """
    if not razao_social or not numero_abi:
        return False
    try:
        import re
        # Extrai apenas os números: '72°' -> '72'
        abi_clean = re.sub(r'\D', '', str(numero_abi))
        if not abi_clean: return False

        from google.cloud.firestore_v1.base_query import FieldFilter
        # Busca em task_files por sucesso naquela ABI e Razão Social
        docs = firestore_db.collection('task_files') \
            .where(filter=FieldFilter("razao_social", "==", razao_social.strip())) \
            .where(filter=FieldFilter("status_importacao", "==", "SUCESSO")) \
            .get()

        # Filtro manual para garantir normalização de ambos os lados se necessário
        for doc in docs:
            db_abi = re.sub(r'\D', '', str(doc.to_dict().get('numero_abi', '')))
            if db_abi == abi_clean:
                return True
        return False
    except Exception as e:
        logger.error(f"Erro ao verificar duplicidade de ABI {numero_abi}: {e}")
        return False

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
        from firebase_admin import firestore
        from google.cloud.firestore_v1.base_query import FieldFilter
        docs = firestore_db.collection('tasks') \
            .where(filter=FieldFilter("razao_social", "==", razao_social)) \
            .order_by("created_at", direction=firestore.Query.DESCENDING) \
            .limit(1).stream()
        for d in docs: return d.to_dict().get('url_sistema', '')
    except Exception as e:
        print(f"Erro ao buscar última URL para {razao_social}: {e}")
    return ""

def normalize_client_id(name):
    """
    Normaliza o nome do cliente para uso como ID de documento.
    Pega apenas a parte relevante do nome (ex: Unimed Campinas) ignorando sufixos formais.
    """
    if not name: return ""
    # Remove sufixos formais comuns e normaliza espaços/caps
    n = name.upper().split(' - ')[0] # Pega antes do " - COOPERATIVA..."
    n = n.replace(' COOPERATIVA', '').replace(' LTDA', '').replace('.', '').replace(',', '').strip()
    
    # Mapeamentos específicos para consistência
    if "CAMPINAS" in n: return "Unimed Campinas"
    if "ERECHIM" in n: return "Unimed Erechim"
    
    # Se não for um caso especial, retorna o original limpo (Capitalized)
    return n.title()

def save_client_config(razao_social, url_sistema):
    """Saves or updates client configuration in Firestore."""
    if not razao_social: return False
    try:
        client_id = normalize_client_id(razao_social)
        doc_ref = firestore_db.collection('client_configs').document(client_id)
        doc_ref.set({
            'name': client_id,
            'razao_social': razao_social, # Mantém o formal original para referência
            'url_sistema': url_sistema,
            'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar config do cliente {razao_social}: {e}")
        return False

# Redirecionado para a função unificada no topo

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
        'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
    })

# Redirecionado para a função unificada no topo

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
            'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        })
        task_data = task_doc.to_dict()
        task_data['id'] = task_doc.id
        return task_data
    return None

def get_tasks_for_dashboard(limit=50, task_type=None):
    query = firestore_db.collection('tasks').order_by('created_at', direction=firestore.Query.DESCENDING)
    
    if task_type:
        query = query.where('type', '==', task_type)
        
    docs = query.limit(limit).stream()
    tasks = []
    for doc in docs:
        task_data = {**doc.to_dict(), 'id': doc.id}
        # Buscar arquivos desta tarefa para ver status individuais
        files = firestore_db.collection('task_files').where('task_id', '==', doc.id).stream()
        task_data['file_results'] = [{'abi': f.to_dict().get('numero_abi'), 'status': f.to_dict().get('status_importacao')} for f in files]
        tasks.append(task_data)
    return tasks

def get_files_for_task(task_id):
    docs = firestore_db.collection('task_files').where('task_id', '==', task_id).stream()
    return [{**doc.to_dict(), 'id': doc.id} for doc in docs]

def mark_all_task_files_as_error(task_id, error_message):
    try:
        files = get_files_for_task(task_id)
        for f in files:
            firestore_db.collection('task_files').document(f['id']).update({
                'status_importacao': 'ERRO',
                'error_message': error_message
            })
        return True
    except Exception as e:
        logger.error(f"Erro ao marcar arquivos como erro: {e}")
        return False

def get_logs_for_task(task_id, limit=2000):
    try:
        # Agora os logs estão em uma subcoleção
        docs = firestore_db.collection('tasks').document(task_id).collection('logs').order_by('timestamp', direction=firestore.Query.DESCENDING).limit(limit).stream()
        logs = [doc.to_dict() for doc in docs]
        return logs
    except Exception as e:
        logger.error(f"Erro ao recuperar logs: {e}")
        return []

def clear_import_logs():
    """
    Clears all logs from tasks AND resets/deletes task records to keep history clean as requested.
    """
    try:
        # 1. Limpa logs das tarefas
        tasks = firestore_db.collection('tasks').stream()
        batch = firestore_db.batch()
        count = 0
        for doc in tasks:
            # Deleta a subcoleção de logs primeiro
            log_docs = doc.reference.collection('logs').stream()
            for log_doc in log_docs:
                batch.delete(log_doc.reference)
            batch.delete(doc.reference) # Decidimos deletar a tarefa para um 'Limpar' real
            count += 1
            if count >= 500:
                batch.commit()
                batch = firestore_db.batch()
                count = 0
        # 2. Limpa os arquivos associados (evita 'fantasmas' nas estatísticas dos clientes)
        task_files = firestore_db.collection('task_files').stream()
        count = 0
        for doc in task_files:
            batch.delete(doc.reference)
            count += 1
            if count >= 500:
                batch.commit()
                batch = firestore_db.batch()
                count = 0

        if count > 0: batch.commit()

        return True
    except Exception as e:
        logger.error(f"Erro ao limpar logs e tarefas: {e}")
        return False

def reset_system_database():
    try:
        for coll in ['client_configs', 'tasks', 'task_files']:
            docs = firestore_db.collection(coll).limit(500).stream()
            while True:
                batch = firestore_db.batch()
                count = 0
                for doc in docs:
                    # Se for 'tasks', também deleta a subcoleção 'logs'
                    if coll == 'tasks':
                        log_docs = doc.reference.collection('logs').stream()
                        for log_doc in log_docs:
                            batch.delete(log_doc.reference)
                    batch.delete(doc.reference)
                    count += 1
                if count == 0: break
                batch.commit()
                docs = firestore_db.collection(coll).limit(500).stream()
        return True
    except Exception as e:
        logger.error(f"Erro ao resetar banco: {e}")
        return False

# --- SYSTEM AUDIT LOGS ---
def add_audit_log(user_email, action, details, level="INFO"):
    """
    Saves an action to the system audit log. Level can be INFO, WARNING or ERROR.
    """
    try:
        now = get_now_br()
        log_entry = {
            "id": str(uuid.uuid4())[:12],
            "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp_val": int(now.timestamp()),
            "user": user_email,
            "action": action,
            "details": details,
            "level": level.upper()
        }
        firestore_db.collection('audit_logs').add(log_entry)
        logger.info(f"[AUDIT] {user_email} - {action} - {level}")
        return True
    except Exception as e:
        logger.error(f"Failed to add audit log: {e}")
        return False

def get_audit_logs(limit=1000):
    try:
        docs = firestore_db.collection('audit_logs').order_by('timestamp_val', direction=firestore.Query.DESCENDING).limit(limit).stream()
        logs = [doc.to_dict() for doc in docs]
        return logs
    except Exception as e:
        logger.error(f"Erro ao recuperar logs de auditoria: {e}")
        return []

def clear_audit_logs():
    """Manual clear function for the system audit logs."""
    try:
        docs = firestore_db.collection('audit_logs').stream()
        batch = firestore_db.batch()
        count = 0
        deleted_count = 0
        for doc in docs:
            batch.delete(doc.reference)
            count += 1
            deleted_count += 1
            if count >= 500:
                batch.commit()
                batch = firestore_db.batch()
                count = 0
        if count > 0: batch.commit()
        return True, deleted_count
    except Exception as e:
        logger.error(f"Erro ao limpar logs de auditoria: {e}")
        return False, 0

def auto_delete_old_audit_logs():
    """Deletes audit logs older than 30 days. To be called lazily."""
    try:
        thirty_days_ago = get_now_br() - timedelta(days=30)
        thirty_days_ago_ts = int(thirty_days_ago.timestamp())
        # To avoid creating a composite index, we can just fetch without order
        docs = firestore_db.collection('audit_logs').where('timestamp_val', '<', thirty_days_ago_ts).stream()
        batch = firestore_db.batch()
        count = 0
        for doc in docs:
            batch.delete(doc.reference)
            count += 1
            if count >= 500:
                batch.commit()
                batch = firestore_db.batch()
                count = 0
        if count > 0: batch.commit()
        if count > 0:
            logger.info(f"[AUDIT] {count} logs antigos (>30 dias) deletados automaticamente.")
    except Exception as e:
        logger.error(f"Erro na limpeza automática de auditoria: {e}")
