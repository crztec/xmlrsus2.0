import sys
import asyncio
import logging
import time
import base64
from datetime import datetime
import re
from playwright.async_api import async_playwright
import api.database as db
from api.utils import send_whatsapp_alert

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
        if await is_cancelled(): return False

        async with async_playwright() as p:
            log_task("Iniciando sincronização com gestaocomercial.cubeti.com.br/ABITracker...")
            # Stealth Avançado + Flags de Sandbox
            browser_args = [
                "--no-sandbox", 
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled"
            ]
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
            search_input = page.locator("input[placeholder*='Buscar cliente'], input[placeholder*='Pesquisar']").first
            
            async def try_search(name_to_search):
                if await search_input.count() > 0:
                    await search_input.click()
                    await search_input.fill("")
                    await search_input.fill(name_to_search)
                    await asyncio.sleep(2)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(3)
                return page.locator("table tbody tr").filter(has_text=re.compile(name_to_search, re.IGNORECASE)).first

            target_row = await try_search(client_name)
            
            if await target_row.count() == 0:
                import unicodedata
                search_name = "".join(c for c in unicodedata.normalize('NFD', client_name) if unicodedata.category(c) != 'Mn')
                if search_name != client_name:
                    log_task(f"Operadora não encontrada com nome original '{client_name}'. Tentando sem acento...", "WARNING")
                    target_row = await try_search(search_name)

            if await target_row.count() == 0:
                log_task("Operadora não encontrada na grid da Cubeti.", "WARNING")
                await browser.close()
                return False
                
            log_task("Operadora localizada!")
            
            # Map status (Iniciado, Importou o ABI, Importou e Analisou, etc.)
            target_status = "Não iniciou"
            if status_gax == "Nao Importado":
                target_status = "Não iniciou"
            elif status_gax in ["Importado", "Pendente", "Importado, falta analisar"]:
                target_status = "Importou o ABI"
            elif status_gax in ["Importado e Analisado", "Falha na Análise", "Falha"]:
                target_status = "Importou e Analisou"
                
            # Seletores ultra-robustos para o botão + (Lida com variações de DOM no CubeTI)
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
                    # Primeiro tenta restringir à linha do cliente
                    sel = f"tr:has-text('{client_name}') {btn_sel}"
                    btn_add = page.locator(sel).first
                    if await btn_add.count() > 0 and await btn_add.is_visible():
                        log_task(f"Botão '+' localizado via seletor específico: {sel}")
                        break
                except: pass

            if not btn_add or await btn_add.count() == 0 or not await btn_add.is_visible():
                log_task("Busca secundária por botão '+' em andamento...", "WARNING")
                # Fallback genérico na página inteira
                for btn_sel in possible_btn_selectors:
                    try:
                        btn_add = page.locator(btn_sel).filter(visible=True).first
                        if await btn_add.count() > 0:
                            log_task(f"Botão '+' encontrado no fallback via: {btn_sel}", "WARNING")
                            break
                    except: pass
            

            if btn_add and await btn_add.count() > 0:
                await btn_add.click(force=True)
                await asyncio.sleep(2)
                
                # Se abrir modal, procura o campo de preenchimento (Geralmente textarea ou input de observação)
                modal_area = page.locator("[role='dialog'], .modal-content, [role='document']").first
                if await modal_area.count() == 0:
                    modal_area = page.locator("body") # fallback caso o modal não tenha as tags claras
                    
                textbox = modal_area.locator("textarea, input:not([type='hidden']):not([type='checkbox']):not([type='radio'])").filter(visible=True).first
                if await textbox.count() > 0:
                    await textbox.fill("")
                    if mensagem_analise:
                        await textbox.fill(mensagem_analise)
                    else:
                        await textbox.fill(target_status)
                    await asyncio.sleep(1)

                save_btn = page.locator("button:has-text('Salvar'), button:has-text('Confirmar'), .btn-primary, button[type='submit']").filter(visible=True).first
                if await save_btn.count() > 0:
                    await save_btn.click()
                    await asyncio.sleep(2)
                log_task("Registro de contato processado.")
            else:
                log_task("Botão '+' não encontrado.", "WARNING")

            if target_status:
                log_task(f"Atualizando status para '{target_status}'")
                # Gatilho de status independe da coluna exata. Procura por botões/comboboxes na linha atual.
                # Baseado na foto, é text "Não Iniciou", "Importou e Analisou", etc.
                status_trigger = target_row.locator("button, [role='combobox'], .cursor-pointer, span.inline-flex, span[aria-haspopup='dialog']").filter(has_text=re.compile(r"Não iniciou|Importou|Impugnando|Impugnado|Finalizou|Agendou|Erro", re.IGNORECASE)).first
                
                if await status_trigger.count() > 0:
                    await status_trigger.scroll_into_view_if_needed()
                    # Dispara mousedown para componentes que dependem dele (Radix/Angular)
                    await status_trigger.dispatch_event("mousedown")
                    await status_trigger.click(force=True)
                    await asyncio.sleep(2)
                    
                    # Procura a opção pelo texto dinâmico (não mais fixo)
                    # Usamos regex com bordas (ignorando espaços laterais) para ser resiliente e não clicar em texto perdido na tela
                    option_regex = re.compile(rf"^\s*{re.escape(target_status)}\s*$", re.I)
                    option = page.locator("button, a, li, [role='menuitem'], [role='option'], .dropdown-item").filter(has_text=option_regex).filter(visible=True).first
                    
                    if await option.count() > 0:
                        await option.click()
                        log_task(f"Status '{target_status}' selecionado.")
                        await asyncio.sleep(2)
                    else:
                        # Fallback por texto exato se regex falhar
                        log_task(f"Popover não detectado via regex '{target_status}', tentando fallback literal...", "WARNING")
                        option_fallback = page.locator(f"button:has-text('{target_status}'), a:has-text('{target_status}'), li:has-text('{target_status}')").filter(visible=True).first
                        if await option_fallback.count() > 0:
                            await option_fallback.click()
                            log_task(f"Status '{target_status}' selecionado via fallback.")
                        else:
                            log_task("Menu de status não reconheceu a opção, tentando teclado...", "WARNING")
                            await page.keyboard.press("ArrowDown")
                            await asyncio.sleep(1)
                            await page.keyboard.press("Enter")
                else:
                    log_task("Dropdown de status não encontrado.", "WARNING")

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

    # Resgata status atual para saber se houve mudança real
    old_status = client.get('abi_status')

    try:
        status, message, snap_url = await _run_abi_check_logic(client_id, active_abi, task_id, pre_fetched_creds)
        db.update_client_abi_status(client_id, active_abi, status, message, task_id, is_batch=is_batch_run)
        
        # Sincroniza status final com Gestaocomercial Cubeti APENAS SE mudou E não for erro técnico
        # Não sincroniza no caso de falhas técnicas (timeout, navegação, etc)
        is_technical_error = status == 'Falha' and any(kw in message.lower() for kw in ['timeout', 'erro técnico', 'cancelado', 'falha no login', 'navegação'])
        if status != old_status and not is_technical_error:
            await sync_to_cubeti_management(client_name, status, message, task_id)
            if task_id:
                db.add_log(task_id, f"[{client_name}] ABI status alterado de '{old_status}' para '{status}'. Sincronizando CubeTI...")
        else:
            reason = "erro técnico (sync pulada)" if is_technical_error else "status mantido"
            if task_id:
                db.add_log(task_id, f"[{client_name}] ABI status '{status}' ({reason}). Sincronização CubeTI pulada.")
        
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
            await send_whatsapp_alert(whatsapp_msg, task_id=task_id)
            
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
            await send_whatsapp_alert(whatsapp_msg, task_id=task_id)
            
        return "Falha", err, None

