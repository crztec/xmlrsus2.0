import sys
import asyncio
import logging
import time
import base64
import re
from datetime import datetime
from playwright.async_api import async_playwright
import api.database as db
from api.utils import send_whatsapp_alert

logger = logging.getLogger(__name__)


async def _sync_impugnation_to_cubeti(client_name, task_id=None, target_status="Impugnando o ABI", contact_message="Cliente impugnando o ABI"):
    """Sincroniza status de impugnação com gestaocomercial.cubeti.com.br/ABITracker."""
    def log_task(msg, level="INFO"):
        sync_label = 'IMPUGN' if target_status and 'Impugnando' in target_status else 'FINAL'
        full_msg = f"[{client_name}] [SYNC CUBETI {sync_label}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg, level)
        logger.info(full_msg)

    async def is_cancelled():
        if not task_id: return False
        try:
            task = db.get_task(task_id)
            if not task: return False
            st = str(task.get('status', '')).upper()
            return st in ['STOPPED', 'CANCELLED']
        except: pass
        return False

    browser = None
    try:
        if await is_cancelled(): return False

        async with async_playwright() as p:
            log_task(f"Iniciando sincronização ({target_status}) com CubeTI...")
            # Stealth Avançado + Flags de Sandbox para Cloud Run
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-setuid-sandbox", 
                "--disable-dev-shm-usage", "--disable-gpu",
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
            
            # Login com Navegação Defensiva (evita quebra por ERR_ABORTED do Firewall)
            log_task("Realizando login Gestaocomercial...")
            try:
                await page.goto("https://gestaocomercial.cubeti.com.br/ABITracker", wait_until="domcontentloaded", timeout=60000)
            except Exception as e_nav:
                log_task(f"Aviso de navegação inicial (CubeTI): {str(e_nav)}. Verificando se chegou na página...", "WARNING")
                await asyncio.sleep(2)
            
            cubeti_creds = db.get_cubeti_credentials()
            cub_email = cubeti_creds.get("email", "")
            cub_pass = cubeti_creds.get("password", "")
            if not cub_email or not cub_pass:
                log_task("Credenciais CubeTI não configuradas.", "WARNING")
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
                
            # Busca operadora específica
            search_input = page.locator("input[placeholder*='Buscar cliente'], input[placeholder*='Pesquisar']").first
            
            async def try_search(name_to_search):
                if await search_input.count() > 0:
                    log_task(f"Searching for: '{name_to_search}'")
                    await search_input.click()
                    await search_input.fill("")
                    await search_input.fill(name_to_search)
                    await asyncio.sleep(2)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(4) # Espera um pouco mais no Cloud Run
                
                # Procura por correspondência exata ou parcial na tabela
                rows = page.locator("table tbody tr")
                count = await rows.count()
                for i in range(count):
                    row_text = await rows.nth(i).inner_text()
                    if name_to_search.lower() in row_text.lower():
                        return rows.nth(i)
                return page.locator("table tbody tr").filter(has_text=re.compile(re.escape(name_to_search), re.IGNORECASE)).first

            target_row = await try_search(client_name)
            
            if await target_row.count() == 0:
                import unicodedata
                # Tenta sem acentos
                search_name = "".join(c for c in unicodedata.normalize('NFD', client_name) if unicodedata.category(c) != 'Mn')
                if search_name != client_name:
                    log_task(f"Not found as '{client_name}'. Trying without accents: '{search_name}'...")
                    target_row = await try_search(search_name)
                
                # Tenta nome parcial (primeira parte significativa) se for nome composto
                if await target_row.count() == 0 and " " in client_name:
                    parts = [p for p in client_name.split() if len(p) > 3 and p.lower() not in ['unimed', 'oeste', 'parana']]
                    if parts:
                        partial_name = parts[0]
                        log_task(f"Searching by partial name: '{partial_name}'...")
                        target_row = await try_search(partial_name)

            if await target_row.count() == 0:
                log_task(f"Operadora '{client_name}' não encontrada na grid da Cubeti após múltiplas tentativas.", "WARNING")
                # Screenshot de debug se falhar
                try:
                    snap_path = f"/tmp/cubeti_search_fail_{int(time.time())}.png"
                    await page.screenshot(path=snap_path)
                    log_task(f"Screenshot de falha salvo em: {snap_path}", "DEBUG")
                except: pass
                await browser.close()
                return False
                
            log_task("Operadora localizada!")
            
            if contact_message:
                log_task(f"Registrando contato: '{contact_message}'...")
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
                    
                    modal_area = page.locator("[role='dialog'], .modal-content, [role='document']").first
                    if await modal_area.count() == 0:
                        modal_area = page.locator("body")
                        
                    textbox = modal_area.locator("textarea, input:not([type='hidden']):not([type='checkbox']):not([type='radio'])").filter(visible=True).first
                    if await textbox.count() > 0:
                        await textbox.fill("")
                        await textbox.fill(contact_message)
                        await asyncio.sleep(1)

                    save_btn = page.locator("button:has-text('Salvar'), button:has-text('Confirmar'), .btn-primary, button[type='submit']").filter(visible=True).first
                    if await save_btn.count() > 0:
                        await save_btn.click()
                        await asyncio.sleep(2)
                    log_task("Registro de contato processado.")
                else:
                    log_task("Botão '+' não encontrado.", "WARNING")

            # Selecionar status no dropdown do CubeTI (pula se target_status for None)
            if target_status:
                log_task(f"Atualizando status para '{target_status}'")
                
                status_trigger = target_row.locator("button, [role='combobox'], .cursor-pointer, span.inline-flex, span[aria-haspopup='dialog']").filter(
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
                        log_task(f"Status '{target_status}' selecionado.")
                        await asyncio.sleep(2)
                    else:
                        # Fallback por texto visível
                        log_task(f"Popover não detectado via regex, tentando fallback literal...", "WARNING")
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
            else:
                log_task("Status mantido (sem alteração no dropdown).")


            await browser.close()
            return True
            
    except Exception as e:
        log_task(f"Erro na sincronização: {str(e)}", "ERROR")
        if browser: await browser.close()
        return False


async def run_impugnation_check_for_client(client_id, task_id=None, pre_fetched_creds=None, is_batch_run=False):
    """Checa impugnações para um único cliente no RSUS."""
    client = db.get_client_config(client_id)
    if not client: return "Erro", "Cliente não encontrado"
    client_name = client.get('name', client_id)
    
    # Resgata status atual para saber se houve mudança
    old_status = client.get('impugnation_status')

    active_abi_doc = db.get_active_abi()
    active_abi = active_abi_doc.get('ABI', 'Desconhecido') if active_abi_doc else 'Desconhecido'

    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg, level)
        logger.info(full_msg)

    try:
        status, message, stats = await _run_impugnation_logic(client_id, active_abi, task_id, pre_fetched_creds)
        
        # Salva o status de impugnação no cliente
        db.update_client_impugnation_status(client_id, status, message, task_id)
        
        # Sincroniza status final com Gestaocomercial Cubeti APENAS SE mudou E não for erro técnico
        is_technical_error = status == 'Erro' and any(kw in message.lower() for kw in ['timeout', 'erro técnico', 'targetclosederror', 'cancelado', 'falha no login'])
        
        if status != old_status and not is_technical_error:
            log_task(f"Status alterado de '{old_status}' para '{status}'. Sincronizando CubeTI...", "DEBUG")
            sync_success = False
            if status == "Impugnando":
                sync_success = await _sync_impugnation_to_cubeti(client_name, task_id, target_status="Impugnando o ABI", contact_message="Cliente impugnando o ABI")
            elif status == "Finalizou":
                sync_success = await _sync_impugnation_to_cubeti(client_name, task_id, target_status="Finalizou o ABI", contact_message="Cliente Finalizou o ABI")
            elif status == "Não Iniciou":
                sync_success = await _sync_impugnation_to_cubeti(client_name, task_id, target_status="Importou, Analisou e Não Iniciou", contact_message="Cliente ainda não iniciou Impugnação")
            
            if task_id:
                if sync_success:
                    db.add_log(task_id, f"[{client_name}] Sincronização CubeTI realizada ({status}).")
                else:
                    db.add_log(task_id, f"[{client_name}] Falha ao sincronizar com CubeTI (ver logs internos).", "WARNING")
        else:
            reason = "erro técnico (sync pulada)" if is_technical_error else "status mantido"
            if task_id:
                db.add_log(task_id, f"[{client_name}] Status '{status}' ({reason}). Sincronização CubeTI pulada.")
        
        # Alerta WhatsApp individual
        if not is_batch_run:
            emoji_map = {"Impugnando": "⚖️", "Finalizou": "🏁", "Sem Impugnação": "✅", "Não Iniciou": "⏳"}
            emoji = emoji_map.get(status, "ℹ️")
            msg = (
                f"{emoji} *GAX RSUS - Checagem de Impugnações*\n\n"
                f"Operadora: {client_name}\n"
                f"ABI: {active_abi}\n"
                f"Resultado: {status}\n\n"
                f"Detalhes: {stats['impugnados']} impugnados, {stats['aptos']} aptos e {stats['aguardando']} aguardando."
            )
            await send_whatsapp_alert(msg, task_id=task_id)
            
        return status, message, stats
    except Exception as e:
        import traceback
        err = f"{type(e).__name__}: {str(e)}"
        logger.error(f"Impugnation check error: {traceback.format_exc()}")
        db.update_client_impugnation_status(client_id, "Erro", err, task_id)
        if task_id:
            db.add_log(task_id, f"[{client_name}] Erro crítico: {err}", "ERROR")
        return "Erro", err, {"aptos": 0, "aguardando": 0}


