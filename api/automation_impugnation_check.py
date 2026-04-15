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
        full_msg = f"[{client_name}] [SYNC CUBETI {'IMPUGN' if 'Impugnando' in target_status else 'FINAL'}] {msg}"
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
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            
            if await is_cancelled():
                await browser.close()
                return False

            context = await browser.new_context(ignore_https_errors=True, viewport={"width": 1920, "height": 1080})
            page = await context.new_page()
            
            # Login
            log_task("Realizando login Gestaocomercial...")
            await page.goto("https://gestaocomercial.cubeti.com.br/ABITracker", wait_until="domcontentloaded", timeout=45000)
            
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
                await page.goto("https://gestaocomercial.cubeti.com.br/ABITracker", wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(2)
                
            # Busca operadora específica
            search_input = page.locator("input[placeholder*='Buscar cliente'], input[placeholder*='Pesquisar']").first
            if await search_input.count() > 0:
                await search_input.click()
                await search_input.fill("")
                await search_input.fill(client_name)
                await asyncio.sleep(2)
                await page.keyboard.press("Enter")
                await asyncio.sleep(3)
            
            target_row = page.locator("table tbody tr").filter(has_text=re.compile(client_name, re.IGNORECASE)).first
            
            if await target_row.count() == 0:
                log_task("Operadora não encontrada na grid da Cubeti.", "WARNING")
                await browser.close()
                return False
                
            log_task("Operadora localizada!")
            
            # Selecionar status no dropdown do CubeTI
            log_task(f"Atualizando status para '{target_status}'")
            
            status_trigger = target_row.locator("button, [role='combobox'], .cursor-pointer, span.inline-flex, span[aria-haspopup='dialog']").filter(
                has_text=re.compile(r"Não iniciou|Importou|Impugnando|Impugnado|Finalizou|Agendou|Erro|Analisou", re.IGNORECASE)
            ).first
            
            if await status_trigger.count() > 0:
                await status_trigger.scroll_into_view_if_needed()
                await status_trigger.dispatch_event("mousedown")
                await status_trigger.click(force=True)
                await asyncio.sleep(2)
                
                option_regex = re.compile(r"Impugnando.*ABI", re.I)
                option = page.locator("[role='menuitem'], [role='option'], .dropdown-item, button").filter(has_text=option_regex).first
                
                if await option.count() > 0:
                    await option.click(force=True)
                    log_task(f"Status '{target_status}' selecionado.")
                    await asyncio.sleep(2)
                else:
                    # Fallback por texto visível
                    log_task(f"Popover não detectado via regex, tentando fallback literal...", "WARNING")
                    option_fallback = page.locator(f"button:has-text('{target_status}'), a:has-text('{target_status}')").filter(visible=True).first
                    if await option_fallback.count() > 0:
                        await option_fallback.click(force=True)
                        log_task(f"Status '{target_status}' selecionado via fallback.")
                    else:
                        log_task("Menu de status não reconheceu a opção, tentando teclado...", "WARNING")
                        await page.keyboard.press("ArrowDown")
                        await asyncio.sleep(1)
                        await page.keyboard.press("Enter")
            else:
                log_task("Dropdown de status não encontrado.", "WARNING")
        
            log_task(f"Registrando contato: '{contact_message}'...")
            
            # Seletores ultra-robustos que ancoram no link com o nome do cliente
            # Tenta CSS robusto e XPath como fallback imediato
            selectors = [
                f"tr:has(a:has-text('{client_name}')) button[title='Registrar contato']",
                f"//tr[.//a[contains(text(), '{client_name}')]]//button[@title='Registrar contato']",
                f"tr:has-text('{client_name}') button[title='Registrar contato']"
            ]
            
            btn_add = None
            for sel in selectors:
                try:
                    btn_add = page.locator(sel).first
                    if await btn_add.count() > 0:
                        log_task(f"Botão '+' localizado via seletor: {sel}")
                        break
                except: continue
                
            if not btn_add or await btn_add.count() == 0:
                log_task("Busca secundária por botão '+' em andamento...", "WARNING")
                btn_add = page.locator("button[title='Registrar contato']").filter(visible=True).first
            

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

            await browser.close()
            return True
            
    except Exception as e:
        log_task(f"Erro na sincronização: {str(e)}", "ERROR")
        if browser: await browser.close()
        return False


async def run_impugnation_check_for_client(client_id, task_id=None, pre_fetched_creds=None, is_batch_run=False):
    """Checa impugnações para um único cliente no RSUS."""
    client = db.get_client_config(client_id)
    client_name = client.get('name', client_id) if client else client_id

    active_abi_doc = db.get_active_abi()
    active_abi = active_abi_doc.get('ABI', 'Desconhecido') if active_abi_doc else 'Desconhecido'

    try:
        status, message = await _run_impugnation_logic(client_id, active_abi, task_id, pre_fetched_creds)
        
        # Salva o status de impugnação no cliente
        db.update_client_impugnation_status(client_id, status, message, task_id)
        
        # Sincroniza com Cubeti conforme o status
        if status == "Impugnando":
            await _sync_impugnation_to_cubeti(client_name, task_id, target_status="Impugnando o ABI", contact_message="Cliente impugnando o ABI")
        elif status == "Finalizou":
            await _sync_impugnation_to_cubeti(client_name, task_id, target_status="Finalizou o ABI", contact_message="Cliente Finalizou o ABI")
        
        # Alerta WhatsApp individual
        if not is_batch_run:
            emoji_map = {"Impugnando": "⚖️", "Finalizou": "🏁", "Sem Impugnação": "✅"}
            emoji = emoji_map.get(status, "ℹ️")
            msg = (
                f"{emoji} *GAX RSUS - Checagem de Impugnações*\n\n"
                f"Operadora: {client_name}\n"
                f"ABI: {active_abi}\n"
                f"Resultado: {status}\n\n"
                f"Detalhes: {message}"
            )
            await send_whatsapp_alert(msg, task_id=task_id)
            
        return status, message
    except Exception as e:
        import traceback
        err = f"{type(e).__name__}: {str(e)}"
        logger.error(f"Impugnation check error: {traceback.format_exc()}")
        db.update_client_impugnation_status(client_id, "Erro", err, task_id)
        if task_id:
            db.add_log(task_id, f"[{client_name}] Erro crítico: {err}", "ERROR")
        return "Erro", err


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
                "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
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
                log_task("Aguardando carregamento pós-login...")
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
            log_task("Navegando para Importações...")
            base_url = url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema.rsplit('/', 1)[0]
            import_url = f"{base_url.rstrip('/')}/importacao"
            await page.goto(import_url, wait_until="domcontentloaded", timeout=45000)
            
            log_task(f"Buscando ABI {active_abi} na grid...")
            try:
                await page.wait_for_selector(f"table td:has-text('{active_abi}'), table td:has-text('{abi_clean}')", timeout=35000)
            except: pass
            
            # Varredura manual de linhas para localizar o ABI
            rows = page.locator("table tbody tr")
            count = await rows.count()
            target_row = None
            
            for i in range(count):
                row = rows.nth(i)
                first_cell = row.locator("td").first
                if await first_cell.count() > 0:
                    cell_text = (await first_cell.inner_text()).strip()
                    cell_clean = cell_text.replace('º', '').strip()
                    cell_numbers = "".join(re.findall(r'\d+', cell_text))
                    abi_numbers = "".join(re.findall(r'\d+', active_abi))
                    
                    if active_abi == cell_text or abi_clean == cell_clean or active_abi in cell_text or (abi_numbers and cell_numbers == abi_numbers):
                        target_row = row
                        break
            
            if not target_row:
                log_task("ABI atual não encontrado na grid de importações.", "WARNING")
                if browser: await browser.close()
                return "Não Verificado", "ABI não importado no RSUS."

            # Verifica se está importado
            status_cell = target_row.locator("td").nth(1)
            status_text = (await status_cell.inner_text()).strip()
            
            if status_text != "Importado":
                log_task(f"ABI com status '{status_text}', pulando checagem de impugnação.", "INFO")
                if browser: await browser.close()
                return "Não Verificado", f"ABI com status: {status_text}"

            if await is_cancelled():
                await browser.close()
                return "Erro", "Cancelado."

            # ─── 3. ABRIR ATENDIMENTOS ───
            update_progress(60)
            log_task("ABI Importado. Abrindo menu de ações...")
            hamburger = target_row.locator("td").last.locator("button, a, .fa-bars").first
            await hamburger.click(force=True)
            await asyncio.sleep(1.5)
            
            log_task("Clicando em 'Atendimentos'...")
            atend_btn = page.locator(".dropdown-menu a:has-text('Atendimentos'), a:has-text('Atendimentos'), a[title='Atendimentos']").first
            try:
                await atend_btn.wait_for(state="visible", timeout=7000)
                await atend_btn.click(force=True)
            except Exception as e:
                log_task(f"Link 'Atendimentos' não encontrado: {str(e)[:100]}", "ERROR")
                if browser: await browser.close()
                return "Erro", "Link Atendimentos não encontrado."
            
            log_task("Aguardando carregamento da tela de Atendimentos...")
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
            log_task("Buscando campo de pesquisa para filtrar 'Impugnado'...")
            
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
            
            log_task("Campo de pesquisa localizado. Digitando 'Impugnado'...")
            await search_field.click()
            await search_field.fill("")
            await search_field.type("Impugnado", delay=60)
            await asyncio.sleep(1)
            await page.keyboard.press("Enter")
            
            # Aguarda a grid filtrar
            log_task("Aguardando resultado da busca...")
            await asyncio.sleep(4)
            
            # ─── 5. VERIFICAR RESULTADOS DE IMPUGNAÇÃO ───
            update_progress(80)
            
            # Verifica se existem linhas com "Impugnado" ou "Não Impugnado" na grid
            has_impugnation = False
            impugnation_count = 0
            
            # Analisa texto visível na grid/page
            try:
                grid_text = await page.evaluate("document.body.innerText")
                for frame in page.frames:
                    try:
                        grid_text += " " + await frame.evaluate("document.body.innerText")
                    except: pass
            except:
                grid_text = ""
            
            impugnation_keywords = ['impugnado', 'impugnação', 'aguardando impugnação', 'não impugnado']
            no_results_keywords = ['nenhum registro', 'sem resultados', '0 registros', 'no records', 'nenhum resultado']
            
            grid_lower = grid_text.lower()
            has_no_results = any(k in grid_lower for k in no_results_keywords)
            
            if not has_no_results:
                visible_rows = page.locator("table tbody tr")
                row_count = await visible_rows.count()
                
                if row_count > 0:
                    for r_idx in range(min(row_count, 5)):
                        try:
                            row_text = (await visible_rows.nth(r_idx).inner_text()).strip().lower()
                            if any(k in row_text for k in impugnation_keywords):
                                has_impugnation = True
                                impugnation_count += 1
                        except: continue
                    
                    if not has_impugnation and row_count > 0:
                        has_impugnation = True
                        impugnation_count = row_count
            
            # Tenta pegar contagem do rodapé
            try:
                footer_text = await page.evaluate("""
                    () => {
                        const els = document.querySelectorAll('span, div, p');
                        for (const el of els) {
                            const t = el.innerText;
                            if (t && /de\\s+\\d+\\s+registros/i.test(t)) return t;
                            if (t && /\\d+\\s+registros/i.test(t)) return t;
                        }
                        return '';
                    }
                """)
                if footer_text:
                    total_match = re.search(r'de\s+(\d+)\s+registros', footer_text, re.I)
                    if total_match:
                        impugnation_count = int(total_match.group(1))
                        if impugnation_count > 0:
                            has_impugnation = True
            except: pass

            if has_impugnation:
                log_task(f"⚖️ IMPUGNAÇÕES DETECTADAS! {impugnation_count} atendimentos encontrados.", "SUCCESS")
            else:
                log_task("Nenhuma impugnação encontrada para este cliente.", "INFO")
            
            # ─── 6. BUSCAR "AGUARDANDO IMPUGNAÇÃO" ───
            update_progress(88)
            log_task("Verificando atendimentos 'Aguardando Impugnação'...")
            
            # Limpa o campo de busca e pesquisa por "Aguardando Impugnação"
            if search_field:
                await search_field.click()
                await search_field.fill("")
                await search_field.type("Aguardando", delay=60)
                await asyncio.sleep(1)
                await page.keyboard.press("Enter")
                await asyncio.sleep(4)
            
            has_aguardando = False
            aguardando_count = 0
            
            try:
                grid_text2 = await page.evaluate("document.body.innerText")
                for frame in page.frames:
                    try:
                        grid_text2 += " " + await frame.evaluate("document.body.innerText")
                    except: pass
            except:
                grid_text2 = ""
            
            grid_lower2 = grid_text2.lower()
            has_no_results2 = any(k in grid_lower2 for k in no_results_keywords)
            
            if not has_no_results2:
                visible_rows2 = page.locator("table tbody tr")
                row_count2 = await visible_rows2.count()
                
                if row_count2 > 0:
                    for r_idx in range(min(row_count2, 5)):
                        try:
                            row_text2 = (await visible_rows2.nth(r_idx).inner_text()).strip().lower()
                            if 'aguardando' in row_text2:
                                has_aguardando = True
                                aguardando_count += 1
                        except: continue
                    
                    if not has_aguardando and row_count2 > 0:
                        # A busca por "Aguardando" já filtrou
                        has_aguardando = True
                        aguardando_count = row_count2
            
            # Tenta pegar contagem do rodapé para "Aguardando"
            try:
                footer_text2 = await page.evaluate("""
                    () => {
                        const els = document.querySelectorAll('span, div, p');
                        for (const el of els) {
                            const t = el.innerText;
                            if (t && /de\\s+\\d+\\s+registros/i.test(t)) return t;
                            if (t && /\\d+\\s+registros/i.test(t)) return t;
                        }
                        return '';
                    }
                """)
                if footer_text2:
                    total_match2 = re.search(r'de\s+(\d+)\s+registros', footer_text2, re.I)
                    if total_match2:
                        aguardando_count = int(total_match2.group(1))
                        if aguardando_count > 0:
                            has_aguardando = True
            except: pass

            update_progress(95)
            
            # ─── 7. DETERMINAR STATUS FINAL ───
            if has_impugnation and not has_aguardando:
                # Tem impugnações feitas MAS não tem mais nada aguardando → Finalizou
                log_task(f"✅ FINALIZOU O ABI! {impugnation_count} impugnações realizadas, 0 aguardando.", "SUCCESS")
                if browser: await browser.close()
                return "Finalizou", f"Cliente finalizou o ABI. {impugnation_count} impugnações realizadas, nenhuma aguardando."
            elif has_impugnation and has_aguardando:
                # Tem impugnações E ainda tem atendimentos aguardando → Impugnando
                log_task(f"⚖️ IMPUGNANDO! {impugnation_count} impugnações, {aguardando_count} aguardando.", "SUCCESS")
                if browser: await browser.close()
                return "Impugnando", f"{impugnation_count} impugnações detectadas, {aguardando_count} aguardando."
            elif not has_impugnation and has_aguardando:
                # Sem impugnações mas com aguardando → Impugnando (ainda vai impugnar)
                log_task(f"⏳ AGUARDANDO IMPUGNAÇÃO! {aguardando_count} atendimentos aguardando.", "SUCCESS")
                if browser: await browser.close()
                return "Impugnando", f"{aguardando_count} atendimentos aguardando impugnação."
            else:
                # Sem impugnação e sem aguardando
                log_task("Nenhuma impugnação e nenhum aguardando encontrado.", "SUCCESS")
                if browser: await browser.close()
                return "Sem Impugnação", "Nenhum atendimento com impugnação detectado."

    except Exception as e:
        import traceback
        err_msg = f"{type(e).__name__}: {str(e)}"
        log_task(f"Erro técnico: {err_msg}", "ERROR")
        logger.error(f"IMPUGNATION CHECK TRACEBACK:\n{traceback.format_exc()}")
        if browser:
            try: await browser.close()
            except: pass
        return "Erro", f"Erro: {err_msg}"


async def run_batch_impugnation_check(task_id, client_ids=None):
    """Executa checagem de impugnações em lote (apenas clientes que analisaram o ABI)."""
    try:
        all_clients = db.get_all_clients()
        
        if client_ids:
            clients = [c for c in all_clients if c['id'] in client_ids]
        else:
            # Filtra clientes "Importado e Analisado" ignorando quem já "Finalizou"
            clients = [
                c for c in all_clients 
                if c.get('abi_status') == 'Importado e Analisado' 
                and c.get('impugnation_status') != 'Finalizou'
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
        erros = 0

        for i, client in enumerate(clients):
            # Check cancelamento
            task_doc = db.get_task(task_id)
            if task_doc and str(task_doc.get('status', '')).upper() in ['STOPPED', 'CANCELLED']:
                db.add_log(task_id, "⏹️ Processamento interrompido pelo usuário.", "WARNING")
                break

            client_name = client.get('name', 'Desconhecido')
            db.update_task(task_id, {"current": i + 1, "current_client": client_name})
            
            target_creds = creds_vitoria if "vitoria" in client.get('url_sistema', '').lower() else creds_general
            
            status, message = await run_impugnation_check_for_client(
                client['id'], task_id=task_id, pre_fetched_creds=target_creds, is_batch_run=True
            )
            
            if status == "Impugnando":
                impugnating += 1
            elif status == "Finalizou":
                finalized += 1
            elif status == "Sem Impugnação":
                sem_impugnacao += 1
            else:
                erros += 1

        db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
        db.add_log(task_id, f"Checagem de impugnações finalizada. Impugnando: {impugnating} | Finalizou: {finalized} | Sem impugnação: {sem_impugnacao} | Erros: {erros}")
        
        msg = (
            f"⚖️ *GAX RSUS - Relatório de Impugnações*\n\n"
            f"Processamento finalizado!\n"
            f"⚖️ Impugnando: {impugnating}\n"
            f"🏁 Finalizou: {finalized}\n"
            f"✅ Sem impugnação: {sem_impugnacao}\n"
            f"❌ Erros: {erros}"
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
