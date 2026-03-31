import asyncio
import logging
import os
import platform
import sys

# if platform.system() == 'Windows':
#     asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import tempfile
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright

import api.auth as auth
import api.database as db
import api.parser as parser
from api.automation_api_check import run_batch_api_check, run_single_api_check

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Em produção, especificar a URL do frontend
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


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    error_msg = traceback.format_exc()
    logging.error(f"CRITICAL ERROR: {error_msg}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
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

# --- RSUS CREDENTIALS MANAGEMENT ---
@app.get("/api/settings/rsus-credentials")
async def get_rsus_creds(type: str):
    """Returns stored credentials for RSUS."""
    creds = db.get_rsus_credentials(type)
    if not creds:
        return {"username": "", "password": ""}
    # Em um cenário real, verificaríamos se o usuário logado é Admin aqui
    return creds

@app.post("/api/settings/rsus-credentials")
async def save_rsus_creds(type: str = Form(...), username: str = Form(...), password: str = Form(...)):
    if db.save_rsus_credentials(type, username, password):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao salvar credenciais.")

@app.post("/api/check-integrations")
async def check_integrations(background_tasks: BackgroundTasks):
    """Dispara a automação de checagem em lote em background."""
    import api.automation_api_check as auto_check
    task_id = db.create_task("api_check_batch", "Checagem de APIs em Lote")
    background_tasks.add_task(auto_check.run_batch_api_check, task_id)
    return {"status": "pending", "task_id": task_id}

@app.post("/api/check-integration/{client_id}")
async def check_single_integration(client_id: str, background_tasks: BackgroundTasks):
    """Dispara a automação de checagem para um único cliente."""
    import api.automation_api_check as auto_check
    task_id = db.create_task("api_check_single", f"Checagem de API: {client_id}")
    background_tasks.add_task(auto_check.run_single_api_check, client_id, task_id)
    return {"status": "pending", "task_id": task_id}

@app.get("/clients")
async def get_clients(page: int = 1, limit: int = 10, search: str = ""):
    clients, total = db.get_clients_paginated(page, limit, search)
    return {"clients": clients, "total": total}

@app.post("/clients/{client_id}")
async def update_client(client_id: str, data: dict):
    success = db.update_client_config(client_id, data)
    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Failed to update client")
    return {"status": "success"}

@app.get("/xml-data")
async def get_xml_data(page: int = 1, limit: int = 10, search: str = ""):
    xml_data, total = db.get_xml_data_paginated(page, limit, search)
    return {"xml_data": xml_data, "total": total}

@app.get("/xml-data/export")
async def export_xml_data():
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
async def get_xml_details(file_id: str):
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
async def export_single_xml_details(file_id: str):
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
async def get_users():
    return db.get_all_users()

@app.get("/users/pending")
async def get_pending_users():
    return db.get_pending_users()

@app.post("/users/approve/{user_email}")
async def approve_user(user_email: str):
    db.update_user_status(user_email, "approved")
    return {"message": "Usuário aprovado com sucesso."}

@app.post("/users/reject/{user_email}")
async def reject_user(user_email: str):
    db.delete_user_profile(user_email)
    return {"message": "Usuário recusado e removido."}

@app.delete("/users/{user_email}")
async def delete_user(user_email: str):
    db.delete_user_profile(user_email)
    db.add_audit_log("Admin/Sistema", "Exclusão de Usuário", f"Perfil {user_email} excluído.", "WARNING")
    return {"message": "Usuário excluído com sucesso."}

@app.patch("/users/{user_email}")
async def update_user(user_email: str, data: dict):
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
        return {"message": "Usuário atualizado com sucesso."}
    raise HTTPException(status_code=400, detail="Erro ao atualizar usuário.")

@app.post("/branding")
async def save_branding(data: dict):
    db.save_branding(data.get("system_name"), data.get("logo_base64"))
    return {"message": "Identidade visual salva."}

@app.post("/maintenance/clear-logs")
async def clear_logs():
    if db.clear_import_logs():
        db.add_audit_log("Admin/Sistema", "Limpar Histórico", "Admin executou a limpeza do histórico de importação do painel principal.", "WARNING")
        return {"message": "Logs limpos com sucesso."}
    raise HTTPException(status_code=500, detail="Erro ao limpar logs.")

@app.post("/maintenance/reset-db")
async def reset_db():
    if db.reset_system_database():
        db.add_audit_log("Admin/Sistema", "Reset de Banco", "Admin reiniciou completamente o banco de dados (Hard Reset).", "ERROR")
        return {"message": "Banco de dados resetado com sucesso."}
    raise HTTPException(status_code=500, detail="Erro ao resetar banco.")

@app.get("/tasks")
async def get_tasks(type: Optional[str] = None, exclude_api: bool = False):
    # Retorna o histórico de tarefas para a página de logs, com filtro opcional por tipo
    # Usando o limite de 50 para evitar sobrecarga
    return db.get_tasks_for_dashboard(limit=50, task_type=type, exclude_api_checks=exclude_api)

@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    task_ref = db.firestore_db.collection('tasks').document(task_id)
    task_doc = task_ref.get()

    if not task_doc.exists:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    task_data = task_doc.to_dict()
    total = task_data.get('total_arquivos', 0)
    processed = task_data.get('arquivos_processados', 0)

    progress = 0
    if total > 0:
        progress = int((processed / total) * 100)

    # Busca os logs (limite aumentado para 2000 para evitar desaparecimento de logs em tarefas longas)
    logs = db.get_logs_for_task(task_id, limit=2000)

    return {
        "id": task_id,
        "status": task_data.get('status'),
        "progress": progress,
        "processed": processed,
        "total": total,
        "logs": logs
    }

async def background_worker_task(task_id: str, url_sistema: str, force: bool = False):
    """
    Realize a automação real do preenchimento no portal RSUS usando Playwright.
    """
    browser_context = None
    try:
        db.firestore_db.collection('tasks').document(task_id).update({'status': 'EM ANDAMENTO'})
        db.add_log(task_id, "INFO", "Iniciando conexão segura com o portal RSUS.")

        # Busca dados da tarefa para obter credenciais
        task_doc = db.firestore_db.collection('tasks').document(task_id).get()
        if not task_doc.exists:
            return
        task_data = task_doc.to_dict()
        usuario = task_data.get('usuario')
        senha = task_data.get('senha')
        razao_social = task_data.get('razao_social', '')

        # Extrai URL base para o Login
        parsed_url = urlparse(url_sistema)

        # --- SSRF PROTECTION ---
        # Prevent navigation to internal network IPs, loopback, and cloud metadata servers
        hostname = parsed_url.hostname or ""

        is_internal = False
        if hostname in ["localhost", "127.0.0.1", "169.254.169.254", "::1"] or \
           hostname.startswith("10.") or \
           hostname.startswith("192.168."):
            is_internal = True
        elif hostname.startswith("172."):
            parts = hostname.split('.')
            if len(parts) >= 2:
                try:
                    if 16 <= int(parts[1]) <= 31:
                        is_internal = True
                except ValueError:
                    pass

        if is_internal:
            db.add_log(task_id, "ERROR", "VULNERABILIDADE SSRF BLOQUEADA: URL aponta para rede interna.")
            db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
            return

        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        login_url = f"{base_url}/Account/Login"

        async with async_playwright() as p:
            # 1. Launcher: Otimiza inicialização e tratamento de binários
            # Incorporando flags de otimização do robô antigo para máxima estabilidade
            browser_args = [
                "--headless=new",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--window-size=1920,1080",
                # DESATIVAR SAME-SITE E REGRAS DE SEGURANÇA
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,SameSiteDefaultChecksMethodRacy",
                "--disable-web-security",
                "--allow-running-insecure-content",
                "--ignore-certificate-errors",
                "--disable-blink-features=AutomationControlled"
            ]
            try:
                # Tenta o launch padrão primeiro
                browser = await p.chromium.launch(headless=True, args=browser_args)
            except Exception:
                # Fallback: Mantém os argumentos de segurança e certificado
                db.add_log(task_id, "DEBUG", "Binários ausentes. Instalando Chromium...")
                import subprocess
                import sys
                subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
                browser = await p.chromium.launch(headless=True, args=browser_args)

            # Novo contexto com Stealth Máximo
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                ignore_https_errors=True,
                timezone_id="America/Sao_Paulo",
                locale="pt-BR"
            )
            # Evasão contra detecção de automação (Webdriver)
            await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

            page = await context.new_page()

            # --- HIPER-OTIMIZAÇÃO: BLOQUEIO DE ATIVOS PESADOS ---
            # Bloqueia fontes e imagens para acelerar o carregamento e evitar erros de OTS/Decoding
            async def block_assets(route):
                if route.request.resource_type in ["image", "font"]:
                    await route.abort()
                else:
                    await route.continue_()
            await page.route("**/*", block_assets)

            page.set_default_navigation_timeout(90000) # Aumentado para 90s (Paciência Selenium)
            page.set_default_timeout(90000)

            # 2. Navegação Orgânica (Simulando o robô antigo)
            try:
                # LISTENER DE CONSOLE PARA CAPTURAR ERROS (MANTIDO EM DEBUG PARA NÃO POLUIR O ACOMPANHAMENTO)
                # Removidos listeners de console do navegador para manter o log limpo apenas com erros da aplicação

                # INTERCEPTOR DE RESPOSTAS PARA INJEÇÃO CIRÚRGICA DE COOKIES
                async def handle_response(response):
                    # Monitoramos o domínio do sistema para forçar persistência de cookies
                    if url_sistema.split('/')[2] in response.url:
                        try:
                            headers = await response.all_headers()
                            set_cookie = headers.get('set-cookie')
                            if set_cookie:
                                # Divide múltiplos cookies (separados por \n no all_headers do Playwright)
                                sc_list = set_cookie.split('\n')
                                for sc in sc_list:
                                    # Parse básico do cookie string
                                    parts = [p.strip() for p in sc.split(';')]
                                    if not parts: continue
                                    name_val = parts[0].split('=', 1)
                                    if len(name_val) < 2: continue

                                    # Injeção manual ignorando SameSite/Secure do navegador
                                    await context.add_cookies([{
                                        "name": name_val[0],
                                        "value": name_val[1],
                                        "domain": url_sistema.split('/')[2],
                                        "path": "/",
                                        "secure": True,
                                        "sameSite": "Lax",
                                        "httpOnly": True
                                    }])
                                db.add_log(task_id, "DEBUG", f"[COOKIE FORÇADO] Tokens de sessão de {response.url[:50]}... reinjetados.")
                        except: pass

                page.on("response", handle_response)

                # --- AUTO-ACCEPT DIALOGS ---
                # Evita que alertas do navegador (ex: 'Sair do site? As alterações não foram salvas') travem a automação
                page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))

                db.add_log(task_id, "INFO", "Acessando a página de importação do sistema.")

                # Debug de Horário e Identidade do Navegador
                browser_time = await page.evaluate("new Date().toString()")
                db.add_log(task_id, "DEBUG", f"[Fuso Navegador] {browser_time}")

                # Entra diretamenta na URL do sistema (ex: /importacao/novo)
                # O portal vai redirecionar automaticamente para a tela de login preservando a rota de retorno (ReturnUrl)
                await page.goto(url_sistema, wait_until="commit", timeout=60000)

                # Tratar modais/avisos iniciais (fast scan)
                try:
                    alert = page.locator("#_browseralert, .browseralert").first
                    if await alert.is_visible(timeout=2000):
                        await page.keyboard.press("Escape")
                except: pass

                # Localizar campo de email (confirmação do redirecionamento para o Login)
                email_field = page.locator("input#email, input#Email").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input#email, input#Email").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break

                await email_field.wait_for(state="visible", timeout=25000)
                db.add_log(task_id, "INFO", "Identificando tela de acesso. Preenchendo login...")

                # Preenchimento tático usando type (igual send_keys do Selenium) para acordar o AngularJS
                # Evitamos o fill() pois portais velhos às vezes não disparam o $watch do Angular a tempo
                await email_field.click()
                await email_field.type(usuario, delay=40)
                await asyncio.sleep(0.5)

                pwd_field = page.locator("input#password, input#Password").first
                await pwd_field.click()
                await pwd_field.type(senha, delay=40)
                await asyncio.sleep(0.5)

                # Botão de Login orgânico
                btn_login = page.locator("#logIn, button[type='submit']").first
                await btn_login.click()

                # Aguarda sumiço do botão de login ou mudança de URL (mais robusto que sleep(2))
                try:
                    await page.wait_for_selector("#logIn, button[type='submit']", state="hidden", timeout=15000)
                except:
                    db.add_log(task_id, "WARNING", "Botão de login ainda visível após clique. Prosseguindo...")

                # VERIFICAÇÃO DE SESSÃO: Logar cookies e LocalStorage
                cookies = await context.cookies()
                has_session = any('.ASPXAUTH' in c['name'] or 'Identity' in c['name'] or 'ASP.NET_SessionId' in c['name'] for c in cookies)

                db.add_log(task_id, "INFO", "Acesso autorizado. Iniciando sessão de trabalho.")

                # NOVO: SE ESTAMOS PRESOS NA TELA DE LOGIN MAS TEMOS COOKIE, FORÇAMOS O SALTO TRIPLO
                if has_session and ("Account/Login" in page.url or "Account/LogOff" in page.url):
                    db.add_log(task_id, "WARNING", "Sessão detectada mas preso na tela de Login. Forçando Salto Triplo (Hiper-Otimizado)...")
                    # 1. Toca na raiz (wait: commit)
                    await page.goto(url_sistema.split('/novo')[0].rsplit('/', 1)[0] + "/", wait_until="commit", timeout=30000)
                    # 2. Visita a lista (Index) - O segredo que funcionou localmente!
                    url_lista = url_sistema.replace("/novo", "")
                    await page.goto(url_lista, wait_until="commit", timeout=45000)
                    await asyncio.sleep(3)
                    # 3. Finalmente vai para o formulário de novo registro
                    await page.goto(url_sistema, wait_until="domcontentloaded", timeout=60000)
                else:
                    # Tática de "Double-Jump" Orgânico de Segurança
                    db.add_log(task_id, "INFO", "Preparando formulários do portal para preenchimento...")
                    url_lista = url_sistema.replace("/novo", "")
                    await page.goto(url_lista, wait_until="commit", timeout=30000)
                    await asyncio.sleep(2)
                    await page.goto(url_sistema, wait_until="commit", timeout=60000)

                form_ready = False
                # Tentativa 1: Aguarda o seletor com paciência
                try:
                    await page.wait_for_selector("input#numeroProtocolo", state="visible", timeout=30000)
                    form_ready = True
                except:
                    db.add_log(task_id, "DEBUG", "Formulário não apareceu de imediato. Tentando carregamento pesado (networkidle)...")
                    try:
                        await page.goto(url_sistema, wait_until="networkidle", timeout=60000)
                        await page.wait_for_selector("input#numeroProtocolo", state="visible", timeout=30000)
                        form_ready = True
                    except: pass

                if form_ready:
                    db.add_log(task_id, "SUCCESS", "Sistema pronto para processar os arquivos.")
                else:
                    # SE AINDA ASSIM FALHAR... (Continua para o dump de erro)
                    # SE AINDA ASSIM FALHAR (Página Branca Extrema): Colhe Diagnóstico
                    html_dump = await page.content()
                    db.add_log(task_id, "ERROR", f"Falha no carregamento final. HTML Parcial: {html_dump[:250]}...")
                    # Salva o dump completo no Firebase Storage para análise profunda
                    try:
                        blob_name = f"debug/screenshots/{task_id}_white_page_dump.html"
                        db.bucket.blob(blob_name).upload_from_string(html_dump, content_type='text/html')
                        db.add_log(task_id, "INFO", f"HTML Dump salvo para auditoria: {blob_name}")
                    except: pass
                    raise e_final

            except Exception as e:
                import traceback
                error_detail = traceback.format_exc()
                # Captura screenshot em caso de erro de login/timeout
                screenshot_path = f"/tmp/error_login_{task_id}.png"
                page_url = page.url
                db.add_log(task_id, "ERROR", f"Falha no login ou redirecionamento inicial: {str(e)[:100]}")
                logger.error(f"DETALHE DO ERRO NO FORMULÁRIO: {error_detail}")
                try:
                    await page.screenshot(path=screenshot_path)
                    # Upload do screenshot para o Storage
                    with open(screenshot_path, 'rb') as f:
                        buf = f.read()
                        remote_path = f"debug/screenshots/{task_id}_login_error.png"
                        bucket = db.storage.bucket()
                        blob = bucket.blob(remote_path)
                        blob.upload_from_string(buf, content_type='image/png')
                        db.add_log(task_id, "DEBUG", f"Screenshot salvo: {remote_path}")
                except Exception:
                    pass

                # NOVO: Se o login/redirecionamento falhar, marca todos os arquivos como ERRO
                db.mark_all_task_files_as_error(task_id, f"Falha no portal: {str(e)[:100]}")
                db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
                raise e

            # Fallback final: Se ainda não carregou, tenta clicar em SELECIONAR ARQUIVO na lista
            if not form_ready:
                db.add_log(task_id, "INFO", "Tentando navegação via menu (fallback dinâmico)...")
                try:
                    url_lista = url_sistema.replace("/novo", "")
                    await page.goto(url_lista, wait_until="domcontentloaded", timeout=60000)
                    await asyncio.sleep(3)

                    # Log de onde estamos para diagnóstico
                    db.add_log(task_id, "DEBUG", f"URL Atual no Fallback: {page.url}")

                    sel_btn = page.locator("a:has-text('SELECIONAR ARQUIVO'), a:has-text('Selecionar arquivo')").first
                    if await sel_btn.is_visible(timeout=15000):
                        await sel_btn.click()
                        db.add_log(task_id, "INFO", "Clique em SELECIONAR ARQUIVO via lista ✓")
                        await page.locator("input#numeroProtocolo").first.wait_for(state="visible", timeout=20000)
                        form_ready = True
                    else:
                        raise Exception(f"Botão de seleção não encontrado em {page.url}")
                except Exception as final_err:
                    db.add_log(task_id, "ERROR", f"Formulário inacessível em {page.url}: {str(final_err)[:100]}")
                    try:
                        img_err = await page.screenshot(full_page=True)
                        db.upload_screenshot(f"debug/screenshots/{task_id}_fallback_failed.png", img_err)
                    except: pass
                    await browser.close()
                    # NOVO: Marca todos os arquivos como erro se o fallback também falhar
                    db.mark_all_task_files_as_error(task_id, f"Formulário inacessível: {str(final_err)[:100]}")
                    db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
                    return

            db.add_log(task_id, "DEBUG", f"URL do formulário: {page.url}")

            # 3. Processamento dos Arquivos
            files = db.get_files_for_task(task_id)
            total = len(files)

            # Ordenação numérica decrescente por ABI conforme o sistema antigo
            def extract_abi_num(num_abi_str):
                import re
                match = re.search(r'(\d+)', str(num_abi_str))
                return int(match.group(1)) if match else 0

            for i, file in enumerate(files):
                nome = file.get('nome_arquivo', 'Arquivo')
                abi = file.get('numero_abi', '')
                storage_path = file.get('storage_path')

                db.add_log(task_id, "INFO", f"[{i+1}/{total}] Iniciando processamento da ABI {abi}.")

                # --- RE-DETECÇÃO ROBUSTA DE FORMULÁRIO (Prevenir Stale Frames) ---
                form_target = page
                status_final_abi = "PENDENTE"
                form_ready = False
                for attempt in range(1, 6): # Aumentado para 6 tentativas
                    try:
                        # Verifica se o campo protocolo está no frame principal ou em algum IFrame
                        if await page.locator("input#numeroProtocolo").count() > 0:
                            form_ready = True
                            db.add_log(task_id, "DEBUG", f"Formulário encontrado no frame principal (ABI {abi})")
                            break

                        # Tenta procurar em IFrames
                        for frame in page.frames:
                            try:
                                if await frame.locator("input#numeroProtocolo").count() > 0:
                                    form_target = frame
                                    form_ready = True
                                    db.add_log(task_id, "DEBUG", f"Formulário encontrado no IFrame: {frame.name or frame.url[:50]} (ABI {abi})")
                                    break
                            except: continue
                        if form_ready: break

                        db.add_log(task_id, "DEBUG", f"Aguardando formulário abrir (Tentativa {attempt}/5)...")
                        await asyncio.sleep(5)
                    except: pass

                if not form_ready:
                    db.add_log(task_id, "ERROR", f"Portal RSUS não carregou o formulário para ABI {abi}. Pulando para o próximo.")
                    db.firestore_db.collection('task_files').document(file['id']).update({
                        'status_importacao': 'ERRO',
                        'error_message': 'Erro de carregamento do portal (Timeout do Formulário)'
                    })
                    # Não damos continue aqui, deixamos cair no final do loop para preparar o próximo

                # --- NOVO: VERIFICAÇÃO DE DUPLICIDADE ---
                already_imported = False
                if not force and db.check_abi_already_imported(razao_social, abi):
                    db.add_log(task_id, "INFO", f"⚠️ ABI {abi} já foi importada com sucesso anteriormente. Pulando...")
                    # Atualiza o status no banco para não ficar pendente
                    try:
                        file_id = file.get('id')
                        if file_id:
                            db.firestore_db.collection('task_files').document(file_id).update({
                                'status_importacao': 'SUCESSO',
                                'error_message': 'Pulado: ABI já existia no histórico.'
                            })
                    except: pass
                    already_imported = True
                    status_final_abi = "SUCCESS"

                if not already_imported:
                    try:
                        db.add_log(task_id, "INFO", f"Preenchendo dados básicos da ABI {abi}...")
                        try:
                            num_processo = file.get('numero_processo', '')
                            dt_recebimento = file.get("data_recebimento_oficio") or file.get("data_registro_transacao", "")

                            # ─── NOVO: Cálculo de Prazo (35 dias) if missing ───
                            dt_prazo = file.get("prazo_resposta_ans", "")
                            if not dt_prazo and dt_recebimento:
                                try:
                                    from datetime import datetime, timedelta
                                    dt_obj = datetime.strptime(dt_recebimento, "%d/%m/%Y")
                                    dt_prazo = (dt_obj + timedelta(days=35)).strftime("%d/%m/%Y")
                                except: pass

                            competencias = file.get("competencias", "")
                            qtd = str(file.get("quantidade_processo", "0"))
                            valor = str(file.get("valor_total_processo", "0"))

                            field_map = {
                                "input#numeroProtocolo": num_processo,
                                "input#dataRecebimentoOficio": dt_recebimento,
                                "input#dataPrazoRespostaAns, input#prazoRespostaAns": dt_prazo,
                                "input#competencias": competencias,
                                "input#quantidadeAtendimentos": qtd,
                                "input#valorTotalABI": valor,
                            }

                            db.add_log(task_id, "INFO", f"Preenchendo formulário para ABI {abi} (Processo: {num_processo})")

                            # ─── NOVO: Definição de interface (Injeção CSS e jQuery Sync) ───
                            try:
                                await page.evaluate("""() => {
                                    const style = document.createElement('style');
                                    style.innerHTML = '.datepicker { display: none !important; visibility: hidden !important; height: 0 !important; }';
                                    document.head.appendChild(style);
                                    if (window.jQuery && !window.$) window.$ = window.jQuery;
                                }""")
                                await asyncio.sleep(1)
                            except: pass

                            for sel, val in field_map.items():
                                if not val: continue
                                try:
                                    # Preenchimento Robusto via JS (Validado na Prova Real Local)
                                    success = await form_target.evaluate("""([sel, val]) => {
                                        const elements = document.querySelectorAll(sel);
                                        const el = elements[0];
                                        if (el) {
                                            el.value = val;
                                            el.dispatchEvent(new Event('input', { bubbles: true }));
                                            el.dispatchEvent(new Event('change', { bubbles: true }));
                                            if (window.jQuery) window.jQuery(el).trigger('change');
                                            return true;
                                        }
                                        return false;
                                    }""", [sel, str(val)])

                                    if success:
                                        db.add_log(task_id, "DEBUG", f"  Campo {sel} preenchido ✓")
                                except Exception as field_err:
                                    db.add_log(task_id, "WARNING", f"  Erro no campo {sel}: {str(field_err)[:50]}")

                            # ─── ETAPA 3: Upload do arquivo XML ───
                            db.add_log(task_id, "INFO", f"Fazendo upload do arquivo XML da ABI {abi}...")
                            with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                                tmp_name = tmp.name

                            try:
                                success_dl = db.download_xml_from_storage(storage_path, tmp_name)
                                if not success_dl:
                                    db.add_log(task_id, "ERROR", f"Erro ao baixar {nome} do storage.")
                                else:
                                    file_input = form_target.locator("input[type='file']").first
                                    # Timeout de 30s para o upload XML (evita travamento total)
                                    await asyncio.wait_for(file_input.set_input_files(tmp_name), timeout=30.0)
                                    await asyncio.sleep(2)
                                    db.add_log(task_id, "INFO", "Arquivo XML anexado com sucesso.")
                            except Exception as dl_err:
                                db.add_log(task_id, "ERROR", f"Erro no upload local do XML: {dl_err}")

                            # ─── ETAPA 4: Screenshot ANTES de clicar Importar (para diagnóstico) ───
                            try:
                                pre_submit_path = f"debug/screenshots/{task_id}_abi_{abi}_pre_submit.png"
                                img_bytes = await page.screenshot(full_page=True)
                                db.upload_screenshot(pre_submit_path, img_bytes)
                                db.add_log(task_id, "DEBUG", f"Screenshot pré-submit salvo: {pre_submit_path}")
                            except: pass

                            # ─── ETAPA 5: Clicar no botão IMPORTAR ARQUIVO ───
                            db.add_log(task_id, "INFO", "Enviando dados para processamento final no portal...")

                            # Interceptor para capturar o erro 400 do portal
                            intercepted_portal_error = {"text": ""}
                            async def catch_import_error(response):
                                if "importacao" in response.url.lower() and response.status == 400:
                                    try:
                                        body = await response.text()
                                        import json
                                        data = json.loads(body)
                                        erros_list = data.get("exception", {}).get("mensagens", [])
                                        msg_code = data.get("msg", "")
                                        if "SIS00121" in msg_code or any("cadastrada" in msg.lower() for msg in erros_list):
                                            if not intercepted_portal_error["text"]:
                                                erro_limpo = " ".join(erros_list) if erros_list else "ABI já cadastrada no sistema."
                                                intercepted_portal_error["text"] = erro_limpo
                                                db.add_log(task_id, "WARNING", f"Portal recusou importação: {erro_limpo}")
                                        else:
                                            db.add_log(task_id, "ERROR", f"ERRO PORTAL (400): {body}")
                                    except:
                                        pass

                            page.on("response", catch_import_error)

                            # Rola para o topo para garantir visibilidade
                            await page.evaluate("window.scrollTo(0, 0)")
                            await asyncio.sleep(2) # Buffer extra para o portal 'sentir' os campos preenchidos

                            # Clique Final no botão de Importar (Robusto com evaluate)
                            # Clique Final no botão de Importar (Robusto com evaluate + timeout)
                            success_click = False
                            try:
                                async def click_import():
                                    return await page.evaluate("""() => {
                                        const buttons = Array.from(document.querySelectorAll('a, button, input[type="submit"]'));
                                        const btn = buttons.find(b => b.innerText.includes('IMPORTAR ARQUIVO') || b.value === 'IMPORTAR ARQUIVO');
                                        if (btn) {
                                            btn.scrollIntoView();
                                            btn.click();
                                            return true;
                                        }
                                        return false;
                                    }""")
                                success_click = await asyncio.wait_for(click_import(), timeout=30.0)
                            except asyncio.TimeoutError:
                                db.add_log(task_id, "ERROR", "Timeout ao clicar em 'IMPORTAR ARQUIVO' (Portal travado).")
                            except Exception as e:
                                db.add_log(task_id, "ERROR", f"Erro no clique final: {e}")

                            if not success_click:
                                db.add_log(task_id, "WARNING", "Clique via JS falhou, tentando clique nativo...")
                                import_selectors = ["a:has-text('IMPORTAR ARQUIVO')", "button:has-text('IMPORTAR ARQUIVO')", ".btn-success"]
                                for selector in import_selectors:
                                    try:
                                        btn = page.locator(selector).first
                                        if await btn.count() > 0:
                                            await btn.click(timeout=5000)
                                            success_click = True
                                            break
                                    except: continue

                            if not success_click:
                                db.add_log(task_id, "ERROR", "Não foi possível clicar em IMPORTAR ARQUIVO.")
                            else:
                                # ─── NOVO: Lida com Modal de Confirmação ou Erro Imediato (AngularJS) ───
                                await asyncio.sleep(1)
                                try:
                                    # Procura botões de Sim/Não (Confirmação) ou Ok (Erro)
                                    btn_sim = page.locator("button:has-text('Sim'), button:has-text('SIM'), a:has-text('Sim'), .btn-footer:has-text('Sim')").first
                                    btn_ok = page.locator("button:has-text('Ok'), button:has-text('OK'), a:has-text('Ok')").first

                                    if await btn_ok.is_visible(timeout=3000):
                                        db.add_log(task_id, "INFO", "Modal de aviso/erro detectado. Fechando (Ok)...")
                                        await btn_ok.click(force=True)
                                    elif await btn_sim.is_visible(timeout=1000):
                                        db.add_log(task_id, "INFO", "Modal de confirmação detectado. Clicando em SIM...")
                                        await btn_sim.click(force=True)
                                    else:
                                        # Fallback para o modal-primary, mas verificando o texto para não fechar erros cego:
                                        generic_btn = page.locator(".modal-footer button.btn-primary").first
                                        if await generic_btn.is_visible(timeout=1000):
                                            btn_text = await generic_btn.inner_text()
                                            db.add_log(task_id, "INFO", f"Modal dinâmico detectado ({btn_text}). Clicando...")
                                            await generic_btn.click(force=True)
                                except: pass

                                # ─── ETAPA 6: Aguardar confirmação do portal ───
                                db.add_log(task_id, "INFO", "Aguardando resposta de confirmação do sistema...")
                                status_final_abi = "ERROR"
                                msg_feedback = ""

                                # Se o erro já foi capturado pelo interceptor de rede, não precisa esperar 60s
                                if intercepted_portal_error["text"]:
                                    status_final_abi = "ERROR"
                                    msg_feedback = intercepted_portal_error["text"]
                                    # Zera a variável para usar o fallback de UI logo abaixo a fim de fechar a modal e passar ao próximo
                                    check_round_limit = 5 # Apenas dá um tempo rápido para a UI estabilizar

                                else:
                                    check_round_limit = 120

                                # Seletor expandido de mensagens (inclui toasts, alertas do navegador e mensagens de sistema)
                                msg_selectors = ".header-message-top, .browseralert, .modal-content, .alert, .alert-success, .alert-danger, .alert-warning, .alert-info, .toast, .notification, .toast-message, #_browseralert, .help-block"

                                # Verifica por até 60 segundos com maior frequência (0.5s) para capturar mensagens transientes
                                for check_round in range(check_round_limit):
                                    try:
                                        # Busca qualquer mensagem visível
                                        msgs = page.locator(msg_selectors)
                                        count = await msgs.count()
                                        for m_idx in range(count):
                                            msg_el = msgs.nth(m_idx)
                                            if await msg_el.is_visible(timeout=100):
                                                msg_text = (await msg_el.inner_text()).strip()
                                                if not msg_text: continue

                                                db.add_log(task_id, "DEBUG", f"Mensagem detectada da UI: '{msg_text[:140]}'")

                                                if any(key in msg_text.lower() for key in ["sucesso", "importad", "concluíd", "enviado"]):
                                                    db.add_log(task_id, "SUCCESS", "Importação confirmada com sucesso pelo portal.")
                                                    status_final_abi = "SUCCESS"
                                                    msg_feedback = msg_text
                                                    break
                                                elif any(key in msg_text.lower() for key in ["erro", "inválid", "rejeitad", "não encontrado", "sis00", "falhou"]):
                                                    if not intercepted_portal_error["text"]:
                                                        db.add_log(task_id, "ERROR", f"Portal recusou importação: {msg_text[:150]}")
                                                        status_final_abi = "ERROR"
                                                        msg_feedback = msg_text
                                                    break

                                        if status_final_abi == "SUCCESS" or (status_final_abi == "ERROR" and msg_feedback and not intercepted_portal_error["text"]):
                                            break

                                        # Se a URL mudar para a lista, assume que terminou
                                        if "/importacao" in page.url and "/novo" not in page.url:
                                            db.add_log(task_id, "INFO", "Processo concluído. Retornando para o início.")
                                            status_final_abi = "SUCCESS"
                                            break
                                    except:
                                        pass
                                    await asyncio.sleep(0.5)

                                # Se nenhuma mensagem apareceu, captura screenshot e verifica URL
                                if status_final_abi == "ERROR" and not msg_feedback:
                                    db.add_log(task_id, "WARNING", f"ABI {abi}: Nenhuma mensagem de confirmação após 45s.")

                                    # Verifica se a URL mudou (pode ter sido redirecionado)
                                    current_url = page.url
                                    db.add_log(task_id, "DEBUG", f"URL atual após submit: {current_url}")

                                    # Screenshot post-submit para diagnóstico
                                    try:
                                        timeout_path = f"debug/screenshots/{task_id}_abi_{abi}_timeout.png"
                                        img_bytes = await page.screenshot(full_page=True)
                                        db.upload_screenshot(timeout_path, img_bytes)
                                        db.add_log(task_id, "DEBUG", f"Screenshot pós-timeout salvo: {timeout_path}")
                                    except: pass

                                    # Captura o HTML visível para diagnóstico
                                    try:
                                        body_text = await page.locator("body").inner_text()
                                        # Loga os primeiros 300 chars para entender o que há na tela
                                        db.add_log(task_id, "DEBUG", f"Texto da página: {body_text[:300]}")
                                    except: pass

                                    msg_feedback = "Timeout - sem confirmação SIS (ver screenshots)"

                                # Atualiza status do arquivo no Firestore
                                db.firestore_db.collection('task_files').document(file['id']).update({
                                    'status_importacao': 'SUCESSO' if status_final_abi == "SUCCESS" else 'ERRO',
                                    'error_message': msg_feedback if status_final_abi == "ERROR" else "",
                                    'data_processamento': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                })

                        except Exception as file_err:
                            import traceback
                            friendly_err = db.get_friendly_error(file_err)
                            db.add_log(task_id, "ERROR", f"Erro na ABI {abi}: {friendly_err}")
                            logger.error(f"Erro no ABI {abi}: {traceback.format_exc()}")
                            try:
                                err_path = f"debug/screenshots/{task_id}_abi_{abi}_exception.png"
                                img_bytes = await page.screenshot(full_page=True)
                                db.upload_screenshot(err_path, img_bytes)
                            except: pass
                            db.firestore_db.collection('task_files').document(file['id']).update({
                                'status_importacao': 'ERRO',
                                'error_message': db.get_friendly_error(file_err)
                            })
                    except Exception as e:
                        db.add_log(task_id, "ERROR", f"Erro interno no processamento da ABI {abi}: {e}")

                # ─── ETAPA FINAL: Limpeza do Arquivo Temporário ───
                try:
                    if 'tmp_name' in locals() and tmp_name and os.path.exists(tmp_name):
                        os.unlink(tmp_name)
                except: pass

                # Atualiza progresso
                processed = i + 1
                progress = int((processed / total) * 100)
                db.firestore_db.collection('tasks').document(task_id).update({
                    'arquivos_processados': processed,
                    'progress': progress,
                    'updated_at': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })

                # Intervalo e limpeza para próximo arquivo
                if i < total - 1:
                    db.add_log(task_id, "INFO", f"Arquivo {i+1} finalizado. Preparando para o próximo...")
                    if status_final_abi == "SUCCESS":
                        db.add_log(task_id, "INFO", "Aguardando 30s para estabilização do portal...")
                        await asyncio.sleep(30)
                    else:
                        await asyncio.sleep(3)

                    # Navegação explícita para a lista para limpar estado
                    try:
                        import_list_url = f"{base_url}/importacao"
                        db.add_log(task_id, "DEBUG", "Limpando estado para o próximo arquivo...")

                        # Tenta ir para a lista de importação
                        await page.goto(import_list_url, wait_until="domcontentloaded", timeout=60000)
                        await asyncio.sleep(5)

                        # Procura o botão de forma robusta
                        sel_btn = None
                        btn_selectors = ["a:has-text('SELECIONAR ARQUIVO')", ".btn-primary:has-text('SELECIONAR ARQUIVO')", "a[href*='novo']"]
                        for selector in btn_selectors:
                            btn = page.locator(selector).first
                            if await btn.count() > 0:
                                sel_btn = btn
                                break

                        if sel_btn:
                            await sel_btn.click()
                            db.add_log(task_id, "DEBUG", "Botão 'SELECIONAR ARQUIVO' clicado.")
                            await asyncio.sleep(5)
                        else:
                            db.add_log(task_id, "WARNING", "Botão 'SELECIONAR ARQUIVO' não encontrado. Forçando reload...")
                            await page.reload(wait_until="domcontentloaded")
                            await asyncio.sleep(5)
                            # Tenta novamente após reload
                            for selector in btn_selectors:
                                btn = page.locator(selector).first
                                if await btn.count() > 0:
                                    await btn.click()
                                    break
                    except Exception as nav_err:
                        db.add_log(task_id, "WARNING", f"Erro na transição: {nav_err}. Tentando reload total...")
                        await page.goto(f"{base_url}/importacao/novo", timeout=60000)
                        await asyncio.sleep(5)

                    # --- RE-DETECÇÃO DE FRAME PÓS REFRESH ---
                    db.add_log(task_id, "DEBUG", "Aguardando novo formulário aparecer...")
                    form_target = page
                    form_ready_next = False
                    for attempt_next in range(1, 4):
                        if await page.locator("input#numeroProtocolo").count() > 0:
                            form_ready_next = True
                            break
                        for frame in page.frames:
                            try:
                                if await frame.locator("input#numeroProtocolo").count() > 0:
                                    form_target = frame
                                    form_ready_next = True
                                    break
                            except: continue
                        if form_ready_next: break
                        await asyncio.sleep(5)

                    if form_ready_next:
                        db.add_log(task_id, "DEBUG", "Formulário re-identificado ✓")
                    else:
                        db.add_log(task_id, "WARNING", "Campo protocolo não repareceu. O robô tentará identificar na próxima iteração.")

            await browser.close()

        # Determina mensagem final baseada nos resultados individuais
        all_files = db.get_files_for_task(task_id)
        success_count = sum(1 for f in all_files if f.get('status_importacao') == 'SUCESSO')
        error_count = sum(1 for f in all_files if f.get('status_importacao') == 'ERRO')

        final_msg = f"Processamento concluído: {success_count} sucessos, {error_count} erros."
        if error_count == 0:
            final_msg = "Tudo pronto! Todos os arquivos foram processados e enviados com sucesso."
            status_final_task = "CONCLUIDO"
        elif success_count == 0:
            final_msg = f"Falha crítica: Nenhum dos {total} arquivos pôde ser importado."
            status_final_task = "ERRO"
        else:
            final_msg = f"Concluído com ressalvas: {success_count} importados, {error_count} falhas."
            status_final_task = "CONCLUIDO_COM_RESSALVAS" # Marcamos como concluído com ressalvas

        db.add_log(task_id, "SUCCESS" if error_count == 0 else "WARNING", final_msg)

        # Delay de 3s antes de fechar a tarefa para dar tempo do polling do frontend capturar o último log
        await asyncio.sleep(3)

        db.firestore_db.collection('tasks').document(task_id).update({
            'status': status_final_task,
            'updated_at': db.get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        })

    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        friendly_gen_err = db.get_friendly_error(e)
        db.add_log(task_id, "ERROR", f"Houve um problema na automação: {friendly_gen_err}")
        db.firestore_db.collection('tasks').document(task_id).update({
            'status': 'ERRO',
            'error_message': friendly_gen_err,
            'updated_at': db.get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        })

