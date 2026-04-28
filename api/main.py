import asyncio
import logging
import os
import platform
import sys

# Centralização do carregamento do .env ANTES das importações dos módulos locais
try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
    else:
        load_dotenv()
except ImportError:
    pass

if platform.system() == 'Windows':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import tempfile
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright
from cachetools import TTLCache, cached
from firebase_admin import firestore

import api.auth as auth
import api.database as db
import api.parser as parser
from api.automation_api_check import run_batch_api_check, run_single_api_check
from api.orchestrator import trigger_cloud_run_job
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    token = credentials.credentials
    decoded_token = auth.verify_token(token)
    if not decoded_token:
        return None
    return decoded_token

# Cache in-memory para evitar consultas repetitivas ao Firestore para validar roles (Max 500 usuários, expira em 5min)
admin_profile_cache = TTLCache(maxsize=500, ttl=300)

@cached(cache=admin_profile_cache)
def _get_cached_profile(email: str):
    return db.get_user_profile(email)

async def require_admin(user = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Autenticação necessária.")
    
    # Verifica Role via cache/Firestore para evitar gargalos lendo o DB em 100% das requisições
    email = user.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Token sem email válido.")
        
    profile = _get_cached_profile(email)
    if not profile or profile.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores podem realizar esta ação.")
    return user


# Configure standard logging
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Sincronização de Fuso Horário no SO (Linux/Cloud Run)
# Garante que o Python e subprocessos (Chrome) usem horário de Brasília
try:
    os.environ['TZ'] = 'America/Sao_Paulo'
    if hasattr(os, 'tzset'):
        os.tzset()
except: pass

app = FastAPI(title="GAX API")

# Configurar CORS para permitir o frontend Next.js
allowed_origins_raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# @app.middleware("http")
# async def log_requests(request, call_next):
#     print(f"Incoming request: {request.method} {request.url}")
#     response = await call_next(request)
#     print(f"Response status: {response.status_code}")
#     return response

from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    # Se for um erro HTTP intencional (ex: 401 Login Inválido, 400 Regra Violada, 404 N/A)
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        # Retorna a mensagem original inalterada para o Frontend parser ler
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    import traceback
    error_msg = traceback.format_exc()
    logging.error(f"CRITICAL ERROR on {request.url}: {error_msg}")
    
    # Em produção, ocultamos o erro detalhado do cliente
    env = os.environ.get("ENV", "development")
    detail = str(exc) if env == "development" else "Ocorreu um erro interno no servidor."
    
    return JSONResponse(
        status_code=500,
        content={"detail": detail}
    )

@app.get("/")
def read_root():
    return {"status": "online", "system": "GAX 2.0"}

@app.get("/health")
async def health_check():
    try:
        # Tenta uma operação simples no Firestore
        db.firestore_db.collection('users').limit(1).get()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}

