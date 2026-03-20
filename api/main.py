from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
import json
import asyncio
from urllib.parse import urlparse
import api.database as db
import api.auth as auth
import api.parser as parser
from playwright.async_api import async_playwright
import tempfile
import logging
import sys

# Configure standard logging
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="GAX API")

# Configurar CORS para permitir o frontend Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Em produção, especificar a URL do frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"Incoming request: {request.method} {request.url}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    error_msg = traceback.format_exc()
    print(f"CRITICAL ERROR: {error_msg}")
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
        return user
    except Exception as e:
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

@app.get("/clients")
async def get_clients():
    return db.get_all_clients()

@app.get("/xml-data")
async def get_xml_data():
    return db.get_all_xml_data()

@app.get("/xml-data/export")
async def export_xml_data():
    import pandas as pd
    from fastapi.responses import StreamingResponse
    import io
    
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
    return {"message": "Usuário excluído com sucesso."}

@app.patch("/users/{user_email}")
async def update_user(user_email: str, data: dict):
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
        return {"message": "Logs limpos com sucesso."}
    raise HTTPException(status_code=500, detail="Erro ao limpar logs.")

@app.post("/maintenance/reset-db")
async def reset_db():
    if db.reset_system_database():
        return {"message": "Banco de dados resetado com sucesso."}
    raise HTTPException(status_code=500, detail="Erro ao resetar banco.")

@app.get("/tasks")
async def get_tasks():
    # Retorna o histórico de todas as tarefas para a página de logs
    # Usando o limite de 50 para evitar sobrecarga
    return db.get_tasks_for_dashboard(limit=50)

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
    
    logs = db.get_logs_for_task(task_id, limit=10)
    
    return {
        "id": task_id,
        "status": task_data.get('status'),
        "progress": progress,
        "processed": processed,
        "total": total,
        "logs": logs
    }

