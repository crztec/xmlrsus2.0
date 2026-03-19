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
            try:
                # Flags para maior invisibilidade e compatibilidade
                browser = await p.chromium.launch(
                    headless=True, 
                    args=[
                        "--no-sandbox", 
                        "--disable-setuid-sandbox", 
                        "--disable-dev-shm-usage",
                        "--disable-gpu"
                    ]
                )
            except Exception as launch_err:
                # Se falhar, tenta instalar apenas como último recurso
                if "Executable doesn't exist" in str(launch_err):
                    db.add_log(task_id, "INFO", "Binários não encontrados, tentando instalação rápida...")
                    import subprocess
                    import sys
                    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
                    browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
                else:
                    raise launch_err

            # Novo contexto com Stealth Básico (UA + Viewport)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                viewport={'width': 1920, 'height': 1080},
                ignore_https_errors=True
            )
            page = await context.new_page()
            page.set_default_navigation_timeout(60000)
            page.set_default_timeout(60000)

            # 1. Login
            db.add_log(task_id, "INFO", f"Acessando página de login: {login_url}")
            try:
                # Retry loop para o carregamento inicial
                for attempt in range(2):
                    try:
                        # Mudamos para 'load' para garantir que o HTML básico esteja lá
                        await page.goto(login_url, timeout=60000, wait_until="load")
                        break
                    except Exception as e:
                        if attempt == 1: raise e
                        db.add_log(task_id, "INFO", "Servidor lento. Tentando novamente...")
                        await asyncio.sleep(5)
                
                # Diagnóstico: Log do título da página
                title = await page.title()
                db.add_log(task_id, "INFO", f"Página carregada: '{title}'. Verificando formulário...")

                # 1.1 Tratar modais de aviso se aparecerem (Navegador, Token ANS, etc.)
                try:
                    # Tenta fechar tanto o modal central quanto a barra de alerta superior
                    modais = page.locator("#myModal, #_browseralert")
                    for i in range(await modais.count()):
                        modal = modais.nth(i)
                        if await modal.is_visible(timeout=3000):
                            db.add_log(task_id, "INFO", "Limpando avisos do portal...")
                            await page.keyboard.press("Escape")
                            # Busca botões de fechar específicos se o Escape não bastar
                            btn_close = page.locator("#myModal button.close, #_closeBrowseralert").first
                            if await btn_close.is_visible(timeout=1000):
                                await btn_close.click()
                            await asyncio.sleep(1)
                except:
                    pass

                # 1.2 Localizar campos (suporte a iframes)
                db.add_log(task_id, "INFO", "Localizando campos de credenciais...")
                
                # Tenta encontrar no quadro principal primeiro
                target = page
                email_field = page.locator("input#email, input#Email, [name='Email'], [name='email']").first
                
                # Se não encontrar no principal após 5s, varre os iframes
                if await email_field.count() == 0:
                    db.add_log(task_id, "INFO", "Campos não encontrados no quadro principal. Varrendo IFrames...")
                    for frame in page.frames:
                        if "Login" in (frame.name or "") or "/Account/Login" in frame.url:
                            f_email = frame.locator("input#email, input#Email, [name='Email']").first
                            if await f_email.count() > 0:
                                db.add_log(task_id, "INFO", f"Formulário encontrado no IFrame: {frame.name or frame.url}")
                                target = frame
                                email_field = f_email
                                break
                
                # Aguarda visibilidade final no alvo selecionado (página ou iframe)
                await email_field.wait_for(state="visible", timeout=15000)
                
                # Preenche credenciais
                db.add_log(task_id, "INFO", "Preenchendo usuário...")
                await email_field.fill(usuario)
                
                pass_field = target.locator("input#password, input#Password, [name='Password'], [name='password']").first
                db.add_log(task_id, "INFO", "Preenchendo senha...")
                await pass_field.fill(senha)
                
                # Procura o botão de login (#logIn é o padrão do RSUS)
                db.add_log(task_id, "INFO", "Calculando seletores de login...")
                # Filtra especificamente por botões visíveis para evitar clicar em modais ocultos
                btn_locator = target.locator("#logIn:visible, button[type='submit']:visible, [name='Login']:visible, button:has-text('Entrar'):visible")
                count = await btn_locator.count()
                db.add_log(task_id, "INFO", f"Encontrados {count} botões de login visíveis. Clicando no primeiro...")
                
                try:
                    # Tenta o primeiro visível
                    btn_login = btn_locator.first
                    await btn_login.wait_for(state="visible", timeout=10000)
                    # Clique forçado para ignorar elementos sobrepostos se necessário
                    await btn_login.click(timeout=10000, force=True)
                except Exception as click_err:
                    db.add_log(task_id, "WARNING", f"Clique direto falhou: {str(click_err)[:80]}. Tentando JS/Enter...")
                    # Fallback 1: Disparar evento de clique via JS (ignora overlays e visibilidade)
                    try:
                        await page.evaluate("() => { const b = document.querySelector('#logIn, button[type=\"submit\"], [name=\"Login\"]'); if(b) b.click(); }")
                    except: pass
                    # Fallback 2: Tecla Enter
                    await pass_field.focus()
                    await page.keyboard.press("Enter")
                
                # Aguarda transição ou verificação rápida de erro
                db.add_log(task_id, "INFO", "Aguardando redirecionamento pós-login...")
                await page.wait_for_timeout(8000)
            except Exception as e:
                import traceback
                error_detail = traceback.format_exc()
                # Captura screenshot em caso de erro de login/timeout
                screenshot_path = f"/tmp/error_login_{task_id}.png"
                page_url = page.url
                db.add_log(task_id, "ERROR", f"Falha no formulário: {str(e)}. URL Atual: {page_url}")
                logger.error(f"DETALHE DO ERRO NO FORMULÁRIO: {error_detail}")
                try:
                    await page.screenshot(path=screenshot_path)
                    # Upload do screenshot para o Storage para podermos visualizar
                    with open(screenshot_path, 'rb') as f:
                        buf = f.read()
                        remote_path = f"debug/screenshots/{task_id}_login_error.png"
                        # Reuso a função de upload mudando o content_type (hack para debug)
                        bucket = db.storage.bucket()
                        blob = bucket.blob(remote_path)
                        blob.upload_from_string(buf, content_type='image/png')
                        db.add_log(task_id, "DEBUG", f"Screenshot do erro salvo em: {remote_path}")
                except Exception as img_err:
                    logger.error(f"Erro ao capturar/salvar screenshot: {img_err}")
                raise e
            # 1.3 Aguarda redirecionamento ou erro de login
            db.add_log(task_id, "INFO", "Aguardando processamento do login...")
            try:
                # Espera 15s por uma mudança de URL que SAIA do /Login ou por carregamento de rede
                await page.wait_for_function("""() => {
                    return !window.location.href.toLowerCase().includes('login') || 
                           document.querySelector('#numeroProtocolo') !== null;
                }""", timeout=20000)
            except:
                pass
                
            # Verifica se ainda estamos na página de login (o que indica erro de credenciais ou travamento)
            current_url = page.url.lower()
            if "login" in current_url and await page.locator("input#password, input#Password").count() > 0:
                # Tira print do erro se ainda estiver na tela
                db.add_log(task_id, "ERROR", "Ainda na página de login após o clique. Verifique credenciais.")
                try:
                    screenshot_path = f"debug/screenshots/{task_id}_login_fail_still_there.png"
                    img_bytes = await page.screenshot()
                    db.upload_xml_to_storage(task_id, screenshot_path, img_bytes)
                except: pass
                await browser.close()
                db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
                return
            
            db.add_log(task_id, "SUCCESS", "Login realizado com sucesso.")

            # 2. Navegação para o formulário de importação
            # Após login, o portal vai para /importacao (lista). 
            # Para abrir o formulário, clicar em "SELECIONAR ARQUIVO" na barra superior.
            db.add_log(task_id, "INFO", "Aguardando página de importações carregar...")
            await asyncio.sleep(5)
            
            # Log da URL atual para diagnóstico
            current_url = page.url
            db.add_log(task_id, "INFO", f"URL pós-login: {current_url}")
            
            # Clica em "SELECIONAR ARQUIVO" para abrir o formulário
            db.add_log(task_id, "INFO", "Procurando botão SELECIONAR ARQUIVO...")
            selecionar_btn = None
            selecionar_selectors = [
                "a:has-text('SELECIONAR ARQUIVO')",
                "button:has-text('SELECIONAR ARQUIVO')",
                "a:has-text('Selecionar Arquivo')",
                "*:has-text('SELECIONAR ARQUIVO')",
            ]
            
            for sel in selecionar_selectors:
                try:
                    btn = page.locator(sel).first
                    if await btn.is_visible(timeout=3000):
                        selecionar_btn = btn
                        db.add_log(task_id, "INFO", f"Botão encontrado: {sel}")
                        break
                except:
                    continue
            
            if selecionar_btn:
                await selecionar_btn.click()
                db.add_log(task_id, "INFO", "Clique em SELECIONAR ARQUIVO realizado ✓")
                await asyncio.sleep(3)
            else:
                db.add_log(task_id, "WARNING", "Botão SELECIONAR ARQUIVO não encontrado. Tirando screenshot...")
                try:
                    img_bytes = await page.screenshot(full_page=True)
                    db.upload_screenshot(f"debug/screenshots/{task_id}_no_selecionar_btn.png", img_bytes)
                except: pass
            
            # 2.1 Localiza o form (suporte a iframes se necessário)
            form_target = page
            protocolo_selector = "input#numeroProtocolo, #numeroProtocolo"
            
            try:
                # Verifica se o campo está no principal
                if await page.locator(protocolo_selector).count() == 0:
                    db.add_log(task_id, "INFO", "Campo de protocolo não encontrado no quadro principal. Varrendo IFrames...")
                    for frame in page.frames:
                        try:
                            if await frame.locator(protocolo_selector).count() > 0:
                                db.add_log(task_id, "INFO", f"Formulário encontrado no IFrame: {frame.name or frame.url}")
                                form_target = frame
                                break
                        except:
                            continue
                
                # Aguarda o campo estar pronto no alvo (seja page ou frame)
                await form_target.locator(protocolo_selector).wait_for(state="visible", timeout=20000)
                db.add_log(task_id, "INFO", "Campo de protocolo encontrado e visível ✓")
            except Exception as e:
                db.add_log(task_id, "ERROR", f"Campo de protocolo não apareceu: {str(e)[:100]}")
                # Screenshot de diagnóstico
                try:
                    screenshot_path = f"debug/screenshots/{task_id}_form_not_found.png"
                    img_bytes = await page.screenshot(full_page=True)
                    db.upload_screenshot(screenshot_path, img_bytes)
                    db.add_log(task_id, "DEBUG", f"Screenshot salvo: {screenshot_path}")
                    # Também loga o HTML para diagnóstico
                    current_url = page.url
                    title = await page.title()
                    db.add_log(task_id, "DEBUG", f"URL atual: {current_url} | Título: {title}")
                except: pass
                await browser.close()
                db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
                return

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
                    # ─── ETAPA 1: Preencher campo Protocolo (somente numeroProcesso do XML) ───
                    num_processo = file.get('numero_processo', '')
                    db.add_log(task_id, "INFO", f"Preenchendo Protocolo: {num_processo}")
                    protocolo_field = form_target.locator("input#numeroProtocolo").first
                    await protocolo_field.click()
                    await protocolo_field.fill("")
                    await protocolo_field.type(str(num_processo), delay=50)
                    
                    # ─── ETAPA 2: Preencher campos de data e valores ───
                    dt_recebimento = file.get("data_recebimento_oficio") or file.get("data_registro_transacao", "")
                    dt_prazo = file.get("prazo_resposta_ans", "")
                    competencias = file.get("competencias", "")
                    qtd = str(file.get("quantidade_processo", "0"))
                    valor = str(file.get("valor_total_processo", "0"))
                    
                    db.add_log(task_id, "INFO", f"Dados: dt_rec={dt_recebimento}, prazo={dt_prazo}, comp={competencias}, qtd={qtd}, val={valor}")
                    
                    # Preenche campos individualmente com Playwright (mais confiável que evaluate)
                    field_map = {
                        "input#dataRecebimentoOficio": dt_recebimento,
                        "input#dataPrazoRespostaAns": dt_prazo,
                        "input#competencias": competencias,
                        "input#quantidadeAtendimentos": qtd,
                        "input#valorTotalABI": valor,
                    }
                    
                    for sel, val in field_map.items():
                        if not val:
                            continue
                        try:
                            field = form_target.locator(sel).first
                            if await field.count() > 0:
                                await field.click()
                                await field.fill("")
                                await field.type(str(val), delay=30)
                                db.add_log(task_id, "DEBUG", f"  Campo {sel} = '{val}' ✓")
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
                    
                    if not success_click:
                        db.add_log(task_id, "ERROR", f"Botão IMPORTAR ARQUIVO não encontrado para ABI {abi}")
                        try:
                            err_path = f"debug/screenshots/{task_id}_abi_{abi}_no_button.png"
                            img_bytes = await page.screenshot(full_page=True)
                            db.upload_screenshot(err_path, img_bytes)
                        except: pass
                        db.firestore_db.collection('task_files').document(file['id']).update({
                            'status_importacao': 'ERRO',
                            'error_message': 'Botão IMPORTAR ARQUIVO não encontrado'
                        })
                        continue
                    
                    # ─── ETAPA 6: Aguardar confirmação do portal ───
                    db.add_log(task_id, "INFO", "Aguardando confirmação do portal...")
                    await asyncio.sleep(5)  # Tempo para o portal processar
                    
                    status_final_abi = "ERROR"
                    msg_feedback = ""
                    
                    # Verifica por até 45 segundos
                    for check_round in range(45):
                        try:
                            # Busca qualquer mensagem visível (alertas, modais, mensagens do sistema)
                            msg_selectors = ".header-message-top, .browseralert, .modal-content, .alert, .alert-success, .alert-danger, .alert-warning, .alert-info, .toast, .notification"
                            msgs = page.locator(msg_selectors)
                            for m_idx in range(await msgs.count()):
                                msg_el = msgs.nth(m_idx)
                                if await msg_el.is_visible(timeout=200):
                                    msg_text = (await msg_el.inner_text()).strip()
                                    if not msg_text:
                                        continue
                                    
                                    db.add_log(task_id, "DEBUG", f"Mensagem detectada: '{msg_text[:100]}'")
                                    
                                    if "SIS00010" in msg_text or "sucesso" in msg_text.lower() or "importad" in msg_text.lower():
                                        db.add_log(task_id, "SUCCESS", f"Portal confirmou ABI {abi}: {msg_text[:100]}")
                                        status_final_abi = "SUCCESS"
                                        msg_feedback = msg_text
                                        break
                                    elif "SIS" in msg_text or "erro" in msg_text.lower() or "inválid" in msg_text.lower() or "não encontrado" in msg_text.lower():
                                        db.add_log(task_id, "ERROR", f"Portal recusou ABI {abi}: {msg_text[:150]}")
                                        status_final_abi = "ERROR"
                                        msg_feedback = msg_text
                                        break
                            
                            if status_final_abi != "ERROR" or msg_feedback:
                                break
                        except:
                            pass
                        await asyncio.sleep(1)
                    
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
                    
                    # Refresh para limpar campos (reload em vez de goto para preservar SPA)
                    await page.reload(wait_until="domcontentloaded", timeout=60000)
                    await asyncio.sleep(5)

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