@app.post("/login")
async def login(email: str = Form(...), password: str = Form(...)):
    """Autentica usuário via Firebase e retorna token/perfil."""
    # DETALHES PARA DEPURAÇÃO (Não logue a senha real em produção!)
    logger.info(f"--- NOVA TENTATIVA DE LOGIN ---")
    logger.info(f"Email Bruto: '{email}' (Tamanho: {len(email)})")
    logger.info(f"Senha (Tamanho: {len(password)})")
    
    # Tratamento básico
    email = email.strip()
    
    try:
        user = auth.sign_in_with_email_and_password(email, password)

        # Injeta o perfil da base de dados (Role, Nome, Status) na resposta
        user_profile = db.get_user_profile(email)
        if user_profile:
            user["role"] = user_profile.get("role", "user")
            user["first_name"] = user_profile.get("first_name", "")
            user["last_name"] = user_profile.get("last_name", "")

        db.add_audit_log(email, "Login", "Usuário acessou o sistema com sucesso.", "INFO")
        return user
    except Exception as e:
        logger.error(f"Login failed for {email}: {e}")
        db.add_audit_log(email, "Tentativa de Login Falhou", str(e), "WARNING")
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/register")
async def register(
    email: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(""),
    last_name: str = Form("")
):
    try:
        user = auth.create_user_with_email_and_password(email, password, first_name, last_name)
        return user
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/reset-password")
async def reset_password(email: str = Form(...)):
    try:
        auth.send_password_reset_email(email)
        db.add_audit_log(email, "Reset de Senha Solicitado", "E-mail de recuperação de senha foi enviado.", "WARNING")
        return {"message": "E-mail de recuperação enviado."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/google")
async def google_auth(id_token: str = Form(...)):
    try:
        user = auth.sign_in_with_google_id_token(id_token)
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/branding")
async def get_branding():
    return db.get_branding()

# --- RSUS SETTINGS ENDPOINTS (Consolidados no fim do arquivo) ---

# --- CUBETI CREDENTIALS MANAGEMENT ---
@app.get("/settings/cubeti-credentials")
async def get_cubeti_creds(user = Depends(require_admin)):
    """Returns stored credentials for CubeTI Gestão Comercial (Masked)."""
    creds = db.get_cubeti_credentials()
    if creds.get("password"):
        creds["password"] = "********"
    return creds

@app.post("/settings/cubeti-credentials")
async def save_cubeti_creds(body: dict, user = Depends(require_admin)):
    password = body.get("password", "")
    # Se a senha for a mascarada, não atualiza ela no banco
    if password.startswith("***") or password == "********":
        current = db.get_cubeti_credentials()
        password = current.get("password", "")
        
    if db.save_cubeti_credentials(body.get("email", ""), password):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao salvar credenciais CubeTI.")

# --- WHATSAPP / EVOLUTION API MANAGEMENT ---
@app.get("/whatsapp/config")
async def get_whatsapp_config(user = Depends(require_admin)):
    """Returns stored WhatsApp Evolution API configuration (Masked)."""
    config = db.get_whatsapp_config()
    if config.get("api_key"):
        config["api_key"] = "********"
    return config

@app.post("/whatsapp/config")
async def save_whatsapp_config(body: dict, user = Depends(require_admin)):
    api_key = body.get("api_key", "")
    # Se a chave for mascarada, não atualiza
    if api_key.startswith("***") or api_key == "********":
        current = db.get_whatsapp_config()
        api_key = current.get("api_key", "")

    if db.save_whatsapp_config(
        body.get("url", ""),
        api_key,
        body.get("instance_name", "GaxBot"),
        body.get("target_numbers", [])
    ):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao salvar config WhatsApp.")

@app.get("/whatsapp/instance/status")
async def whatsapp_instance_status(user = Depends(require_admin)):
    """Proxy: checks Evolution API instance connection state."""
    import requests
    config = db.get_whatsapp_config()
    base = config["url"].rstrip("/")
    instance = config.get("instance_name", "GaxBot")
    headers = {"apikey": config["api_key"]}
    try:
        resp = requests.get(f"{base}/instance/connectionState/{instance}", headers=headers, timeout=15)
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Erro de Autenticação (Forbidden): Verifique sua Global API Key no Evolution.")
        if resp.status_code == 200:
            return resp.json()
        
        resp2 = requests.get(f"{base}/instance/fetchInstances", params={"instanceName": instance}, headers=headers, timeout=15)
        if resp2.status_code == 403:
            raise HTTPException(status_code=403, detail="Erro de Autenticação (Forbidden): Verifique sua Global API Key no Evolution.")
        return resp2.json()
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar Evolution API: {str(e)}")

@app.post("/whatsapp/instance/create")
async def whatsapp_instance_create(user = Depends(require_admin)):
    """Proxy: creates a new Evolution API v1.8.x instance with the configured name."""
    import requests
    config = db.get_whatsapp_config()
    base = config["url"].rstrip("/")
    instance = config.get("instance_name", "GaxBot")
    headers = {"apikey": config["api_key"], "Content-Type": "application/json"}
    try:
        resp = requests.post(
            f"{base}/instance/create",
            headers=headers,
            json={"instanceName": instance, "qrcode": True, "integration": "WHATSAPP-BAILEYS"},
            timeout=30
        )
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Erro de Autenticação (Forbidden): Verifique sua Global API Key no Evolution.")
        return resp.json()
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao criar instância: {str(e)}")

@app.get("/whatsapp/instance/qrcode")
async def whatsapp_instance_qrcode(user = Depends(require_admin)):
    """Proxy: fetches QR Code for the configured instance."""
    import requests
    config = db.get_whatsapp_config()
    base = config["url"].rstrip("/")
    instance = config.get("instance_name", "GaxBot")
    headers = {"apikey": config["api_key"]}
    try:
        resp = requests.get(f"{base}/instance/connect/{instance}", headers=headers, timeout=30)
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Erro de Autenticação (Forbidden): Verifique sua Global API Key no Evolution.")
        return resp.json()
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao gerar QR Code: {str(e)}")

@app.post("/whatsapp/send-test")
async def whatsapp_send_test(body: dict, user = Depends(require_admin)):
    """Dispara uma mensagem de teste para os números configurados."""
    import api.utils as utils
    message = body.get("message", "🔔 Teste de Conexão GAX - Evolution API está funcionando!")
    try:
        # Chama a função refatorada no utils.py que busca config do banco
        await utils.send_whatsapp_alert(message)
        return {"status": "success", "message": "Mensagem de teste enviada com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao enviar mensagem de teste: {str(e)}")

# --- MESSAGE BROADCAST & TEMPLATES ---

@app.get("/messages/templates")
async def get_templates(user = Depends(require_admin)):
    return db.get_message_templates()

@app.post("/messages/templates")
async def save_template(body: dict, user = Depends(require_admin)):
    tid = db.save_message_template(body.get("name"), body.get("content"), body.get("id"))
    if tid: return {"status": "success", "id": tid}
    raise HTTPException(status_code=500, detail="Erro ao salvar template.")

@app.delete("/messages/templates/{template_id}")
async def delete_template(template_id: str, user = Depends(require_admin)):
    if db.delete_message_template(template_id):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao deletar template.")

@app.get("/messages/logs")
async def get_message_logs(page: int = 1, limit: int = 10, user = Depends(require_admin)):
    logs, total = db.get_message_logs_paginated(page, limit)
    return {"logs": logs, "total": total}

@app.patch("/clients/{client_id}/whatsapp")
async def update_client_whatsapp(client_id: str, body: dict, user = Depends(require_admin)):
    """Atualização rápida de contatos de whatsapp."""
    whatsapp_numbers = body.get("whatsapp_numbers", [])
    if db.update_client_config(client_id, {"whatsapp_numbers": whatsapp_numbers}):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao atualizar contatos.")

@app.post("/messages/broadcast")
async def broadcast_message(body: dict, background_tasks: BackgroundTasks, user = Depends(require_admin)):
    """
    Processa o envio em lote com base em filtros inteligentes.
    """
    import api.utils as utils
    
    filters = body.get("filters", {})
    message = body.get("message", "")
    
    if not message:
        raise HTTPException(status_code=400, detail="Mensagem não pode estar vazia.")
    
    # 1. Busca todos os clientes para filtrar
    all_clients = db.get_all_clients()
    targets = [] # List of tuples (client_id, client_name, whatsapp_numbers_list)
    
    # Busca detalhes de whatsapp_numbers separadamente pois get_all_clients retorna resumido
    # NOTA: Otimização futura - incluir whatsapp_numbers no stream do get_all_clients se necessário
    
    for c in all_clients:
        # Recarrega config completa para pegar whatsapp_numbers (array)
        conf = db.get_client_config(c['id'])
        if not conf: continue
        
        nums = conf.get("whatsapp_numbers", [])
        if not nums: continue
        
        # Filtro: Cliente Específico
        if filters.get("client_id") and filters["client_id"] != c['id']:
            continue
            
        # Filtro: API Offline
        if filters.get("api_offline") and c.get("api_status") != "offline":
            continue
            
        # Filtros ABI (Sincronizado com Checar Importações)
        # Nao Importado -> Pendente Importação
        # Importado, falta analisar -> Falta Analisar
        # Falha na Análise / Falha -> Falha na Análise
        abi_status = c.get("abi_status", "").lower()
        
        passed_abi_filter = False
        has_any_abi_filter = filters.get("abi_pending") or filters.get("abi_missing") or filters.get("abi_failed")
        
        if has_any_abi_filter:
            if filters.get("abi_pending") and "nao importado" in abi_status: passed_abi_filter = True
            if filters.get("abi_missing") and "falta" in abi_status: passed_abi_filter = True
            if filters.get("abi_failed") and ("falha" in abi_status or "erro" in abi_status): passed_abi_filter = True
            
            if not passed_abi_filter: continue
        
        targets.append((c['id'], c['name'], nums))

    if not targets:
        return {"status": "success", "sent_count": 0, "message": "Nenhum cliente encontrado para os filtros aplicados."}

    # 2. Lógica de Disparo Assíncrono (Processa em background)
    async def run_broadcast():
        count = 0
        for cid, cname, nums in targets:
            for contact_item in nums:
                # Suporta tanto o formato antigo (string) quanto o novo (dict com 'number')
                n = contact_item.get("number") if isinstance(contact_item, dict) else contact_item
                if not n: continue
                
                try:
                    await utils.send_whatsapp_alert(message, target_numbers=[n])
                    db.save_message_log(cid, cname, n, message, "SUCCESS")
                except Exception as e:
                    db.save_message_log(cid, cname, n, message, "ERROR", str(e))
                count += 1
                await asyncio.sleep(1) # Delay de segurança entre números
    
    background_tasks.add_task(run_broadcast)
    
    return {
        "status": "success", 
        "sent_count": sum(len(t[2]) for t in targets),
        "target_clients": len(targets),
        "message": f"Disparo iniciado para {len(targets)} cliente(s)."
    }

class ABICheckRequest(BaseModel):
    client_id: Optional[str] = None
    client_ids: Optional[List[str]] = None


@app.post("/cancel-task/{task_id}")
async def cancel_task(task_id: str, user = Depends(get_current_user)):
    """Cancela uma tarefa em andamento."""
    db.update_task(task_id, {"status": "cancelled"})
    db.add_log(task_id, "Interrompendo processamento (solicitação do usuário)...", "WARNING")
    return {"status": "success"}

# --- ABI CHECK ENDPOINTS ---
@app.post("/upload-abi-schedule")
async def upload_abi_schedule(file: UploadFile = File(...), user = Depends(get_current_user)):
    import pandas as pd
    import io
    from datetime import datetime as dt
    try:
        contents = await file.read()
        current_year = dt.now().year

        # 1. Carrega sem header para encontrar a linha correta
        df_raw = pd.read_excel(io.BytesIO(contents), header=None)

        # 2. Localiza a linha do cabeçalho buscando por palavras-chave
        header_idx = 0
        for i, row in df_raw.head(20).iterrows():
            row_str = " ".join([str(val).lower() for val in row.values])
            if 'abi' in row_str or 'competência' in row_str or 'trimestre' in row_str or 'lançamento' in row_str:
                header_idx = i
                break

        # 3. Recarrega com o header correto
        df = pd.read_excel(io.BytesIO(contents), header=header_idx)
        df = df.dropna(how='all')

        # 4. Mapeamento inteligente de colunas para os 7 campos relevantes
        import unicodedata
        def strip_accents(s):
           return ''.join(c for c in unicodedata.normalize('NFD', s)
                          if unicodedata.category(c) != 'Mn').lower().strip()

        COLUMN_MAP = {
            'Ano Lançamento':          ['ano', 'lancamento', 'year'],
            'ABI':                     ['abi'],
            'Competência':             ['competencia', 'trimestre', 'referencia', 'periodo'],
            'Data fim competência':    ['data fim competencia', 'fim competencia', 'data fim comp'],
            'Data de Lançamento':      ['data de lancamento', 'data lancamento', 'inicio'],
            'Data fim de Ciência':     ['data fim de ciencia', 'fim ciencia', 'prazo ciencia', 'data fim ciencia'],
            'Data fim de Impugnação':  ['data fim de impugnacao', 'fim impugnacao', 'prazo impugnacao', 'impugnacao'],
        }

        columns_map = {}
        for col in df.columns:
            c_norm = strip_accents(str(col))
            for standard_name, synonyms in COLUMN_MAP.items():
                if any(syn in c_norm for syn in synonyms) and standard_name not in columns_map.values():
                    columns_map[col] = standard_name
                    break

        df = df.rename(columns=columns_map)

        # 5. Garante que a coluna ABI existe
        if 'ABI' not in df.columns:
            return {"status": "error", "message": "Não foi possível localizar a coluna 'ABI' no arquivo. Verifique o formato do Excel."}

        # 6. Remove linhas sem ABI
        df = df[df['ABI'].notna() & (df['ABI'].astype(str).str.strip() != '')]

        # 7. Preenche anos (importante quando o ano só aparece na primeira linha do grupo)
        if 'Ano Lançamento' in df.columns:
            # Preenche o ano para baixo (forward fill) para lidar com grupos no Excel
            df['Ano Lançamento'] = df['Ano Lançamento'].ffill()
            
            def is_valid_year(val):
                try:
                    if hasattr(val, 'year'):
                        return val.year >= current_year
                    # Tenta converter para int se for float/string (ex: 2026.0 -> 2026)
                    return int(float(str(val).strip())) >= current_year
                except:
                    return False
            df = df[df['Ano Lançamento'].apply(is_valid_year)]

        if df.empty:
            return {"status": "error", "message": f"Nenhum registro encontrado para o ano {current_year}. Verifique se o arquivo contém a coluna 'Ano Lançamento'."}

        # 8. Converte TODAS as datas para string DD/MM/YYYY
        date_columns = ['Data fim competência', 'Data de Lançamento', 'Data fim de Ciência', 'Data fim de Impugnação']
        for col in date_columns:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors='coerce').dt.strftime('%d/%m/%Y')
                df[col] = df[col].fillna('')

        # 9. Converte Ano Lançamento para inteiro simples
        if 'Ano Lançamento' in df.columns:
            df['Ano Lançamento'] = df['Ano Lançamento'].apply(
                lambda x: x.year if hasattr(x, 'year') else (int(str(x)[:4]) if str(x).strip() else '')
            )

        # 10. Normaliza ABI — garante sufixo º
        df['ABI'] = df['ABI'].astype(str).str.strip()

        # 11. Preenche campos restantes com string vazia
        df = df.fillna('')

        data_list = df.to_dict(orient='records')

        if db.save_abi_schedule(data_list):
            return {"status": "success", "message": f"{len(data_list)} registros de {current_year} processados com sucesso."}
        raise HTTPException(status_code=500, detail="Erro ao salvar cronograma no banco.")
    except Exception as e:
        logger.error(f"Erro ao processar Excel de ABI: {e}")
        raise HTTPException(status_code=400, detail=f"Erro no arquivo: {str(e)}")

