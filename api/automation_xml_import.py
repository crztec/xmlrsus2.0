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
        db.update_task(task_id, {'status': 'EM ANDAMENTO'})
        db.add_log(task_id, "INFO", "Iniciando conexão segura com o portal RSUS.")

        # Busca dados da tarefa
        task_doc = db.get_task(task_id)
        if not task_doc:
            return
        task_data = task_doc
        razao_social = task_data.get('razao_social', '')
        
        # Busca credenciais do settings (não são mais armazenadas na task)
        cred_type = task_data.get('credential_type', 'general')
        creds = db.get_rsus_credentials(cred_type)
        if not creds:
            db.add_log(task_id, "ERROR", f"Credenciais RSUS ({cred_type}) não encontradas no sistema.")
            db.update_task(task_id, {'status': 'ERRO'})
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
            db.update_task(task_id, {'status': 'ERRO'})
            return

        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"

        async with async_playwright() as p:
            browser_args = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
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

            page.set_default_navigation_timeout(90000)
            page.set_default_timeout(90000)

            try:
                page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.accept()))

                db.add_log(task_id, "INFO", "Acessando a página de importação do sistema.")
                await page.goto(url_sistema, wait_until="domcontentloaded", timeout=60000)

                email_field = page.locator("input#email, input#Email").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input#email, input#Email").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break

                await email_field.wait_for(state="visible", timeout=25000)
                db.add_log(task_id, "INFO", "Identificando tela de acesso. Preenchendo login...")

                await email_field.fill(usuario)
                await asyncio.sleep(0.3)

                pwd_field = page.locator("input#password, input#Password").first
                await pwd_field.fill(senha)
                await asyncio.sleep(0.3)

                btn_login = page.locator("#logIn, button[type='submit']").first
                await btn_login.click()
                
                try:
                    await page.wait_for_load_state("networkidle", timeout=15000)
                except: pass

                db.add_log(task_id, "INFO", "Acesso autorizado. Iniciando sessão de trabalho.")

                # Navigate to import page
                url_lista = f"{base_url}/importacao"
                url_sistema_novo = f"{base_url}/importacao/novo"
                
                db.add_log(task_id, "INFO", f"Navegando para {url_lista}...")
                await page.goto(url_lista, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(2)
                
                db.add_log(task_id, "INFO", f"Navegando para {url_sistema_novo}...")
                await page.goto(url_sistema_novo, wait_until="domcontentloaded", timeout=60000)
                
                # Wait for AngularJS SPA to render the form
                try:
                    await page.wait_for_selector("input#numeroProtocolo", state="visible", timeout=30000)
                    db.add_log(task_id, "DEBUG", "Formulário Angular carregado.")
                except:
                    # Try frames
                    for frame in page.frames:
                        try:
                            await frame.wait_for_selector("input#numeroProtocolo", state="visible", timeout=5000)
                            db.add_log(task_id, "DEBUG", "Formulário Angular carregado (via frame).")
                            break
                        except: continue

                db.add_log(task_id, "SUCCESS", "Sistema pronto para processar os arquivos.")

            except Exception as e:
                db.mark_all_task_files_as_error(task_id, f"Falha no portal: {str(e)[:100]}")
                db.update_task(task_id, {'status': 'ERRO'})
                raise e

            files = db.get_files_for_task(task_id)
            total = len(files)

            if force and total > 0:
                try:
                    task_snap = db.get_task(task_id)
                    razao_social_task = task_snap.get('razao_social') if task_snap else None
                    if razao_social_task:
                        abis_to_replace = [f.get('numero_abi') for f in files if f.get('numero_abi')]
                        db.mark_abis_as_substituted(razao_social_task, abis_to_replace)
                        db.add_log(task_id, "INFO", f"🔄 Modo SUBSTITUIÇÃO: {len(abis_to_replace)} ABIs invalidadas.")
                except: pass

            for i, file in enumerate(files):
                # 1. Checa cancelamento via Firestore antes de processar cada arquivo
                try:
                    task_snap = db.get_task(task_id)
                    if task_snap.get('status') == 'cancelled':
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
                    db.update_task_file(file['id'], {
                        'status_importacao': 'ERRO',
                        'error_message': 'Timeout do Formulário'
                    })
                    continue

                already_imported = False
                if not force and db.check_abi_already_imported(razao_social, abi):
                    db.add_log(task_id, "INFO", f"⚠️ ABI {abi} já existia. Pulando...")
                    db.update_task_file(file['id'], {
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
                        if not dt_prazo and dt_recebimento:
                            try:
                                d_obj = db.datetime.strptime(dt_recebimento, "%d/%m/%Y")
                                dt_prazo = (d_obj + db.timedelta(days=35)).strftime("%d/%m/%Y")
                            except:
                                pass
                        
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
                            try:
                                db.add_log(task_id, "DEBUG", f"Preenchendo {sel} = {str(val)[:30]}... URL: {page.url}")
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
                            except Exception as eval_err:
                                db.add_log(task_id, "ERROR", f"Erro preenchendo {sel}: {eval_err}")

                        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                            tmp_name = tmp.name
                        
                        if db.download_xml_from_storage(storage_path, tmp_name):
                            db.add_log(task_id, "DEBUG", f"XML baixado. Fazendo upload do arquivo...")
                            file_input = form_target.locator("input[type='file']").first
                            await file_input.set_input_files(tmp_name)
                            db.add_log(task_id, "DEBUG", "Arquivo selecionado. Aguardando processamento...")
                            await asyncio.sleep(2)
                            
                            # Clique em Importar
                            db.add_log(task_id, "DEBUG", "Clicando em IMPORTAR ARQUIVO...")
                            success_click = False
                            try:
                                btn_importar = form_target.locator("button:has-text('IMPORTAR ARQUIVO'), input[type='submit'][value='IMPORTAR ARQUIVO'], a:has-text('IMPORTAR ARQUIVO')").first
                                if await btn_importar.count() > 0:
                                    await btn_importar.click()
                                    success_click = True
                            except Exception as click_err:
                                db.add_log(task_id, "WARNING", f"Erro ao clicar em IMPORTAR: {click_err}")
                            
                            if success_click:
                                db.add_log(task_id, "DEBUG", "Botão IMPORTAR clicado. Aguardando resposta...")
                                await asyncio.sleep(2)
                                # Lida com modal de confirmação
                                try:
                                    btn_sim = page.locator("button:has-text('Sim'), button:has-text('SIM')").first
                                    if await btn_sim.is_visible(timeout=2000):
                                        await btn_sim.click()
                                        db.add_log(task_id, "DEBUG", "Modal confirmação clicado.")
                                except: pass
                                
                                # Aguarda feedback
                                status_final_abi = "ERROR"
                                for _ in range(60):
                                    try:
                                        feedback_locators = ".alert, .toast, .modal-content, .swal2-title, .swal2-html-container, .toast-message, snack-bar-container, .ui-growl-message, .alert-success"
                                        msg = await page.locator(feedback_locators).first.inner_text() if await page.locator(feedback_locators).first.count() > 0 else ""
                                        body_text = await page.locator("body").inner_text()
                                    except:
                                        msg = ""
                                        body_text = ""
                                        
                                    combined_text = (msg + " " + body_text).lower()
                                    if any(k in combined_text for k in ["operação realizada com sucesso", "sis00010", "importado com sucesso", "arquivo importado"]):
                                        status_final_abi = "SUCCESS"
                                        db.add_log(task_id, "SUCCESS", f"ABI {abi} importada com sucesso!")
                                        break
                                    if any(k in msg.lower() for k in ["erro", "já cadastrada", "inválid"]):
                                        status_final_abi = "ERROR"
                                        db.add_log(task_id, "ERROR", f"Erro portal ABI {abi}: {msg[:100]}")
                                        break
                                    await asyncio.sleep(1)
                            else:
                                db.add_log(task_id, "WARNING", "Botão IMPORTAR ARQUIVO não encontrado.")
                            
                        if os.path.exists(tmp_name): os.unlink(tmp_name)

                        final_status = 'SUCESSO' if status_final_abi == "SUCCESS" else 'ERRO'
                        db.update_task_file(file['id'], {
                            'status_importacao': final_status,
                            'error_message': '' if final_status == 'SUCESSO' else f'Sem confirmação do portal (timeout)',
                            'data_processamento': db.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        })
                        db.add_log(task_id, "INFO" if final_status == 'SUCESSO' else "WARNING", f"ABI {abi}: {final_status}")
                    except Exception as fe:
                        db.add_log(task_id, "ERROR", f"Erro na ABI {abi}: {fe}")
                        db.update_task_file(file['id'], {
                            'status_importacao': 'ERRO',
                            'error_message': str(fe)[:200]
                        })

                # Feedback e transição
                progress = int(((i + 1) / total) * 100)
                db.update_task(task_id, {'progress': progress})
                await asyncio.sleep(3) # Delay entre envios

            await browser.close()
            db.update_task(task_id, {'status': 'CONCLUIDO'})

    except Exception as e:
        db.add_log(task_id, "ERROR", f"Erro crítico automação: {e}")
        db.update_task(task_id, {'status': 'ERRO'})
