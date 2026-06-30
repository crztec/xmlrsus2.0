import sys
import asyncio
import logging
import time
import base64
from datetime import datetime
import re
from playwright.async_api import async_playwright
import api.database as db
from api.utils import send_whatsapp_alert, launch_browser_robust

logger = logging.getLogger(__name__)

async def sync_to_cubeti_management(client_name, status_gax, mensagem_analise, task_id=None):
    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] [SYNC CUBETI] {msg}"
        if task_id:
            db.add_log(task_id, full_msg, level)
        if level == "ERROR": logger.error(full_msg)
        else: logger.info(full_msg)

    async def is_cancelled():
        if not task_id: return False
        try:
            task = db.get_task(task_id)
            if not task: return False
            st = str(task.get('status', '')).upper()
            if st in ['STOPPED', 'CANCELLED']:
                log_task("Interrupção solicitada pelo usuário.", "WARNING")
                return True
        except: pass
        return False

    browser = None
    try:
        def log_task(msg, level="INFO"):
            if not task_id: return
            db.add_log(task_id, f"[{client_name}] [SYNC CUBETI] {msg}", level)

        log_task("Iniciando sincronização com Gestão Comercial CubeTI...")
        
        # Inicia Playwrighth Avançado + Flags de Sandbox
        browser_args = [
            "--no-sandbox", 
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled"
        ]
        
        if await is_cancelled(): return False

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=browser_args)
            
            if await is_cancelled(): 
                await browser.close()
                return False

            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                ignore_https_errors=True, 
                viewport={"width": 1920, "height": 1080}
            )
            # Desativa navigator.webdriver
            await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            page = await context.new_page()
            
            # Login com Navegação Defensiva (ERR_ABORTED Mitigation)
            log_task("Realizando login Gestaocomercial...")
            if await is_cancelled(): return False
            try:
                await page.goto("https://gestaocomercial.cubeti.com.br/ABITracker", wait_until="domcontentloaded", timeout=60000)
            except Exception as e_nav:
                log_task(f"Aviso de navegação inicial (CubeTI): {str(e_nav)}. Verificando se chegou na página...", "WARNING")
                await asyncio.sleep(2)
            
            if await is_cancelled(): return False
            cubeti_creds = db.get_cubeti_credentials()
            cub_email = cubeti_creds.get("email", "")
            cub_pass = cubeti_creds.get("password", "")
            if not cub_email or not cub_pass:
                log_task("Credenciais CubeTI não configuradas. Configure em Controle de Acessos.", "WARNING")
                await browser.close()
                return False
            await page.fill("input#Email, input[type='email']", cub_email)
            await page.fill("input#Password, input[type='password']", cub_pass)
            await page.click("button[type='submit'], input[type='submit']")
            
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except: pass
            
            if await is_cancelled(): return False
            if "ABITracker" not in page.url:
                try:
                    await page.goto("https://gestaocomercial.cubeti.com.br/ABITracker", wait_until="domcontentloaded", timeout=60000)
                except: pass
                await asyncio.sleep(2)
                
            # Busca operadora específica (Isolamento de Grid)
            search_input = page.locator("input[placeholder*='Buscar cliente'], input[placeholder*='Pesquisar'], .k-textbox input, .k-input-inner").first
            
            async def try_search(name_to_search, quiet=False):
                if await search_input.count() > 0:
                    if not quiet:
                        log_task(f"Pesquisando por '{name_to_search}' no Gestão Comercial CubeTI...", "INFO")
                    await search_input.click()
                    await search_input.fill("")
                    await asyncio.sleep(0.5)
                    await search_input.type(name_to_search, delay=50)
                    await asyncio.sleep(1)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(5) 
                
                rows = page.locator("table tbody tr")
                count = await rows.count()
                for i in range(count):
                    row = rows.nth(i)
                    text = await row.inner_text()
                    if name_to_search.lower() in " ".join(text.split()).lower():
                        return row
                return page.locator("NON_EXISTENT_ELEMENT")

            target_row = await try_search(client_name)
            
            if await target_row.count() == 0:
                import unicodedata
                search_name = "".join(c for c in unicodedata.normalize('NFD', client_name) if unicodedata.category(c) != 'Mn')
                if search_name != client_name:
                    log_task(f"Tentando sem acento: '{search_name}'", "WARNING")
                    target_row = await try_search(search_name)

            if await target_row.count() == 0:
                skip_words = {'unimed', 'de', 'da', 'do', 'dos', 'das', 'e', 'em', 'a', 'o', 'sa', 'ltda', 'me'}
                parts = [p for p in client_name.split() if len(p) > 3 and p.lower() not in skip_words]
                for part in parts:
                    log_task(f"Tentando busca parcial por '{part}'...", "WARNING")
                    target_row = await try_search(part)
                    if await target_row.count() > 0:
                        break

            if await target_row.count() == 0:
                log_task("Operadora não encontrada na grid da Cubeti após várias tentativas.", "WARNING")
                await browser.close()
                return False
                
            target_status = status_gax
            log_task(f"Operadora localizada! Registrando Contato e Atualizando status para '{target_status}'")
            
            # --- INTELIGÊNCIA DE SINCRONIZAÇÃO (Ler estado atual para evitar redundância) ---
            current_row_data = await target_row.evaluate("""(row) => {
                const cells = Array.from(row.querySelectorAll('td'));
                return {
                    status: cells[2] ? cells[2].innerText.trim() : "",
                    andamento: cells[5] ? cells[5].innerText.trim() : ""
                };
            }""")
            current_status = current_row_data.get('status', '')
            current_andamento = current_row_data.get('andamento', '')
            log_task(f"Estado atual no CubeTI: Status='{current_status}', Último Andamento='{current_andamento}'", "DEBUG")

            # --- DECISÃO: REGISTRAR CONTATO ---
            msg_to_check = mensagem_analise if mensagem_analise else target_status
            skip_contact = False
            if msg_to_check.lower() in current_andamento.lower():
                log_task(f"Contato '{msg_to_check}' já registrado no CubeTI. Pulando registro (+).", "DEBUG")
                skip_contact = True
            
            if not skip_contact:
                possible_btn_selectors = [
                    "button[title*='Registrar']",
                    "a[title*='Registrar']",
                    "button[data-original-title*='Registrar']",
                    "a[data-original-title*='Registrar']",
                    "a.btn-success i.fa-plus",
                    "button.btn-success i.fa-plus",
                    ".btn-success"
                ]
                
                btn_add = None
                for btn_sel in possible_btn_selectors:
                    try:
                        sel = f"tr:has-text('{client_name}') {btn_sel}"
                        btn_add = page.locator(sel).first
                        if await btn_add.count() > 0 and await btn_add.is_visible():
                            break
                    except: pass

                if not btn_add or await btn_add.count() == 0 or not await btn_add.is_visible():
                    for btn_sel in possible_btn_selectors:
                        try:
                            btn_add = page.locator(btn_sel).filter(visible=True).first
                            if await btn_add.count() > 0:
                                break
                        except: pass
                
                if btn_add and await btn_add.count() > 0:
                    await btn_add.click(force=True)
                    await asyncio.sleep(2)
                    modal_area = page.locator("[role='dialog'], .modal-content, [role='document']").first
                    if await modal_area.count() == 0: modal_area = page.locator("body")
                        
                    textbox = modal_area.locator("textarea, input:not([type='hidden']):not([type='checkbox']):not([type='radio'])").filter(visible=True).first
                    if await textbox.count() > 0:
                        await textbox.fill("")
                        if mensagem_analise: await textbox.fill(mensagem_analise)
                        else: await textbox.fill(target_status)
                        await asyncio.sleep(1)

                    save_btn = page.locator("button:has-text('Salvar'), button:has-text('Confirmar'), .btn-primary, button[type='submit']").filter(visible=True).first
                    if await save_btn.count() > 0:
                        await save_btn.click()
                        await asyncio.sleep(2)
                    log_task("Registro de contato processado.", "DEBUG")

            # --- DECISÃO: ATUALIZAR STATUS ---
            workflow_order = ["Não iniciou", "Importou o ABI", "Importou e Analisou", "Impugnando o ABI", "Finalizou o ABI"]
            
            def get_rank(s):
                for idx, val in enumerate(workflow_order):
                    if val.lower() in s.lower(): return idx
                return -1

            target_rank = get_rank(target_status)
            current_rank = get_rank(current_status)

            if current_rank >= target_rank and target_rank != -1:
                log_task(f"Status atual '{current_status}' já atende ou supera '{target_status}'. Pulando alteração de status.", "DEBUG")
                target_status = None
            
            if target_status:
                target_row = await try_search(client_name, quiet=True)
                log_task(f"Atualizando status para '{target_status}'", "DEBUG")
                status_trigger = target_row.locator("button, [role='combobox'], .cursor-pointer, span.inline-flex, span[aria-haspopup='dialog'], .k-dropdown, .k-dropdown-wrap").filter(
                    has_text=re.compile(r"Não iniciou|Importou|Impugnando|Impugnado|Finalizou|Agendou|Erro|Analisou", re.IGNORECASE)
                ).first
                
                if await status_trigger.count() > 0:
                    await status_trigger.scroll_into_view_if_needed()
                    await status_trigger.dispatch_event("mousedown")
                    await status_trigger.click(force=True)
                    await asyncio.sleep(2)
                    
                    option_regex = re.compile(rf"^\s*{re.escape(target_status)}\s*$", re.I)
                    option = page.locator("button, a, li, [role='menuitem'], [role='option'], .dropdown-item").filter(has_text=option_regex).filter(visible=True).first
                    
                    if await option.count() > 0:
                        await option.click()
                        log_task(f"Status '{target_status}' selecionado com sucesso.", "DEBUG")
                        await asyncio.sleep(2)
                    else:
                        option_fallback = page.locator(f"button:has-text('{target_status}'), a:has-text('{target_status}'), li:has-text('{target_status}')").filter(visible=True).first
                        if await option_fallback.count() > 0:
                            await option_fallback.click()
                            log_task(f"Status '{target_status}' selecionado via fallback.", "DEBUG")
                        else:
                            await page.keyboard.press("ArrowDown")
                            await asyncio.sleep(1)
                            await page.keyboard.press("Enter")
            await browser.close()
            log_task("Sincronização com CubeTI concluída com sucesso!", "SUCCESS")
            return True
            
    except Exception as e:
        log_task(f"Erro na sincronização: {str(e)}", "ERROR")
        if browser: await browser.close()
        return False