@app.get("/abi-schedule")
async def get_abi_schedule(user = Depends(get_current_user)):
    return {
        "active": db.get_active_abi(),
        "all": db.get_abi_schedule()
    }

@app.get("/abi-dashboard-stats")
async def get_abi_dashboard_stats(user = Depends(get_current_user)):
    return db.get_abi_dashboard_stats()

@app.post("/start-abi-check")
async def start_abi_check(request: ABICheckRequest, background_tasks: BackgroundTasks, user = Depends(get_current_user)):
    """Inicia a checagem de ABIs (lote ou individual) via Cloud Run Job."""
    active_abi = db.get_active_abi()
    if not active_abi:
        raise HTTPException(status_code=400, detail="Nenhuma ABI ativa identificada. Faça upload do cronograma (.xlsx) antes de checar.")
    
    abi_label = active_abi.get('ABI', 'Desconhecido') or 'Desconhecido'
    client_id = request.client_id
    client_ids = request.client_ids
    
    if client_id:
        task_id = db.create_task("abi_check_single", f"Checagem ABI {abi_label}: {client_id}")
        db.update_task(task_id, {"client_id": client_id})
    elif client_ids:
        label_unit = "operadora" if len(client_ids) == 1 else "operadoras"
        task_id = db.create_task("abi_check_batch", f"Checagem ABI {abi_label} (Parcial: {len(client_ids)} {label_unit})")
        db.update_task(task_id, {"client_ids": client_ids})
    else:
        task_id = db.create_task("abi_check_batch", f"Checagem ABI {abi_label} em Lote")

    trigger_cloud_run_job(task_id, background_tasks)
    return {"status": "pending", "task_id": task_id}