@app.post("/pre-check")
async def pre_check_duplicates(
    files: List[UploadFile] = File(...)
):
    if not files:
        return {"duplicates": []}

    arquivos_upload_data = []
    for file in files:
        content = await file.read()
        arquivos_upload_data.append((file.filename, content))

    # Extrai os dados dos XMLs para identificar as ABIs
    try:
        extracted = parser.extrair_dados_xml(arquivos_upload_data)
        if extracted.empty:
            return {"duplicates": [], "client_exists": False, "razao_social": ""}

        # Assume que todos os arquivos são da mesma Razão Social (pelo fluxo do sistema)
        razao_social = parser.extract_razao_social(arquivos_upload_data[0][1])
        
        # Verifica se o cliente já possui URL cadastrada
        url_sistema = db.get_last_url_for_client(razao_social)
        client_exists = bool(url_sistema)

        duplicates = []
        for _, row in extracted.iterrows():
            abi = str(row.get('Número ABI', row.get('numero_abi', '')))
            if db.check_abi_already_imported(razao_social.strip(), abi):
                duplicates.append(abi)

        return {
            "duplicates": duplicates, 
            "razao_social": razao_social,
            "client_exists": client_exists,
            "url_sistema": url_sistema
        }
    except Exception as e:
        logger.error(f"Erro no pre-check: {e}")
        return {"duplicates": [], "error": str(e), "client_exists": False}