async def run_abi_check_for_client(client_id, task_id=None, pre_fetched_creds=None, is_batch_run=False, force_sync=False):
    client = db.get_client_config(client_id)
    client_name = client.get('name', client_id) if client else client_id
    active_abi_doc = db.get_active_abi()
    active_abi = active_abi_doc.get('ABI', 'Desconhecido') if active_abi_doc else 'Desconhecido'
    old_status = client.get('abi_status')
    try:
        status, message, snap_url = await _run_abi_check_logic(client_id, active_abi, task_id, pre_fetched_creds)
        db.update_client_abi_status(client_id, active_abi, status, message, task_id, is_batch=is_batch_run)
        if task_id:
            db.add_log(task_id, f"[{client_name}] ABI {active_abi} verificado no RSUS: {status}")
        old_abi = client.get('abi_current')
        is_new_abi = False
        if old_abi:
            import re
            old_abi_digits = re.sub(r'\D', '', str(old_abi))
            new_abi_digits = re.sub(r'\D', '', str(active_abi))
            if old_abi_digits and new_abi_digits and old_abi_digits != new_abi_digits:
                is_new_abi = True
        technical_keywords = ['timeout', 'erro técnico', 'syntaxerror', 'page.evaluate', 'cancelado', 'falha no login', 'navegação', 'error:']
        is_technical_error = status == 'Falha' and any(kw in message.lower() for kw in technical_keywords)
        if (status != old_status or is_new_abi or force_sync) and not is_technical_error:
            await sync_to_cubeti_management(client_name, status, message, task_id)
            if task_id:
                reason = "mudança de ABI" if is_new_abi else ("execução manual" if force_sync else f"alterado de '{old_status}' para '{status}'")
                db.add_log(task_id, f"[{client_name}] ABI status {reason}. Sincronizando CubeTI...", "DEBUG")
        else:
            reason = "erro técnico (sync pulada)" if is_technical_error else "status mantido"
            if task_id:
                db.add_log(task_id, f"[{client_name}] ABI status '{status}' ({reason}). Sincronização CubeTI pulada.", "DEBUG")
        if not is_batch_run:
            status_emoji = "✅" if status == 'Importado e Analisado' else "⚠️" if "Importado" in status else "❌"
            whatsapp_msg = (
                f"{status_emoji} *GAX RSUS - Checagem de ABI Individual*\n\n"
                f"Operadora: {client_name}\n"
                f"ABI: {active_abi}\n"
                f"Status: {status.upper()}\n\n"
                f"Detalhes: {message}"
            )
            await send_whatsapp_alert(whatsapp_msg, task_id=task_id)
        return status, message, snap_url
    except Exception as e:
        import traceback
        err = f"{type(e).__name__}: {str(e)}"
        logger.error(f"run_abi_check_for_client error: {traceback.format_exc()}")
        db.update_client_abi_status(client_id, active_abi, "Falha", err, task_id, is_batch=is_batch_run)
        if task_id:
            db.add_log(task_id, f"[{client_name}] Erro crítico: {err}", "ERROR")
        if not is_batch_run:
            whatsapp_msg = (
                f"❌ *GAX RSUS - Erro na Checagem de ABI*\n\n"
                f"Operadora: {client_name}\n"
                f"Erro: {err[:500]}"
            )
            await send_whatsapp_alert(whatsapp_msg, task_id=task_id)
        return "Falha", err, None

