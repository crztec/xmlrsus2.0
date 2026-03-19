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
            # Aguarda carregar ou verifica se logou
            await page.wait_for_load_state("networkidle")
            if "Login" in page.url:
                db.add_log(task_id, "ERROR", "Falha na autenticação. Verifique usuário e senha.")
                await browser.close()
                db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
                return
            
            db.add_log(task_id, "SUCCESS", "Login realizado com sucesso.")

            # 2. Navegação para Importação
            await page.goto(url_sistema, wait_until="commit")
            try:
                await page.wait_for_selector("input#numeroProtocolo", timeout=45000)
            except:
                db.add_log(task_id, "WARNING", "Campo de protocolo não apareceu após o redirecionamento. Tentando prosseguir...")

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
                
                db.add_log(task_id, "INFO", f"Iniciando preenchimento do ABI {abi}...")
                
                # Preenche formulário - O sistema antigo usava o Número do Processo no campo Protocolo
                num_processo = file.get('numero_processo') or abi
                await page.fill("input#numeroProtocolo", str(num_processo))
                
                # Para campos que podem ser readonly ou controlados por máscara de JS (como datas e valores),
                # injetar via evaluate é mais rápido e confiável.
                dt_recebimento = file.get("data_recebimento_oficio") or file.get("data_registro_transacao", "")
                dt_prazo = file.get("prazo_resposta_ans", "")
                competencias = file.get("competencias", "")
                qtd = str(file.get("quantidade_processo", "0"))
                valor = str(file.get("valor_total_processo", "0"))

                # Script para forçar preenchimento no DOM e notificar AngularJS
                await page.evaluate("""(data) => {
                    const setValAttr = (sel, val) => {
                        const el = document.querySelector(sel);
                        if (el) {
                            el.value = val;
                            // Dispara eventos padrão
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('blur', { bubbles: true }));
                            
                            // Integração extra com AngularJS se disponível
                            if (window.angular) {
                                const ngEl = angular.element(el);
                                const controller = ngEl.controller('ngModel');
                                if (controller) {
                                    controller.$setViewValue(val);
                                    controller.$render();
                                }
                                ngEl.triggerHandler('input');
                                ngEl.triggerHandler('change');
                            }
                        }
                    };
                    if (data.dt_recebimento) setValAttr('input#dataRecebimentoOficio', data.dt_recebimento);
                    if (data.dt_prazo) setValAttr('input#dataPrazoRespostaAns', data.dt_prazo);
                    setValAttr('input#competencias', data.competencias);
                    setValAttr('input#quantidadeAtendimentos', data.qtd);
                    setValAttr('input#valorTotalABI', data.valor);
                }""", {
                    "dt_recebimento": dt_recebimento,
                    "dt_prazo": dt_prazo,
                    "competencias": competencias,
                    "qtd": qtd,
                    "valor": valor
                })

                # Upload do arquivo
                with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                    tmp_name = tmp.name
                
                try:
                    success_dl = db.download_xml_from_storage(storage_path, tmp_name)
                    if not success_dl:
                        db.add_log(task_id, "ERROR", f"Erro ao baixar {nome} do storage.")
                        continue
                    
                    # Upload e espera estabilizar
                    file_input = page.locator("input[type='file'], input[name='arquivos']").first
                    await file_input.set_input_files(tmp_name)
                    await asyncio.sleep(2)
                finally:
                    if os.path.exists(tmp_name): os.unlink(tmp_name)

                # Clique no botão Importar (Usa seletor exato do subheader)
                db.add_log(task_id, "INFO", "Enviando formulário de importação...")
                success_click = False
                
                # Seletores refinados para o portal RSUS (Priorizando o que o usuário indicou)
                import_selectors = [
                    "a:has-text('IMPORTAR ARQUIVO')", 
                    "button:has-text('IMPORTAR ARQUIVO')",
                    "button:has-text('Importar')", 
                    "input[type='submit'][value*='Importar']",
                    ".btn-primary:has-text('Importar')"
                ]
                
                # Rola para o topo para garantir visibilidade da barra de ferramentas superior
                await page.evaluate("window.scrollTo(0, 0)")
                await asyncio.sleep(1)
                
                for selector in import_selectors:
                    try:
                        btn = page.locator(selector).first
                        if await btn.is_visible(timeout=2000):
                            await btn.click(force=True)
                            success_click = True
                            db.add_log(task_id, "INFO", f"Clique realizado com seletor: {selector}")
                            break
                    except:
                        continue
                
                if not success_click:
                    db.add_log(task_id, "ERROR", f"Não foi possível localizar o botão de Importar para ABI {abi}")
                    # Screenshot de debug do formulário
                    try:
                        screenshot_path = f"debug/screenshots/{task_id}_abi_{abi}_form_error.png"
                        img_bytes = await page.screenshot(full_page=True)
                        db.upload_xml_to_storage(task_id, screenshot_path, img_bytes)
                        db.add_log(task_id, "DEBUG", f"Screenshot do formulário salvo em: {screenshot_path}")
                    except: pass
                    db.firestore_db.collection('task_files').document(file['id']).update({
                        'status_importacao': 'ERRO',
                        'error_message': 'Botão Importar não respondeu ou não foi encontrado'
                    })
                    continue

                # Aguarda processamento do portal com verificação de sucesso REAL
                db.add_log(task_id, "INFO", "Aguardando confirmação do portal...")
                
                # Pequena espera para o portal reagir
                await asyncio.sleep(3)
                
                status_final_abi = "ERROR"
                msg_feedback = ""
                
                # Loop de verificação de mensagens (SIS...) por até 45s
                for _ in range(45):
                    # Procura no container de mensagens (e também em alertas de sistema)
                    container_msg = page.locator(".header-message-top, .browseralert, .modal-content, .alert").first
                    if await container_msg.is_visible(timeout=500):
                        msg_text = await container_msg.inner_text()
                        
                        # Códigos de retorno do RSUS: SIS00010 (Sucesso), SIS... (Erros)
                        if "SIS00010" in msg_text or "sucesso" in msg_text.lower():
                            db.add_log(task_id, "SUCCESS", f"Portal confirmou ABI {abi}: {msg_text[:100]}")
                            status_final_abi = "SUCCESS"
                            msg_feedback = msg_text
                            break
                        elif "SIS" in msg_text or "erro" in msg_text.lower() or "inválid" in msg_text.lower() or "não encontrado" in msg_text.lower():
                            db.add_log(task_id, "ERROR", f"Portal recusou ABI {abi}: {msg_text[:150]}")
                            status_final_abi = "ERROR"
                            msg_feedback = msg_text
                            break
                    await asyncio.sleep(1)
                
                # Se após 45s não confirmou, tira novo print para ver o que sobrou na tela
                if status_final_abi == "ERROR" and not msg_feedback:
                    db.add_log(task_id, "WARNING", f"ABI {abi}: Sem resposta SIS confirmada após 45s. Capturando tela...")
                    try:
                        screenshot_path = f"debug/screenshots/{task_id}_abi_{abi}_timeout.png"
                        img_bytes = await page.screenshot(full_page=True)
                        db.upload_xml_to_storage(task_id, screenshot_path, img_bytes)
                        db.add_log(task_id, "DEBUG", f"Screenshot do timeout salvo em: {screenshot_path}")
                    except: pass
                    msg_feedback = "Timeout aguardando confirmação (Verificar screenshot)"
                
                # Atualiza status do arquivo no Firestore
                db.firestore_db.collection('task_files').document(file['id']).update({
                    'status_importacao': 'SUCESSO' if status_final_abi == "SUCCESS" else 'ERRO',
                    'error_message': msg_feedback if status_final_abi == "ERROR" else "",
                    'data_processamento': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })

                # Atualiza progresso
                processed = i + 1
                progress = int((processed / total) * 100)
                db.firestore_db.collection('tasks').document(task_id).update({
                    'arquivos_processados': processed,
                    'progress': progress,
                    'updated_at': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })
                
                # Intervalo de espera de 120s conforme regra original do sistema para estabilidade
                if i < total - 1:
                    if status_final_abi == "SUCCESS":
                        db.add_log(task_id, "INFO", "Aguardando 120s para estabilização do portal...")
                        await asyncio.sleep(120)
                    else:
                        await asyncio.sleep(5)
                    
                    # Refresh para limpar campos
                    await page.goto(url_sistema)
                    await page.wait_for_load_state("networkidle")

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