# --- IMPUGNATION CHECK ENDPOINTS ---
@app.post("/start-impugnation-check")
async def start_impugnation_check(request: ABICheckRequest, background_tasks: BackgroundTasks, user = Depends(get_current_user)):
    """Inicia a checagem de impugnações (lote ou individual) via Cloud Run Job."""
    active_abi = db.get_active_abi()
    if not active_abi:
        raise HTTPException(status_code=400, detail="Nenhuma ABI ativa identificada.")
    
    abi_label = active_abi.get('ABI', 'Desconhecido') or 'Desconhecido'
    client_id = request.client_id
    client_ids = request.client_ids
    
    if client_id:
        task_id = db.create_task("impugnation_check_single", f"Checagem Impugnação {abi_label}: {client_id}")
        db.update_task(task_id, {"client_id": client_id})
    elif client_ids:
        label_unit = "operadora" if len(client_ids) == 1 else "operadoras"
        task_id = db.create_task("impugnation_check_batch", f"Checagem Impugnação {abi_label} (Parcial: {len(client_ids)} {label_unit})")
        db.update_task(task_id, {"client_ids": client_ids})
    else:
        task_id = db.create_task("impugnation_check_batch", f"Checagem Impugnação {abi_label} em Lote")

    trigger_cloud_run_job(task_id, background_tasks)
    return {"status": "pending", "task_id": task_id}

@app.get("/impugnation-dashboard-stats")
async def get_impugnation_stats(user = Depends(get_current_user)):
    return db.get_impugnation_dashboard_stats()