async def is_task_stopped(task_id):
    if not task_id: return False
    try:
        task = db.get_task(task_id)
        if not task:
            status = str(db.get_task_status_only(task_id)).upper() if hasattr(db, 'get_task_status_only') else 'RUNNING'
            return status in ['STOPPED', 'CANCELLED']
        return str(task.get('status', '')).upper() in ['STOPPED', 'CANCELLED']
    except:
        return False

async def _run_abi_check_logic(client_id, active_abi, task_id=None, pre_fetched_creds=None):
    client = db.get_client_config(client_id)
    if not client: return "Falha", "Cliente não encontrado.", None
    url_sistema = client.get('url_sistema')
    client_name = client.get('name', client_id)
    import re
    abi_clean = re.sub(r'\D', '', str(active_abi))
    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] {msg}"
        if task_id: db.add_log(task_id, full_msg, level)
        if level == "ERROR": logger.error(full_msg)
        elif level == "WARNING": logger.warning(full_msg)
        elif level == "SUCCESS": logger.info(f"✅ {full_msg}")
        else: logger.info(full_msg)
    def update_progress(percent):
        if task_id:
            try:
                task = db.get_task(task_id)
                if task:
                    t_total = task.get('total', 0)
                    if t_total > 1:
                        t_curr = task.get('current', 1) - 1
                        t_curr = max(0, t_curr)
                        scaled = int(((t_curr + (percent / 100)) / t_total) * 100)
                        db.update_task(task_id, {"progress_percent": scaled})
                    else: db.update_task(task_id, {"progress_percent": percent})
                else: db.update_task(task_id, {"progress_percent": percent})
            except: pass
    if not url_sistema: return "Falha", "URL não configurada.", None
    cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"
    if await is_task_stopped(task_id): return "Falha", "Tarefa parada pelo usuário.", None
    browser = None
    try:
        async with async_playwright() as p:
            update_progress(5)
            log_task(f"Verificando ABI {active_abi} no portal RSUS...")
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-setuid-sandbox", 
                "--disable-dev-shm-usage",
                "--disable-gpu", "--single-process", "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,dbus",
                "--disable-web-security", "--allow-running-insecure-content",
                "--ignore-certificate-errors", "--disable-blink-features=AutomationControlled",
                "--disable-software-rasterizer"
            ]
            if pre_fetched_creds: creds = pre_fetched_creds
            else: creds = await asyncio.to_thread(db.get_rsus_credentials, cred_type)
            if not creds or not creds.get('username'):
                msg_erro = f"Credenciais '{cred_type}' não encontradas."
                log_task(msg_erro, "ERROR")
                return "Falha", msg_erro, None
            log_task("Credenciais obtidas. Abrindo navegador...", "DEBUG")
            browser = await launch_browser_robust(p, browser_args, task_id=task_id)
            update_progress(15)
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
            async def block_assets(route):
                if route.request.resource_type == "media" or "google-analytics" in route.request.url:
                    await route.abort()
                else: await route.continue_()
            await page.route("**/*", block_assets)
            page.set_default_navigation_timeout(90000)
            page.set_default_timeout(90000)
            page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            async def is_cancelled():
                if not task_id: return False
                try:
                    task = db.get_task(task_id)
                    if not task: return False
                    st = str(task.get('status', '')).upper()
                    if st in ['STOPPED', 'CANCELLED']:
                        log_task("⏹️ Interrupção solicitada pelo usuário.", "WARNING")
                        return True
                except: pass
                return False
            if await is_cancelled():
                if browser: await browser.close()
                return "Falha", "Tarefa cancelada pelo usuário.", None
            try:
                update_progress(25)
                await page.goto(url_sistema, wait_until="commit", timeout=60000)
                try:
                    alert = page.locator("#_browseralert, .browseralert").first
                    if await alert.is_visible(timeout=2000): await page.keyboard.press("Escape")
                except: pass
                email_field = page.locator("input[type='email'], input[name*='mail'], input#email, input#Email, input#username, #username, input[name='username']").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input[type='email'], input[name*='mail'], input#email, input#Email, input#username, #username, input[name='username']").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break
                await email_field.wait_for(state="visible", timeout=25000)
                await email_field.click(force=True)
                await email_field.type(usuario, delay=40)
                await asyncio.sleep(0.5)
                pwd_field = page.locator("input#password, input#Password, #password, input[type='password']").first
                await pwd_field.click(force=True)
                await pwd_field.type(senha, delay=40)
                await asyncio.sleep(0.5)
                btn_login = page.locator("#logIn, button[type='submit']").first
                await btn_login.click(force=True)
                try:
                    await page.wait_for_selector("#logIn, button[type='submit']", state="hidden", timeout=15000)
                except: pass
                if await is_cancelled():
                    if browser: await browser.close()
                    return "Falha", "Tarefa cancelada pelo usuário.", None
                update_progress(45)
                try:
                    await page.wait_for_selector(".navbar, .main-sidebar, .content-header, #wrapper", timeout=60000)
                except:
                    if await is_cancelled(): 
                        await browser.close()
                        return "Falha", "Cancelado", None
                    await page.goto(url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema, wait_until="commit", timeout=30000)
                    await asyncio.sleep(2)
            except Exception as e:
                log_task(f"Erro no login: {str(e)}", "ERROR")
                if browser: await browser.close()
                return "Falha", f"Falha no login: {str(e)[:500]}", None
            update_progress(60)
            base_url = url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema.rsplit('/', 1)[0]
            import_url = f"{base_url.rstrip('/')}/importacao"
            await page.goto(import_url, wait_until="domcontentloaded", timeout=45000)
            try:
                await page.wait_for_selector(f"table td:has-text('{active_abi}'), table td:has-text('{abi_clean}')", timeout=35000)
            except: pass
            grid_data = await page.evaluate("""() => {
                const rows = document.querySelectorAll('table tbody tr');
                return Array.from(rows).map(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    const links = Array.from(row.querySelectorAll('a'));
                    const logsLink = links.find(a => 
                        a.innerText.includes('Logs Análise') || 
                        (a.getAttribute('href') && a.getAttribute('href').includes('log-analise'))
                    );
                    return {
                        cellCount: cells.length,
                        firstCell: cells[0] ? cells[0].innerText.trim() : '',
                        secondCell: cells[1] ? cells[1].innerText.trim() : '',
                        fullText: row.innerText.trim(),
                        logsHref: logsLink ? logsLink.getAttribute('href') : null
                    };
                });
            }""")
            target_row_index = -1
            abi_numbers = "".join(re.findall(r'\\d+', active_abi))
            for idx, row_data in enumerate(grid_data):
                cell_text = row_data['firstCell']
                if not cell_text: continue
                cell_clean = cell_text.replace('º', '').strip()
                cell_numbers = "".join(re.findall(r'\\d+', cell_text))
                if active_abi == cell_text or abi_clean == cell_clean or active_abi in cell_text or (abi_numbers and cell_numbers == abi_numbers):
                    target_row_index = idx
                    break
            if target_row_index == -1:
                if browser: await browser.close()
                return "Nao Importado", "ABI atual ainda não importado no RSUS.", None
            status_text = grid_data[target_row_index]['secondCell']
            target_row = page.locator("table tbody tr").nth(target_row_index)
            if status_text != "Importado":
                if browser: await browser.close()
                return "Pendente", f"Status: {status_text}", None
            if await is_cancelled():
                if browser: await browser.close()
                return "Falha", "Cancelado", None
            hamburger = target_row.locator("td").last.locator("button, a, .fa-bars").first
            await hamburger.click(force=True)
            await asyncio.sleep(1.5)
            logs_btn = page.locator(".dropdown-menu a:has-text('Logs Análise'), a:has-text('Logs Análise')").first
            try:
                await logs_btn.wait_for(state="attached", timeout=7000)
                await logs_btn.scroll_into_view_if_needed()
                await asyncio.sleep(0.3)
                await logs_btn.click(timeout=5000)
            except:
                if browser: await browser.close()
                return "Importado e Analisado", "Cliente não realiza análise no portal.", None
            try: await page.wait_for_url("**/log-analise/**", timeout=20000)
            except: await asyncio.sleep(4)
            try: await page.wait_for_load_state("domcontentloaded", timeout=15000)
            except: pass
            try:
                await page.wait_for_selector("table tbody tr", timeout=45000)
                await asyncio.sleep(2)
            except: pass
            analysis_data = await page.evaluate("""() => {
                const rows = document.querySelectorAll('table tbody tr');
                return Array.from(rows).map(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    return {
                        cellCount: cells.length,
                        abi: cells[0] ? cells[0].innerText.trim() : '',
                        resultado: cells.length >= 7 ? cells[6].innerText.trim() : '',
                        fullText: row.innerText.trim()
                    };
                });
            }""")
            abi_matched_any_row = False
            target_abi_numbers = re.sub(r'\D', '', str(active_abi))
            for r_idx, row_data in enumerate(analysis_data):
                if row_data['cellCount'] >= 7:
                    abi_row_clean = re.sub(r'\D', '', row_data['abi'])
                    if abi_row_clean != target_abi_numbers: continue
                    abi_matched_any_row = True
                    result_text = row_data['resultado']
                    row_lower = row_data['fullText'].lower()
                    if re.search(r'\bsucesso\b', row_lower):
                        update_progress(100)
                        await browser.close()
                        return "Importado e Analisado", "Análise feita com sucesso.", None
                    if re.search(r'\b(falha|erro)\b', row_lower):
                        row = page.locator("table tbody tr").nth(r_idx)
                        try:
                            menu_btn = row.locator("button").filter(has_text=re.compile(r"Detalhes d. Análise", re.I)).first
                            if await menu_btn.count() == 0: menu_btn = row.locator("button.btn-default, .fa-bars, i.fa-bars").first
                            await menu_btn.scroll_into_view_if_needed()
                            await menu_btn.click(force=True)
                            try:
                                await page.wait_for_selector(".modal-content:has-text('Detalhes'), .modal-content:has-text('ATENDIMENTOS')", state="visible", timeout=12000)
                            except:
                                item_detalhe = page.locator("a:has-text('Detalhes'), .dropdown-menu :text('Detalhes')").filter(visible=True).first
                                if await item_detalhe.count() > 0:
                                    await item_detalhe.click(force=True)
                                    try: await page.wait_for_selector(".modal-content", state="visible", timeout=8000)
                                    except: pass
                            await asyncio.sleep(2)
                            success_parcial = False
                            has_real_error = False
                            mensagem_analise = ""
                            modal_container = page.locator(".modal-content").first
                            if await is_cancelled():
                                if browser: await browser.close()
                                return "Falha", "Cancelado", None
                            search_field = modal_container.locator("input.searchTerm, input[placeholder*='Pesquisar']").first
                            if await search_field.count() > 0:
                                await search_field.click()
                                await search_field.fill("")
                                await search_field.type("Parcial", delay=50)
                                await page.keyboard.press("Enter")
                                modal_text = await modal_container.inner_text(timeout=3000)
                                if "Parcial" in modal_text or "parcial" in modal_text.lower():
                                    success_parcial = True
                                    mensagem_analise = "Análise Sucesso - Parcial"
                                if not success_parcial:
                                    await search_field.fill("")
                                    await search_field.type("Falha", delay=50)
                                    await page.keyboard.press("Enter")
                                    modal_text = await modal_container.inner_text(timeout=3000)
                                    if "Falha" in modal_text or "falha" in modal_text.lower():
                                        has_real_error = True
                                        mensagem_analise = "Erro na análise"
                                    if not has_real_error:
                                        await search_field.fill("")
                                        await search_field.type("Erro", delay=50)
                                        await page.keyboard.press("Enter")
                                        modal_text = await modal_container.inner_text(timeout=3000)
                                        if "Erro" in modal_text or "erro" in modal_text.lower():
                                            has_real_error = True
                                            mensagem_analise = "Erro na análise"
                            else:
                                modal_text = await modal_container.inner_text(timeout=5000)
                                if "Parcial" in modal_text or "parcial" in modal_text.lower():
                                    success_parcial = True
                                    mensagem_analise = "Análise Sucesso - Parcial (Varredura)"
                                elif "Falha" in modal_text or "falha" in modal_text.lower() or "Erro" in modal_text or "erro" in modal_text.lower():
                                    has_real_error = True
                                    mensagem_analise = "Erro na análise"
                            close_btn = page.locator(".modal button.close, .modal [data-dismiss='modal']").first
                            if await close_btn.count() > 0:
                                await close_btn.click()
                                await asyncio.sleep(1)
                            if success_parcial:
                                update_progress(100)
                                await browser.close()
                                return "Importado e Analisado", mensagem_analise, None
                            elif has_real_error:
                                await browser.close()
                                return "Falha na Análise", mensagem_analise, None
                            else:
                                update_progress(100)
                                await browser.close()
                                return "Importado e Analisado", "Análise feita com sucesso.", None
                        except Exception as deep_e:
                            await browser.close()
                            return "Falha na Análise", f"ABI {row_data['abi']}: Erro", None
            if not abi_matched_any_row and len(analysis_data) > 0:
                for r_idx, row_data in enumerate(analysis_data):
                    row_lower = row_data['fullText'].lower()
                    if "sucesso" in row_lower:
                        update_progress(100)
                        if "parcial" in row_lower:
                            await browser.close()
                            return "Importado e Analisado", "Análise Sucesso - Parcial", None
                        await browser.close()
                        return "Importado e Analisado", "Análise feita com sucesso.", None
                    if "falha" in row_lower or "erro" in row_lower:
                        if "parcial" in row_lower:
                            await browser.close()
                            return "Importado e Analisado", "Análise Sucesso - Parcial", None
                        await browser.close()
                        return "Falha na Análise", f"Erro: {row_data['fullText'][:80]}", None
            await browser.close()
            return "Importado, falta analisar", "Arquivo importado, análise não concluída ou não localizada.", None
    except Exception as e:
        import traceback
        err_trace = traceback.format_exc()
        err_msg = f"{type(e).__name__}: {str(e)}"
        if browser:
            try: await browser.close()
            except: pass
        return "Falha", f"Erro: {err_msg}", None