@app.post("/upload")
async def upload_xmls(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    url_sistema: Optional[str] = Form(None),
    usuario: Optional[str] = Form(None),
    senha: Optional[str] = Form(None),
    gax_user_email: str = Form("Admin/Sistema"),
    force: bool = Form(False)
):
    if not files:
        return {"error": "Nenhum arquivo enviado."}

    arquivos_upload_data = []
    for file in files:
        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            return {"error": f"Arquivo {file.filename} excede o limite de 5MB."}
        arquivos_upload_data.append((file.filename, content))

    # Identifica a Razão Social do primeiro arquivo
    razao_social = parser.extract_razao_social(arquivos_upload_data[0][1])
    if not razao_social:
        return {"error": "Não foi possível identificar a Razão Social no XML."}

    # Se a URL não foi enviada, tenta buscar a cadastrada
    if not url_sistema:
        url_sistema = db.get_last_url_for_client(razao_social)
        if not url_sistema:
            return {"error": "URL do sistema não informada e não encontrada no cadastro."}

    # Se usuário/senha não foram enviados, busca as credenciais globais
    if not usuario or not senha:
        cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"
        stored = db.get_rsus_credentials(cred_type)
        if stored:
            usuario = stored.get('username', usuario)
            senha = stored.get('password', senha)

    if not usuario or not senha:
        return {"error": "Credenciais RSUS não encontradas para este sistema."}

    # Se for um cliente novo (sem URL salva), salva a configuração agora
    if not db.get_last_url_for_client(razao_social):
        db.save_client_config(razao_social, url_sistema)

    # NOVO: Prevenção de duplicidade (Idempotência) - Respeita o parâmetro 'force'
    if not force:
        recent_docs = db.firestore_db.collection('tasks') \
            .order_by('created_at', direction=firestore.Query.DESCENDING) \
            .limit(5).get()

        for doc in recent_docs:
            last_task = doc.to_dict()
            if last_task.get('razao_social') == razao_social and \
               last_task.get('usuario') == usuario and \
               last_task.get('url_sistema') == url_sistema:
                from datetime import datetime
                last_created = datetime.strptime(last_task['created_at'], "%Y-%m-%d %H:%M:%S")
                if (db.get_now_br().replace(tzinfo=None) - last_created).total_seconds() < 10:
                    logger.warning(f"Ignorando upload duplicado para {razao_social} (Idempotência)")
                    return {"status": "success", "message": "Upload já em processamento.", "task_id": doc.id}

    # Cria a tarefa no banco com as credenciais reais
    task_id = db.create_task(
        task_type="xml_import",
        url_sistema=url_sistema,
        usuario=usuario,
        senha=senha,
        razao_social=razao_social
    )

    # Upload dos arquivos para o Storage e prepara dados para o Firestore
    files_info = []
    for filename, content in arquivos_upload_data:
        storage_path = db.upload_xml_to_storage(task_id, filename, content)
        # Extrai dados básicos do XML para visualização rápida no portal
        extracted = parser.extrair_dados_xml([(filename, content)])
        if not extracted.empty:
            row = extracted.iloc[0].to_dict()
            row['storage_path'] = storage_path
            row['razao_social'] = razao_social
            files_info.append(row)

    # Adiciona os arquivos à tarefa no Firestore (bulk)
    db.add_files_to_task_bulk(task_id, files_info)
    db.update_task_total_files(task_id, len(files_info))

    # Inicia o processamento em segundo plano
    background_tasks.add_task(background_worker_task, task_id, url_sistema, force)

    # Audita a importação
    db.add_audit_log(gax_user_email, "Upload e Importação", f"Iniciou a fila de importação para a empresa '{razao_social}' no portal alvo: {url_sistema}", "INFO")

    return {
        "message": f"{len(files)} arquivos recebidos. O robô iniciará o preenchimento no RSUS em instantes.",
        "task_id": task_id,
        "razao_social": razao_social,
        "total_files": len(files_info),
        "status": "Iniciado"
    }