@app.get("/reports/impugnations")
async def export_impugnations_report(user = Depends(get_current_user)):
    import io
    import pandas as pd
    from fastapi.responses import StreamingResponse
    from datetime import datetime
    
    clients = db.get_all_clients()
    report_data = []
    
    for c in clients:
        # Puxa a configuração completa do cliente para pegar o config que contém os stats (get_all_clients já retorna isso, mas vamos garantir)
        full_client = db.get_client_config(c['id']) if 'impugnation_stats' not in c else c
        stats = full_client.get('impugnation_stats', {})
        
        last_check = full_client.get('impugnation_last_check') or full_client.get('abi_last_check')
        dt_str = ""
        if last_check:
            try:
                import pytz
                # Localize to Sao Paulo
                tz = pytz.timezone('America/Sao_Paulo')
                # Check if it's aware, if so astimezone, otherwise force tz
                if hasattr(last_check, 'tzinfo') and last_check.tzinfo is not None:
                    local_dt = last_check.astimezone(tz)
                else:
                    local_dt = pytz.utc.localize(last_check).astimezone(tz)
                dt_str = local_dt.strftime('%d/%m/%Y %H:%M')
            except Exception as e:
                dt_str = str(last_check)[:16]
                
        report_data.append({
            "Cliente": full_client.get('name', 'Desconhecido'),
            "Situação do ABI": full_client.get('impugnation_status', 'Não Iniciou'),
            "Quantidade de Atendimentos": stats.get('total', 0),
            "Quantidade Impugnados": stats.get('impugnados', 0),
            "Quantidade Não Impugnando": stats.get('nao_impugnando', 0),
            "Quantidade Aptos": stats.get('aptos', 0),
            "Quantidade Aguardando Impugnação": stats.get('aguardando', 0),
            "Data da Última Checagem": dt_str
        })
        
    df = pd.DataFrame(report_data)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Relatório Impugnações')
    
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Relatorio_Impugnacoes.xlsx"}
    )


# --- SINGLE API CHECK (Consolidados no fim do arquivo) ---

@app.get("/active-task/{category}")
async def get_active_task_route(category: str, user = Depends(get_current_user)):
    """Retorna a tarefa ativa para uma categoria (abi ou api)."""
    task = db.get_active_task(category)
    if task:
        return task
    return {"status": "none"}

@app.get("/clients")
async def get_clients(page: int = 1, limit: int = 10, search: str = "", user = Depends(get_current_user)):
    logger.info(f"GET /clients chamado por: {user.get('email') if user else 'ANÔNIMO'}")
    clients, total = db.get_clients_paginated(page, limit, search)
    return {"clients": clients, "total": total}

@app.post("/clients/{client_id}")
async def update_client(client_id: str, data: dict, user = Depends(require_admin)):
    success = db.update_client_config(client_id, data)
    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Failed to update client")
    return {"status": "success"}

@app.post("/clients/delete-batch")
async def delete_clients_batch_route(data: dict, user = Depends(require_admin)):
    client_ids = data.get('client_ids', [])
    if not client_ids:
        raise HTTPException(status_code=400, detail="No client IDs provided")
    success = db.delete_clients_batch(client_ids)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete clients")
    return {"status": "success"}

# --- ROTAS DE GRUPOS ---

@app.get("/groups")
async def get_groups(user = Depends(require_admin)):
    return db.get_groups()

@app.post("/groups")
async def create_group(data: dict, user = Depends(require_admin)):
    group_id = db.create_group(data)
    if not group_id:
        raise HTTPException(status_code=500, detail="Failed to create group")
    return {"status": "success", "id": group_id}

@app.post("/groups/{group_id}")
async def update_group(group_id: str, data: dict, user = Depends(require_admin)):
    success = db.update_group(group_id, data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update group")
    return {"status": "success"}

@app.delete("/groups/{group_id}")
async def delete_group(group_id: str, user = Depends(require_admin)):
    success = db.delete_group(group_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete group")
    return {"status": "success"}

@app.get("/xml-data")
async def get_xml_data(page: int = 1, limit: int = 10, search: str = "", client: str = "", user = Depends(get_current_user)):
    xml_data, total = db.get_xml_data_paginated(page, limit, search, client)
    return {"xml_data": xml_data, "total": total}

@app.get("/xml-data/export")
async def export_xml_data(user = Depends(get_current_user)):
    import io

    import pandas as pd
    from fastapi.responses import StreamingResponse

    data = db.get_all_xml_data()
    df = pd.DataFrame(data)

    # Renomeia para as colunas amigáveis do usuário
    df_export = df.rename(columns={
        "file_name": "Nome do Arquivo",
        "abi": "Número ABI",
        "client": "Razão Social",
        "value": "Valor Total do Processo",
        "quantity": "Qtd. Atendimentos",
        "competence": "Datas de Competência",
        "process_number": "Número do Processo",
        "transaction_date": "Data de Registro da Transação",
        "recebimento_oficio": "Data Recebimento Ofício",
        "date": "Data Processamento"
    })

    # Remove colunas técnicas e desnecessárias
    cols_to_drop = ["storage_path", "id", "status"]
    for col in cols_to_drop:
        if col in df_export.columns: df_export = df_export.drop(columns=[col])

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name='Dados XML')
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=extracao_xml.xlsx"}
    )