async def background_worker_task(task_id: str, url_sistema: str):
    """
    Realize a automação real do preenchimento no portal RSUS usando Playwright.
    """
    browser_context = None
    try:
        db.firestore_db.collection('tasks').document(task_id).update({'status': 'EM ANDAMENTO'})
        db.add_log(task_id, "INFO", f"Iniciando automação no RSUS: {url_sistema}")

        # Busca dados da tarefa para obter credenciais
        task_doc = db.firestore_db.collection('tasks').document(task_id).get()
        if not task_doc.exists:
            return
        task_data = task_doc.to_dict()
        usuario = task_data.get('usuario')
        senha = task_data.get('senha')

        # Extrai URL base para o Login
        parsed_url = urlparse(url_sistema)
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
                # IMPORTANTE: Foram retiradas TODAS as flags de "otimização" (ex: --disable-background-networking)
                # O Angular PRECISA de networking em background e timer throttling desativado para carregar os templates SVG/HTML.
            ]
            try:
                # Tenta o launch padrão primeiro (muito mais rápido no Docker)
                browser = await p.chromium.launch(headless=True, args=browser_args)
            except Exception as launch_err:
                # Fallback: Se falhar em ambiente local/sem-cached, tenta instalação rápida
                err_msg = str(launch_err)
                if "Executable doesn't exist" in err_msg or "not found" in err_msg.lower():
                    db.add_log(task_id, "INFO", "Binários ausentes. Instalando Chromium (uma única vez)...")
                    import subprocess
                    import sys
                    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
                    browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
                else:
                    raise launch_err

            # Novo contexto com Stealth Básico (UA + Viewport)
            # O Cloud Run roda em UTC. Portais velhos (IIS) costumam mandar cookies
            # de autenticação baseados no horário local do Brasil sem o 'GMT' no Expires.
            # Isso faz o Playwright em UTC apagar o cookie instantaneamente achando que já expirou.
            # Forçamos PT-BR e fuso horário de SP para emular 100% o ambiente do robô local.
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                viewport={'width': 1920, 'height': 1080},
                ignore_https_errors=True,
                timezone_id="America/Sao_Paulo",
                locale="pt-BR"
            )
            page = await context.new_page()
            page.set_default_navigation_timeout(60000)
            page.set_default_timeout(60000)

            # 2. Navegação Orgânica (Simulando o robô antigo)
            try:
                # LISTENER DE CONSOLE PARA CAPTURAR O ERRO INVISÍVEL DO ANGULARJS!
                page.on("console", lambda msg: db.add_log(task_id, "DEBUG" if msg.type != "error" else "ERROR", f"[Browser Console] {msg.text[:500]}") if msg.type in ['error', 'warning'] else None)
                page.on("pageerror", lambda err: db.add_log(task_id, "ERROR", f"[Uncaught Exception] {str(err)[:500]}"))

                db.add_log(task_id, "INFO", f"Acessando url alvo para redirecionamento orgânico: {url_sistema}")
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
                db.add_log(task_id, "INFO", "Tela de login atingida. Preenchendo credenciais...")
                
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
                # Removemos force=True para que o clique só ocorra se o Angular habilitar o botão de fato
                await btn_login.click()
                await asyncio.sleep(2)
                
                db.add_log(task_id, "INFO", "Autenticado. Aguardando o portal redirecionar de volta organicamente...")
                
                # O robô antigo simplesmente aguardava o campo de protocolo aparecer na tela.
                # Sem forçar navegação, sem iframes secundários, apenas paciência.
                db.add_log(task_id, "INFO", "Aguardando carregamento do formulário (campo Protocolo)...")
                
                form_ready = False
                try:
                    # Usando wait_for_function para procurar em todos os frames e não ligar para 'visibility'
                    # Equivalente exato ao 'presence_of_element_located' do Selenium, superando as restrições do Playwright
                    await page.wait_for_function("""
                        () => {
                            if (document.querySelector('input#numeroProtocolo')) return true;
                            for (let i = 0; i < window.frames.length; i++) {
                                try {
                                    if (window.frames[i].document.querySelector('input#numeroProtocolo')) return true;
                                } catch(e) {}
                            }
                            return false;
                        }
                    """, timeout=60000)
                    form_ready = True
                    db.add_log(task_id, "SUCCESS", "Formulário renderizado com sucesso de forma orgânica!")
                except:
                    # Se mesmo organicamente falhar em 60s, a sessão Angular pode ter corrompido.
                    # Vamos tentar 1 único refresh como último recurso ou fallback final.
                    db.add_log(task_id, "WARNING", "Página em branco ou travada detectada. Aplicando REFRESH...")
                    try:
                        img_blank = await page.screenshot()
                        db.upload_screenshot(f"debug/screenshots/{task_id}_step1_blank.png", img_blank)
                        await page.reload(wait_until="domcontentloaded", timeout=45000)
                        await page.wait_for_function("() => !!document.querySelector('input#numeroProtocolo')", timeout=30000)
                        form_ready = True
                        db.add_log(task_id, "SUCCESS", "Formulário renderizado após refresh!")
                    except Exception as reload_err:
                        db.add_log(task_id, "ERROR", f"Falha após refresh: Timeout!")
                        try:
                            html_content = await page.content()
                            html_path = f"debug/screenshots/{task_id}_dump.html"
                            bucket = db.storage.bucket()
                            bucket.blob(html_path).upload_from_string(html_content.encode('utf-8'), content_type='text/html')
                            db.add_log(task_id, "DEBUG", f"HTML Dump (após refresh) salvo: {html_path}")
                        except Exception as dump_err:
                            db.add_log(task_id, "ERROR", f"Falha ao salvar HTML Dump: {dump_err}")
                        
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
                except Exception as img_err:
                    pass
                raise e

            # Fallback final: Se ainda não carregou, tenta clicar em SELECIONAR ARQUIVO na lista
            if not form_ready:
                db.add_log(task_id, "INFO", "Tentando navegação via menu (fallback final)...")
                try:
                    await page.goto("https://rsuserechim.cubeti.com.br/importacao", wait_until="commit", timeout=60000)
                    sel_btn = page.locator("a:has-text('SELECIONAR ARQUIVO'), a:has-text('Selecionar arquivo')").first
                    if await sel_btn.is_visible(timeout=10000):
                        await sel_btn.click()
                        db.add_log(task_id, "INFO", "Clique em SELECIONAR ARQUIVO via lista ✓")
                        await page.locator("input#numeroProtocolo").first.wait_for(state="visible", timeout=15000)
                        form_ready = True
                    else:
                        raise Exception("Botão de seleção não encontrado na lista")
                except Exception as final_err:
                    db.add_log(task_id, "ERROR", f"Formulário inacessível: {str(final_err)[:100]}")
                    try:
                        img_err = await page.screenshot(full_page=True)
                        db.upload_screenshot(f"debug/screenshots/{task_id}_fallback_failed.png", img_err)
                    except: pass
                    await browser.close()
                    db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
                    return

            db.add_log(task_id, "INFO", f"URL do formulário: {page.url}")
            
            # 2.1 Define o alvo do formulário (suporte a frames se necessário)
            form_target = page
            protocolo_selector = "input#numeroProtocolo"
            
            # Verificação final rápida para garantir que o elemento está acessível
            if await page.locator(protocolo_selector).count() == 0:
                for frame in page.frames:
                    if await frame.locator(protocolo_selector).count() > 0:
                        form_target = frame
                        db.add_log(task_id, "INFO", "Formulário detectado dentro de IFrame.")
                        break

            # 3. Processamento dos Arquivos
            files = db.get_files_for_task(task_id)
            total = len(files)
            
            # Ordenação numérica decrescente por ABI conforme o sistema antigo
            def extract_abi_num(num_abi_str):
                import re
                match = re.search(r'(\d+)', str(num_abi_str))
                return int(match.group(1)) if match else 0
            
            files.sort(key=lambda x: extract_abi_num(x.get('numero_abi', '')), reverse=True)
            
            for i, file in enumerate(files):
                nome = file.get('nome_arquivo', 'Arquivo')
                abi = file.get('numero_abi', '')
                storage_path = file.get('storage_path')
                
                db.add_log(task_id, "INFO", f"[{i+1}/{total}] Iniciando preenchimento do ABI {abi}...")
                
                try:
                    # ─── ETAPA 1: Preenchimento Robusto (Force-Fill) ───
                    # Extração de dados com fallbacks
                    num_processo = file.get('numero_processo', '')
                    dt_recebimento = file.get("data_recebimento_oficio") or file.get("data_registro_transacao", "")
                    dt_prazo = file.get("prazo_resposta_ans", "")
                    competencias = file.get("competencias", "")
                    qtd = str(file.get("quantidade_processo", "0"))
                    valor = str(file.get("valor_total_processo", "0"))

                    field_map = {
                        "input#numeroProtocolo": num_processo,
                        "input#dataRecebimentoOficio": dt_recebimento,
                        "input#dataPrazoRespostaAns": dt_prazo,
                        "input#competencias": competencias,
                        "input#quantidadeAtendimentos": qtd,
                        "input#valorTotalABI": valor,
                    }
                    
                    db.add_log(task_id, "INFO", f"Preenchendo formulário para ABI {abi} (Processo: {num_processo})")
                    
                    for sel, val in field_map.items():
                        if not val: continue
                        try:
                            # Tenta preenchimento forçado via JS para contornar readOnly e AngularJS
                            # Dispara 'input', 'change' e 'blur' para garantir sincronização do framework
                            success = await form_target.evaluate(f"(args) => {{ \
                                const el = document.querySelector(args.sel); \
                                if (el) {{ \
                                    el.value = args.val; \
                                    el.dispatchEvent(new Event('input', {{ bubbles: true }})); \
                                    el.dispatchEvent(new Event('change', {{ bubbles: true }})); \
                                    el.dispatchEvent(new Event('blur', {{ bubbles: true }})); \
                                    return true; \
                                }} \
                                return false; \
                            }}", {"sel": sel, "val": str(val)})
                            
                            if success:
                                db.add_log(task_id, "DEBUG", f"  Campo {sel} preenchido ✓")
                            else:
                                db.add_log(task_id, "WARNING", f"  Campo {sel} NÃO encontrado na página")
                        except Exception as field_err:
                            db.add_log(task_id, "WARNING", f"  Erro no campo {sel}: {str(field_err)[:60]}")
                    
                    # ─── ETAPA 3: Upload do arquivo XML ───
                    db.add_log(task_id, "INFO", f"Fazendo upload do XML: {nome}")
                    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                        tmp_name = tmp.name
                    
                    try:
                        success_dl = db.download_xml_from_storage(storage_path, tmp_name)
                        if not success_dl:
                            db.add_log(task_id, "ERROR", f"Erro ao baixar {nome} do storage.")
                            continue
                        
                        file_input = form_target.locator("input[type='file']").first
                        await file_input.set_input_files(tmp_name)
                        await asyncio.sleep(2)
                        db.add_log(task_id, "INFO", "Upload do XML realizado ✓")
                    finally:
                        if os.path.exists(tmp_name): os.unlink(tmp_name)
                    
                    # ─── ETAPA 4: Screenshot ANTES de clicar Importar (para diagnóstico) ───
                    try:
                        pre_submit_path = f"debug/screenshots/{task_id}_abi_{abi}_pre_submit.png"
                        img_bytes = await page.screenshot(full_page=True)
                        db.upload_screenshot(pre_submit_path, img_bytes)
                        db.add_log(task_id, "DEBUG", f"Screenshot pré-submit salvo: {pre_submit_path}")
                    except: pass
                    
                    # ─── ETAPA 5: Clicar no botão IMPORTAR ARQUIVO ───
                    db.add_log(task_id, "INFO", "Clicando em IMPORTAR ARQUIVO...")
                    
                    # Rola para o topo para garantir visibilidade
                    await page.evaluate("window.scrollTo(0, 0)")
                    await asyncio.sleep(1)
                    
                    success_click = False
                    # O botão fica na barra superior cinza, no topo da página
                    import_selectors = [
                        "a:has-text('IMPORTAR ARQUIVO')",
                        "button:has-text('IMPORTAR ARQUIVO')",
                        "a:has-text('Importar Arquivo')",
                        "button:has-text('Importar')",
                        ".btn-primary:has-text('Importar')",
                        "input[type='submit'][value*='Importar']",
                    ]
                    
                    for selector in import_selectors:
                        try:
                            btn = page.locator(selector).first
                            if await btn.is_visible(timeout=2000):
                                await btn.click(force=True)
                                success_click = True
                                db.add_log(task_id, "INFO", f"Clique realizado: {selector} ✓")
                                break
                        except:
                            continue
                    
                    if success_click:
                        # ─── NOVO: Lida com Modal de Confirmação (AngularJS) ───
                        # Alguns portais abrem um modal 'Deseja realmente importar?' após o clique no botão superior
                        await asyncio.sleep(1)
                        try:
                            confirm_selectors = [
                                "button:has-text('Sim')", 
                                "button:has-text('SIM')", 
                                "a:has-text('Sim')",
                                ".modal-footer button.btn-primary", # Padrão Bootstrap/Angular
                                ".btn-footer:has-text('Sim')",
                                "button:contains('Sim')"
                            ]
                            for sel_conf in confirm_selectors:
                                btn_conf = page.locator(sel_conf).first
                                if await btn_conf.is_visible(timeout=5000):
                                    db.add_log(task_id, "INFO", f"Modal de confirmação detectado ({sel_conf}). Clicando em SIM...")
                                    await btn_conf.click(force=True)
                                    break
                        except: pass
                    else:
                        db.add_log(task_id, "ERROR", f"Botão IMPORTAR ARQUIVO não encontrado para ABI {abi}")
                        db.firestore_db.collection('task_files').document(file['id']).update({
                            'status_importacao': 'ERRO',
                            'error_message': 'Botão IMPORTAR ARQUIVO não encontrado'
                        })
                        continue
                    
                    # ─── ETAPA 6: Aguardar confirmação do portal ───
                    db.add_log(task_id, "INFO", "Aguardando confirmação do portal...")
                    status_final_abi = "ERROR"
                    msg_feedback = ""
                    
                    # Seletor expandido de mensagens (inclui toasts, alertas do navegador e mensagens de sistema)
                    msg_selectors = ".header-message-top, .browseralert, .modal-content, .alert, .alert-success, .alert-danger, .alert-warning, .alert-info, .toast, .notification, .toast-message, #_browseralert, .help-block"
                    
                    # Verifica por até 60 segundos com maior frequência (0.5s) para capturar mensagens transientes
                    for check_round in range(120):
                        try:
                            # Busca qualquer mensagem visível
                            msgs = page.locator(msg_selectors)
                            count = await msgs.count()
                            for m_idx in range(count):
                                msg_el = msgs.nth(m_idx)
                                if await msg_el.is_visible(timeout=100):
                                    msg_text = (await msg_el.inner_text()).strip()
                                    if not msg_text: continue
                                    
                                    db.add_log(task_id, "DEBUG", f"Mensagem detectada: '{msg_text[:140]}'")
                                    
                                    if any(key in msg_text.lower() for key in ["sucesso", "importad", "concluíd", "enviado"]):
                                        db.add_log(task_id, "SUCCESS", f"Portal confirmou importação: {msg_text[:100]}")
                                        status_final_abi = "SUCCESS"
                                        msg_feedback = msg_text
                                        break
                                    elif any(key in msg_text.lower() for key in ["erro", "inválid", "rejeitad", "não encontrado", "sis00", "falhou"]):
                                        db.add_log(task_id, "ERROR", f"Portal recusou importação: {msg_text[:150]}")
                                        status_final_abi = "ERROR"
                                        msg_feedback = msg_text
                                        break
                            
                            if status_final_abi == "SUCCESS" or (status_final_abi == "ERROR" and msg_feedback):
                                break
                                
                            # Se a URL mudar para a lista, assume que terminou
                            if "/importacao" in page.url and "/novo" not in page.url:
                                db.add_log(task_id, "INFO", "Redirecionado para lista de importações.")
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
                    db.add_log(task_id, "ERROR", f"Erro ao processar ABI {abi}: {str(file_err)}")
                    logger.error(f"Erro no ABI {abi}: {traceback.format_exc()}")
                    try:
                        err_path = f"debug/screenshots/{task_id}_abi_{abi}_exception.png"
                        img_bytes = await page.screenshot(full_page=True)
                        db.upload_screenshot(err_path, img_bytes)
                    except: pass
                    db.firestore_db.collection('task_files').document(file['id']).update({
                        'status_importacao': 'ERRO',
                        'error_message': str(file_err)[:200]
                    })

                # Atualiza progresso
                processed = i + 1
                progress = int((processed / total) * 100)
                db.firestore_db.collection('tasks').document(task_id).update({
                    'arquivos_processados': processed,
                    'progress': progress,
                    'updated_at': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })
                
                # Intervalo e refresh para próximo arquivo
                if i < total - 1:
                    if status_final_abi == "SUCCESS":
                        db.add_log(task_id, "INFO", "Aguardando 120s para estabilização do portal...")
                        await asyncio.sleep(120)
                    else:
                        await asyncio.sleep(5)
                    
                    # Refresh para limpar campos para próximo arquivo
                    try:
                        await page.reload(wait_until="domcontentloaded", timeout=60000)
                        await asyncio.sleep(5)
                    except:
                        # Se reload falhar, volta à lista e clica SELECIONAR ARQUIVO
                        db.add_log(task_id, "INFO", "Reload falhou. Voltando à lista...")
                        await page.goto(f"{base_url}/importacao", wait_until="domcontentloaded", timeout=60000)
                        await asyncio.sleep(3)
                        try:
                            sel_btn = page.locator("a:has-text('SELECIONAR ARQUIVO')").first
                            await sel_btn.click()
                            await asyncio.sleep(3)
                        except: pass
                    
                    # Espera campo protocolo reaparecer
                    try:
                        await form_target.locator("input#numeroProtocolo").wait_for(state="visible", timeout=15000)
                    except:
                        db.add_log(task_id, "WARNING", "Campo protocolo não reapareceu após refresh")

            await browser.close()
            
        db.firestore_db.collection('tasks').document(task_id).update({
            'status': 'CONCLUIDO',
            'updated_at': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        db.add_log(task_id, "SUCCESS", "Automação finalizada. Todos os arquivos foram submetidos.")
        
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        db.firestore_db.collection('tasks').document(task_id).update({
            'status': 'ERRO',
            'error_message': str(e),
            'updated_at': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        db.add_log(task_id, "ERROR", f"Falha na automação: {str(e)}")

@app.post("/upload")
async def upload_xmls(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    url_sistema: str = Form(...),
    usuario: str = Form(...),
    senha: str = Form(...)
):
    if not files:
        return {"error": "Nenhum arquivo enviado."}

    arquivos_upload_data = []
    for file in files:
        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            return {"error": f"Arquivo {file.filename} excede o limite de 5MB."}
        arquivos_upload_data.append((file.filename, content))

    # Identifica a Razão Social do primeiro arquivo para a tarefa
    razao_social = parser.extract_razao_social(arquivos_upload_data[0][1])
    
    # Cria a tarefa no banco com as credenciais reais
    task_id = db.create_task(
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
    background_tasks.add_task(background_worker_task, task_id, url_sistema)

    return {
        "message": f"{len(files)} arquivos recebidos. O robô iniciará o preenchimento no RSUS em instantes.",
        "task_id": task_id,
        "razao_social": razao_social,
        "total_files": len(files_info),
        "status": "Iniciado"
    }