async def _run_impugnation_logic(client_id, active_abi, task_id=None, pre_fetched_creds=None):
    """Lógica interna de checagem de impugnações — navega até Atendimentos e busca 'Impugnado'."""
    client = db.get_client_config(client_id)
    if not client:
        return "Erro", "Cliente não encontrado."
        
    url_sistema = client.get('url_sistema')
    client_name = client.get('name', client_id)
    
    abi_clean = re.sub(r'\D', '', str(active_abi))
    
    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg, level)
        if level == "ERROR": logger.error(full_msg)
        elif level == "SUCCESS": logger.info(f"✅ {full_msg}")
        else: logger.info(full_msg)

    def update_progress(percent):
        if task_id:
            try:
                task = db.get_task(task_id)
                if task:
                    t_total = task.get('total', 0)
                    if t_total > 1:
                        t_curr = max(0, task.get('current', 1) - 1)
                        scaled = int(((t_curr + (percent / 100)) / t_total) * 100)
                        db.update_task(task_id, {"progress_percent": scaled})
                    else:
                        db.update_task(task_id, {"progress_percent": percent})
                else:
                    db.update_task(task_id, {"progress_percent": percent})
            except: pass

    if not url_sistema:
        return "Erro", "URL não configurada."

    cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"

    async def is_cancelled():
        if not task_id: return False
        try:
            task = db.get_task(task_id)
            if not task: return False
            st = str(task.get('status', '')).upper()
            return st in ['STOPPED', 'CANCELLED']
        except: pass
        return False

    if await is_cancelled():
        return "Erro", "Tarefa cancelada."

    browser = None
    try:
        async with async_playwright() as p:
            update_progress(5)
            log_task(f"Iniciando checagem de impugnações para ABI {active_abi}...")
            
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-setuid-sandbox", 
                "--disable-dev-shm-usage",
                "--disable-gpu", "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
                "--disable-web-security", "--allow-running-insecure-content",
                "--ignore-certificate-errors", "--disable-blink-features=AutomationControlled"
            ]

            if pre_fetched_creds:
                creds = pre_fetched_creds
            else:
                creds = await asyncio.to_thread(db.get_rsus_credentials, cred_type)

            if not creds or not creds.get('username'):
                return "Erro", f"Credenciais '{cred_type}' não encontradas."

            browser = await p.chromium.launch(headless=True, args=browser_args)
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
                else:
                    await route.continue_()
            
            await page.route("**/*", block_assets)
            page.set_default_navigation_timeout(90000)
            page.set_default_timeout(90000)
            page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))

            if await is_cancelled():
                await browser.close()
                return "Erro", "Cancelado."

            # ─── 1. LOGIN ───
            try:
                update_progress(25)
                log_task("Realizando login no RSUS...")
                await page.goto(url_sistema, wait_until="commit", timeout=60000)
                
                try:
                    alert = page.locator("#_browseralert, .browseralert").first
                    if await alert.is_visible(timeout=2000):
                        await page.keyboard.press("Escape")
                except: pass
                
                email_field = page.locator("input[type='email'], input[name*='mail'], input#email, input#Email, input#username, #username, input[name='username']").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input[type='email'], input[name*='mail'], input#email, input#Email, input#username, #username, input[name='username']").first
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
                
                try:
                    await page.wait_for_selector("#logIn, button[type='submit']", state="hidden", timeout=15000)
                except: pass
                
                if await is_cancelled():
                    await browser.close()
                    return "Erro", "Cancelado."

                update_progress(40)
                log_task("Aguardando carregamento pós-login...", "DEBUG")
                try:
                    await page.wait_for_selector(".navbar, .main-sidebar, .content-header, #wrapper", timeout=60000)
                except:
                    await page.goto(url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema, wait_until="commit", timeout=30000)
                    await asyncio.sleep(2)
                
                cookies = await context.cookies()
                has_session = any('.ASPXAUTH' in c['name'] or 'Identity' in c['name'] or 'ASP.NET_SessionId' in c['name'] for c in cookies)
                if not has_session:
                    log_task("Sessão não confirmada nos cookies.", "WARNING")

            except Exception as e:
                log_task(f"Erro no login: {str(e)}", "ERROR")
                if browser: await browser.close()
                return "Erro", f"Falha no login: {str(e)[:300]}"

            # ─── 2. NAVEGAÇÃO PARA IMPORTAÇÕES → ABI ATUAL ───
            update_progress(50)
            log_task("Navegando para Importações...", "DEBUG")
            base_url = url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema.rsplit('/', 1)[0]
            import_url = f"{base_url.rstrip('/')}/importacao"
            await page.goto(import_url, wait_until="domcontentloaded", timeout=45000)
            
            log_task(f"Buscando ABI {active_abi} na grid...", "DEBUG")
            try:
                await page.wait_for_selector(f"table td:has-text('{active_abi}'), table td:has-text('{abi_clean}')", timeout=35000)
            except: pass
            
            # EXTRAÇÃO VIA JAVASCRIPT: Lê todas as linhas da tabela de uma vez
            # Isso evita os timeouts individuais de .inner_text() que ocorrem no Cloud Run
            grid_data = await page.evaluate("""() => {
                const rows = document.querySelectorAll('table tbody tr');
                return Array.from(rows).map(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    return {
                        cellCount: cells.length,
                        firstCell: cells[0] ? cells[0].innerText.trim() : '',
                        secondCell: cells[1] ? cells[1].innerText.trim() : ''
                    };
                });
            }""")
            
            log_task(f"Grid de importações lida: {len(grid_data)} linhas.", "DEBUG")
            
            target_row_index = -1
            abi_numbers = "".join(re.findall(r'\d+', active_abi))
            
            for idx, row_data in enumerate(grid_data):
                cell_text = row_data['firstCell']
                if not cell_text: continue
                
                cell_clean = cell_text.replace('º', '').strip()
                cell_numbers = "".join(re.findall(r'\d+', cell_text))
                
                if active_abi == cell_text or abi_clean == cell_clean or active_abi in cell_text or (abi_numbers and cell_numbers == abi_numbers):
                    target_row_index = idx
                    log_task(f"ABI {active_abi} localizado na linha {idx+1}.", "DEBUG")
                    break
            
            if target_row_index == -1:
                log_task("ABI atual não encontrado na grid de importações.", "WARNING")
                if browser: await browser.close()
                return "Não Verificado", "ABI não importado no RSUS."

            # Verifica se está importado
            status_text = grid_data[target_row_index]['secondCell']
            target_row = page.locator("table tbody tr").nth(target_row_index)
            
            if status_text != "Importado":
                log_task(f"ABI com status '{status_text}', pulando checagem de impugnação.", "INFO")
                if browser: await browser.close()
                return "Não Verificado", f"ABI com status: {status_text}"

            if await is_cancelled():
                await browser.close()
                return "Erro", "Cancelado."

            # ─── 3. ABRIR ATENDIMENTOS ───
            update_progress(60)
            log_task("ABI Importado. Abrindo menu de ações...", "DEBUG")
            hamburger = target_row.locator("td").last.locator("button, a, .fa-bars").first
            await hamburger.click(force=True)
            await asyncio.sleep(1.5)
            
            log_task("Clicando em 'Atendimentos'...", "DEBUG")
            atend_btn = page.locator(".dropdown-menu a:has-text('Atendimentos'), a:has-text('Atendimentos'), a[title='Atendimentos']").first
            try:
                await atend_btn.wait_for(state="visible", timeout=7000)
                await atend_btn.click(force=True)
            except Exception as e:
                log_task(f"Link 'Atendimentos' não encontrado: {str(e)[:100]}", "ERROR")
                if browser: await browser.close()
                return "Erro", "Link Atendimentos não encontrado."
            
            log_task("Aguardando carregamento da tela de Atendimentos...", "DEBUG")
            await asyncio.sleep(4)
            
            # Aguarda a grid de atendimentos carregar
            try:
                await page.wait_for_selector("table tbody tr, .grid", timeout=45000)
                await asyncio.sleep(2)
            except:
                log_task("Grid de atendimentos não carregou.", "WARNING")

            if await is_cancelled():
                await browser.close()
                return "Erro", "Cancelado."

            # ─── 4. BUSCAR "IMPUGNADO" NO CAMPO DE PESQUISA ───
            update_progress(75)
            log_task("Buscando campo de pesquisa para filtrar 'Impugnado'...", "DEBUG")
            
            # O campo de pesquisa fica no canto superior direito da grid de atendimentos
            search_field = None
            search_selectors = [
                "input.searchTerm",
                "input[placeholder*='Pesquisar']",
                "input[placeholder*='pesquisar']",
                "input[type='search']",
                "input[placeholder*='Buscar']",
                ".searchTerm",
                "input[name*='search']"
            ]
            
            for selector in search_selectors:
                candidate = page.locator(selector).first
                if await candidate.count() > 0 and await candidate.is_visible():
                    search_field = candidate
                    break
            
            # Tenta em frames se não encontrou na página principal
            if not search_field:
                for frame in page.frames:
                    for selector in search_selectors:
                        try:
                            candidate = frame.locator(selector).first
                            if await candidate.count() > 0 and await candidate.is_visible():
                                search_field = candidate
                                break
                        except: continue
                    if search_field:
                        break
            
            if not search_field:
                log_task("Campo de pesquisa não encontrado na tela de Atendimentos.", "WARNING")
                if browser: await browser.close()
                return "Não Verificado", "Campo de pesquisa não encontrado."

            # ─── 5. DEFINIR FUNÇÃO DE PESQUISA NA GRID ───
            async def search_grid(term, target_keywords):
                if not search_field: return False, 0
                log_task(f"Pesquisando por '{term}' na grid...", "DEBUG")
                await search_field.fill("")
                await search_field.fill(term)
                await asyncio.sleep(0.5)
                await page.keyboard.press("Enter")
                
                # Aguarda um pouco para o AJAX do Kendo UI processar
                await asyncio.sleep(3)
                
                # Extração via JS para evitar pendência/timeout de inner_text()
                grid_data = await page.evaluate("""() => {
                    const rows = document.querySelectorAll('table tbody tr');
                    return Array.from(rows).map(row => row.innerText.trim().toLowerCase());
                }""")
                
                has_match = False
                match_count = 0
                no_results_keywords = ['nenhum registro', 'sem resultados', '0 registros', 'no records', 'nenhum resultado']
                
                # Se a grade está vazia ou contém apenas mensagens de "sem resultados"
                if not grid_data or any(all(k in row_text for k in no_results_keywords) for row_text in grid_data[:1]):
                    pass
                else:
                    for row_text in grid_data:
                        if any(k in row_text for k in target_keywords):
                            has_match = True
                            match_count += 1
                
                # Tenta pegar contagem do rodapé se encontrou algo
                if has_match:
                    try:
                        ft_text = await page.evaluate("""
                            () => {
                                const els = document.querySelectorAll('span, div, p, .k-pager-info');
                                for (const el of els) {
                                    const t = el.innerText;
                                    if (t && /de\\s+\\d+\\s+(?:registros|itens)/i.test(t)) return t;
                                }
                                return '';
                            }
                        """)
                        if ft_text:
                            mtch = re.search(r'de\s+(\d+)\s+(?:registros|itens)', ft_text, re.I)
                            if mtch: match_count = int(mtch.group(1))
                    except: pass
                    
                return has_match, match_count

            # ─── 6. EXECUTAR PESQUISAS SEQUENCIAIS E VALIDAR REGRAS ───
            update_progress(80)
            
            # 1. Pesquisa "Impugnado" (abrange 'Impugnado' e 'Não Impugnado')
            has_imp, count_imp = await search_grid("Impugnado", ['impugnado', 'não impugnado'])
            if has_imp:
                log_task(f"Encontrados {count_imp} registros Impugnados/Não Impugnados.", "INFO")
                
            update_progress(85)
            # 2. Pesquisa "Apto" (Para incluir Apto Para Impugnação)
            has_apto, count_apto = await search_grid("Apto", ['apto'])
            if has_apto:
                log_task(f"Encontrados {count_apto} registros Aptos para Impugnação.", "INFO")
                
            update_progress(90)
            # 3. Pesquisa "Aguardando"
            has_ag, count_ag = await search_grid("Aguardando", ['aguardando'])
            if has_ag:
                log_task(f"Encontrados {count_ag} registros Aguardando Impugnação.", "INFO")
                
            update_progress(95)
            
            # ─── 7. DETERMINAR STATUS FINAL ───
            if not has_imp and not has_apto and has_ag:
                # Nao tem impasse, só "aguardando"
                log_task(f"⏳ NÃO INICIOU IMPUGNAÇÃO! {count_ag} atendimentos aguardando.", "SUCCESS")
                if browser: await browser.close()
                return "Não Iniciou", f"Cliente ainda não iniciou impugnação. {count_ag} atendimentos aguardando.", {"impugnados": 0, "aptos": 0, "aguardando": count_ag}

            elif (has_imp or has_apto) and has_ag:
                # Tem impugnados ou aptos, E também tem aguardando. Ou seja: ainda está no meio do processo
                total_resolvidos = count_imp + count_apto
                log_task(f"⚖️ IMPUGNANDO! {total_resolvidos} resolvidos (imp/apto), {count_ag} aguardando.", "SUCCESS")
                if browser: await browser.close()
                return "Impugnando", f"{total_resolvidos} registros impugnados/aptos, e {count_ag} ainda aguardando.", {"impugnados": count_imp, "aptos": count_apto, "aguardando": count_ag}

            elif (has_imp or has_apto) and not has_ag:
                # Não tem mais nada "aguardando", então tudo foi impugnado (ou apto/não impugnado)
                total_resolvidos = count_imp + count_apto
                log_task(f"✅ FINALIZOU O ABI! 0 aguardando.", "SUCCESS")
                if browser: await browser.close()
                return "Finalizou", f"Cliente finalizou o ABI. Nenhum atendimento aguardando impugnação.", {"impugnados": count_imp, "aptos": count_apto, "aguardando": 0}
            
            elif not has_imp and not has_apto and not has_ag:
                log_task("Nenhum registro encontrado nas três pesquisas (Impugnado, Apto, Aguardando).", "WARNING")
                if browser: await browser.close()
                return "Sem Impugnação", "Nenhum atendimento relevante detectado.", {"impugnados": 0, "aptos": 0, "aguardando": 0}


    except Exception as e:
        import traceback
        err_msg = f"{type(e).__name__}: {str(e)}"
        log_task(f"Erro técnico: {err_msg}", "ERROR")
        logger.error(f"IMPUGNATION CHECK TRACEBACK:\n{traceback.format_exc()}")
        if browser:
            try: await browser.close()
            except: pass
        return "Erro", f"Erro: {err_msg}", {"impugnados": 0, "aptos": 0, "aguardando": 0}