@app.get("/xml-data/{file_id}/details")
async def get_xml_details(file_id: str, user = Depends(get_current_user)):
    doc = db.firestore_db.collection('task_files').document(file_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    data = doc.to_dict()
    storage_path = data.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=400, detail="Caminho do storage não encontrado para este arquivo")

    # Download do XML para memória
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        success = db.download_xml_from_storage(storage_path, tmp.name)
        if not success:
            raise HTTPException(status_code=500, detail="Erro ao baixar arquivo do Storage")

        with open(tmp.name, 'rb') as f:
            content = f.read()

    # Remove o arquivo temporário
    os.unlink(tmp.name)

    # Parse dos detalhes finos
    details = parser.parse_fine_details_from_bytes(content)
    return details

@app.get("/xml-data/{file_id}/export")
async def export_single_xml_details(file_id: str, user = Depends(get_current_user)):
    import io

    import pandas as pd
    from fastapi.responses import StreamingResponse

    # Busca o arquivo e extrai os detalhes (mesma lógica do endpoint de detalhes)
    doc = db.firestore_db.collection('task_files').document(file_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    data = doc.to_dict()
    storage_path = data.get("storage_path")
    file_name = data.get("file_name", f"detalhes_{file_id}")

    import tempfile
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        success = db.download_xml_from_storage(storage_path, tmp.name)
        if not success:
            raise HTTPException(status_code=500, detail="Erro ao baixar arquivo")
        with open(tmp.name, 'rb') as f:
            content = f.read()
    os.unlink(tmp.name)

    details = parser.parse_fine_details_from_bytes(content)
    if not details:
        # Se não houver detalhes, retorna um erro amigável ao invés de Excel vazio
        raise HTTPException(status_code=404, detail="Nenhum detalhe encontrado para este XML para exportação.")

    df = pd.DataFrame(details)

    # Renomeia para colunas amigáveis
    df_export = df.rename(columns={
        "beneficiario_cod": "Cód. Beneficiário",
        "beneficiario_nome": "Nome do Beneficiário",
        "data": "Data Atendimento",
        "procedimento_cod": "Cód. Procedimento",
        "procedimento_nome": "Descrição Procedimento",
        "valor": "Valor (R$)"
    })

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name='Detalhes XML')
    output.seek(0)

    safe_filename = file_name.replace('.xml', '').replace('.XML', '') + "_detalhes.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={safe_filename}"}
    )

@app.get("/users")
async def get_users(user = Depends(require_admin)):
    return db.get_all_users()

@app.get("/users/pending")
async def get_pending_users(user = Depends(require_admin)):
    return db.get_pending_users()

@app.post("/users/approve/{user_email}")
async def approve_user(user_email: str, user = Depends(require_admin)):
    admin_profile_cache.pop(user_email, None)
    db.update_user_status(user_email, "approved")
    return {"message": "Usuário aprovado com sucesso."}

@app.post("/users/reject/{user_email}")
async def reject_user(user_email: str, user = Depends(require_admin)):
    admin_profile_cache.pop(user_email, None)
    db.delete_user_profile(user_email)
    return {"message": "Usuário recusado e removido."}

@app.delete("/users/{user_email}")
async def delete_user(user_email: str, user = Depends(require_admin)):
    admin_profile_cache.pop(user_email, None)
    db.delete_user_profile(user_email)
    db.add_audit_log("Admin/Sistema", "Exclusão de Usuário", f"Perfil {user_email} excluído.", "WARNING")
    return {"message": "Usuário excluído com sucesso."}

@app.patch("/users/{user_email}")
async def update_user(user_email: str, data: dict, user = Depends(require_admin)):
    # Se uma nova senha for fornecida, atualiza no Firebase Auth
    new_password = data.get("password")
    if new_password and len(str(new_password).strip()) > 0:
        try:
            auth.update_user_credentials(user_email, new_password=new_password)
            db.add_audit_log("Admin/Sistema", "Alteração de Senha (Admin)", f"Senha do usuário {user_email} alterada pelo administrador.", "WARNING")
        except Exception as e:
            logger.error(f"Erro ao atualizar senha via admin para {user_email}: {e}")
            raise HTTPException(status_code=400, detail=f"Erro ao atualizar senha no Auth: {str(e)}")

    success = db.update_user_profile(
        user_email,
        data.get("email"),
        data.get("first_name"),
        data.get("last_name"),
        data.get("role"),
        data.get("status")
    )
    if success:
        admin_profile_cache.pop(user_email, None)
        return {"message": "Usuário atualizado com sucesso."}
    raise HTTPException(status_code=400, detail="Erro ao atualizar usuário.")

@app.post("/branding")
async def save_branding(data: dict, user = Depends(require_admin)):
    db.save_branding(data.get("system_name"), data.get("logo_base64"))
    return {"message": "Identidade visual salva."}

@app.post("/maintenance/clear-logs")
async def clear_logs(user = Depends(require_admin)):
    if db.clear_import_logs():
        db.add_audit_log("Admin/Sistema", "Limpar Histórico", "Admin executou a limpeza do histórico de importação do painel principal.", "WARNING")
        return {"message": "Logs limpos com sucesso."}
    raise HTTPException(status_code=500, detail="Erro ao limpar logs.")

@app.post("/maintenance/reset-db")
async def reset_db(user = Depends(require_admin)):
    if db.reset_system_database():
        db.add_audit_log("Admin/Sistema", "Reset de Banco", "Admin reiniciou completamente o banco de dados (Hard Reset).", "ERROR")
        return {"message": "Banco de dados resetado com sucesso."}
    raise HTTPException(status_code=500, detail="Erro ao resetar banco.")

@app.get("/tasks")
async def get_tasks(type: Optional[str] = None, exclude_api: bool = False, user = Depends(get_current_user)):
    # Retorna o histórico de tarefas para a página de logs, com filtro opcional por tipo
    # Usando o limite de 50 para evitar sobrecarga
    tasks = db.get_tasks_for_dashboard(limit=50, task_type=type, exclude_api_checks=exclude_api)
    for t in tasks:
        if 'senha' in t: t['senha'] = "********"
        if 'usuario' in t: t['usuario'] = "********"
    return tasks