# --- AUDIT LOGS ENDPOINTS ---
@app.get("/audit")
async def route_get_audit_logs():
    # Limpeza lazy
    db.auto_delete_old_audit_logs()
    logs = db.get_audit_logs(limit=1000)
    return {"status": "success", "logs": logs}

@app.delete("/audit")
async def route_clear_audit_logs():
    success, count = db.clear_audit_logs()
    if success:
        # Registra a própria ação na tabela limpa
        db.add_audit_log("Admin/Sistema", "Limpar Logs de Auditoria", f"{count} registros foram excluídos manualmente.", "WARNING")
        return {"status": "success", "message": f"{count} logs deletados."}
    raise HTTPException(status_code=500, detail="Erro ao deletar auditoria")
# --- EMAIL UTILS (INLINED FOR STABILITY) ---
def send_verification_email(to_email, code, action_type):
    """Sends a 6-digit verification code to the user's email."""
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        logger.warning(f"!!! SMTP NÃO CONFIGURADO !!! Código de verificação para {to_email} ({action_type}): {code}")
        return False

    subject = "Código de Verificação - GAX"
    if action_type == 'email_change':
        body = f"Você solicitou a alteração do seu e-mail no GAX.\n\nSeu código de confirmação é: {code}\n\nEste código expira em 1 minuto."
    else:
        body = f"Você solicitou a alteração da sua senha no GAX.\n\nSeu código de confirmação é: {code}\n\nEste código expira em 1 minuto."

    try:
        msg = MIMEMultipart()
        msg['From'] = f"GAX Sistema <{smtp_user}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Verification email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False

