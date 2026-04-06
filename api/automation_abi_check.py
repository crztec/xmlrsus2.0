import asyncio
import logging
import time
import base64
from datetime import datetime
from playwright.async_api import async_playwright
import api.database as db
from api.utils import send_whatsapp_alert

logger = logging.getLogger(__name__)

async def sync_to_cubeti_management(client_name, status_gax, mensagem_analise, task_id=None):
    def log_task(msg, level="INFO"):
        full_msg = f"[SYNC CUBETI - {client_name}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg, level)
        if level == "ERROR": logger.error(full_msg)
        else: logger.info(full_msg)

    browser = None
    try:
        async with async_playwright() as p:
            log_task("Iniciando sincronização com gestaocomercial.cubeti.com.br/ABITracker...")
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            
            context = await browser.new_context(ignore_https_errors=True, viewport={"width": 1920, "height": 1080})
            page = await context.new_page()
            
            # Login
            log_task("Realizando login Gestaocomercial...")
            await page.goto("https://gestaocomercial.cubeti.com.br/ABITracker", wait_until="domcontentloaded", timeout=45000)
            
            await page.fill("input#Email, input[type='email']", "victor@cubeti.com.br")
            await page.fill("input#Password, input[type='password']", "Teste.123")
            await page.click("button[type='submit'], input[type='submit']")
            
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except: pass
            
            if "ABITracker" not in page.url:
                await page.goto("https://gestaocomercial.cubeti.com.br/ABITracker", wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(2)
                
            log_task("Buscando operadora na grid...")
            search_input = page.locator("input[type='search']").first
            if await search_input.count() > 0:
                await search_input.fill(client_name)
                await asyncio.sleep(3)
            
            rows = page.locator("table tbody tr")
            count = await rows.count()
            target_row = None
            
            part_name = client_name.split(" ")[0].lower()
            for i in range(count):
                row = rows.nth(i)
                text = await row.inner_text()
                if part_name in text.lower():
                    target_row = row
                    break
                    
            if not target_row:
                log_task("Operadora não encontrada na grid da Cubeti.", "WARNING")
                await browser.close()
                return False
                
            log_task("Operadora localizada!")
            
            # Map status
            target_status = "Nao iniciou"
            if status_gax == "Nao Importado":
                target_status = "Nao iniciou"
            elif status_gax in ["Importado", "Importado, falta analisar", "Pendente"]:
                target_status = "Importou o ABI"
            elif status_gax in ["Importado e Analisado", "Falha na Análise", "Falha"]:
                target_status = "Importou e Analisou"
                
            log_task(f"Atualizando status para '{target_status}'")
            status_select = target_row.locator("select").first
            if await status_select.count() > 0:
                options = status_select.locator("option")
                opt_count = await options.count()
                val_to_select = None
                for i in range(opt_count):
                    opt = options.nth(i)
                    t = await opt.inner_text()
                    if target_status.lower() in t.lower():
                        val_to_select = await opt.get_attribute("value")
                        break
                if val_to_select:
                    await status_select.select_option(val_to_select)
                    await asyncio.sleep(2)
                    log_task(f"Status '{target_status}' selecionado.")
                else:
                    log_task("Opção de status não encontrada.", "WARNING")
            
            log_task("Atualizando registro de contatos (botão + verde)...")
            btn_add = target_row.locator("a.btn-success, button.btn-success, .fa-plus, text='+', :text-is('+')").first
            if await btn_add.count() > 0:
                await btn_add.scroll_into_view_if_needed()
                await btn_add.click(force=True)
                
                # Aguarda modal (AngularJS costuma usar classes padrao ou ids)
                try:
                    await page.wait_for_selector(".modal.in, .modal.show, .modal[style*='block']", timeout=15000)
                    await asyncio.sleep(2)
                except: pass
                
                txt_area = page.locator(".modal textarea, textarea").last
                if await txt_area.count() > 0:
                    await txt_area.fill("") # Clear
                    await txt_area.fill(mensagem_analise)
                else:
                    log_task("Área de texto do modal não encontrada.", "WARNING")
                    
                btn_save = page.locator(".modal button.btn-primary, .modal button:has-text('Salvar'), button:has-text('Salvar')").first
                if await btn_save.count() > 0:
                    await btn_save.click(force=True)
                    await asyncio.sleep(3)
                    log_task("Registro salvo com sucesso.")
                else:
                    log_task("Botão Salvar do modal não encontrado.", "WARNING")
            else:
                log_task("Botão '+' verde não encontrado na linha.", "WARNING")

            await browser.close()
            return True
            
    except Exception as e:
        log_task(f"Erro na sincronização: {str(e)}", "ERROR")
        if browser: await browser.close()
        return False

async def run_abi_check_for_client(client_id, task_id=None, pre_fetched_creds=None, is_batch_run=False):
    """Wrapper para a checagem de ABI para um único cliente."""
    client = db.get_client_config(client_id)
    client_name = client.get('name', client_id) if client else client_id

    active_abi_doc = db.get_active_abi()
    active_abi = active_abi_doc.get('ABI', 'Desconhecido') if active_abi_doc else 'Desconhecido'

    try:
        status, message, snap_url = await _run_abi_check_logic(client_id, active_abi, task_id, pre_fetched_creds)
        db.update_client_abi_status(client_id, active_abi, status, message, task_id, is_batch=is_batch_run)
        
        # Sincroniza status final com Gestaocomercial Cubeti
        await sync_to_cubeti_management(client_name, status, message, task_id)
        
        # Alerta individual de WhatsApp se não for lote
        if not is_batch_run:
            status_emoji = "✅" if status == 'Importado e Analisado' else "⚠️" if "Importado" in status else "❌"
            whatsapp_msg = (
                f"{status_emoji} *GAX RSUS - Checagem de ABI Individual*\n\n"
                f"Operadora: {client_name}\n"
                f"ABI: {active_abi}\n"
                f"Status: {status.upper()}\n\n"
                f"Detalhes: {message}"
            )
            await send_whatsapp_alert(whatsapp_msg, task_id=task_id, target_numbers=["552797629236"])
            
        return status, message, snap_url
    except Exception as e:
        import traceback
        err = f"{type(e).__name__}: {str(e)}"
        logger.error(f"run_abi_check_for_client error: {traceback.format_exc()}")
        db.update_client_abi_status(client_id, active_abi, "Falha", err, task_id, is_batch=is_batch_run)
        if task_id:
            db.add_log(task_id, f"[{client_name}] Erro crítico: {err}", "ERROR")
            
        # Alerta de erro no WhatsApp se não for lote
        if not is_batch_run:
            whatsapp_msg = (
                f"❌ *GAX RSUS - Erro na Checagem de ABI*\n\n"
                f"Operadora: {client_name}\n"
                f"Erro: {err[:500]}"
            )
            await send_whatsapp_alert(whatsapp_msg, task_id=task_id, target_numbers=["552797629236"])
            
        return "Falha", err, None

async def _run_abi_check_logic(client_id, active_abi, task_id=None, pre_fetched_creds=None):
    """
    Lógica interna da checagem de ABI no RSUS (Refatorada com técnicas do API Check).
    """
    client = db.get_client_config(client_id)
    if not client:
        return "Falha", "Cliente não encontrado.", None
        
    url_sistema = client.get('url_sistema')
    client_name = client.get('name', client_id)
    
    import re
    abi_clean = re.sub(r'\D', '', str(active_abi))
    
    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg, level)
        if level == "ERROR": logger.error(full_msg)
        elif level == "WARNING": logger.warning(full_msg)
        elif level == "SUCCESS": logger.info(f"✅ {full_msg}")
        else: logger.info(full_msg)

    def update_progress(percent):
        if task_id:
            try:
                db.update_task(task_id, {"progress_percent": percent})
            except: pass

    if not url_sistema:
        return "Falha", "URL não configurada.", None

    cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"

    browser = None
    try:
        async with async_playwright() as p:
            update_progress(5)
            log_task(f"Iniciando navegador para checar ABI {active_abi}...")
            
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
                "--disable-gpu", "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
                "--disable-web-security", "--allow-running-insecure-content",
                "--ignore-certificate-errors", "--disable-blink-features=AutomationControlled"
            ]

            # Busca credenciais
            if pre_fetched_creds:
                creds = pre_fetched_creds
            else:
                creds = await asyncio.to_thread(db.get_rsus_credentials, cred_type)

            if not creds or not creds.get('username'):
                msg_erro = f"Credenciais '{cred_type}' não encontradas."
                log_task(msg_erro, "ERROR")
                return "Falha", msg_erro, None

            log_task("Credenciais obtidas. Abrindo navegador...")
            browser = await p.chromium.launch(headless=True, args=browser_args)
            update_progress(15)
            log_task("Navegador aberto com sucesso.")

            usuario = creds['username']
            senha = creds['password']

            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                ignore_https_errors=True,
                timezone_id="America/Sao_Paulo",
                locale="pt-BR"
            )
            await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

            page = await context.new_page()
            
            # Bloqueio de assets suavizado
            async def block_assets(route):
                if route.request.resource_type == "media" or "google-analytics" in route.request.url:
                    await route.abort()
                else:
                    await route.continue_()
            
            await page.route("**/*", block_assets)
            
            page.set_default_navigation_timeout(90000)
            page.set_default_timeout(90000)
            
            # Aceita dialogs automaticamente
            page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            
            async def is_cancelled():
                if not task_id: return False
                try:
                    doc = db.firestore_db.collection('tasks').document(task_id).get()
                    if doc.exists and doc.to_dict().get('status') == 'cancelled':
                        log_task("Interrupção solicitada pelo usuário.", "WARNING")
                        return True
                except: pass
                return False

            if await is_cancelled():
                if browser: await browser.close()
                return "Falha", "Tarefa cancelada pelo usuário.", None

            # 1. Login
            try:
                update_progress(25)
                log_task("Realizando login no RSUS...")
                await page.goto(url_sistema, wait_until="commit", timeout=60000)
                
                # Trata modal de alerta inicial
                try:
                    alert = page.locator("#_browseralert, .browseralert").first
                    if await alert.is_visible(timeout=2000):
                        await page.keyboard.press("Escape")
                except: pass
                
                # Localiza campo de login
                email_field = page.locator("input#email, input#Email, input#username, #username, input[name='username']").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input#email, input#Email, input#username, #username, input[name='username']").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break
                
                await email_field.wait_for(state="visible", timeout=25000)
                log_task("Preenchendo credenciais...")
                
                await email_field.click(force=True)
                await email_field.type(usuario, delay=40)
                await asyncio.sleep(0.5)
                
                pwd_field = page.locator("input#password, input#Password, #password, input[type='password']").first
                await pwd_field.click(force=True)
                await pwd_field.type(senha, delay=40)
                await asyncio.sleep(0.5)
                
                btn_login = page.locator("#logIn, button[type='submit']").first
                await btn_login.click(force=True)
                
                # Aguarda desaparecer botão login
                try:
                    await page.wait_for_selector("#logIn, button[type='submit']", state="hidden", timeout=15000)
                except: pass
                
                # Estabilização pós-login
                update_progress(45)
                log_task("Aguardando carregamento da interface...")
                try:
                    await page.wait_for_selector(".navbar, .main-sidebar, .content-header, #wrapper", timeout=60000)
                except:
                    # Tenta forçar salto se estiver preso
                    await page.goto(url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema, wait_until="commit", timeout=30000)
                    await asyncio.sleep(2)
                
                # Verificação de cookies de sessão
                cookies = await context.cookies()
                has_session = any('.ASPXAUTH' in c['name'] or 'Identity' in c['name'] or 'ASP.NET_SessionId' in c['name'] for c in cookies)
                if not has_session:
                    log_task("Sessão não detectada nos cookies. Continuando com cautela...", "WARNING")

            except Exception as e:
                log_task(f"Erro no login: {str(e)}", "ERROR")
                if browser: await browser.close()
                return "Falha", f"Falha no login: {str(e)[:500]}", None

            # 2. Navegação para Importações
            update_progress(60)
            log_task("Navegando para 'Importações'...")
            base_url = url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema.rsplit('/', 1)[0]
            import_url = f"{base_url.rstrip('/')}/importacao"
            await page.goto(import_url, wait_until="domcontentloaded", timeout=45000)
            
            log_task(f"Buscando ABI {active_abi} na grid...")
            # Aguarda a table carregar e o texto do ABI aparecer em qualquer célula (ajuda no loading assíncrono)
            try:
                # O abi_clean já foi definido no início da função
                await page.wait_for_selector(f"table td:has-text('{active_abi}'), table td:has-text('{abi_clean}')", timeout=35000)
            except:
                pass # Silenciando aviso genérico para unificar adiante
            
            # Varredura manual de linhas para garantir detecção correta na primeira coluna
            rows = page.locator("table tbody tr")
            count = await rows.count()
            target_row = None
            
            # log_task(f"Analisando {count} linhas da grid...")
            for i in range(count):
                row = rows.nth(i)
                first_cell = row.locator("td").first
                if await first_cell.count() > 0:
                    cell_text = (await first_cell.inner_text()).strip()
                    # log_task(f"Linha {i+1}: Texto lido = '{cell_text}'")
                    
                    # Comparações flexíveis
                    cell_clean = cell_text.replace('º', '').strip()
                    
                    # Se falhar a comparação direta, tentamos extrair apenas números
                    import re
                    cell_numbers = "".join(re.findall(r'\d+', cell_text))
                    abi_numbers = "".join(re.findall(r'\d+', active_abi))
                    
                    if active_abi == cell_text or abi_clean == cell_clean or active_abi in cell_text or (abi_numbers and cell_numbers == abi_numbers):
                        target_row = row
                        # log_task(f"SUCESSO: ABI {active_abi} localizado na linha {i+1}!")
                        break
            
            if not target_row:
                log_task(f"Aviso: ABI atual ainda nao importado no RSUS.", "WARNING")
                if browser: await browser.close()
                return "Nao Importado", "ABI atual ainda nao importado no RSUS.", None

            # Obtém status direto da segunda coluna (Status Arquivo)
            status_cell = target_row.locator("td").nth(1)
            status_text = (await status_cell.inner_text()).strip()
            
            if status_text != "Importado":
                log_task(f"ABI {active_abi} encontrado com status: {status_text}", "INFO")
                if browser: await browser.close()
                return "Pendente", f"Status: {status_text}", None

            # 3. Ver Logs de Análise
            update_progress(85)
            log_task("ABI Importado. Abrindo menu de ações...")
            hamburger = target_row.locator("td").last.locator("button, a, .fa-bars").first
            await hamburger.click(force=True)
            await asyncio.sleep(1.5)
            
            log_task("Clicando em 'Logs Análise'...")
            logs_btn = page.locator(".dropdown-menu a:has-text('Logs Análise'), a:has-text('Logs Análise')").first
            
            # Verifica se o botão existe e é visível rapidamente
            try:
                # Se não aparecer em 5s após clicar no hambúrguer, provavelmente não existe para este cliente
                await logs_btn.wait_for(state="visible", timeout=7000)
                await logs_btn.click(force=True, timeout=5000)
            except:
                log_task(f"Aviso: Cliente nao realiza análise ou opção indisponível.", "WARNING")
                if browser: await browser.close()
                return "Importado", "Cliente nao realiza análise.", None
            
            log_task("Aguardando carregamento da tabela de logs...")
            try:
                # Aguarda a tabela ter pelo menos uma linha
                await page.wait_for_selector("table tbody tr", timeout=45000)
                
                # Aguarda o conteúdo estabilizar (evita 'Carregando...' ou grid vazia momentânea)
                for _ in range(15):
                    first_row = page.locator("table tbody tr").first
                    first_text = (await first_row.inner_text()).strip()
                    if first_text and "carregando" not in first_text.lower():
                        break
                    await asyncio.sleep(1)
            except:
                log_task("Aviso: Tempo esgotado aguardando linhas na tabela de logs.", "WARNING")
            
            # Analisa as primeiras linhas para encontrar Sucesso ou Falha
            log_rows = page.locator("table tbody tr")
            rows_to_check = await log_rows.count()
            rows_to_check = min(rows_to_check, 3) # Verifica as 3 primeiras para segurança
            
            found_result = False
            for r_idx in range(rows_to_check):
                row = log_rows.nth(r_idx)
                cells = row.locator("td")
                cell_count = await cells.count()
                
                if cell_count >= 7:
                    abi_val = (await cells.nth(0).inner_text()).strip()
                    result_text = (await cells.nth(6).inner_text()).strip()
                    
                    if "Sucesso" in result_text:
                        update_progress(100)
                        log_task(f"Sucesso detectado na análise do ABI {abi_val}", "SUCCESS")
                        await browser.close()
                        return "Importado e Analisado", f"ABI {abi_val}: Sucesso", None
                    
                    if "Falha" in result_text or "Erro" in result_text:
                        log_task(f"Falha detectada. Iniciando Deep Dive (Detalhes da Análise)...", "INFO")
                        try:
                            # 1. Clicar no menu hambúrguer desta linha
                            h_btn = row.locator("td").last.locator("button, a, .fa-bars").first
                            await h_btn.click(force=True)
                            await asyncio.sleep(1)
                            
                            # 2. Clicar em Detalhes da Análise
                            detalhes_btn = page.locator(".dropdown-menu a:has-text('Detalhes')").first
                            await detalhes_btn.click(force=True)
                            
                            # 3. Aguardar modal abrir content
                            await page.wait_for_selector(".modal.in, .modal.show, .modal[style*='block']", timeout=15000)
                            await asyncio.sleep(3)
                            
                            # 4. Selecionar '100' registros por página no modal
                            select_qtd = page.locator(".modal select").first
                            if await select_qtd.count() > 0:
                                await select_qtd.scroll_into_view_if_needed()
                                await select_qtd.select_option("100")
                                await asyncio.sleep(3)
                                
                            # 5. Ler mensagens e procurar por "Sucesso - Parcial"
                            msgs = await page.evaluate('''() => {
                                const modal = document.querySelector('.modal.in, .modal.show, .modal[style*="block"], .modal-content');
                                if (!modal) return [];
                                const rows = modal.querySelectorAll('table tbody tr');
                                return Array.from(rows).map(r => r.innerText || r.textContent);
                            }''')
                            
                            # Fechar modal
                            close_btn = page.locator(".modal button.close, .modal [data-dismiss='modal']").first
                            if await close_btn.count() > 0:
                                await close_btn.click()
                                await asyncio.sleep(1)
                                
                            has_partial = any("Análise Sucesso - Parcial" in m or "Analise Sucesso - Parcial" in m for m in msgs)
                            
                            if has_partial:
                                update_progress(100)
                                log_task(f"Deep Dive: Encontrado Sucesso Parcial no ABI {abi_val}", "SUCCESS")
                                await browser.close()
                                return "Importado e Analisado", "Análise Sucesso - Parcial", None
                            else:
                                log_task(f"Deep Dive: Nenhum Sucesso Parcial, mantendo Erro.", "ERROR")
                                await browser.close()
                                return "Falha na Análise", "Erro na análise", None
                                
                        except Exception as deep_e:
                            log_task(f"Aviso no Deep Dive: {str(deep_e)[:100]}", "WARNING")
                            log_task(f"Falha detectada na análise do ABI {abi_val}.", "ERROR")
                            await browser.close()
                            return "Falha na Análise", f"ABI {abi_val}: Erro", None
                else:
                    # Fallback para estrutura inesperada
                    log_text = (await row.inner_text()).strip()
                    if "Sucesso" in log_text:
                        update_progress(100)
                        log_task(f"Sucesso detectado na análise (fallback)", "SUCCESS")
                        await browser.close()
                        return "Importado e Analisado", "Análise concluída com sucesso.", None
                    
                    if "Falha" in log_text or "Erro" in log_text:
                        log_task(f"Falha detectada na análise (fallback): {log_text[:50]}.", "ERROR")
                        await browser.close()
                        return "Falha na Análise", f"Erro: {log_text[:50]}", None
            
            # Se chegou aqui, não achou Sucesso nem Falha explícita nas primeiras linhas
            log_task("Resultado final da análise não localizado (falta processar?).", "WARNING")
            await browser.close()
            return "Importado, falta analisar", "Arquivo importado, análise não concluída ou não localizada.", None

    except Exception as e:
        import traceback
        err_trace = traceback.format_exc()
        err_msg = f"{type(e).__name__}: {str(e)}" if str(e) else type(e).__name__
        log_task(f"Erro técnico: {err_msg}", "ERROR")
        log_task(f"Traceback: {err_trace[-400:]}", "ERROR")
        logger.error(f"ABI CHECK TRACEBACK:\n{err_trace}")
        if browser:
            try: await browser.close()
            except: pass
        return "Falha", f"Erro: {err_msg}", None