@app.get("/task/{task_id}")
async def get_task_status(task_id: str, user = Depends(get_current_user)):
    """Retorna o status completo, progresso e logs de uma tarefa."""
    task = db.firestore_db.collection('tasks').document(task_id).get()
    if not task.exists:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    
    task_data = task.to_dict()
    
    # Mascarar campos sensíveis antes de retornar
    if 'senha' in task_data: task_data['senha'] = "********"
    if 'usuario' in task_data: task_data['usuario'] = "********"
    # Campos da Evolution API se existirem
    if 'api_key' in task_data: task_data['api_key'] = "********"
    
    # Cálculos de compatibilidade
    total = task_data.get('total_arquivos', 0)
    processed = task_data.get('arquivos_processados', 0)
    
    # Se progress_percent (granular) existir, usamos ele. 
    # Caso contrário, recalculamos pelo total de arquivos (lote).
    progress = task_data.get('progress_percent')
    if progress is None:
        if total > 0:
            progress = int((processed / total) * 100)
        else:
            progress = 0
            
    # Recupera logs (agora sempre em ordem ASCENDING por timestamp_precise via database.py)
    logs = db.get_task_logs(task_id)
    
    # Atualiza o dicionário de retorno para garantir que a UI tenha todos os campos
    response = {
        **task_data,
        "progress": progress,
        "progress_percent": progress,
        "logs": logs
    }
    
    return response

@app.get("/task/{task_id}/logs")
async def route_get_task_logs(task_id: str, client_name: str = None, user = Depends(get_current_user)):
    """Retorna a lista de logs de uma tarefa específica, opcionalmente filtrada por cliente."""
    return db.get_task_logs(task_id, client_filter=client_name)

@app.get("/tasks/history-logs")
async def get_history_logs(type: str = "abi", limit: int = 5, user = Depends(get_current_user)):
    """Retorna logs agregados das últimas N tarefas de uma categoria."""
    return db.get_aggregated_history_logs(task_category=type, limit_tasks=limit)


# --- API MONITORING ENDPOINTS ---
class BatchCheckRequest(BaseModel):
    client_ids: Optional[List[str]] = None

@app.post("/check-integrations")
async def route_run_batch_api_check(request: BatchCheckRequest, user = Depends(get_current_user)):
    """Dispara checagem de APIs em lote via Cloud Run Job."""
    desc = "Checagem geral de APIs RSUS" if not request.client_ids else f"Checagem parcial ({len(request.client_ids)} clientes)"
    task_id = db.create_task(task_type="batch_api_check", description=desc)
    if request.client_ids:
        db.update_task(task_id, {"client_ids": request.client_ids})
    trigger_cloud_run_job(task_id)
    return {"status": "success", "task_id": task_id}

@app.post("/check-integration/{client_id}")
async def route_run_single_api_check(client_id: str, user = Depends(get_current_user)):
    """Dispara checagem de API individual via Cloud Run Job."""
    task_id = db.create_task(task_type="api_check_single", description=f"Checagem individual: {client_id}", razao_social=client_id)
    db.update_task(task_id, {"client_id": client_id})
    trigger_cloud_run_job(task_id)
    return {"status": "success", "task_id": task_id}

# --- RSUS SETTINGS ENDPOINTS ---
@app.get("/settings/rsus-credentials")
async def route_get_rsus_credentials(type: str = "general", user = Depends(require_admin)):
    creds = db.get_rsus_credentials(type)
    if creds and creds.get("password"):
        creds["password"] = "********"
    return creds or {"username": "", "password": ""}

@app.post("/settings/rsus-credentials")
async def route_save_rsus_credentials(type: str = Form(...), username: str = Form(...), password: str = Form(...), user = Depends(require_admin)):
    # Se a senha for a mascarada, não atualiza ela no banco
    if password.startswith("***") or password == "********":
        current = db.get_rsus_credentials(type)
        if current:
            password = current.get("password", "")

    if db.save_rsus_credentials(type, username, password):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao salvar credenciais")

# --- MENU CONFIGURATION ENDPOINTS ---
@app.get("/menu-config")
async def route_get_menu_config():
    return db.get_menu_config()

@app.post("/menu-config")
async def route_save_menu_config(config: dict, user = Depends(require_admin)):
    success, error_msg = db.save_menu_config_detailed(config)
    if success: return {"status": "success"}
    raise HTTPException(status_code=500, detail=error_msg)

@app.post("/menu-config/set-default")
async def route_set_menu_default(config: dict, user = Depends(require_admin)):
    if db.save_menu_default(config): return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao salvar padrão.")

@app.post("/menu-config/restore-default")
async def route_restore_menu_default(user = Depends(require_admin)):
    if db.restore_menu_default(): return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao restaurar.")

# --- USER PROFILE ENDPOINTS ---
@app.get("/profile")
async def route_get_profile(email: str):
    profile = db.get_user_profile(email)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
    return profile

@app.post("/profile/request-code")
async def route_request_verification_code(email: str = Form(...), action_type: str = Form(...)):
    """Gera e envia um código de 6 dígitos para o e-mail do usuário."""
    import secrets
    code = secrets.randbelow(900000) + 100000
    if db.save_verification_code(email, code, action_type):
        from api.email_utils import send_verification_email # Usando utilitário centralizado
        send_verification_email(email, code, action_type)
        return {"status": "success", "message": "Código enviado para seu e-mail."}
    raise HTTPException(status_code=500, detail="Erro ao gerar código de verificação.")