# --- USER PROFILE ENDPOINTS ---
@app.get("/profile")
async def route_get_profile(email: str):
    profile = db.get_user_profile(email)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
    return profile

@app.post("/profile/request-code")
async def route_request_verification_code(email: str = Form(...), action_type: str = Form(...)):
    """Generates and sends a 6-digit code to the user's email."""
    code = secrets.randbelow(900000) + 100000
    if db.save_verification_code(email, code, action_type):
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
    """
    Updates profile. 
    - Email change: needs code.
    - Password change: needs current_password.
    - Name change: direct.
    """

    # 1. Verificação se está tentando mudar o e-mail
    is_changing_email = new_email and new_email != current_email
    if is_changing_email:
        if not code:
            raise HTTPException(status_code=400, detail="O código de verificação é obrigatório para alterar o e-mail.")
        if not db.verify_code(current_email, code, 'email_change'):
            raise HTTPException(status_code=400, detail="Código de verificação de e-mail inválido ou expirado.")

    # 2. Verificação se está tentando mudar a senha
    is_changing_password = new_password and len(new_password) > 0
    if is_changing_password:
        if not current_password:
            raise HTTPException(status_code=400, detail="A senha atual é obrigatória para definir uma nova senha.")
        try:
            # Tenta logar com a senha atual para validar
            auth.sign_in_with_email_and_password(current_email, current_password)
        except Exception:
            raise HTTPException(status_code=400, detail="A senha atual informada está incorreta.")

    try:
        # 3. Atualiza no Firebase Auth se necessário (E-mail ou Senha)
        if is_changing_email or is_changing_password:
            auth.update_user_credentials(current_email, new_email, new_password)

        # 4. Atualiza no Firestore (Nome, Sobrenome e novo E-mail se houver)
        success = db.update_user_profile(current_email, new_email or current_email, first_name, last_name)

        if success:
            db.add_audit_log(current_email, "Atualização de Perfil", "Usuário alterou seus dados.", "INFO")
            return {"status": "success"}
    except Exception as e:
        logger.error(f"Erro ao atualizar perfil: {e}")
        error_detail = db.get_friendly_error(e)
        raise HTTPException(status_code=400, detail=error_detail)

    raise HTTPException(status_code=500, detail="Erro desconhecido ao atualizar perfil.")

