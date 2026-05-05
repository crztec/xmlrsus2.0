import sys
import asyncio
import os
import tempfile
import logging
from urllib.parse import urlparse
from playwright.async_api import async_playwright
import api.database as db
import api.parser as parser

logger = logging.getLogger(__name__)

async def background_worker_task(task_id: str, url_sistema: str, force: bool = False):
    """
    Realize a automação real do preenchimento no portal RSUS usando Playwright.
    Extraído de main.py para isolamento.
    """
    browser_context = None
    try:
        db.firestore_db.collection('tasks').document(task_id).update({'status': 'EM ANDAMENTO'})
        db.add_log(task_id, "INFO", "Iniciando conexão segura com o portal RSUS.")

        # Busca dados da tarefa
        task_doc = db.firestore_db.collection('tasks').document(task_id).get()
        if not task_doc.exists:
            return
        task_data = task_doc.to_dict()
        razao_social = task_data.get('razao_social', '')
        
        # Busca credenciais do settings (não são mais armazenadas na task)
        cred_type = task_data.get('credential_type', 'general')
        creds = db.get_rsus_credentials(cred_type)
        if not creds:
            db.add_log(task_id, "ERROR", f"Credenciais RSUS ({cred_type}) não encontradas no sistema.")
            db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
            return
        usuario = creds.get('username', '')
        senha = creds.get('password', '')

        # Extrai URL base para o Login
        parsed_url = urlparse(url_sistema)

        # --- SSRF PROTECTION ---
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

        async with async_playwright() as p:
            browser_args = [
                "--headless=new",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,SameSiteDefaultChecksMethodRacy",
                "--disable-web-security",
                "--allow-running-insecure-content",
                "--ignore-certificate-errors",
                "--disable-blink-features=AutomationControlled"
            ]
            try:
                browser = await p.chromium.launch(headless=True, args=browser_args)
            except Exception:
                db.add_log(task_id, "DEBUG", "Binários ausentes. Instalando Chromium...")
                import subprocess
                import sys
                subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
                browser = await p.chromium.launch(headless=True, args=browser_args)

            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                ignore_https_errors=True,
                timezone_id="America/Sao_Paulo",
                locale="pt-BR"
            )
            await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            page = await context.new_page()

            async def block_assets(route):
                if route.request.resource_type in ["image", "font"]:
                    await route.abort()
                else:
                    await route.continue_()
            await page.route("**/*", block_assets)

            page.set_default_navigation_timeout(90000)
            page.set_default_timeout(90000)

            try:
                async def handle_response(response):
                    if url_sistema.split('/')[2] in response.url:
                        try:
                            headers = await response.all_headers()
                            set_cookie = headers.get('set-cookie')
                            if set_cookie:
                                sc_list = set_cookie.split('\n')
                                for sc in sc_list:
                                    parts = [p.strip() for p in sc.split(';')]
                                    if not parts: continue
                                    name_val = parts[0].split('=', 1)
                                    if len(name_val) < 2: continue
                                    await context.add_cookies([{
                                        "name": name_val[0],
                                        "value": name_val[1],
                                        "domain": url_sistema.split('/')[2],
                                        "path": "/",
                                        "secure": True,
                                        "sameSite": "Lax",
                                        "httpOnly": True
                                    }])
                        except: pass

                page.on("response", handle_response)
                page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))

                db.add_log(task_id, "INFO", "Acessando a página de importação do sistema.")
                await page.goto(url_sistema, wait_until="commit", timeout=60000)

                email_field = page.locator("input#email, input#Email").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input#email, input#Email").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break

                await email_field.wait_for(state="visible", timeout=25000)
                db.add_log(task_id, "INFO", "Identificando tela de acesso. Preenchendo login...")

                await email_field.click()
                await email_field.type(usuario, delay=40)
                await asyncio.sleep(0.5)

                pwd_field = page.locator("input#password, input#Password").first
                await pwd_field.click()
                await pwd_field.type(senha, delay=40)
                await asyncio.sleep(0.5)

                btn_login = page.locator("#logIn, button[type='submit']").first
                await btn_login.click()

                try:
                    await page.wait_for_selector("#logIn, button[type='submit']", state="hidden", timeout=15000)
                except:
                    db.add_log(task_id, "WARNING", "Botão de login ainda visível após clique. Prosseguindo...")

                cookies = await context.cookies()
                has_session = any('.ASPXAUTH' in c['name'] or 'Identity' in c['name'] or 'ASP.NET_SessionId' in c['name'] for c in cookies)

                db.add_log(task_id, "INFO", "Acesso autorizado. Iniciando sessão de trabalho.")

                if has_session and ("Account/Login" in page.url or "Account/LogOff" in page.url):
                    db.add_log(task_id, "WARNING", "Sessão detectada mas preso na tela de Login. Forçando Salto... ")
                    await page.goto(url_sistema.split('/novo')[0].rsplit('/', 1)[0] + "/", wait_until="commit", timeout=30000)
                    url_lista = url_sistema.replace("/novo", "")
                    await page.goto(url_lista, wait_until="commit", timeout=45000)
                    await asyncio.sleep(3)
                    await page.goto(url_sistema, wait_until="domcontentloaded", timeout=60000)
                else:
                    db.add_log(task_id, "INFO", "Preparando formulários do portal...")
                    url_lista = url_sistema.replace("/novo", "")
                    await page.goto(url_lista, wait_until="commit", timeout=30000)
                    await asyncio.sleep(2)
                    await page.goto(url_sistema, wait_until="commit", timeout=60000)

                form_ready = False
                try:
                    await page.wait_for_selector("input#numeroProtocolo", state="visible", timeout=30000)
                    form_ready = True
                except:
                    try:
                        await page.goto(url_sistema, wait_until="networkidle", timeout=60000)
                        await page.wait_for_selector("input#numeroProtocolo", state="visible", timeout=30000)
                        form_ready = True
                    except: pass

                if form_ready:
                    db.add_log(task_id, "SUCCESS", "Sistema pronto para processar os arquivos.")
                else:
                    html_dump = await page.content()
                    db.add_log(task_id, "ERROR", f"Falha no carregamento final. HTML Parcial: {html_dump[:250]}...")
                    raise Exception("Formulário não carregou")

            except Exception as e:
                db.mark_all_task_files_as_error(task_id, f"Falha no portal: {str(e)[:100]}")
                db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
                raise e

            files = db.get_files_for_task(task_id)
            total = len(files)

            if force and total > 0:
                try:
                    task_snap = db.firestore_db.collection('tasks').document(task_id).get()
                    razao_social_task = task_snap.to_dict().get('razao_social') if task_snap.exists else None
                    if razao_social_task:
                        abis_to_replace = [f.get('numero_abi') for f in files if f.get('numero_abi')]
                        db.mark_abis_as_substituted(razao_social_task, abis_to_replace)
                        db.add_log(task_id, "INFO", f"🔄 Modo SUBSTITUIÇÃO: {len(abis_to_replace)} ABIs invalidadas.")
                except: pass

            for i, file in enumerate(files):
                # 1. Checa cancelamento via Firestore antes de processar cada arquivo
                try:
                    task_snap = db.firestore_db.collection('tasks').document(task_id).get()
                    if task_snap.exists and task_snap.to_dict().get('status') == 'cancelled':
                        db.add_log(task_id, "WARNING", "⏹️ Processamento interrompido pelo usuário. Encerrando worker.")
                        if browser_context: await browser_context.close()
                        sys.exit(0)
                except Exception as e_cancel:
                    logger.error(f"Erro ao checar cancelamento: {e_cancel}")

                nome = file.get('nome_arquivo', 'Arquivo')
                abi = file.get('numero_abi', '')
                storage_path = file.get('storage_path')

                db.add_log(task_id, "INFO", f"[{i+1}/{total}] Processando ABI {abi}.")

                form_target = page
                status_final_abi = "PENDENTE"
                form_ready = False
                for attempt in range(1, 4):
                    if await page.locator("input#numeroProtocolo").count() > 0:
                        form_ready = True
                        break
                    for frame in page.frames:
                        try:
                            if await frame.locator("input#numeroProtocolo").count() > 0:
                                form_target = frame
                                form_ready = True
                                break
                        except: continue
                    if form_ready: break
                    await asyncio.sleep(5)

                if not form_ready:
                    db.add_log(task_id, "ERROR", f"Portal não carregou formulário para ABI {abi}")
                    db.firestore_db.collection('task_files').document(file['id']).update({
                        'status_importacao': 'ERRO',
                        'error_message': 'Timeout do Formulário'
                    })
                    continue

                already_imported = False
                if not force and db.check_abi_already_imported(razao_social, abi):
                    db.add_log(task_id, "INFO", f"⚠️ ABI {abi} já existia. Pulando...")
                    db.firestore_db.collection('task_files').document(file['id']).update({
                        'status_importacao': 'SUCESSO',
                        'error_message': 'Pulado: ABI já existia.'
                    })
                    already_imported = True
                    status_final_abi = "SUCCESS"

                if not already_imported:
                    try:
                        num_processo = file.get('numero_processo', '')
                        dt_recebimento = file.get("data_recebimento_oficio") or file.get("data_registro_transacao", "")
                        dt_prazo = file.get("prazo_resposta_ans", "") or ""
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

                        for sel, val in field_map.items():
                            if not val: continue
                            await form_target.evaluate("""([sel, val]) => {
                                const elements = document.querySelectorAll(sel);
                                const el = elements[0];
                                if (el) {
                                    el.value = val;
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                    return true;
                                }
                                return false;
                            }""", [sel, str(val)])

                        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                            tmp_name = tmp.name
                        
                        if db.download_xml_from_storage(storage_path, tmp_name):
                            file_input = form_target.locator("input[type='file']").first
                            await file_input.set_input_files(tmp_name)
                            await asyncio.sleep(2)
                            
                            # Clique em Importar
                            success_click = await page.evaluate("""() => {
                                const btn = Array.from(document.querySelectorAll('a, button, input[type="submit"]'))
                                    .find(b => b.innerText.includes('IMPORTAR ARQUIVO') || b.value === 'IMPORTAR ARQUIVO');
                                if (btn) { btn.click(); return true; }
                                return false;
                            }""")
                            
                            if success_click:
                                await asyncio.sleep(2)
                                # Lida com modal de confirmação
                                try:
                                    btn_sim = page.locator("button:has-text('Sim'), button:has-text('SIM')").first
                                    if await btn_sim.is_visible(timeout=2000):
                                        await btn_sim.click()
                                except: pass
                                
                                # Aguarda feedback
                                status_final_abi = "ERROR"
                                for _ in range(60):
                                    msg = await page.locator(".alert, .toast, .modal-content").first.inner_text() if await page.locator(".alert, .toast, .modal-content").first.count() > 0 else ""
                                    if any(k in msg.lower() for k in ["sucesso", "importad", "concluíd"]):
                                        status_final_abi = "SUCCESS"
                                        break
                                    if any(k in msg.lower() for k in ["erro", "já cadastrada", "inválid"]):
                                        status_final_abi = "ERROR"
                                        break
                                    await asyncio.sleep(1)
                            
                        if os.path.exists(tmp_name): os.unlink(tmp_name)

                        db.firestore_db.collection('task_files').document(file['id']).update({
                            'status_importacao': 'SUCESSO' if status_final_abi == "SUCCESS" else 'ERRO',
                            'data_processamento': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        })
                    except Exception as fe:
                        db.add_log(task_id, "ERROR", f"Erro na ABI {abi}: {fe}")
                        db.firestore_db.collection('task_files').document(file['id']).update({'status_importacao': 'ERRO'})

                # Feedback e transição
                progress = int(((i + 1) / total) * 100)
                db.firestore_db.collection('tasks').document(task_id).update({'progress': progress})
                await asyncio.sleep(3) # Delay entre envios

            await browser.close()
            db.firestore_db.collection('tasks').document(task_id).update({'status': 'CONCLUIDO'})

    except Exception as e:
        db.add_log(task_id, "ERROR", f"Erro crítico automação: {e}")
        db.firestore_db.collection('tasks').document(task_id).update({'status': 'ERRO'})