async def run_batch_abi_check(task_id, client_ids=None):
    try:
        if client_ids:
            all_clients = db.get_all_clients()
            clients = [c for c in all_clients if c['id'] in client_ids]
        else:
            all_v = db.get_all_clients()
            clients = [
                c for c in all_v 
                if c.get('abi_status') != 'Importado e Analisado'
                and c.get('impugnation_status') not in ['Finalizou', 'Impugnando']
            ]
        total = len(clients)
        unit = "operadora" if total == 1 else "operadoras"
        db.add_log(task_id, f"🚀 Iniciando checagem de ABI {'Individual' if total == 1 else 'em LOTE'} para {total} {unit}...")
        db.update_task(task_id, {"total": total, "current": 0})
        creds_general = db.get_rsus_credentials('general')
        creds_vitoria = db.get_rsus_credentials('unimed_vitoria')

        for i, client in enumerate(clients):
            # Check cancelamento
            task_doc = db.get_task(task_id)
            if task_doc and str(task_doc.get('status', '')).upper() in ['STOPPED', 'CANCELLED']:
                db.add_log(task_id, "⏹️ Processamento interrompido pelo usuário. Encerrando worker.", "WARNING")
                sys.exit(0)

            client_name = client.get('name', 'Desconhecido')
            db.update_task(task_id, {"current": i + 1, "current_client": client_name})
            
            target_creds = creds_vitoria if "vitoria" in client.get('url_sistema', '').lower() else creds_general
            
            is_manual = client_ids is not None
            await run_abi_check_for_client(client['id'], task_id=task_id, pre_fetched_creds=target_creds, is_batch_run=True, force_sync=is_manual)

        db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
        db.add_log(task_id, f"Checagem de ABI {'Individual' if total == 1 else 'em Lote'} Finalizada!")
        
        # Alerta WhatsApp (opcional, mas bom manter o padrão)
        stats = db.get_abi_dashboard_stats()
        msg = f"📊 *GAX RSUS - Relatório de ABIs*\n\nProcessamento finalizado!\n✅ Analisados: {stats['imported_analyzed']}\n⚠️ Falta Analisar: {stats['imported_not_analyzed']}\n❌ Falhas: {stats['failure']}"
        await send_whatsapp_alert(msg, task_id=task_id)

    except Exception as e:
        db.add_log(task_id, f"Erro estrutural no lote: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})

async def run_single_abi_check(client_id, task_id):
    """Executa a checagem individual para um cliente."""
    try:
        client = db.get_client_config(client_id)
        client_name = client.get('name', 'Desconhecido')
        db.update_task(task_id, {"total": 1, "current": 0, "status": "running", "current_client": client_name})
        db.add_log(task_id, f"🔍 Iniciando checagem INDIVIDUAL para: {client_name}...")
        
        await run_abi_check_for_client(client_id, task_id=task_id, force_sync=True)
        
        db.update_task(task_id, {"status": "completed", "current": 1, "current_client": "Finalizado"})
    except Exception as e:
        db.add_log(task_id, f"Erro: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})