# --- API MONITORING ENDPOINTS ---
@app.post("/check-integrations")
async def route_run_batch_api_check(background_tasks: BackgroundTasks):
    """Dispara a checagem de API para todos os clientes."""
    task_id = db.create_task(task_type="batch_api_check", description="Checagem geral de APIs RSUS")
    background_tasks.add_task(run_batch_api_check, task_id)
    return {"status": "success", "task_id": task_id}

@app.post("/check-integration/{client_id}")
async def route_run_single_api_check(client_id: str, background_tasks: BackgroundTasks):
    """Dispara a checagem de API para um único cliente."""
    task_id = db.create_task(
        task_type="single_api_check", 
        description=f"Checagem individual: {client_id}",
        razao_social=client_id
    )
    background_tasks.add_task(run_single_api_check, client_id, task_id)
    return {"status": "success", "task_id": task_id}

@app.get("/task/{task_id}")
async def route_get_task_status(task_id: str):
    """Retorna o status e os logs de uma tarefa específica."""
    task = db.firestore_db.collection('tasks').document(task_id).get()
    if not task.exists:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return task.to_dict()

@app.get("/task/{task_id}/logs")
async def route_get_task_logs(task_id: str):
    """Retorna a lista de logs de uma tarefa específica."""
    logs = db.get_task_logs(task_id)
    return logs

# --- RSUS SETTINGS ENDPOINTS ---
@app.get("/settings/rsus-credentials")
async def route_get_rsus_credentials(type: str = "general"):
    """Recupera as credenciais RSUS por tipo."""
    creds = db.get_rsus_credentials(type)
    if not creds:
        return {"username": "", "password": ""}
    return creds

@app.post("/settings/rsus-credentials")
async def route_save_rsus_credentials(
    type: str = Form(...), 
    username: str = Form(...), 
    password: str = Form(...)
):
    """Salva credenciais RSUS (general ou unimed_vitoria) via Form."""
    success = db.save_rsus_credentials(type, username, password)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Erro ao salvar credenciais")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=False)