async def is_task_stopped(task_id):
    """Verifica se a tarefa foi interrompida pelo usuário (Suporta STOPPED e CANCELLED)."""
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
                task = db.get_task(task_id)
                if task:
                    t_total = task.get('total', 0)
                    if t_total > 1:
                        # Batch progress: scale according to current client index
                        t_curr = task.get('current', 1) - 1
                        t_curr = max(0, t_curr)
                        scaled = int(((t_curr + (percent / 100)) / t_total) * 100)
                        db.update_task(task_id, {"progress_percent": scaled})
                    else:
                        # Individual progress
                        db.update_task(task_id, {"progress_percent": percent})
                else:
                    db.update_task(task_id, {"progress_percent": percent})
            except: pass

    if not url_sistema:
        return "Falha", "URL não configurada.", None

    cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"

    # Check stop signal
    if await is_task_stopped(task_id):
        return "Falha", "Tarefa parada pelo usuário.", None

    browser = None
    try:
        async with async_playwright() as p:
            update_progress(5)
            log_task(f"Iniciando navegador para checar ABI {active_abi}...")
            
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-setuid-sandbox", 
                "--disable-dev-shm-usage",
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
            log_task("Navegador aberto com sucesso.", "DEBUG")

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
                email_field = page.locator("input[type='email'], input[name*='mail'], input#email, input#Email, input#username, #username, input[name='username']").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input[type='email'], input[name*='mail'], input#email, input#Email, input#username, #username, input[name='username']").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break
                
                await email_field.wait_for(state="visible", timeout=25000)
                log_task("Preenchendo credenciais...", "DEBUG")
                
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
                
                if await is_cancelled():
                    if browser: await browser.close()
                    return "Falha", "Tarefa cancelada pelo usuário.", None

                # Estabilização pós-login
                update_progress(45)
                log_task("Aguardando carregamento da interface...", "DEBUG")
                try:
                    await page.wait_for_selector(".navbar, .main-sidebar, .content-header, #wrapper", timeout=60000)
                except:
                    # Tenta forçar salto se estiver preso
                    if await is_cancelled(): 
                        await browser.close()
                        return "Falha", "Cancelado", None
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
            log_task("Navegando para 'Importações'...", "DEBUG")
            base_url = url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema.rsplit('/', 1)[0]
            import_url = f"{base_url.rstrip('/')}/importacao"
            await page.goto(import_url, wait_until="domcontentloaded", timeout=45000)
            
            log_task(f"Buscando ABI {active_abi} na grid...", "DEBUG")
            # Aguarda a table carregar e o texto do ABI aparecer em qualquer célula
            try:
                await page.wait_for_selector(f"table td:has-text('{active_abi}'), table td:has-text('{abi_clean}')", timeout=35000)
            except:
                pass
            
            # EXTRAÇÃO VIA JAVASCRIPT: Lê todas as linhas da tabela de uma vez
            # Isso evita os timeouts individuais de .inner_text() que ocorrem no Cloud Run
            grid_data = await page.evaluate("""() => {
                const rows = document.querySelectorAll('table tbody tr');
                return Array.from(rows).map(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    return {
                        cellCount: cells.length,
                        firstCell: cells[0] ? cells[0].innerText.trim() : '',
                        secondCell: cells[1] ? cells[1].innerText.trim() : '',
                        fullText: row.innerText.trim()
                    };
                });
            }""")
            
            log_task(f"Grid carregada via JS: {len(grid_data)} linhas.", "DEBUG")
            
            target_row_index = -1
            import re
            abi_numbers = "".join(re.findall(r'\\d+', active_abi))
            
            for idx, row_data in enumerate(grid_data):
                cell_text = row_data['firstCell']
                if not cell_text:
                    continue
                
                cell_clean = cell_text.replace('º', '').strip()
                cell_numbers = "".join(re.findall(r'\\d+', cell_text))
                
                if active_abi == cell_text or abi_clean == cell_clean or active_abi in cell_text or (abi_numbers and cell_numbers == abi_numbers):
                    target_row_index = idx
                    log_task(f"ABI {active_abi} localizado na linha {idx+1}.", "DEBUG")
                    break
            
            if target_row_index == -1:
                log_task(f"Aviso: ABI atual ainda não importado no RSUS.", "WARNING")
                if browser: await browser.close()
                return "Nao Importado", "ABI atual ainda não importado no RSUS.", None

            # Obtém status direto da segunda coluna (Status Arquivo) via dados já extraídos
            status_text = grid_data[target_row_index]['secondCell']
            target_row = page.locator("table tbody tr").nth(target_row_index)
            
            if status_text != "Importado":
                log_task(f"ABI {active_abi} encontrado com status: {status_text}", "INFO")
                if browser: await browser.close()
                return "Pendente", f"Status: {status_text}", None

            if await is_cancelled():
                if browser: await browser.close()
                return "Falha", "Cancelado", None

            log_task("ABI Importado. Abrindo menu de ações...", "DEBUG")
            hamburger = target_row.locator("td").last.locator("button, a, .fa-bars").first
            await hamburger.click(force=True)
            await asyncio.sleep(1.5)
            
            log_task("Clicando em 'Logs Análise'...", "DEBUG")
            logs_btn = page.locator(".dropdown-menu a:has-text('Logs Análise'), a:has-text('Logs Análise')").first
            
            # Verifica se o botão existe e é visível rapidamente
            try:
                await logs_btn.wait_for(state="visible", timeout=7000)
                # Salva URL atual para detectar navegação
                url_before = page.url
                await logs_btn.click(force=True, timeout=5000)
            except:
                log_task(f"Aviso: Cliente não realiza análise ou opção indisponível.", "WARNING")
                if browser: await browser.close()
                return "Importado", "Cliente não realiza análise.", None
            
            # CRÍTICO: 'Logs Análise' NAVEGA para /log-analise/ (página "Análises Realizadas")
            # Pode abrir na mesma aba ou em uma nova aba (popup) dependendo da operadora/software.
            log_task("Aguardando navegação ou popup para 'Análises Realizadas'...", "DEBUG")
            
            try:
                # Tenta capturar se abrir em nova aba
                async with page.expect_popup(timeout=8000) as popup_info:
                    await logs_btn.click(force=True, timeout=5000)
                page = await popup_info.value
                log_task(f"Nova aba/popup detectada para análise: {page.url}", "DEBUG")
            except:
                # Se não abriu popup, assume que navegou na mesma aba
                try:
                    await page.wait_for_url("**/log-analise/**", timeout=20000)
                    log_task(f"Página de análise carregada (mesma aba): {page.url}", "DEBUG")
                except:
                    # Fallback final se o URL não mudou visivelmente
                    await asyncio.sleep(4)
                    log_task(f"Página atual após tentativa de Logs: {page.url}", "DEBUG")
            
            # Aguarda a página "Análises Realizadas" carregar completamente
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=15000)
            except: pass
            
            try:
                # Aguarda a tabela de análises ter pelo menos uma linha
                await page.wait_for_selector("table tbody tr", timeout=45000)
                await asyncio.sleep(2)  # Pequena pausa para estabilização
            except:
                log_task("Aviso: Tempo esgotado aguardando linhas na tabela de análises.", "WARNING")
            
            # EXTRAÇÃO VIA JAVASCRIPT: Lê todas as linhas da tabela "Análises Realizadas" de uma vez
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
            
            log_task(f"Grid de Análises Realizadas: {len(analysis_data)} linhas (via JS).", "DEBUG")
            
            found_result = False
            abi_matched_any_row = False
            import re
            target_abi_numbers = re.sub(r'\D', '', str(active_abi))
            
            for r_idx, row_data in enumerate(analysis_data):
                # Log diagnóstico para as primeiras 3 linhas
                if r_idx < 3:
                    log_task(f"Análise linha {r_idx+1}/{len(analysis_data)}: {row_data['cellCount']} colunas | ABI: '{row_data['abi']}' | Resultado: '{row_data['resultado']}' | Full: '{row_data['fullText'][:80]}'", "DEBUG")
                
                if row_data['cellCount'] >= 7:
                    abi_row_clean = re.sub(r'\D', '', row_data['abi'])
                    
                    if abi_row_clean != target_abi_numbers:
                        continue
                    
                    abi_matched_any_row = True
                    result_text = row_data['resultado']
                    res_lower = result_text.lower()
                    log_task(f"ABI {row_data['abi']} encontrado na linha {r_idx+1}. Resultado: '{result_text}'", "DEBUG")
                    
                    if "sucesso" in res_lower:
                        update_progress(100)
                        log_task(f"Sucesso detectado na análise do ABI {row_data['abi']}", "SUCCESS")
                        await browser.close()
                        return "Importado e Analisado", "Análise feita com sucesso.", None
                    
                    if "falha" in res_lower or "erro" in res_lower:
                        log_task(f"Evento '{result_text}' detectado para ABI {row_data['abi']}. Iniciando Deep Dive...", "INFO")
                        # Obtém o locator real da linha para interagir com o Deep Dive
                        row = page.locator("table tbody tr").nth(r_idx)
                        try:
                            # 1. Abre o detalhe (Resiliente a 'da' vs 'do' e erro de pt)
                            import re
                            menu_btn = row.locator("button").filter(has_text=re.compile(r"Detalhes d. Análise", re.I)).first
                            if await menu_btn.count() == 0:
                                menu_btn = row.locator("button.btn-default, .fa-bars, i.fa-bars").first
                                
                            await menu_btn.scroll_into_view_if_needed()
                            await menu_btn.click(force=True)
                            
                            # Aguarda o modal abrir (identificado por 'Detalhes' ou 'ATENDIMENTOS')
                            try:
                                await page.wait_for_selector(".modal-content:has-text('Detalhes'), .modal-content:has-text('ATENDIMENTOS')", state="visible", timeout=12000)
                                log_task("Modal de Detalhes aberto com sucesso.", "DEBUG")
                            except:
                                # Se o clique abriu um dropdown em vez do modal direto, clica em Detalhes
                                item_detalhe = page.locator("a:has-text('Detalhes'), .dropdown-menu :text('Detalhes')").filter(visible=True).first
                                if await item_detalhe.count() > 0:
                                    await item_detalhe.click(force=True)
                                    try:
                                        await page.wait_for_selector(".modal-content", state="visible", timeout=8000)
                                    except: pass
                            
                            await asyncio.sleep(2)
                            
                            # 3. Busca Direta no Modal (Otimizado via campo de pesquisa)
                            success_parcial = False
                            has_real_error = False
                            mensagem_analise = ""
                            
                            modal_container = page.locator(".modal-content").first
                            if await is_cancelled():
                                if browser: await browser.close()
                                return "Falha", "Cancelado", None

                            search_field = modal_container.locator("input.searchTerm, input[placeholder*='Pesquisar']").first
                            if await search_field.count() > 0:
                                # Busca 1: Parcial
                                await search_field.click()
                                await search_field.fill("")
                                await search_field.type("Parcial", delay=50)
                                await page.keyboard.press("Enter")
                                try:
                                    await modal_container.locator("td").filter(has_text=re.compile(r"Parcial", re.I)).first.wait_for(state="visible", timeout=5000)
                                except: pass
                                
                                modal_text = await modal_container.inner_text(timeout=3000)
                                if "Parcial" in modal_text or "parcial" in modal_text.lower():
                                    success_parcial = True
                                    mensagem_analise = "Análise Sucesso - Parcial"
                                
                                if not success_parcial:
                                    # Busca 2: Falha
                                    await search_field.fill("")
                                    await search_field.type("Falha", delay=50)
                                    await page.keyboard.press("Enter")
                                    try:
                                        await modal_container.locator("td").filter(has_text=re.compile(r"Falha", re.I)).first.wait_for(state="visible", timeout=300)
                                    except: pass
                                    
                                    if r_count > 0:
                                        # Varredura dinâmica da grid filtrada
                                        visible_rows_list = await visible_rows.all()
                                        
                                        # Checa se a primeira linha tem mensagem de vazio
                                        try:
                                            first_row_text = (await visible_rows_list[0].inner_text()).lower()
                                            is_empty_table_message = any(k in first_row_text for k in no_results_keywords)
                                        except:
                                            is_empty_table_message = False
                 
                                        if not is_empty_table_message:
                                            for r_row in visible_rows_list[:5]:
                                                try:
                                                    r_text = (await r_row.inner_text()).strip().lower()
                                                    if any(k in r_text for k in target_keywords):
                                                        has_match = True
                                                        match_count += 1
                                                except: continue
                                    
                                    modal_text = await modal_container.inner_text(timeout=3000)
                                    if "Falha" in modal_text or "falha" in modal_text.lower():
                                        has_real_error = True
                                        mensagem_analise = "Erro na análise"
                                        
                                    if not has_real_error:
                                        # Busca 3: Erro
                                        await search_field.fill("")
                                        await search_field.type("Erro", delay=50)
                                        await page.keyboard.press("Enter")
                                        try:
                                            await modal_container.locator("td").filter(has_text=re.compile(r"Erro", re.I)).first.wait_for(state="visible", timeout=3000)
                                        except: pass
                                        modal_text = await modal_container.inner_text(timeout=3000)
                                        if "Erro" in modal_text or "erro" in modal_text.lower():
                                            has_real_error = True
                                            mensagem_analise = "Erro na análise"
                            else:
                                # Fallback para o modo antigo de varredura se o campo de busca não existir
                                modal_text = await modal_container.inner_text(timeout=5000)
                                if "Parcial" in modal_text or "parcial" in modal_text.lower():
                                    success_parcial = True
                                    mensagem_analise = "Análise Sucesso - Parcial (Varredura)"
                                elif "Falha" in modal_text or "falha" in modal_text.lower() or "Erro" in modal_text or "erro" in modal_text.lower():
                                    has_real_error = True
                                    mensagem_analise = "Erro na análise"
                            
                            # Fecha o modal ao final
                            close_btn = page.locator(".modal button.close, .modal [data-dismiss='modal']").first
                            if await close_btn.count() > 0:
                                await close_btn.click()
                                await asyncio.sleep(1)

                            if success_parcial:
                                update_progress(100)
                                log_task(f"Deep Dive: Encontrado Sucesso Parcial no ABI {row_data['abi']}", "SUCCESS")
                                await browser.close()
                                return "Importado e Analisado", mensagem_analise, None
                            elif has_real_error:
                                log_task(f"Deep Dive: Falha/Erro real confirmado nos detalhes.", "ERROR")
                                await browser.close()
                                return "Falha na Análise", mensagem_analise, None
                            else:
                                # FALSO POSITIVO: main grid disse "Erro", mas o modal de detalhes não possui erros/falhas
                                log_task("Deep Dive: Nenhuma falha nos detalhes. Ignorando falso erro e definindo como Sucesso.", "SUCCESS")
                                update_progress(100)
                                await browser.close()
                                return "Importado e Analisado", "Análise feita com sucesso.", None
                                
                        except Exception as deep_e:
                            log_task(f"Aviso no Deep Dive: {str(deep_e)[:100]}", "WARNING")
                            log_task(f"Falha detectada na análise do ABI {row_data['abi']}.", "ERROR")
                            await browser.close()
                            return "Falha na Análise", f"ABI {row_data['abi']}: Erro", None
                else:
                    # Fallback para estrutura inesperada (< 7 colunas)
                    log_text = row_data['fullText']
                    if "Sucesso" in log_text:
                        update_progress(100)
                        log_task(f"Sucesso detectado na análise (fallback, linha {r_idx+1})", "SUCCESS")
                        await browser.close()
                        return "Importado e Analisado", "Análise concluída com sucesso.", None
                    
                    if "Falha" in log_text or "Erro" in log_text:
                        log_task(f"Falha detectada na análise (fallback, linha {r_idx+1}): {log_text[:50]}.", "ERROR")
                        await browser.close()
                        return "Falha na Análise", f"Erro: {log_text[:50]}", None
            
            # FALLBACK: Se nenhuma linha bateu com o ABI filtrado, tenta varredura genérica nos dados já extraídos
            if not abi_matched_any_row and len(analysis_data) > 0:
                log_task(f"Nenhuma linha bateu com ABI '{active_abi}' (filtro numérico). Varredura genérica em {len(analysis_data)} linhas...", "WARNING")
                for r_idx, row_data in enumerate(analysis_data):
                    row_lower = row_data['fullText'].lower()
                    
                    if r_idx < 3:
                        log_task(f"Fallback linha {r_idx+1}: '{row_data['fullText'][:150]}'", "DEBUG")
                    
                    # Busca Sucesso/Parcial/Falha/Erro diretamente no texto da linha
                    if "sucesso" in row_lower:
                        update_progress(100)
                        if "parcial" in row_lower:
                            log_task(f"Sucesso Parcial detectado (varredura genérica, linha {r_idx+1})", "SUCCESS")
                            await browser.close()
                            return "Importado e Analisado", "Análise Sucesso - Parcial", None
                        log_task(f"Sucesso detectado (varredura genérica, linha {r_idx+1})", "SUCCESS")
                        await browser.close()
                        return "Importado e Analisado", "Análise feita com sucesso.", None
                    
                    if "falha" in row_lower or "erro" in row_lower:
                        if "parcial" in row_lower:
                            log_task(f"Sucesso Parcial detectado (linha com falha+parcial, linha {r_idx+1})", "SUCCESS")
                            await browser.close()
                            return "Importado e Analisado", "Análise Sucesso - Parcial", None
                        log_task(f"Falha detectada (varredura genérica, linha {r_idx+1}): {row_data['fullText'][:80]}", "ERROR")
                        await browser.close()
                        return "Falha na Análise", f"Erro: {row_data['fullText'][:80]}", None
            
            # Se chegou aqui, não achou Sucesso nem Falha explícita nas primeiras linhas
            log_task(f"Conclusão da análise não localizada na grid (verificadas: {len(analysis_data)}).", "WARNING")
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
            all_v = db.get_all_clients()
            # Filtro Inteligente: Processa apenas quem ainda não terminou a importação/análise
            # e ignora quem já está em fase de monitoramento de impugnação
            clients = [
                c for c in all_v 
                if c.get('abi_status') != 'Importado e Analisado'
                and c.get('impugnation_status') not in ['Finalizou', 'Impugnando']
            ]
            
        total = len(clients)
        
        db.update_task(task_id, {"total": total, "current": 0, "status": "running"})
        db.add_log(task_id, f"🚀 Iniciando checagem de ABI em LOTE para {total} operadoras...")

        # Cache de credenciais
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
            
            await run_abi_check_for_client(client['id'], task_id=task_id, pre_fetched_creds=target_creds, is_batch_run=True)

        db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
        db.add_log(task_id, "Checagem de ABI em lote finalizada.")
        
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
        db.update_task(task_id, {"total": 1, "current": 0, "status": "running", "current_client": client.get('name')})
        db.add_log(task_id, f"🔍 Iniciando checagem INDIVIDUAL para: {client.get('name')}...")
        
        await run_abi_check_for_client(client_id, task_id=task_id)
        
        db.update_task(task_id, {"status": "completed", "current": 1, "current_client": "Finalizado"})
    except Exception as e:
        db.add_log(task_id, f"Erro: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})