async def run_batch_abi_check(task_id, client_ids=None):
    """Executa a checagem de ABI para todos ou alguns clientes específicos."""
    try:
        if client_ids:
            all_clients = db.get_all_clients()
            clients = [c for c in all_clients if c['id'] in client_ids]
        else:
            clients = db.get_all_clients()
            
        total = len(clients)
        
        db.update_task(task_id, {"total": total, "current": 0, "status": "running"})
        db.add_log(task_id, f"🚀 Iniciando checagem de ABI em LOTE para {total} operadoras...")

        # Cache de credenciais
        creds_general = db.get_rsus_credentials('general')
        creds_vitoria = db.get_rsus_credentials('unimed_vitoria')

        for i, client in enumerate(clients):
            # Check cancelamento
            task_doc = db.firestore_db.collection('tasks').document(task_id).get()
            if task_doc.exists and task_doc.to_dict().get('status') == 'cancelled':
                db.add_log(task_id, "⏹️ Processamento interrompido pelo usuário.", "WARNING")
                break

            client_name = client.get('name', 'Desconhecido')
            db.update_task(task_id, {"current": i + 1, "current_client": client_name})
            
            target_creds = creds_vitoria if "vitoria" in client.get('url_sistema', '').lower() else creds_general
            
            await run_abi_check_for_client(client['id'], task_id=task_id, pre_fetched_creds=target_creds, is_batch_run=True)

        db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
        db.add_log(task_id, "Checagem de ABI em lote finalizada.")
        
        # Alerta WhatsApp (opcional, mas bom manter o padrão)
        stats = db.get_abi_dashboard_stats()
        msg = f"📊 *GAX RSUS - Relatório de ABIs*\n\nProcessamento finalizado!\n✅ Analisados: {stats['imported_analyzed']}\n⚠️ Falta Analisar: {stats['imported_not_analyzed']}\n❌ Falhas: {stats['failure']}"
        await send_whatsapp_alert(msg, task_id=task_id, target_numbers=["552797629236"])

    except Exception as e:
        db.add_log(task_id, f"Erro estrutural no lote: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})

async def run_single_abi_check(client_id, task_id):
    """Executa a checagem individual para um cliente."""
    try:
        client = db.get_client_config(client_id)
        db.update_task(task_id, {"total": 1, "current": 0, "status": "running", "current_client": client.get('name')})
        db.add_log(task_id, f"🔍 Iniciando checagem INDIVIDUAL para: {client.get('name')}...")
        
        await run_abi_check_for_client(client_id, task_id=task_id)
        
        db.update_task(task_id, {"status": "completed", "current": 1, "current_client": "Finalizado"})
    except Exception as e:
        db.add_log(task_id, f"Erro: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})
