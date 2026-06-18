import copy
import logging
import os
import re
import secrets
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from cachetools import TTLCache

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

# ============ Performance: In-Memory TTL Caches ============
# Avoids redundant Firestore reads on frequently-called read-only endpoints.
# Each cache stores the full response and expires after its TTL.
_cache_all_clients = TTLCache(maxsize=1, ttl=60)       # 60s — clients change only via robot runs
_cache_dashboard_stats = TTLCache(maxsize=1, ttl=30)   # 30s — dashboard can tolerate slight staleness
_cache_historical_data = TTLCache(maxsize=1, ttl=120)  # 120s — historical data rarely changes
_cache_active_abi = TTLCache(maxsize=1, ttl=60)        # 60s — ABI only changes every few weeks
_cache_abi_schedule = TTLCache(maxsize=1, ttl=120)     # 120s — schedule changes only on admin uploads

# Thread pool for parallelizing Firestore subcollection reads (N+1 → parallel)
_firestore_pool = ThreadPoolExecutor(max_workers=10)

def invalidate_abi_caches():
    """Clears all ABI-related caches. Call after write operations that modify ABI data."""
    _cache_all_clients.clear()
    _cache_dashboard_stats.clear()
    _cache_historical_data.clear()
    _cache_active_abi.clear()
    _cache_abi_schedule.clear()
    logger.info("ABI caches invalidated.")

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
    """Returns all clients from client_configs, deduplicated by normalized Name + CNPJ.
    Results are cached for 60s to avoid redundant Firestore reads."""
    cached = _cache_all_clients.get('all_clients')
    if cached is not None:
        return cached
    try:
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

        for doc in docs:
            data = doc.to_dict()
            name = data.get('name') or data.get('razao_social') or doc.id
            cnpj = data.get('cnpj', '')
            
            # Deduplicação baseada no nome normalizado e CNPJ
            norm = normalize_name(name)
            key = f"{norm}_{cnpj}"
            if key in seen_keys: continue
            seen_keys.add(key)
            
            clients.append({
                'id': doc.id,
                'name': name,
                'cnpj': cnpj,
                'url_sistema': data.get('url_sistema', ''),
                'api_status': data.get('api_status', 'unknown'),
                'api_last_check': data.get('api_last_check', ''),
                'total_abis': data.get('total_abis', 0),
                # Campos ABI
                'abi_status': data.get('abi_status', ''),
                'abi_current': data.get('abi_current', ''),
                'abi_last_check': data.get('abi_last_check', ''),
                'abi_last_message': data.get('abi_last_message', ''),
                'abi_last_task_id': data.get('abi_last_task_id', ''),
                'impugnation_status': data.get('impugnation_status', ''),
                'impugnation_last_check': data.get('impugnation_last_check', ''),
                'impugnation_last_message': data.get('impugnation_last_message', ''),
                'impugnation_last_task_id': data.get('impugnation_last_task_id', ''),
                'impugnation_stats': data.get('impugnation_stats', {}),
            })
            
        clients.sort(key=lambda x: x['name'])
        _cache_all_clients['all_clients'] = clients
        return clients
    except Exception as e:
        logger.error(f"Erro ao buscar todos os clientes: {e}")
        return []

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
            
            if search:
                s = search.lower()
                g_name = data.get('group_name', '') or ''
                if s not in name.lower() and s not in cnpj and s not in g_name.lower():
                    continue
                
            # Formatação de data robusta para o front
            last_check = data.get('api_last_check', '-')
            if hasattr(last_check, 'isoformat'):
                last_check = last_check.isoformat()
            elif isinstance(last_check, datetime):
                last_check = last_check.isoformat()
                
            # Formatação de data robusta para abi_last_check
            abi_last_check = data.get('abi_last_check')
            if hasattr(abi_last_check, 'isoformat'):
                abi_last_check = abi_last_check.isoformat()
            elif isinstance(abi_last_check, datetime):
                abi_last_check = abi_last_check.isoformat()
            else:
                abi_last_check = None
                
            # Formatação de data robusta para impugnation_last_check
            impugnation_last_check = data.get('impugnation_last_check')
            if hasattr(impugnation_last_check, 'isoformat'):
                impugnation_last_check = impugnation_last_check.isoformat()
            elif isinstance(impugnation_last_check, datetime):
                impugnation_last_check = impugnation_last_check.isoformat()
            else:
                impugnation_last_check = None

            clients.append({
                'id': doc.id,
                'name': name,
                'cnpj': cnpj,
                'url_sistema': data.get('url_sistema', ''),
                'api_status': data.get('api_status', 'unknown'),
                'api_last_check': last_check,
                'api_last_message': data.get('api_last_message', ''),
                'api_last_screenshot_url': data.get('api_last_screenshot_url', ''),
                'api_status_history': data.get('api_status_history', []),
                'api_last_task_id': data.get('api_last_task_id', ''),
                'total_abis': data.get('total_abis', 0),
                # Campos ABI
                'abi_status': data.get('abi_status', ''),
                'abi_current': data.get('abi_current', ''),
                'abi_last_check': abi_last_check,
                'abi_last_message': data.get('abi_last_message', ''),
                'abi_last_task_id': data.get('abi_last_task_id', ''),
                'whatsapp_numbers': data.get('whatsapp_numbers', []),
                'group_id': data.get('group_id'),
                'group_name': data.get('group_name'),
                'ultima_importacao': abi_last_check, # Adiciona compatibilidade com o front
                'impugnation_status': data.get('impugnation_status', ''),
                'impugnation_last_check': impugnation_last_check,
                'impugnation_last_message': data.get('impugnation_last_message', ''),
                'impugnation_last_task_id': data.get('impugnation_last_task_id', ''),
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
        # Garante campo 'name' consistente para logs e UI
        if 'name' not in data:
            data['name'] = data.get('razao_social') or doc.id
        return data
    return None

def create_task(task_type, description="", url_sistema="", razao_social="", usuario="", senha=""):
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
        task_data['status'] = 'PENDENTE'

    firestore_db.collection('tasks').document(task_id).set(task_data)
    return task_id

def update_task(task_id, data):
    """Updates task status/metadata."""
    firestore_db.collection('tasks').document(task_id).set(data, merge=True)

def add_log(task_id, message, level="INFO"):
    """Adiciona um log a uma tarefa e atualiza o log resumido.
    
    Níveis aceitos no Firestore: INFO, SUCCESS, WARNING, ERROR.
    DEBUG: apenas impresso no terminal (Cloud Logging), não persiste no banco.
    """
    # ── DEBUG: sem escrita no Firestore ─────────────────────────────────────
    if level.upper() == "DEBUG":
        logger.info(f"[DEBUG Task {task_id}] {message}")
        return True
    # ────────────────────────────────────────────────────────────────────────
    try:
        now = get_now_br()
        timestamp = now.strftime("%H:%M:%S")
        
        log_entry = {
            'timestamp': timestamp,
            'timestamp_precise': time.time(),
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


def get_task_logs(task_id, client_filter=None):
    """Recupera todos os logs de uma tarefa específica, com filtro opcional por cliente."""
    try:
        logs_ref = firestore_db.collection('tasks').document(task_id).collection('logs')
        docs = logs_ref.get()
        
        logs = []
        for doc in docs:
            log_data = doc.to_dict()
            msg = log_data.get('message', '')
            
            # Se houver filtro por cliente, filtra por [Nome] ou mensagens globais
            if client_filter:
                is_global = msg.startswith("🚀") or "em lote" in msg.lower() or "finalizada" in msg.lower() or "Finalizado" in msg
                is_for_client = f"[{client_filter}]" in msg
                if is_for_client or is_global:
                    logs.append(log_data)
            else:
                logs.append(log_data)
        
        # Ordenação robusta: timestamp (string HH:MM:SS) + timestamp_precise (float epoch)
        logs.sort(key=lambda x: (x.get('timestamp', ''), x.get('timestamp_precise', 0)))
        return logs
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
            'whatsapp_numbers': update_data.get('whatsapp_numbers', []),
            'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        }
        firestore_db.collection('client_configs').document(client_id).set(clean_data, merge=True)
        return True
    except Exception as e:
        logger.error(f"Erro ao atualizar cliente {client_id}: {e}")
        return False

def update_client_api_status(client_id, status, message, task_id=None, screenshot_url=None, is_batch=False):
    """Updates the API monitoring status for a client, maintaining history and forensics."""
    if not client_id: return False
    try:
        client_ref = firestore_db.collection('client_configs').document(client_id)
        
        # Single Firestore read instead of two redundant .get() calls
        client_doc = client_ref.get()
        
        update_data = {
            'api_status': status,
            'api_last_message': message,
            'api_last_check': firestore.SERVER_TIMESTAMP
        }
        
        if task_id and (not is_batch or not client_doc.to_dict().get('api_last_task_id')):
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

# ============ CubeTI Credentials ============

def get_cubeti_credentials():
    """Retrieves CubeTI Gestão Comercial credentials."""
    try:
        doc = firestore_db.collection('system_settings').document('cubeti_credentials').get()
        if doc.exists:
            return doc.to_dict()
    except Exception as e:
        logger.error(f"Erro ao buscar credenciais CubeTI: {e}")
    return {"email": "", "password": ""}

def save_cubeti_credentials(email, password):
    """Saves CubeTI Gestão Comercial credentials."""
    try:
        firestore_db.collection('system_settings').document('cubeti_credentials').set({
            "email": email,
            "password": password,
            "updated_at": get_now_br().isoformat()
        }, merge=True)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar credenciais CubeTI: {e}")
        return False

# ============ WhatsApp / Evolution API Config ============

def get_whatsapp_config():
    """Retrieves WhatsApp Evolution API configuration."""
    try:
        doc = firestore_db.collection('system_settings').document('whatsapp_config').get()
        if doc.exists:
            return doc.to_dict()
    except Exception as e:
        logger.error(f"Erro ao buscar config WhatsApp: {e}")
    return {"url": "", "api_key": "", "instance_name": "GaxBot", "target_numbers": []}

def save_whatsapp_config(url, api_key, instance_name, target_numbers):
    """Saves WhatsApp Evolution API configuration."""
    try:
        firestore_db.collection('system_settings').document('whatsapp_config').set({
            "url": url,
            "api_key": api_key,
            "instance_name": instance_name,
            "target_numbers": target_numbers,
            "updated_at": get_now_br().isoformat()
        }, merge=True)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar config WhatsApp: {e}")
        return False

# ============ Global Messaging (Broadcast) ============

def save_message_template(name, content, template_id=None):
    """Salva ou atualiza um template de mensagem no Firestore."""
    try:
        if not template_id:
            template_id = str(uuid.uuid4())[:8]
        
        data = {
            "id": template_id,
            "name": name,
            "content": content,
            "updated_at": firestore.SERVER_TIMESTAMP
        }
        firestore_db.collection('message_templates').document(template_id).set(data, merge=True)
        return template_id
    except Exception as e:
        logger.error(f"Erro ao salvar template: {e}")
        return None

def get_message_templates():
    """Recupera todos os templates de mensagem."""
    try:
        docs = firestore_db.collection('message_templates').order_by("name").stream()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        logger.error(f"Erro ao buscar templates: {e}")
        return []

def delete_message_template(template_id):
    """Remove um template de mensagem."""
    try:
        firestore_db.collection('message_templates').document(template_id).delete()
        return True
    except Exception as e:
        logger.error(f"Erro ao deletar template {template_id}: {e}")
        return False

def save_message_log(client_id, client_name, recipient, message, status, error_details=None):
    """Registra o log de um disparo de mensagem."""
    try:
        log_data = {
            "client_id": client_id,
            "client_name": client_name,
            "recipient": recipient,
            "message": message[:200] + ("..." if len(message) > 200 else ""),
            "full_message": message,
            "status": status,
            "error_details": error_details,
            "created_at": firestore.SERVER_TIMESTAMP
        }
        firestore_db.collection('message_logs').add(log_data)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar log de mensagem: {e}")
        return False

def get_message_logs_paginated(page=1, limit=10):
    """Busca logs de mensagens com paginação."""
    try:
        # Pega todos ordenados por data decrescente (limitado a 500 para performance)
        query = firestore_db.collection('message_logs').order_by("created_at", direction=firestore.Query.DESCENDING).limit(500)
        docs = query.get()
        
        logs = []
        for doc in docs:
            d = doc.to_dict()
            ca = d.get('created_at')
            # Formatação robusta de data do Firestore (Timestamp) para string ISO
            if hasattr(ca, 'isoformat'):
                d['created_at'] = ca.isoformat()
            
            logs.append(d)
        
        total = len(logs)
        start = (page - 1) * limit
        end = start + limit
        
        return logs[start:end], total
    except Exception as e:
        logger.error(f"Erro ao buscar logs de mensagens: {e}")
        return [], 0

def get_xml_data_paginated(page=1, limit=10, search="", client_filter=""):
    """Recupera metadados de XML com paginação e busca, com deduplicação por ABI."""
    try:
        # Cache de mapeamento de clientes para grupos para busca por grupo
        clients_ref = firestore_db.collection('client_configs').get()
        client_to_group = {c.to_dict().get('name'): c.to_dict().get('group_name') for c in clients_ref if c.to_dict().get('name')}

        query = firestore_db.collection('task_files').order_by('data_processamento', direction=firestore.Query.DESCENDING)
        
        # Estratégia resiliente: Buscar um lote grande e filtrar em memória para evitar falhas de indexação/case-sensitive
        if client_filter:
            # 1. Tenta buscar tarefas vinculadas se for um nome simples
            tasks = firestore_db.collection('tasks').where('razao_social', '==', client_filter.strip()).limit(50).stream()
            task_ids = [t.id for t in tasks]
            
            if task_ids:
                # Se achou tarefas, busca os arquivos delas
                docs_by_task = firestore_db.collection('task_files').where('task_id', 'in', task_ids[:30]).limit(500).get()
            else:
                docs_by_task = []
                
            # 2. Busca também os últimos 1000 arquivos para garantir que pegamos os recentes mesmo com nome diferente
            docs_recent = query.limit(1000).get()
            
            # Combina os docs (mantendo a ordenação por data de processamento se possível)
            docs = list(docs_by_task) + [d for d in docs_recent if d.id not in [x.id for x in docs_by_task]]
        else:
            docs = query.limit(1000).get()
        
        xml_list = []
        seen_abis = set()
        
        for doc in docs:
            d = doc.to_dict()
            abi = d.get("numero_abi") or doc.id
            file_name = d.get("nome_arquivo") or "-"
            client = d.get("razao_social") or "Desconhecido"
            
            # FILTRO CRÍTICO: Se houver filtro de cliente, ignorar qualquer doc que não seja dele
            if client_filter:
                # print(f"DEBUG: Comparing '{client_filter.strip().lower()}' with '{client.lower()}'")
                if client_filter.strip().lower() not in client.lower():
                    continue
                
            # Normalização de ABI para deduplicação (específica por cliente)
            abi_key = f"{client}_{str(abi).replace('º', '').replace('°', '').strip()}"
            
            if abi_key in seen_abis: continue
            seen_abis.add(abi_key)
            
            if search:
                s = search.lower()
                g_name = client_to_group.get(client, "") or ""
                if s not in str(abi).lower() and s not in file_name.lower() and s not in client.lower() and s not in g_name.lower():
                    continue
            
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
        client_id = normalize_client_id(razao_social)
        doc = firestore_db.collection('client_configs').document(client_id).get()
        if doc.exists: return doc.to_dict().get('url_sistema', '')
        
        # Fallback para busca por campo se o ID falhar
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

def get_tasks_for_dashboard(limit=50, task_type=None, exclude_api_checks=False):
    """
    Recupera tarefas para o dashboard de forma index-resiliente.
    """
    # 1. Busca documentos da coleção tasks ordenados por data (Firestore aceita order_by sozinho sem índice composto)
    # Pegamos 300 para garantir que encontraremos tarefas filtradas mesmo se houver muitas outras
    query = firestore_db.collection('tasks').order_by('created_at', direction=firestore.Query.DESCENDING).limit(300)
    
    docs = query.get()
    tasks = []
    
    monitoring_types = [
        'batch_api_check', 'single_api_check', 'api_check_batch', 'api_check_single',
        'abi_check_batch', 'abi_check_single'
    ]
    
    for doc in docs:
        task_dict = doc.to_dict()
        
        # Filtro de tipo em memória para evitar necessidade de índice composto
        if task_type and task_dict.get('type') != task_type:
            continue
            
        # Filtra tipos de checagem de API/ABI no backend para não prejudicar o limit(50)
        if exclude_api_checks and task_dict.get('type') in monitoring_types:
            continue
            
        task_data = {**task_dict, 'id': doc.id}
        # Buscar arquivos desta tarefa para ver status individuais
        files = firestore_db.collection('task_files').where('task_id', '==', doc.id).stream()
        task_data['file_results'] = [{'abi': f.to_dict().get('numero_abi'), 'status': f.to_dict().get('status_importacao')} for f in files]
        tasks.append(task_data)
        
        if len(tasks) >= limit:
            break
            
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

def get_logs_for_task(task_id, limit=2000, client_filter=None):
    try:
        # Recupera logs e ordena em memória para consistência
        docs = firestore_db.collection('tasks').document(task_id).collection('logs').limit(limit).get()
        
        logs = []
        for doc in docs:
            log_data = doc.to_dict()
            msg = log_data.get('message', '')
            
            # Se houver filtro por cliente, mostra APENAS logs desse cliente
            if client_filter:
                if f"[{client_filter}]" in msg:
                    logs.append(log_data)
            else:
                # Na visão global, mostra tudo
                logs.append(log_data)
        
        logs.sort(key=lambda x: (x.get('timestamp', ''), x.get('timestamp_precise', 0)))
        return logs
    except Exception as e:
        logger.error(f"Erro ao recuperar logs: {e}")
        return []

def get_aggregated_history_logs(task_category="abi", limit_tasks=5):
    """
    Recupera logs agregados das últimas N tarefas de uma categoria (abi ou api).
    Usa filtragem e ordenação em memória para ser 100% resiliente a falta de índices no Firestore.
    """
    try:
        if task_category == "abi":
            target_types = ["abi_check_batch", "abi_check_single"]
        elif task_category == "impugnation":
            target_types = ["impugnation_check_batch", "impugnation_check_single"]
        else:
            target_types = ["api_check_batch", "api_check_single", "batch_api_check", "single_api_check"]

        # 1. Busca documentos filtrando por tipo para não depender de limit(500) genérico
        # Se houver muitos registros, o Firestore pode exigir índice composto (type + created_at)
        # Por segurança, buscamos por tipo primeiro e ordenamos em memória
        tasks_query = (
            firestore_db.collection('tasks')
            .where('type', 'in', target_types)
            .order_by('__name__', direction=firestore.Query.DESCENDING)
            .limit(limit_tasks * 10)
        )
        task_docs = tasks_query.get()
        
        all_tasks = []
        for doc in task_docs:
            data = doc.to_dict()
            data['id'] = doc.id
            all_tasks.append(data)
            
        # 2. Ordenação em memória por created_at (decrescente)
        all_tasks.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        # target_types já definidos acima

        filtered_tasks = []
        for doc_data in all_tasks:
            if doc_data.get('type') in target_types:
                filtered_tasks.append(doc_data)
            if len(filtered_tasks) >= limit_tasks:
                break

        all_aggregated_logs = []

        for t_data in filtered_tasks:
            t_id = t_data['id']
            client_name = t_data.get('razao_social') or t_data.get('current_client') or "Sistema"
            
            # 3. Busca logs para cada tarefa
            t_logs = get_logs_for_task(t_id)
            
            # 4. Limitamos os logs por tarefa para não estourar a memória/payload no histórico agregado
            # Pegamos apenas os últimos 50 logs de cada tarefa para o histórico resumido
            recent_t_logs = t_logs[-50:] if len(t_logs) > 50 else t_logs
            
            # 5. Adiciona prefixo do cliente se não houver (para clareza no histórico)
            for log in recent_t_logs:
                msg = log.get('message', '')
                if client_name != "Sistema" and f"[{client_name}]" not in msg:
                    log['message'] = f"[{client_name}] {msg}"
                all_aggregated_logs.append(log)

        # 6. Ordenação final por timestamp_precise (absoluta)
        all_aggregated_logs.sort(key=lambda x: x.get('timestamp_precise', 0))
        
        return all_aggregated_logs
    except Exception as e:
        logger.error(f"Erro ao recuperar histórico agregado: {e}")
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

def update_task(task_id, data):
    """Updates task metadata in Firestore."""
    if not task_id: return False
    try:
        firestore_db.collection('tasks').document(task_id).update(data)
        return True
    except Exception as e:
        logger.error(f"Error updating task {task_id}: {e}")
        return False

def get_task(task_id):
    """Fetches a task document from Firestore."""
    if not task_id: return None
    try:
        doc = firestore_db.collection('tasks').document(task_id).get()
        if doc.exists:
            return doc.to_dict()
    except Exception as e:
        logger.error(f"Error fetching task {task_id}: {e}")
    return None

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

# --- ABI SCHEDULE & CHECKS ---
def save_abi_schedule(data_list):
    """Saves ABI schedule to Firestore."""
    try:
        # Limpa o cronograma anterior para manter apenas o novo upload
        docs = firestore_db.collection('cronograma_abis').stream()
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

        # Salva novos dados
        batch = firestore_db.batch()
        for item in data_list:
            doc_ref = firestore_db.collection('cronograma_abis').document()
            batch.set(doc_ref, item)
        batch.commit()
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar cronograma ABI: {e}")
        return False

def get_active_task(category="abi"):
    """
    Busca a tarefa mais recente que ainda está em execução para uma categoria.
    Filtra tipos de tarefa correspondentes e status 'running'.
    """
    try:
        # Pega as últimas 20 tarefas para encontrar a ativa sem precisar de índices compostos complexos no where
        tasks = get_tasks_for_dashboard(limit=20)
        
        if category == "abi":
            target_types = ["abi_check_batch", "abi_check_single"]
        elif category == "impugnation":
            target_types = ["impugnation_check_batch", "impugnation_check_single"]
        else:
            target_types = ["api_check_batch", "api_check_single", "batch_api_check", "single_api_check"]

        for task in tasks:
            if task.get('type') in target_types and task.get('status') == 'running':
                return task
        return None
    except Exception as e:
        logger.error(f"Erro ao buscar tarefa ativa ({category}): {e}")
        return None

def get_abi_schedule():
    """Returns the complete ABI schedule. Cached for 120s."""
    cached = _cache_abi_schedule.get('schedule')
    if cached is not None:
        return cached
    try:
        docs = firestore_db.collection('cronograma_abis').stream()
        schedule = [doc.to_dict() for doc in docs]
        # Ordenação básica por ABI
        def extract_num(s):
            m = re.search(r'(\d+)', str(s))
            return int(m.group(1)) if m else 0
        schedule.sort(key=lambda x: extract_num(x.get('ABI', '0')))
        _cache_abi_schedule['schedule'] = schedule
        return schedule
    except Exception as e:
        logger.error(f"Erro ao buscar cronograma ABI: {e}")
        return []

def get_active_abi():
    """Identifies the active ABI based on 'Data fim de Ciência'. Cached for 60s."""
    cached = _cache_active_abi.get('active')
    if cached is not None:
        return cached
    try:
        schedule = get_abi_schedule()
        if not schedule: return None
        
        now = get_now_br()
        
        # O ABI ativo é o primeiro cuja Data fim de Impugnação >= hoje
        active = None
        for item in schedule:
            dt_str = item.get('Data fim de Impugnação', '')
            if not dt_str: continue
            try:
                # dt_obj é 00:00:00 da data limite.
                dt_obj = datetime.strptime(dt_str, "%d/%m/%Y").replace(tzinfo=timezone(timedelta(hours=-3)))
                
                # Se hoje ainda for menor ou IGUAL à data limite (comparando apenas a data), a ABI ainda está ativa.
                # Ou comparamos dt_obj em 23:59:59 >= now.
                dt_limit = dt_obj.replace(hour=23, minute=59, second=59)
                if dt_limit >= now:
                    active = item
                    break
            except: continue
            
        if not active and schedule:
            active = schedule[-1]
            
        _cache_active_abi['active'] = active
        return active
    except Exception as e:
        logger.error(f"Erro ao identificar ABI ativo: {e}")
        return None

def update_client_abi_status(client_id, abi, status, message, task_id=None, is_batch=False):
    """Updates ABI check status for a client."""
    if not client_id: return False
    try:
        client_ref = firestore_db.collection('client_configs').document(client_id)
        
        update_data = {
            'abi_status': status,
            'abi_last_message': message,
            'abi_current': abi,
            'abi_last_check': firestore.SERVER_TIMESTAMP
        }
        
        if task_id:
            update_data['abi_last_task_id'] = task_id

        # Reset inteligente de impugnação se o número do ABI mudar
        client_doc = client_ref.get()
        if client_doc.exists:
            client_data = client_doc.to_dict()
            current_abi_in_db = client_data.get('abi_current')
            if current_abi_in_db and current_abi_in_db != abi:
                # Salva o snapshot histórico antes de resetar
                try:
                    client_ref.collection('abi_historical_stats').document(str(current_abi_in_db).replace("/", "_")).set({
                        'abi': current_abi_in_db,
                        'abi_status': client_data.get('abi_status', ''),
                        'impugnation_status': client_data.get('impugnation_status', 'Não Iniciou'),
                        'impugnation_stats': client_data.get('impugnation_stats', {"total": 0, "impugnados": 0, "nao_impugnando": 0, "aptos": 0, "aguardando": 0}),
                        'archived_at': firestore.SERVER_TIMESTAMP
                    })
                    logger.info(f"Snapshot do ABI {current_abi_in_db} salvo para o cliente {client_id}.")
                except Exception as ex_snap:
                    logger.error(f"Erro ao salvar snapshot histórico do ABI {current_abi_in_db} para o cliente {client_id}: {ex_snap}")

                update_data['impugnation_status'] = 'Não Iniciou'
                update_data['impugnation_stats'] = {"total": 0, "impugnados": 0, "nao_impugnando": 0, "aptos": 0, "aguardando": 0}
                update_data['impugnation_last_message'] = f"ABI mudou de {current_abi_in_db} para {abi}. Resetando status para nova checagem."
        
        client_ref.update(update_data)
        
        # Histórico de ABIs
        client_ref.collection('abi_history').add({
            'abi': abi,
            'status': status,
            'message': message,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'task_id': task_id
        })
        
        return True
    except Exception as e:
        logger.error(f"Erro ao atualizar status de ABI do cliente {client_id}: {e}")
        return False

def get_abi_historical_data():
    """Recupera o histórico de todos os ABIs finalizados/arquivados para todos os clientes.
    Cached for 120s. Uses get_all_clients() cache for client name resolution."""
    cached = _cache_historical_data.get('historical')
    if cached is not None:
        return cached
    try:
        historical_docs = firestore_db.collection_group('abi_historical_stats').get()
        
        # Reuse cached client list instead of a separate Firestore read
        all_clients = get_all_clients()
        client_names = {c['id']: c['name'] for c in all_clients}
        
        results = []
        for doc in historical_docs:
            client_id = doc.reference.parent.parent.id if doc.reference.parent and doc.reference.parent.parent else "Desconhecido"
            client_name = client_names.get(client_id, client_id)
            
            data = doc.to_dict()
            data['client_id'] = client_id
            data['client_name'] = client_name
            ts = data.get('archived_at')
            if ts:
                data['archived_at'] = ts.strftime("%d/%m/%Y %H:%M")
            results.append(data)
            
        # Ordenar por ABI decrescente e depois alfabeticamente pelo nome do cliente
        results.sort(key=lambda x: (int(re.sub(r'\D', '', str(x.get('abi', '0')))) if re.sub(r'\D', '', str(x.get('abi', '0'))) else 0, x.get('client_name', '')), reverse=True)
        _cache_historical_data['historical'] = results
        return results
    except Exception as e:
        logger.error(f"Erro ao buscar histórico de ABIs: {e}")
        return []

def get_abi_historical_snapshots(abi_num):
    """Recupera os snapshots diários de um ABI específico (ativo ou arquivado).
    Parallelizes client subcollection reads to avoid N+1 sequential queries."""
    try:
        snapshots_ref = firestore_db.collection('current_abi_evolution').document(str(abi_num)).collection('snapshots').order_by('date').get()
        timeline = []
        for doc in snapshots_ref:
            data = doc.to_dict()
            if 'timestamp' in data: del data['timestamp']
            timeline.append(data)
        
        # Parallel client snapshot reads (was N+1 sequential queries)
        client_evolution = {}
        client_snaps_docs = firestore_db.collection('current_abi_evolution').document(str(abi_num)).collection('client_snapshots').get()
        
        def _fetch_client_snaps(c_doc):
            c_id = c_doc.id
            snaps_ref = c_doc.reference.collection('snapshots').order_by('date').get()
            t = []
            for s in snaps_ref:
                sd = s.to_dict()
                if 'timestamp' in sd: del sd['timestamp']
                t.append(sd)
            return (c_id, t) if t else None
        
        if client_snaps_docs:
            futures = [_firestore_pool.submit(_fetch_client_snaps, c_doc) for c_doc in client_snaps_docs]
            for future in as_completed(futures):
                result = future.result()
                if result:
                    client_evolution[result[0]] = result[1]
                
        return {"timeline": timeline, "client_evolution": client_evolution}
    except Exception as e:
        logger.error(f"Erro ao buscar snapshots históricos do ABI {abi_num}: {e}")
        return {"timeline": [], "client_evolution": {}}

def get_abi_dashboard_stats():
    """Calculates stats for the ABI dashboard.
    Cached for 30s. Uses parallel reads for client evolution snapshots."""
    cached = _cache_dashboard_stats.get('stats')
    if cached is not None:
        return cached
    try:
        clients = get_all_clients()

        # Obtém o ABI ativo ANTES do loop para usar na comparação (also cached)
        active_abi = get_active_abi()
        active_abi_digits = re.sub(r'\D', '', str(active_abi.get('ABI', ''))) if active_abi else ''

        stats = {
            'total_clients': len(clients),
            'imported': 0,
            'imported_analyzed': 0,
            'imported_not_analyzed': 0,
            'failure': 0,
            'pending': 0,
            'not_imported': 0,
            'impugnating': 0,
            'finalized': 0,
            'not_started': 0
        }

        client_details = []
        abi_started = False  # Indica se algum cliente já foi processado para este ABI

        for c in clients:
            # Verifica se o cliente pertence ao ABI ATUAL.
            # Se abi_current do cliente for diferente do ABI ativo, seus dados são do ciclo anterior
            # e não devem aparecer na Visão Geral Atual.
            client_abi_digits = re.sub(r'\D', '', str(c.get('abi_current', '')))
            client_is_current = (client_abi_digits == active_abi_digits) if active_abi_digits else True

            if not client_is_current:
                # Cliente ainda não foi processado para o ABI atual → dados zerados
                client_details.append({
                    'id': c.get('id'),
                    'name': c.get('name') or c.get('razao_social') or c.get('id'),
                    'total': 0, 'impugnados': 0, 'nao_impugnando': 0, 'aptos': 0, 'aguardando': 0
                })
                stats['not_imported'] += 1
                continue

            abi_started = True
            status = str(c.get('abi_status', 'Pendente')).strip()
            status_lower = status.lower()
            msg = str(c.get('abi_last_message', '')).lower()
            impugnation = str(c.get('impugnation_status', '')).strip()
            stats_raw = c.get('impugnation_stats', {})

            client_details.append({
                'id': c.get('id'),
                'name': c.get('name') or c.get('razao_social') or c.get('id'),
                'total': stats_raw.get('total', 0),
                'impugnados': stats_raw.get('impugnados', 0),
                'nao_impugnando': stats_raw.get('nao_impugnando', 0),
                'aptos': stats_raw.get('aptos', 0),
                'aguardando': stats_raw.get('aguardando', 0)
            })

            if status_lower in ['nao importado', 'não importado']:
                stats['not_imported'] += 1
            elif impugnation == 'Finalizou':
                stats['finalized'] += 1
            elif impugnation == 'Impugnando':
                stats['impugnating'] += 1
            elif impugnation == 'Não Iniciou':
                stats['not_started'] += 1
            elif status_lower == 'importado e analisado':
                stats['imported_analyzed'] += 1
            elif status_lower == 'importado':
                if "nao realiza an" in msg or "não realiza an" in msg:
                    stats['imported_analyzed'] += 1
                else:
                    stats['imported'] += 1
                    stats['imported_not_analyzed'] += 1
            elif status_lower == 'importado, falta analisar':
                stats['imported'] += 1
                stats['imported_not_analyzed'] += 1
            elif status_lower in ['falha', 'falha na análise', 'falha na analise']:
                stats['failure'] += 1
            else:
                stats['pending'] += 1

        # Fetch the evolution timeline for the active ABI
        evolution_timeline = []
        client_evolution = {}

        if active_abi:
            abi_num = active_abi.get('ABI', '')
            if abi_num:
                snapshots_ref = firestore_db.collection('current_abi_evolution').document(str(abi_num)).collection('snapshots').order_by('date').get()
                for doc in snapshots_ref:
                    data = doc.to_dict()
                    if 'timestamp' in data: del data['timestamp']
                    evolution_timeline.append(data)

                # Parallel client snapshot reads (was N+1 sequential queries)
                def _fetch_client_evolution(c_detail):
                    c_id = c_detail.get('id')
                    if not c_id:
                        return None
                    snaps_ref = firestore_db.collection('current_abi_evolution').document(str(abi_num)).collection('client_snapshots').document(c_id).collection('snapshots').order_by('date').get()
                    timeline = []
                    for s in snaps_ref:
                        s_data = s.to_dict()
                        if 'timestamp' in s_data: del s_data['timestamp']
                        timeline.append(s_data)
                    return (c_id, timeline) if timeline else None

                futures = [_firestore_pool.submit(_fetch_client_evolution, c) for c in client_details]
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        client_evolution[result[0]] = result[1]

        stats['evolution_timeline'] = evolution_timeline
        stats['client_evolution'] = client_evolution
        stats['client_details'] = client_details
        stats['abi_num'] = active_abi.get('ABI') if active_abi else None
        stats['abi_started'] = abi_started  # True se o robô já processou algum cliente para este ABI
        stats['total_atendimentos'] = sum(c.get('total', 0) for c in client_details)
        _cache_dashboard_stats['stats'] = stats
        return stats
    except Exception as e:
        logger.error(f"Erro ao calcular estatísticas ABI: {e}")
        return {}


def save_current_abi_evolution_snapshot(abi_number):
    """Saves a daily global and per-client snapshot of the current ABI's impugnation stats."""
    if not abi_number: return False
    try:
        from datetime import datetime
        import pytz
        
        # Get current global stats
        stats = get_abi_dashboard_stats()
        clients = stats.get('client_details', [])
        
        # Aggregate totals
        total_impugnados = sum(c.get('impugnados', 0) for c in clients)
        total_aptos = sum(c.get('aptos', 0) for c in clients)
        total_aguardando = sum(c.get('aguardando', 0) for c in clients)
        total_nao_impugnando = sum(c.get('nao_impugnando', 0) for c in clients)
        total_atendimentos = sum(c.get('total', 0) for c in clients)
        
        # Use BRT timezone for the date
        tz = pytz.timezone('America/Sao_Paulo')
        now = datetime.now(tz)
        date_str = now.strftime('%Y-%m-%d')
        
        # Save Global Snapshot
        global_ref = firestore_db.collection('current_abi_evolution').document(str(abi_number)).collection('snapshots').document(date_str)
        snapshot_data = {
            'date': date_str,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'impugnados': total_impugnados,
            'aptos': total_aptos,
            'aguardando': total_aguardando,
            'nao_impugnando': total_nao_impugnando,
            'total': total_atendimentos
        }
        global_ref.set(snapshot_data)

        # Save Per-Client Snapshots
        for c in clients:
            c_id = c.get('id') or c.get('name') # name is used as fallback in get_abi_dashboard_stats
            if not c_id: continue
            
            # Garantimos que o documento pai exista (Firestore virtual doc fix)
            parent_ref = firestore_db.collection('current_abi_evolution').document(str(abi_number)).collection('client_snapshots').document(c_id)
            parent_ref.set({'updated_at': now.strftime('%Y-%m-%d %H:%M:%S'), 'name': c.get('name')}, merge=True)
            
            client_ref = parent_ref.collection('snapshots').document(date_str)
            client_data = {
                'date': date_str,
                'timestamp': firestore.SERVER_TIMESTAMP,
                'impugnados': c.get('impugnados', 0),
                'aptos': c.get('aptos', 0),
                'aguardando': c.get('aguardando', 0),
                'nao_impugnando': c.get('nao_impugnando', 0),
                'total': c.get('total', 0)
            }
            client_ref.set(client_data)
            
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar snapshot de evolucao do ABI {abi_number}: {e}")
        return False


def get_abi_historical_debug():
    """
    Diagnóstico: retorna todos os documentos de 'abi_historical_stats' de todos os clientes,
    incluindo o ID do documento e o valor do campo 'abi'. Útil para inspecionar quais ABIs
    estão salvos e em qual formato (ex: '105', 'ABI 105', '105/2026', etc.).
    """
    try:
        import re
        historical_docs = firestore_db.collection_group('abi_historical_stats').get()
        results = []
        for doc in historical_docs:
            client_id = doc.reference.parent.parent.id if doc.reference.parent and doc.reference.parent.parent else "?"
            data = doc.to_dict()
            results.append({
                "document_id": doc.id,
                "client_id": client_id,
                "abi_field": data.get("abi"),
                "has_impugnation_stats": bool(data.get("impugnation_stats")),
                "archived_at": str(data.get("archived_at", "")),
            })
        results.sort(key=lambda x: (str(x.get("abi_field", "")), x.get("client_id", "")))
        return results
    except Exception as e:
        logger.error(f"[debug] Erro ao inspecionar abi_historical_stats: {e}")
        return []


def archive_current_abi_as_historical(abi_num: str, date_override: str = None):
    """
    Arquiva os dados ATUAIS de 'impugnation_stats' dos client_configs como histórico
    do ABI informado. Salva nos dois lugares:
      1. client_configs/{id}/abi_historical_stats/{abi_num} — formato idêntico ao do robô
      2. current_abi_evolution/{abi_num}/snapshots/{date} — para o gráfico de evolução

    Use quando o robô não salvou o histórico do ABI anterior (ex: ABI 105) durante a
    transição, mas os dados ainda estão vivos nos client_configs.
    ATENÇÃO: execute antes de o robô processar o próximo ABI, pois ele vai zerar os dados.
    """
    if not abi_num:
        return {"ok": False, "error": "abi_num é obrigatório"}

    try:
        from datetime import datetime
        import pytz

        abi_str = str(abi_num).strip()
        doc_id = abi_str.replace("/", "_")
        tz = pytz.timezone('America/Sao_Paulo')
        now = datetime.now(tz)
        snap_date = date_override or now.strftime('%Y-%m-%d')

        clients_ref = firestore_db.collection('client_configs').get()

        archived_clients = []
        skipped_clients = []
        totals = {'impugnados': 0, 'aptos': 0, 'aguardando': 0, 'nao_impugnando': 0, 'total': 0}

        for client_doc in clients_ref:
            client_id = client_doc.id
            client_data = client_doc.to_dict()
            client_name = client_data.get('name') or client_data.get('razao_social') or client_id

            stats_raw = client_data.get('impugnation_stats', {})

            # Não pula mais os clientes com total = 0 para garantir que todos fiquem registrados no histórico


            impugnados     = stats_raw.get('impugnados', 0)
            aptos          = stats_raw.get('aptos', 0)
            aguardando     = stats_raw.get('aguardando', 0)
            nao_impugnando = stats_raw.get('nao_impugnando', 0)
            total          = stats_raw.get('total', impugnados + aptos + aguardando + nao_impugnando)

            # 1. Salva em abi_historical_stats (formato idêntico ao do robô)
            hist_ref = (
                firestore_db
                .collection('client_configs')
                .document(client_id)
                .collection('abi_historical_stats')
                .document(doc_id)
            )
            hist_ref.set({
                'abi': abi_str,
                'abi_status': client_data.get('abi_status', ''),
                'impugnation_status': client_data.get('impugnation_status', 'Não Iniciou'),
                'impugnation_stats': {
                    'total':          total,
                    'impugnados':     impugnados,
                    'aptos':          aptos,
                    'aguardando':     aguardando,
                    'nao_impugnando': nao_impugnando,
                },
                'archived_at': firestore.SERVER_TIMESTAMP,
                'archived_by': 'admin_endpoint',
            })

            # 2. Salva snapshot de evolução para o gráfico de histórico
            parent_ref = (
                firestore_db
                .collection('current_abi_evolution')
                .document(abi_str)
                .collection('client_snapshots')
                .document(client_id)
            )
            parent_ref.set({'name': client_name, 'backfilled': True}, merge=True)
            parent_ref.collection('snapshots').document(snap_date).set({
                'date':           snap_date,
                'timestamp':      firestore.SERVER_TIMESTAMP,
                'impugnados':     impugnados,
                'aptos':          aptos,
                'aguardando':     aguardando,
                'nao_impugnando': nao_impugnando,
                'total':          total,
                'backfilled':     True,
            })

            totals['impugnados']     += impugnados
            totals['aptos']          += aptos
            totals['aguardando']     += aguardando
            totals['nao_impugnando'] += nao_impugnando
            totals['total']          += total

            archived_clients.append(client_name)
            logger.info(f"[archive] Cliente {client_name} ({client_id}) arquivado para ABI {abi_str}.")

        if not archived_clients:
            return {
                "ok": False,
                "error": (
                    f"Nenhum cliente com dados reais encontrado em client_configs para arquivar como ABI {abi_str}. "
                    f"Clientes pulados (sem dados): {skipped_clients}"
                )
            }

        # Salva snapshot global de evolução
        global_ref = (
            firestore_db
            .collection('current_abi_evolution')
            .document(abi_str)
            .collection('snapshots')
            .document(snap_date)
        )
        global_ref.set({
            'date':           snap_date,
            'timestamp':      firestore.SERVER_TIMESTAMP,
            'impugnados':     totals['impugnados'],
            'aptos':          totals['aptos'],
            'aguardando':     totals['aguardando'],
            'nao_impugnando': totals['nao_impugnando'],
            'total':          totals['total'],
            'backfilled':     True,
        })
        logger.info(f"[archive] Snapshot global do ABI {abi_str} salvo em {snap_date}. Total: {totals['total']}")

        return {
            "ok": True,
            "abi": abi_str,
            "snapshot_date": snap_date,
            "clients_archived": len(archived_clients),
            "clients_skipped": len(skipped_clients),
            "totals": totals,
        }

    except Exception as e:
        logger.error(f"[archive] Erro ao arquivar ABI {abi_num}: {e}")
        return {"ok": False, "error": str(e)}


def backfill_abi_snapshot(abi_num: str, date_override: str = None):
    """
    Reconstrói retroativamente o snapshot de evolução de um ABI a partir dos dados
    já salvos em 'abi_historical_stats' (por cliente).

    Busca documentos cujo CAMPO 'abi' contenha o número alvo (ex: 105), independentemente
    do ID do documento ou do formato exato do valor (ex: '105', 'ABI 105', '105/2026').
    """
    if not abi_num:
        return {"ok": False, "error": "abi_num é obrigatório"}

    try:
        import re
        from datetime import datetime
        import pytz

        abi_str = str(abi_num).strip()
        # Extrai apenas os dígitos do número alvo para comparação flexível
        target_digits = re.sub(r'\D', '', abi_str)
        if not target_digits:
            return {"ok": False, "error": f"abi_num inválido: '{abi_str}'"}

        tz = pytz.timezone('America/Sao_Paulo')

        # Busca TODOS os documentos históricos de todos os clientes via collection group
        historical_docs = firestore_db.collection_group('abi_historical_stats').get()

        client_snapshots = []
        totals = {'impugnados': 0, 'aptos': 0, 'aguardando': 0, 'nao_impugnando': 0, 'total': 0}

        # Mapa de nomes para enriquecer o log
        clients_ref = firestore_db.collection('client_configs').get()
        client_names = {c.id: c.to_dict().get('name', c.id) for c in clients_ref}

        for doc in historical_docs:
            data = doc.to_dict()
            abi_value = str(data.get('abi', ''))
            # Compara apenas os dígitos para suportar formatos como "ABI 105", "105/2026", "105"
            if re.sub(r'\D', '', abi_value) != target_digits:
                continue

            client_id = doc.reference.parent.parent.id if doc.reference.parent and doc.reference.parent.parent else None
            if not client_id:
                continue

            client_name = client_names.get(client_id, client_id)
            stats = data.get('impugnation_stats', {})

            impugnados     = stats.get('impugnados', 0)
            aptos          = stats.get('aptos', 0)
            aguardando     = stats.get('aguardando', 0)
            nao_impugnando = stats.get('nao_impugnando', 0)
            total          = stats.get('total', impugnados + aptos + aguardando + nao_impugnando)

            # Determina a data do snapshot
            if date_override:
                snap_date = date_override
            else:
                archived_at = data.get('archived_at')
                if archived_at and hasattr(archived_at, 'strftime'):
                    snap_date = archived_at.strftime('%Y-%m-%d')
                elif archived_at and isinstance(archived_at, str):
                    try:
                        snap_date = datetime.strptime(archived_at, "%d/%m/%Y %H:%M").strftime('%Y-%m-%d')
                    except Exception:
                        snap_date = datetime.now(tz).strftime('%Y-%m-%d')
                else:
                    snap_date = datetime.now(tz).strftime('%Y-%m-%d')

            totals['impugnados']     += impugnados
            totals['aptos']          += aptos
            totals['aguardando']     += aguardando
            totals['nao_impugnando'] += nao_impugnando
            totals['total']          += total

            client_snapshots.append({
                'client_id':   client_id,
                'client_name': client_name,
                'snap_date':   snap_date,
                'impugnados':  impugnados,
                'aptos':       aptos,
                'aguardando':  aguardando,
                'nao_impugnando': nao_impugnando,
                'total':       total,
            })

        if not client_snapshots:
            # Retorna também o que existe para ajudar no diagnóstico
            existing = get_abi_historical_debug()
            existing_abis = sorted(set(
                re.sub(r'\D', '', str(e.get('abi_field', '')))
                for e in existing if e.get('abi_field')
            ))
            return {
                "ok": False,
                "error": (
                    f"Nenhum dado histórico encontrado para o ABI '{abi_str}' "
                    f"(buscado por dígitos: '{target_digits}'). "
                    f"ABIs disponíveis no banco (somente números): {existing_abis}"
                )
            }

        final_date = date_override or max(c['snap_date'] for c in client_snapshots)

        # Salva snapshot global
        global_ref = (
            firestore_db
            .collection('current_abi_evolution')
            .document(abi_str)
            .collection('snapshots')
            .document(final_date)
        )
        global_ref.set({
            'date':           final_date,
            'timestamp':      firestore.SERVER_TIMESTAMP,
            'impugnados':     totals['impugnados'],
            'aptos':          totals['aptos'],
            'aguardando':     totals['aguardando'],
            'nao_impugnando': totals['nao_impugnando'],
            'total':          totals['total'],
            'backfilled':     True,
        })
        logger.info(f"[backfill] Snapshot global do ABI {abi_str} salvo em {final_date}.")

        # Salva snapshot por cliente
        for cs in client_snapshots:
            c_id   = cs['client_id']
            c_name = cs['client_name']
            c_date = cs['snap_date']

            parent_ref = (
                firestore_db
                .collection('current_abi_evolution')
                .document(abi_str)
                .collection('client_snapshots')
                .document(c_id)
            )
            parent_ref.set({'name': c_name, 'backfilled': True}, merge=True)

            parent_ref.collection('snapshots').document(c_date).set({
                'date':           c_date,
                'timestamp':      firestore.SERVER_TIMESTAMP,
                'impugnados':     cs['impugnados'],
                'aptos':          cs['aptos'],
                'aguardando':     cs['aguardando'],
                'nao_impugnando': cs['nao_impugnando'],
                'total':          cs['total'],
                'backfilled':     True,
            })
            logger.info(f"[backfill] Cliente {c_name} ({c_id}) para ABI {abi_str} salvo em {c_date}.")

        return {
            "ok": True,
            "abi": abi_str,
            "snapshot_date": final_date,
            "clients_backfilled": len(client_snapshots),
            "totals": totals,
        }

    except Exception as e:
        logger.error(f"[backfill] Erro ao reconstruir snapshot do ABI {abi_num}: {e}")
        return {"ok": False, "error": str(e)}

def update_client_impugnation_status(client_id, status, message, task_id=None, stats=None):
    """Updates impugnation check status for a client."""
    if not client_id: return False
    try:
        client_ref = firestore_db.collection('client_configs').document(client_id)
        
        update_data = {
            'impugnation_status': status,
            'impugnation_last_message': message,
            'impugnation_last_check': firestore.SERVER_TIMESTAMP
        }
        
        if task_id:
            update_data['impugnation_last_task_id'] = task_id
            
        if stats:
            update_data['impugnation_stats'] = stats
            
        client_ref.update(update_data)
        return True
    except Exception as e:
        logger.error(f"Erro ao atualizar status de impugnação do cliente {client_id}: {e}")
        return False

def get_impugnation_dashboard_stats():
    """Calculates stats for impugnation checks."""
    try:
        clients = get_all_clients()
        stats = {
            'total_eligible': 0,
            'impugnating': 0,
            'no_impugnation': 0,
            'finalized': 0,
            'not_started': 0,
            'not_checked': 0,
            'errors': 0
        }
        
        for c in clients:
            abi_status = c.get('abi_status', 'Pendente')
            imp_status = c.get('impugnation_status', '')
            
            # Conta clientes que já analisaram ou estão em processo de impugnação
            if abi_status == 'Importado e Analisado' or imp_status in ['Impugnando', 'Finalizou', 'Não Iniciou']:
                stats['total_eligible'] += 1
                
                if imp_status == 'Impugnando':
                    stats['impugnating'] += 1
                elif imp_status == 'Finalizou':
                    stats['finalized'] += 1
                elif imp_status == 'Sem Impugnação':
                    stats['no_impugnation'] += 1
                elif imp_status == 'Não Iniciou':
                    # Mantém o contador específico se o frontend precisar no futuro
                    stats['not_started'] += 1
                elif imp_status == 'Erro':
                    stats['errors'] += 1
                else:
                    stats['not_checked'] += 1
                    
        return stats
    except Exception as e:
        logger.error(f"Erro ao calcular estatísticas de impugnação: {e}")
        return {}


def mark_abis_as_substituted(razao_social, abis):
    """
    Encontra entradas 'SUCESSO' existentes no task_files para um determinado cliente e lista de ABIs,
    e marca-as como 'SUBSTITUIDO' para limpar o histórico e permitir nova importação limpa.
    """
    try:
        if not abis:
            return True
            
        if isinstance(abis, str):
            abis = [abis]
            
        count_marked = 0
        for abi in abis:
            # Normalização básica para busca (remove o º se houver)
            abi_str = str(abi).replace("º", "").replace("°", "").strip()
            
            # Busca as tasks do cliente para pegar os task_ids vinculados
            tasks = firestore_db.collection('tasks').where('razao_social', '==', razao_social.strip()).stream()
            
            for task_doc in tasks:
                task_id = task_doc.id
                # Busca na coleção RAIZ 'task_files' pelo task_id
                files = firestore_db.collection('task_files').where('task_id', '==', task_id).stream()
                for doc in files:
                    data = doc.to_dict()
                    if data.get('status_importacao') != 'SUCESSO':
                        continue
                        
                    doc_abi = str(data.get('numero_abi', '')).replace("º", "").replace("°", "").strip()
                    if doc_abi == abi_str:
                        doc.reference.update({'status_importacao': 'SUBSTITUIDO'})
                        count_marked += 1
                
        if count_marked > 0:
            logger.info(f"Sucesso: {count_marked} ABIs para '{razao_social}' marcadas como SUBSTITUIDO.")
        return True
    except Exception as e:
        logger.error(f"Erro ao marcar ABIs como substituídas para {razao_social}: {e}")
        return False

def recalculate_client_abis(client_id):
    """
    Reconta o total de ABIs importadas com sucesso para um cliente e atualiza o documento do cliente.
    """
    try:
        client_ref = firestore_db.collection('client_configs').document(client_id)
        doc = client_ref.get()
        if not doc.exists:
            # Tenta buscar pelo campo 'name' se o client_id não for o ID do documento
            query = firestore_db.collection('client_configs').where('name', '==', client_id).limit(1).stream()
            client_doc = next(query, None)
            if client_doc:
                client_ref = client_doc.reference
                doc = client_doc
            else:
                logger.warning(f"Cliente {client_id} não encontrado para recalcular estatísticas.")
                return False

        data = doc.to_dict()
        name = data.get('name', client_id)
        
        # Busca manual iterando pelas tasks para obter IDs vinculados
        tasks = firestore_db.collection('tasks').where('razao_social', '==', name.strip()).stream()
            
        success_abis = []
        last_abi = data.get('abi_current')
        last_date = None
        
        for task_doc in tasks:
            task_id = task_doc.id
            files = firestore_db.collection('task_files').where('task_id', '==', task_id).stream()
            for f in files:
                fdata = f.to_dict()
                if fdata.get('status_importacao') != 'SUCESSO':
                    continue
                    
                abi = fdata.get('numero_abi')
                if abi:
                    success_abis.append(str(abi))
                    # Tenta pegar a data de criação para definir o atual
                    created_at = fdata.get('created_at')
                    if created_at:
                        if not last_date or created_at > last_date:
                            last_date = created_at
                            last_abi = str(abi)
        
        unique_abis = list(set(success_abis))
        count = len(unique_abis)
        
        update_payload = {
            'total_abis': count,
            'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        if last_abi:
            update_payload['abi_current'] = last_abi
        
        if last_date:
            update_payload['abi_last_check'] = last_date
            
        client_ref.update(update_payload)
        logger.info(f"Contagem do cliente '{name}' atualizada: {count} ABIs.")
        return True
    except Exception as e:
        logger.error(f"Erro ao recalcular estatísticas para {client_id}: {e}")
        return False

# --- GESTÃO DE GRUPOS ---

def get_groups():
    """Retorna todos os grupos cadastrados."""
    try:
        docs = firestore_db.collection('groups').order_by('name').get()
        groups = []
        for doc in docs:
            d = doc.to_dict()
            d['id'] = doc.id
            groups.append(d)
        return groups
    except Exception as e:
        logger.error(f"Erro ao buscar grupos: {e}")
        return []

def create_group(data):
    """Cria um novo grupo e associa os clientes listados."""
    try:
        group_ref = firestore_db.collection('groups').document()
        group_id = group_ref.id
        
        group_payload = {
            'name': data.get('name'),
            'client_ids': data.get('client_ids', []),
            'created_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        }
        group_ref.set(group_payload)
        
        # Atualiza a referência de grupo em cada cliente associado
        for client_id in data.get('client_ids', []):
            firestore_db.collection('client_configs').document(client_id).update({
                'group_id': group_id,
                'group_name': data.get('name')
            })
            
        return group_id
    except Exception as e:
        logger.error(f"Erro ao criar grupo: {e}")
        return None

def update_group(group_id, data):
    """Atualiza um grupo e as associações de clientes."""
    try:
        group_ref = firestore_db.collection('groups').document(group_id)
        old_group = group_ref.get().to_dict()
        old_clients = set(old_group.get('client_ids', []))
        new_clients = set(data.get('client_ids', []))
        
        # 1. Atualiza o documento do grupo
        group_ref.update({
            'name': data.get('name'),
            'client_ids': list(new_clients),
            'updated_at': get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        })
        
        # 2. Clientes removidos do grupo: limpa a ref no cliente
        removed = old_clients - new_clients
        for cid in removed:
            firestore_db.collection('client_configs').document(cid).update({
                'group_id': None,
                'group_name': None
            })
            
        # 3. Clientes novos ou existentes: garante grupo_id/group_name correto
        for cid in new_clients:
            firestore_db.collection('client_configs').document(cid).update({
                'group_id': group_id,
                'group_name': data.get('name')
            })
            
        return True
    except Exception as e:
        logger.error(f"Erro ao atualizar grupo {group_id}: {e}")
        return False

def delete_group(group_id):
    """Remove um grupo e limpa as referências nos clientes."""
    try:
        group_ref = firestore_db.collection('groups').document(group_id)
        group_data = group_ref.get().to_dict()
        if group_data:
            client_ids = group_data.get('client_ids', [])
            for cid in client_ids:
                firestore_db.collection('client_configs').document(cid).update({
                    'group_id': None,
                    'group_name': None
                })
        group_ref.delete()
        return True
    except Exception as e:
        logger.error(f"Erro ao excluir grupo {group_id}: {e}")
        return False

def delete_clients_batch(client_ids):
    """Exclui vários clientes e os remove de qualquer grupo associado."""
    try:
        batch = firestore_db.batch()
        for cid in client_ids:
            # Pega o cliente para ver se ele pertence a um grupo
            cref = firestore_db.collection('client_configs').document(cid)
            cdat = cref.get().to_dict()
            if cdat and cdat.get('group_id'):
                gid = cdat.get('group_id')
                # Remove o cid da lista de client_ids do grupo
                gref = firestore_db.collection('groups').document(gid)
                gdat = gref.get().to_dict()
                if gdat:
                    new_g_clients = [x for x in gdat.get('client_ids', []) if x != cid]
                    batch.update(gref, {'client_ids': new_g_clients})
            
            # Deleta o cliente
            batch.delete(cref)
            
        batch.commit()
        return True
    except Exception as e:
        logger.error(f"Erro na exclusão em massa de clientes: {e}")
        return False


# ============================================================================
# MENU CONFIGURATION
# ============================================================================

MENU_DEFAULTS = {
    "main_menu": [
        {"key": "dashboard", "label": "Enviar ABIs", "icon": "CloudUpload", "order": 0, "isAdmin": False},
        {"key": "xml-data", "label": "Dados ABIs", "icon": "FileText", "order": 1, "isAdmin": False},
        {"key": "check-imports", "label": "Checar Importações", "icon": "Shield", "order": 2, "isAdmin": False},
        {"key": "abi-history", "label": "Histórico de ABIs", "icon": "ScrollText", "order": 3, "isAdmin": False},
        {"key": "logs", "label": "Histórico de Importações", "icon": "ClipboardList", "order": 4, "isAdmin": False},
        {"key": "api-checks", "label": "Checar APIs", "icon": "Puzzle", "order": 5, "isAdmin": False},
    ],
    "admin_menu": [
        {"key": "clients", "label": "Clientes", "icon": "Users", "order": 0, "isAdmin": True},
        {"key": "users", "label": "Usuários", "icon": "Users", "order": 1, "isAdmin": True},
        {"key": "groups", "label": "Grupos", "icon": "LayoutDashboard", "order": 2, "isAdmin": True},
        {"key": "pending", "label": "Pendentes", "icon": "UserPlus", "order": 3, "isAdmin": True},
    ],
    "config_menu": [
        {"key": "integrations", "label": "Integrações", "icon": "Puzzle", "order": 0, "isAdmin": True},
        {"key": "audit", "label": "Logs do Sistema", "icon": "ScrollText", "order": 1, "isAdmin": True},
        {"key": "access-control", "label": "Controle de Acessos", "icon": "Lock", "order": 2, "isAdmin": True},
        {"key": "messages", "label": "Mensagens", "icon": "FileText", "order": 3, "isAdmin": True},
        {"key": "branding", "label": "Identidade Visual", "icon": "Palette", "order": 4, "isAdmin": True},
        {"key": "menus", "label": "Gerenciar Menus", "icon": "LayoutGrid", "order": 5, "isAdmin": True},
    ],
    "section_labels": {
        "main_title": "Importação",
        "admin_title": "Administração",
        "config_title": "Configuração"
    }
}

def get_menu_config():
    """Returns the active menu configuration, falling back to defaults."""
    try:
        doc = firestore_db.collection('system_config').document('menu_layout').get()
        if doc.exists:
            data = doc.to_dict()
            # Merge with defaults to fill any missing fields
            defaults = copy.deepcopy(MENU_DEFAULTS)
            for key in defaults:
                if key not in data or (isinstance(data.get(key), list) and len(data[key]) == 0):
                    data[key] = defaults[key]
            return data
        return copy.deepcopy(MENU_DEFAULTS)
    except Exception as e:
        logger.error(f"Erro ao buscar menu config: {e}")
        return copy.deepcopy(MENU_DEFAULTS)

def save_menu_config_detailed(config: dict):
    """Saves the active menu configuration and returns (success, error_message)."""
    try:
        clean_config = {
            "main_menu": config.get("main_menu", []),
            "admin_menu": config.get("admin_menu", []),
            "config_menu": config.get("config_menu", []),
            "section_labels": config.get("section_labels", {}),
            "updated_at": get_now_br().isoformat()
        }
        firestore_db.collection('system_config').document('menu_layout').set(clean_config)
        return True, None
    except Exception as e:
        err = str(e)
        logger.error(f"Erro ao salvar menu config no Firestore: {err}")
        return False, err

def get_menu_default():
    """Returns the custom default, or hardcoded defaults if none set."""
    try:
        doc = firestore_db.collection('system_config').document('menu_layout_default').get()
        if doc.exists:
            data = doc.to_dict()
            defaults = copy.deepcopy(MENU_DEFAULTS)
            for key in defaults:
                if key not in data or (isinstance(data.get(key), list) and len(data[key]) == 0):
                    data[key] = defaults[key]
            return data
        return copy.deepcopy(MENU_DEFAULTS)
    except Exception as e:
        logger.error(f"Erro ao buscar menu default: {e}")
        return copy.deepcopy(MENU_DEFAULTS)

def save_menu_default(config: dict):
    """Saves the current config as the new custom default."""
    try:
        config['saved_as_default_at'] = get_now_br().isoformat()
        firestore_db.collection('system_config').document('menu_layout_default').set(config)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar menu default: {e}")
        return False

def restore_menu_default():
    """Restores the active config to hardcoded defaults by deleting the custom default document."""
    try:
        # Delete the custom default document to force use of hardcoded defaults next time
        firestore_db.collection('system_config').document('menu_layout_default').delete()
        
        # Save a copy of hardcoded defaults as active current config
        success, _ = save_menu_config_detailed(copy.deepcopy(MENU_DEFAULTS))
        return success
    except Exception as e:
        logger.error(f"Erro ao restaurar menu default: {e}")
        return False