@app.post("/profile/update")
async def route_update_profile(
    current_email: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    new_email: Optional[str] = Form(None),
    new_password: Optional[str] = Form(None),
    current_password: Optional[str] = Form(None),
    code: Optional[str] = Form(None)
):
    """Atualiza dados do perfil no Firebase e Firestore."""
    is_changing_email = new_email and new_email != current_email
    if is_changing_email:
        if not code:
            raise HTTPException(status_code=400, detail="O código de verificação é obrigatório para alterar o e-mail.")
        if not db.verify_code(current_email, code, 'email_change'):
            raise HTTPException(status_code=400, detail="Código inválido ou expirado.")

    is_changing_password = new_password and len(str(new_password).strip()) > 0
    if is_changing_password:
        if not current_password:
            raise HTTPException(status_code=400, detail="A senha atual é obrigatória.")
        try:
            auth.sign_in_with_email_and_password(current_email, current_password)
        except Exception:
            raise HTTPException(status_code=400, detail="Senha atual incorreta.")

    try:
        if is_changing_email or is_changing_password:
            auth.update_user_credentials(current_email, new_email, new_password)
        success = db.update_user_profile(current_email, new_email or current_email, first_name, last_name)
        if success:
            return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    raise HTTPException(status_code=500, detail="Erro ao atualizar perfil.")


# --- ADDITIONAL CORE ENDPOINTS ---

@app.post("/pre-check")
async def pre_check_duplicates(files: List[UploadFile] = File(...)):
    if not files: return {"duplicates": []}
    arquivos_upload_data = []
    for file in files:
        content = await file.read()
        arquivos_upload_data.append((file.filename, content))
    try:
        extracted = parser.extrair_dados_xml(arquivos_upload_data)
        if extracted.empty: return {"duplicates": [], "client_exists": False, "razao_social": ""}
        razao_social = parser.extract_razao_social(arquivos_upload_data[0][1])
        url_sistema = db.get_last_url_for_client(razao_social)
        duplicates = []
        for _, row in extracted.iterrows():
            abi = str(row.get('Número ABI', row.get('numero_abi', '')))
            if db.check_abi_already_imported(razao_social.strip(), abi):
                duplicates.append(abi)
        return {"duplicates": duplicates, "razao_social": razao_social, "client_exists": bool(url_sistema), "url_sistema": url_sistema}
    except Exception as e:
        logger.error(f"Erro no pre-check: {e}")
        return {"duplicates": [], "error": str(e), "client_exists": False}

@app.post("/upload")
async def upload_xmls(files: List[UploadFile] = File(...), url_sistema: Optional[str] = Form(None), usuario: Optional[str] = Form(None), senha: Optional[str] = Form(None), gax_user_email: str = Form("Admin/Sistema"), force: bool = Form(False)):
    """Recebe XMLs, persiste no Firestore/Storage e dispara processamento via Cloud Run Job."""
    if not files: return {"error": "Nenhum arquivo enviado."}
    arquivos_upload_data = []
    for file in files:
        content = await file.read()
        if len(content) > 5 * 1024 * 1024: return {"error": f"Arquivo {file.filename} excede 5MB."}
        arquivos_upload_data.append((file.filename, content))
    razao_social = parser.extract_razao_social(arquivos_upload_data[0][1])
    if not razao_social: return {"error": "Razão Social não identificada."}
    if not url_sistema: url_sistema = db.get_last_url_for_client(razao_social)
    if not usuario or not senha:
        cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"
        stored = db.get_rsus_credentials(cred_type)
        if stored:
            usuario = stored.get('username', usuario)
            senha = stored.get('password', senha)
    if not usuario or not senha: return {"error": "Credenciais RSUS não encontradas."}
    if not db.get_last_url_for_client(razao_social): db.save_client_config(razao_social, url_sistema)
    task_id = db.create_task(task_type="xml_import", url_sistema=url_sistema, usuario=usuario, senha=senha, razao_social=razao_social)
    db.update_task(task_id, {"force": force, "url_sistema": url_sistema})
    files_info = []
    for filename, content in arquivos_upload_data:
        storage_path = db.upload_xml_to_storage(task_id, filename, content)
        extracted = parser.extrair_dados_xml([(filename, content)])
        if not extracted.empty:
            row = extracted.iloc[0].to_dict()
            row['storage_path'] = storage_path
            row['razao_social'] = razao_social
            files_info.append(row)
    db.add_files_to_task_bulk(task_id, files_info)
    db.update_task_total_files(task_id, len(files_info))
    trigger_cloud_run_job(task_id)
    db.add_audit_log(gax_user_email, "Upload e Importação", f"Iniciou a fila de importação para '{razao_social}'", "INFO")
    return {"message": "Arquivos recebidos.", "task_id": task_id, "razao_social": razao_social, "total_files": len(files_info), "status": "Iniciado"}

@app.get("/audit")
async def route_get_audit_logs(user = Depends(require_admin)):
    db.auto_delete_old_audit_logs()
    return {"status": "success", "logs": db.get_audit_logs(limit=1000)}

@app.delete("/audit")
async def route_clear_audit_logs(user = Depends(require_admin)):
    success, count = db.clear_audit_logs()
    if success:
        db.add_audit_log("Admin/Sistema", "Limpar Logs de Auditoria", f"{count} registros excluídos.", "WARNING")
        return {"status": "success", "message": f"{count} logs deletados."}
    raise HTTPException(status_code=500, detail="Erro ao deletar auditoria")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8005, reload=False)