async def run_batch_impugnation_check(task_id, client_ids=None):
    """Executa checagem de impugnações em lote (apenas clientes que analisaram o ABI)."""
    try:
        all_clients = db.get_all_clients()
        
        if client_ids:
            clients = [c for c in all_clients if c['id'] in client_ids]
        else:
            # Seleciona TODAS que estão como 'Importado e Analisado' (os 39 que o usuário mencionou)
            clients = [
                c for c in all_clients 
                if c.get('abi_status') == 'Importado e Analisado'
            ]
        
        total = len(clients)
        
        db.update_task(task_id, {"total": total, "current": 0, "status": "running"})
        db.add_log(task_id, f"⚖️ Iniciando checagem de impugnações para {total} operadoras (apenas Analisadas)...")

        if total == 0:
            db.add_log(task_id, "Nenhum cliente com status 'Importado e Analisado' encontrado.", "WARNING")
            db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
            return

        # Cache de credenciais
        creds_general = db.get_rsus_credentials('general')
        creds_vitoria = db.get_rsus_credentials('unimed_vitoria')

        impugnating = 0
        finalized = 0
        sem_impugnacao = 0
        nao_iniciou = 0
        erros = 0
        details_list = []

        for i, client in enumerate(clients):
            # Check cancelamento
            task_doc = db.get_task(task_id)
            if task_doc and str(task_doc.get('status', '')).upper() in ['STOPPED', 'CANCELLED']:
                db.add_log(task_id, "⏹️ Processamento interrompido pelo usuário. Encerrando worker.", "WARNING")
                sys.exit(0)

            client_name = client.get('name', 'Desconhecido')
            db.update_task(task_id, {"current": i + 1, "current_client": client_name})
            
            target_creds = creds_vitoria if "vitoria" in client.get('url_sistema', '').lower() else creds_general
            
            status, message, stats = await run_impugnation_check_for_client(
                client['id'], task_id=task_id, pre_fetched_creds=target_creds, is_batch_run=True
            )
            
            # Adiciona aos detalhes
            emoji_map = {"Impugnando": "⚖️", "Finalizou": "🏁", "Sem Impugnação": "✅", "Não Iniciou": "⏳", "Erro": "❌"}
            emoji = emoji_map.get(status, "ℹ️")
            details_list.append(f"{emoji} *{client_name}*: {stats['impugnados']} imp | {stats['aptos']} aptos | {stats['aguardando']} aguard.")

            if status == "Impugnando":
                impugnating += 1
            elif status == "Finalizou":
                finalized += 1
            elif status == "Sem Impugnação":
                sem_impugnacao += 1
            elif status == "Não Iniciou":
                nao_iniciou += 1
            else:
                erros += 1

        db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
        db.add_log(task_id, f"Checagem de impugnações finalizada. Impugnando: {impugnating} | Finalizou: {finalized} | Não iniciou: {nao_iniciou} | Sem impugnação: {sem_impugnacao} | Erros: {erros}")
        
        details_text = "\n".join(details_list)
        
        msg = (
            f"⚖️ *GAX RSUS - Relatório de Impugnações*\n\n"
            f"Processamento em lote finalizado!\n\n"
            f"📋 *DETALHAMENTO POR OPERADORA:*\n"
            f"--------------------------------\n"
            f"{details_text}\n\n"
            f"--------------------------------\n"
            f"📊 *CONSOLIDADO DO LOTE*\n"
            f"⚖️ Impugnando: {impugnating}\n"
            f"🏁 Finalizou: {finalized}\n"
            f"⏳ Não iniciou: {nao_iniciou}\n"
            f"❌ Erros: {erros}\n"
            f"--------------------------------"
        )
        await send_whatsapp_alert(msg, task_id=task_id)

    except Exception as e:
        db.add_log(task_id, f"Erro estrutural no lote: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})


async def run_single_impugnation_check(client_id, task_id):
    """Executa checagem individual de impugnação."""
    try:
        client = db.get_client_config(client_id)
        db.update_task(task_id, {"total": 1, "current": 0, "status": "running", "current_client": client.get('name')})
        db.add_log(task_id, f"⚖️ Iniciando checagem de impugnação para: {client.get('name')}...")
        
        await run_impugnation_check_for_client(client_id, task_id=task_id)
        
        db.update_task(task_id, {"status": "completed", "current": 1, "current_client": "Finalizado"})
    except Exception as e:
        db.add_log(task_id, f"Erro: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})
