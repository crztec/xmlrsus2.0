import sys
import asyncio
import logging
import time
import base64
from datetime import datetime
from playwright.async_api import async_playwright
import api.database as db
from api.utils import send_whatsapp_alert, launch_browser_robust

logger = logging.getLogger(__name__)

async def run_api_check_for_client(client_id, task_id=None, pre_fetched_creds=None, is_batch_run=False):
    """Wrapper para a checagem que injeta a lógica de alertas de WhatsApp."""
    client = db.get_client_config(client_id)
    client_name = client.get('name', client_id) if client else client_id
    
    try:
        status, message, snap_url = await _run_api_check_logic(client_id, task_id, pre_fetched_creds)
        
        # Alerta individual se não for lote
        if not is_batch_run:
            status_emoji = "✅" if status == 'online' else "❌"
            msg = f"{status_emoji} *GAX RSUS - Checagem de API Individual*\n\nOperadora: {client_name}\nStatus: {status.upper()}\n\nDetalhes: {message}"
            # Envio aguardado (await) para evitar que a tarefa seja descartada pelo event loop
            await send_whatsapp_alert(msg, task_id=task_id)
            
        return status, message, snap_url
    except Exception as e:
        status, message = "error", f"Erro inesperado: {str(e)}"
        if not is_batch_run:
            msg = f"❌ *GAX RSUS - Erro na Checagem*\n\nOperadora: {client_name}\nErro: {str(e)[:500]}"
            await send_whatsapp_alert(msg, task_id=task_id)
        return status, message, None

async def _run_api_check_logic(client_id, task_id=None, pre_fetched_creds=None):
    """
    Lógica interna da checagem de API para um único cliente RSUS.
    """
    client = db.get_client_config(client_id)
    if not client:
        return "error", "Cliente não encontrado.", None
        
    url_sistema = client.get('url_sistema')
    client_name = client.get('name', client_id)
    
    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg)
        logger.info(full_msg)

    def update_progress(percent):
        if task_id:
            try:
                db.update_task(task_id, {"progress_percent": percent})
            except: pass

    if not url_sistema:
        return "offline", "URL não configurada.", None

    # Otimização de inicialização simultânea: Credenciais + Cold Start do Browser
    cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"

    browser = None
    try:
        async with async_playwright() as p:
            update_progress(5)
            logger.info(f"[{client_name}] Iniciando navegador e buscando credenciais simultaneamente...")
            
            browser_args = [
                "--headless=new",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu", "--single-process",
                "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,SameSiteDefaultChecksMethodRacy,dbus",
                "--disable-web-security",
                "--allow-running-insecure-content",
                "--ignore-certificate-errors",
                "--disable-blink-features=AutomationControlled",
                "--disable-software-rasterizer"
            ]
            
            async def fetch_creds():
                if pre_fetched_creds:
                    return pre_fetched_creds
                return await asyncio.to_thread(db.get_rsus_credentials, cred_type)

            # Dispara ambas as tarefas I/O bound simultaneamente
            creds, browser = await asyncio.gather(
                fetch_creds(),
                launch_browser_robust(p, browser_args, task_id=task_id)
            )
            update_progress(15)
            
            if not creds or not creds.get('username'):
                msg_erro = f"Credenciais '{cred_type}' não encontradas no sistema. Acesse Configurações > Credenciais RSUS."
                log_task(msg_erro, "ERROR")
                if browser: await browser.close()
                return "offline", msg_erro, None

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
            
            # Escuta de Erros Críticos do Browser (Raio-X de Erros JS do Portal)
            page.on("console", lambda msg: logger.warning(f"[{client_name}] [BROWSER JS] {msg.text}") if msg.type == "error" else None)
            
            # Bloqueio de assets suavizado (apenas imagens e mídias pesadas) para não quebrar SPAs/hidratação
            async def block_assets(route):
                if route.request.resource_type == "media" or "google-analytics" in route.request.url:
                    await route.abort()
                else:
                    await route.continue_()
            
            await page.route("**/*", block_assets)
            
            page.set_default_navigation_timeout(90000)
            page.set_default_timeout(90000)
            
            # Aceita dialogs automaticamente para não travar
            page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            
            async def is_cancelled():
                if not task_id: return False
                try:
                    # Checagem leve de status para permitir interrupção via UI
                    doc = db.firestore_db.collection('tasks').document(task_id).get()
                    if doc.exists and doc.to_dict().get('status') == 'cancelled':
                        log_task("Interrupção solicitada pelo usuário. Abortando serviço...", "WARNING")
                        return True
                except: pass
                return False
            
            if await is_cancelled():
                if browser: await browser.close()
                return "offline", "Tarefa cancelada pelo usuário.", None

            # 1. Login (idêntico ao robô de importação)
            try:
                update_progress(30)
                log_task("Realizando login no RSUS...")
                # Navega direto para a URL (portal redireciona para /Account/Login com ReturnUrl)
                await page.goto(url_sistema, wait_until="commit", timeout=60000)
                
                # Trata modal de alerta inicial se houver
                try:
                    alert = page.locator("#_browseralert, .browseralert").first
                    if await alert.is_visible(timeout=2000):
                        await page.keyboard.press("Escape")
                except: pass
                
                # Localiza campo de login (resiliente para múltiplos portais)
                email_field = page.locator("input#email, input#Email, input#username, #username, input[name='username']").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input#email, input#Email, input#username, #username, input[name='username']").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break
                
                await email_field.wait_for(state="visible", timeout=25000)
                logger.info(f"[{client_name}] Campo de login identificado. Preenchendo credenciais...")
                
                # Usa .type() com delay para compatibilidade com portais AngularJS
                await email_field.click(force=True)
                await email_field.type(usuario, delay=40)
                await asyncio.sleep(0.5)
                
                pwd_field = page.locator("input#password, input#Password, #password, input[type='password']").first
                await pwd_field.click(force=True)
                await pwd_field.type(senha, delay=40)
                await asyncio.sleep(0.5)
                
                btn_login = page.locator("#logIn, button[type='submit']").first
                await btn_login.click(force=True)
                
                # Aguarda desaparecimento do botão de login (mais robusto que sleep)
                try:
                    await page.wait_for_selector("#logIn, button[type='submit']", state="hidden", timeout=15000)
                except:
                    logger.warning(f"[{client_name}] Botão de login ainda visível após clique. Verificando erros na tela...")
                
                # ESTABILIZAÇÃO DE SESSÃO: Aguarda elemento real em vez de networkidle
                update_progress(55)
                logger.info(f"[{client_name}] Aguardando carregamento da interface pós-login...")
                try:
                    # Foca em um seletor que indica que a página carregou algo além do rodapé/loading
                    await page.wait_for_selector(".navbar, .main-sidebar, .content-header, #wrapper", timeout=60000)
                except Exception:
                    logger.warning(f"[{client_name}] Interface principal não detectada em 60s. Continuando com pausa de segurança...")
                    await asyncio.sleep(5)
                
                await asyncio.sleep(2)
                
                # VERIFICAÇÃO DE SESSÃO: Logar cookies e LocalStorage (idêntico ao robô de importação)
                cookies = await context.cookies()
                has_session = any(
                    '.ASPXAUTH' in c['name'] or 'Identity' in c['name'] or 'ASP.NET_SessionId' in c['name']
                    for c in cookies
                )
 
                # NOVO: SE ESTAMOS PRESOS NA TELA DE LOGIN MAS TEMOS COOKIE, FORÇAMOS O SALTO TRIPLO
                if has_session and ("Account/Login" in page.url or "Account/LogOff" in page.url):
                    logger.info(f"[{client_name}] Sessão detectada mas preso na tela de Login. Forçando Salto Triplo (Hiper-Otimizado)...")
                    # 1. Toca na raiz (wait: commit)
                    await page.goto(url_sistema.split('?')[0].rsplit('/', 1)[0] + "/", wait_until="commit", timeout=15000)
                    # 2. Visita a lista (Index) - O segredo que funcionou no robô de importação
                    # No API Check não temos /novo, então tentamos a raiz novamente ou uma rota conhecida
                    await page.goto(url_sistema, wait_until="commit", timeout=20000)
                    logger.info(f"[{client_name}] Pausa de 2s para processamento de cookies após salto de sessão...")
                    await asyncio.sleep(2)
                
                # Verifica erro de senha/login explícito na tela
                login_error = await page.evaluate("""
                    () => {
                        if (!document.body) return null;
                        const texts = ['inválido', 'incorreto', 'falhou', 'não encontrado', 'erro'];
                        const body = document.body.innerText.toLowerCase();
                        return texts.find(t => body.includes(t));
                    }
                """)
                
                if login_error and ("Account/Login" in page.url):
                    msg_fail = f"Falha na autenticação RSUS: mensagem de erro detectada ('{login_error}')."
                    log_task(msg_fail, "ERROR")
                    return "offline", msg_fail, None
 
                # Se ainda está na tela de login sem sessão detectada, falhou
                if "Account/Login" in page.url and not has_session:
                    log_task("Falha no login: ainda na tela de login sem sessão válida.", "ERROR")
                    return "offline", "Falha na autenticação RSUS.", None
                
                log_task("Login bem-sucedido. Sessão estabelecida.")
                update_progress(75)
                if await is_cancelled(): 
                    if browser: await browser.close()
                    return "offline", "Tarefa cancelada pelo usuário.", None
            except Exception as e:
                log_task(f"Erro no login: {str(e)}", "ERROR")
                return "offline", "Erro ao acessar portal RSUS.", None
 
            # 2. Navegação para Atendimentos através da lista de ABIs (Hambúrguer Direito)
            try:
                update_progress(85)
                logger.info(f"[{client_name}] Localizando ABI e abrindo menu hambúrguer...")
                if await is_cancelled(): 
                    if browser: await browser.close()
                    return "offline", "Tarefa cancelada pelo usuário.", None
                
                # REFINAMENTO FINAL: Removemos esperas globais por domcontentloaded/networkidle
                # Iniciamos polling ativo pelos elementos da grid IMEDIATAMENTE.
                
                # Função auxiliar para encontrar e clicar em elementos em qualquer frame (incluindo aninhados)
                async def click_in_frames(selector, text_match=None, title_match=None, search_frames_first=False, reverse_elements=False):
                    async def try_click_visible(root_locator):
                        try:
                            items = await root_locator.all()
                            if reverse_elements:
                                items.reverse()
                            for item in items:
                                if await item.is_visible():
                                    try:
                                        # Força o scroll em containers problemáticos (DevExpress/Bootstrap)
                                        await page.evaluate("""
                                            () => {
                                                document.querySelectorAll('.dxpc-content, .modal-body, .dxpc-mainDiv, .dx-scrollable-container').forEach(el => el.scrollTo(0, 99999));
                                            }
                                        """)
                                    except: pass
                                    
                                    await item.scroll_into_view_if_needed()
                                    await item.click(timeout=3000)
                                    return True
                        except: pass
                        return False

                    def build_locator(root):
                        if title_match: return root.locator(f"{selector}[title*='{title_match}']")
                        elif text_match: return root.locator(f"{selector}:has-text('{text_match}')")
                        else: return root.locator(selector)
                    
                    async def search_main():
                        return await try_click_visible(build_locator(page))
                    
                    async def search_iframes():
                        for frame in page.frames:
                            try:
                                if await try_click_visible(build_locator(frame)): return True
                            except: continue
                        return False

                    if search_frames_first:
                        if await search_iframes(): return True
                        if await search_main(): return True
                    else:
                        if await search_main(): return True
                        if await search_iframes(): return True
                    
                    return False

                # 1. Tenta localizar o hambúrguer (.fa-bars ou button.dropdown-toggle)
                # Implementa o "Triple Jump": se não achar em 15s, força a URL de importação
                found_bars = False
                jump_triggered = False
                
                for i in range(12): # Total de 60s (5s * 12)
                    if await click_in_frames("tr:has-text('Importado') .fa-bars, tr:has-text('Importado') button.dropdown-toggle"):
                        found_bars = True
                        break
                    
                    # OTIMIZAÇÃO: Aumentamos a prioridade manual para 30s (6 iterações) antes do salto
                    if i >= 5 and not jump_triggered:
                        logger.info(f"[{client_name}] Grid não detectada manualmente. Tentando 'Triple Jump' como recurso...")
                        # Limpa sufixos common e força a rota de importação
                        base_url = url_sistema.split('/login')[0]
                        target_url = f"{base_url.rstrip('/')}/importacao"
                        
                        # Tenta o salto com timeouts reduzidos para não bloquear a navegação manual
                        for attempt in range(2):
                            try:
                                base_url = url_sistema.split('/login')[0] if '/login' in url_sistema else url_sistema.rsplit('/', 1)[0]
                                base_url = base_url.rstrip('/')
                                
                                # 1º SALTO: Raiz do portal
                                logger.info(f"[{client_name}] Salto 1/2: {base_url}/ (Raiz)...")
                                try:
                                    await page.goto(f"{base_url}/", wait_until="commit", timeout=15000)
                                except Exception: pass
                                await asyncio.sleep(1)
                                
                                # 2º SALTO: Destino Final com wait_until=domcontentloaded para evitar tela branca de SPA (Timeout 30s)
                                logger.info(f"[{client_name}] Salto 2/2: {target_url} (Final)...")
                                try:
                                    await page.goto(target_url, wait_until="domcontentloaded", timeout=25000)
                                except Exception: pass
                                
                                # Busca agressiva por qualquer sinal de vida (60s timeout)
                                logger.info(f"[{client_name}] Aguardando renderização da grid (max 60s)...")
                                try:
                                    await page.wait_for_selector(".fa-bars, button.dropdown-toggle, .grid, .loading", timeout=60000)
                                except:
                                    # Fallback em caso de tela branca profunda: Reload Tático e IFrame Scroll
                                    logger.warning(f"[{client_name}] Tela possivelmente branca. Forçando Reload Tático (domcontentloaded)...")
                                    try:
                                        await page.reload(wait_until="commit", timeout=15000)
                                        await page.wait_for_load_state("domcontentloaded", timeout=15000)
                                        await asyncio.sleep(2)
                                    except: pass

                                    logger.warning(f"[{client_name}] Forçando scroll em todos os IFrames disponíveis...")
                                    await page.evaluate("""
                                        () => {
                                            const frames = document.querySelectorAll('iframe');
                                            frames.forEach(f => {
                                                try {
                                                    f.contentWindow.scrollTo(0, 100);
                                                    f.contentWindow.scrollTo(0, 0);
                                                } catch(e) {}
                                            });
                                            window.scrollTo(0, 100);
                                        }
                                    """)
                                    await asyncio.sleep(3)
                                    await page.wait_for_selector(".fa-bars, button.dropdown-toggle", timeout=15000)

                                logger.info(f"[{client_name}] Navegação bem-sucedida. Grid detectada.")
                                break
                            except Exception as e_jump:
                                if attempt == 0:
                                    logger.warning(f"[{client_name}] Salto demorado ({str(e_jump)[:30]}). Re-tentando salto rápido...")
                                    await asyncio.sleep(2)
                                else:
                                    logger.warning(f"[{client_name}] Salto por URL falhou ou demorou demais. Continuando via polling manual...")
                        
                        jump_triggered = True
                        
                    await asyncio.sleep(5)
                
                # FALLBACK DE RECARGA: Se após tudo ainda não achar o menu, tenta dar um refresh
                if not found_bars:
                    logger.warning(f"[{client_name}] Grid ainda não encontrada. Tentando recarregar a página (Reload Fallback)...")
                    # Usa commit seguido de wait_for_load_state relaxado
                    try:
                        await page.reload(wait_until="commit", timeout=15000)
                        await page.wait_for_load_state("domcontentloaded", timeout=10000)
                    except: pass
                    await asyncio.sleep(3)
                    if await click_in_frames("tr:has-text('Importado') .fa-bars, tr:has-text('Importado') button.dropdown-toggle"):
                        logger.info(f"[{client_name}] Grid encontrada após recarga da página.")
                        found_bars = True
                
                if not found_bars:
                    raise Exception("Menu de contexto (.fa-bars) não encontrado após polling e Triple Jump.")
                
                # LOG DE MÉTODO DE NAVEGAÇÃO
                if jump_triggered:
                    logger.info(f"[{client_name}] Acesso realizado via Salto Direto (Triple Jump)")
                else:
                    logger.info(f"[{client_name}] Acesso realizado via Navegação Manual")
                
                # 2. Aguarda o menu aparecer
                await asyncio.sleep(1)
                update_progress(90)
                
                logger.info(f"[{client_name}] Menu aberto. Navegando para 'Atendimentos'...")
                found_atend = False
                for _ in range(3):
                    if await click_in_frames('*', title_match='Atendimentos'):
                        found_atend = True
                        break
                    if await click_in_frames('*', text_match='Atendimentos'):
                        found_atend = True
                        break
                    await asyncio.sleep(2)
                
                if not found_atend:
                    raise Exception("Link 'Atendimentos' não encontrado.")
                
                await asyncio.sleep(3)
            except Exception as e:
                screenshot_url = None

                log_task(f"Erro de navegação (Atendimentos): {str(e)}", "ERROR")
                return "error", f"Falha na navegação: {str(e)[:500]}", screenshot_url

            # 3. Navegação para Beneficiário (Novo hambúrguer na tela de atendimentos)
            try:
                log_task("Na tela de Atendimentos. Abrindo menu do beneficiário...")
                if await is_cancelled(): 
                    if browser: await browser.close()
                    return "offline", "Tarefa cancelada pelo usuário.", None
                found_bars_benef = False
                for _ in range(5):
                    # Especificidade aumentada: prioriza ícones dentro de tabelas ou grids para evitar o menu lateral
                    if await click_in_frames('table .fa-bars, .grid .fa-bars, #dropdownGrid0, button.dropdown-toggle'):
                        found_bars_benef = True
                        break
                    await asyncio.sleep(4)
                
                if not found_bars_benef:
                    raise Exception("Menu de contexto não encontrado na tela de Atendimentos.")
                
                await asyncio.sleep(1.5)
                log_task("Menu aberto. Clicando em 'Beneficiário'...")
                found_benef = False
                if await click_in_frames('*', title_match='Beneficiário'):
                    found_benef = True
                elif await click_in_frames('*', text_match='Beneficiário'):
                    found_benef = True
                
                if not found_benef:
                    raise Exception("Link 'Beneficiário' não encontrado no menu.")
                
                # Aguarda modal ou nova tela
                await asyncio.sleep(4)
            except Exception as e:
                # CAPTURA DE SCREENSHOT EM CASO DE ERRO
                screenshot_url = None
                try:
                    shot_path = f"api_checks/{client_id}_{int(time.time())}.png"
                    img_bytes = await page.screenshot()
                    if db.upload_screenshot(shot_path, img_bytes):
                        screenshot_url = f"https://firebasestorage.googleapis.com/v0/b/{db.FIREBASE_STORAGE_BUCKET}/o/{shot_path.replace('/', '%2F')}?alt=media"
                except: pass

                log_task(f"Erro ao abrir beneficiário: {str(e)}", "ERROR")
                return "error", f"Erro no Beneficiário: {str(e)[:500]}", screenshot_url

            # 4. Ação de Atualização e Verificação Final
            try:
                update_progress(95)
                logger.info(f"[{client_name}] Modal de Beneficiário aberta. Rolando e atualizando...")
                if await is_cancelled(): 
                    if browser: await browser.close()
                    return "offline", "Tarefa cancelada pelo usuário.", None
                
                # =====================================================================
                # NOVO: NETWORK INTERCEPTION PARA LER A RESPOSTA AJAX DO PORTAL
                # =====================================================================
                network_status = {"error": None, "success": None, "is_updating": True}
                
                async def handle_response(response):
                    if not network_status.get("is_updating"): return
                    try:
                        url = response.url.lower()
                        if any(ext in url for ext in ['.js', '.css', '.png', '.jpg', '.gif', 'fonts']): return
                        
                        status = response.status
                        if status >= 400:
                            network_status["error"] = f"HTTP {status} do portal."
                            return
                        
                        content_type = response.headers.get("content-type", "").lower()
                        if "json" in content_type or "text" in content_type or "html" in content_type:
                            body = await response.body()
                            text = body.decode('utf-8', errors='ignore').lower()
                            
                            err_kws = ['error integração', 's0000', 'one or more errors', 'exception', 'ocorreu um erro', 'falha ao salvar']
                            if any(k in text for k in err_kws) and "sucesso" not in text:
                                network_status["error"] = f"Erro detectado na integração."
                            
                            suc_kws = ['atualizado com sucesso', 'dados atualizados', 'salvo com sucesso']
                            if any(k in text for k in suc_kws) and not network_status["error"]:
                                if response.request.method in ['POST', 'PUT']:
                                    network_status["success"] = "Sucesso detectado no payload."
                    except: pass
                
                page.on("response", handle_response)
                # =====================================================================

                found_update = False
                for _ in range(5):
                    # Tenta encontrar por texto (botões, links, divs)
                    if await click_in_frames('*', text_match='Atualizar', search_frames_first=True, reverse_elements=True):
                        found_update = True
                        break
                    # Tenta encontrar por input value
                    if await click_in_frames("input[value='Atualizar'], input[value='ATUALIZAR']", search_frames_first=True, reverse_elements=True):
                        found_update = True
                        break
                    # Tenta encontrar com uppercase
                    if await click_in_frames('*', text_match='ATUALIZAR', search_frames_first=True, reverse_elements=True):
                        found_update = True
                        break
                    await asyncio.sleep(2)
                
                if not found_update:
                    raise Exception("Botão 'Atualizar' não localizado na tela de Beneficiário.")
                
                log_task("Clique em 'Atualizar' realizado. Aguardando resposta do portal...")
                
                # --- VERIFICAÇÃO FINAL: ONLINE VS OFFLINE ---
                log_task("Aguardando resposta do portal (Polling de até 18s)...")
                update_progress(98)
                
                # Polling loop para lidar com lentidão no portal
                for attempt in range(12):
                    await asyncio.sleep(1.5)
                    
                    # 0. Verifica o interceptador de rede
                    if network_status["error"]:
                        log_task("Erro detectado na integração.", "ERROR")
                        return "offline", "Erro detectado na integração.", None
                    
                    if network_status["success"]:
                        log_task("Sucesso detectado via Rede (Interceptação AJAX). API ATIVA.")
                        return "online", "Conexão operacional.", None
                    
                    # ============================================================
                    # CAMADA 1: Detecção de popups/overlays/modais visíveis
                    # ============================================================
                    popup_result = await page.evaluate("""
                        () => {
                            const errorPatterns = /error|erro|falha|indispon|fail|exception|timeout|s\\d{4,}/i;
                            // Keywords estritas para evitar falsos positivos com a grid de fundo
                            const successPatterns = /atualizado com sucesso|dados atualizados|salvo com sucesso|gravado com sucesso/i;
                            
                            const popupSelectors = [
                                '.modal.show', '.modal.in', '.modal[style*="display: block"]',
                                '.ui-dialog:not([style*="display: none"])',
                                '.bootbox', '.swal2-popup',
                                '[role="dialog"]', '[role="alertdialog"]',
                                '.popup', '.dialog', '.overlay:not([style*="display: none"])',
                                '.dx-overlay-content', '.dx-popup-content',
                                '.k-window:not(.k-window-minimized)', '.t-window', '.RadWindow',
                                'div[class*="popup"]', 'div[class*="dialog"]', 'div[class*="modal"]',
                                'div[class*="Popup"]', 'div[class*="Dialog"]', 'div[class*="Modal"]',
                                '.alert-danger', '.alert-error', '.alert-warning',
                                'div[class*="error"]', 'div[class*="Error"]',
                            ];
                            
                            for (const sel of popupSelectors) {
                                try {
                                    const els = document.querySelectorAll(sel);
                                    for (const el of els) {
                                        const rect = el.getBoundingClientRect();
                                        const style = window.getComputedStyle(el);
                                        if (rect.width === 0 || rect.height === 0) continue;
                                        if (style.display === 'none' || style.visibility === 'hidden') continue;
                                        if (parseFloat(style.opacity) < 0.1) continue;
                                        
                                        const text = (el.innerText || '').trim();
                                        if (!text || text.length < 3) continue;
                                        
                                        if (errorPatterns.test(text)) {
                                            return { type: 'error', text: text.substring(0, 500), selector: sel };
                                        }
                                        if (successPatterns.test(text)) {
                                            return { type: 'success', text: text.substring(0, 500), selector: sel };
                                        }
                                    }
                                } catch(e) {}
                            }
                            
                            // Fallback z-index
                            const allDivs = document.querySelectorAll('div, section, aside');
                            for (const div of allDivs) {
                                try {
                                    const style = window.getComputedStyle(div);
                                    const zIndex = parseInt(style.zIndex);
                                    if (isNaN(zIndex) || zIndex < 100) continue;
                                    
                                    const rect = div.getBoundingClientRect();
                                    if (rect.width < 100 || rect.height < 50) continue;
                                    if (style.display === 'none' || style.visibility === 'hidden') continue;
                                    if (style.position !== 'fixed' && style.position !== 'absolute') continue;
                                    
                                    const text = (div.innerText || '').trim();
                                    if (!text || text.length < 5) continue;
                                    
                                    if (errorPatterns.test(text)) {
                                        return { type: 'error', text: text.substring(0, 500), selector: 'z-index:' + zIndex };
                                    }
                                    if (successPatterns.test(text)) {
                                        return { type: 'success', text: text.substring(0, 500), selector: 'z-index:' + zIndex };
                                    }
                                } catch(e) {}
                            }
                            
                            return null;
                        }
                    """)
                    
                    if not popup_result:
                        for frame in page.frames:
                            if frame == page.main_frame:
                                continue
                            try:
                                popup_result = await frame.evaluate("""
                                    () => {
                                        const errorPatterns = /error|erro|falha|indispon|fail|exception|timeout|s\\d{4,}/i;
                                        const successPatterns = /atualizado com sucesso|dados atualizados|salvo com sucesso|gravado com sucesso/i;
                                        const selectors = ['.modal.show', '.modal.in', '.modal[style*="display: block"]', '.ui-dialog', '[role="dialog"]', '[role="alertdialog"]', '.popup', '.dialog', 'div[class*="popup"]', 'div[class*="dialog"]', 'div[class*="modal"]', 'div[class*="Popup"]', 'div[class*="Dialog"]', 'div[class*="Modal"]', 'div[class*="error"]', 'div[class*="Error"]', '.alert-danger', '.dx-overlay-content', '.dx-popup-content'];
                                        for (const sel of selectors) {
                                            try {
                                                const els = document.querySelectorAll(sel);
                                                for (const el of els) {
                                                    const rect = el.getBoundingClientRect();
                                                    if (rect.width === 0 || rect.height === 0) continue;
                                                    const text = (el.innerText || '').trim();
                                                    if (!text || text.length < 3) continue;
                                                    if (errorPatterns.test(text)) return { type: 'error', text: text.substring(0, 500), selector: sel };
                                                    if (successPatterns.test(text)) return { type: 'success', text: text.substring(0, 500), selector: sel };
                                                }
                                            } catch(e) {}
                                        }
                                        return null;
                                    }
                                """)
                                if popup_result:
                                    break
                            except:
                                continue
                    
                    if popup_result:
                        popup_type = popup_result.get('type', '')
                        popup_text = popup_result.get('text', '').strip().replace('\n', ' ')[:200]
                        popup_selector = popup_result.get('selector', '')
                        
                        if popup_type == 'error':
                            log_task(f"Popup de ERRO detectado no instante {attempt+1} ({popup_selector}): {popup_text}", "WARNING")
                            
                            screenshot_url = None
                            try:
                                img_bytes = await page.screenshot(full_page=False)
                                base64_img = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('utf-8')}"
                                screenshot_url = base64_img
                            except: pass
                            
                            return "offline", f"Erro de integração: {popup_text}", screenshot_url
                        
                        elif popup_type == 'success':
                            log_task(f"Popup de SUCESSO detectado no instante {attempt+1} ({popup_selector}): {popup_text}", "SUCCESS")
                            return "online", "Conexão RSUS Ativa e funcional.", None
                            
                    # ============================================================
                    # CAMADA 2: Varredura de texto completo
                    # ============================================================
                    all_text = await page.evaluate("document.body.innerText")
                    for frame in page.frames:
                        try:
                            all_text += " " + await frame.evaluate("document.body.innerText")
                        except: pass
                    
                    all_text_lower = all_text.lower()
                    
                    error_keywords = [
                        'error integra', 'erro integra', 'erro de integração', 'error integration',
                        'one or more errors', 'errors occurred', 'erro ao atualizar',
                        'falha na atualização', 'falha na integração', 'falha ao conectar',
                        'não foi possível', 'indisponível', 'serviço indisponível', 'service unavailable',
                        'internal server error', 'tente novamente', 'conexão recusada',
                        'connection refused', 'timeout', 'time out', 's0000',
                    ]
                    
                    matched_error = next((k for k in error_keywords if k in all_text_lower), None)
                    if matched_error:
                        idx = all_text_lower.find(matched_error)
                        context_start = max(0, idx - 30)
                        context_end = min(len(all_text), idx + len(matched_error) + 80)
                        error_context = all_text[context_start:context_end].strip().replace('\n', ' ')
                        
                        log_task(f"Erro detectado no texto no instante {attempt+1}: '{error_context}'", "WARNING")
                        
                        screenshot_url = None
                        try:
                            img_bytes = await page.screenshot(full_page=False)
                            base64_img = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('utf-8')}"
                            screenshot_url = base64_img
                        except: pass
                        
                        return "offline", f"Portal retornou erro: {error_context[:200]}", screenshot_url
                    
                    # Keywords de sucesso estritas (sem palavras soltas como 'sucesso' ou 'concluído')
                    success_keywords = ['atualizado com sucesso', 'dados atualizados', 'salvo com sucesso', 'gravado com sucesso']
                    if any(k in all_text_lower for k in success_keywords):
                        log_task(f"Mensagem de sucesso detectada no texto no instante {attempt+1}.", "SUCCESS")
                        return "online", "Conexão RSUS Ativa e funcional.", None
                        
                # Se o loop terminar sem detectar nada (timeout)
                visible_summary = all_text.strip().replace('\n', ' | ')[:300]
                log_task(f"Timeout aguardando resposta. Texto visível final: {visible_summary}", "DEBUG")
                log_task("Portal processou sem erro explícito. Assumindo conexão ATIVA (Fallback).", "SUCCESS")
                return "online", "Conexão operacional (sem erro reportado).", None
                
            except Exception as e:
                log_task(f"Erro na etapa final: {str(e)}", "ERROR")
                return "error", f"Erro no formulário final: {str(e)[:50]}", None

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        log_task(f"Erro inesperado: {str(e)}", "ERROR")
        if task_id:
            db.add_log(task_id, f"TRACEBACK: {error_detail}", "ERROR")
        return "error", f"Erro técnico: {str(e)}", None
    finally:
        if browser:
            try:
                await browser.close()
            except: pass

async def run_batch_api_check(task_id=None, client_ids=None):
    """Executa a checagem para todos ou alguns clientes ativos com atualização de progresso."""
    try:
        if client_ids:
            # Busca apenas os clientes selecionados
            clients = [db.get_client_config(cid) for cid in client_ids]
            # Filtra eventuais nulos caso um ID não exista
            clients = [c for c in clients if c]
        else:
            clients = db.get_all_clients()
        
        # Proteção contra retorno nulo do banco
        if clients is None:
            clients = []
            
        total = len(clients)
        
        if task_id:
            db.update_task(task_id, {"total": total, "current": 0, "status": "running"})
            db.add_log(task_id, f"Iniciando checagem em lote para {total} clientes...")
            
        if total == 0:
            if task_id:
                db.add_log(task_id, "Processo abortado: Nenhum cliente retornado do banco de dados.", "WARNING")
                db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
            return

        # OTIMIZAÇÃO BATCH: Busca credenciais apenas uma vez na inicialização do lote
        creds_general = db.get_rsus_credentials('general')
        creds_vitoria = db.get_rsus_credentials('unimed_vitoria')
        if task_id:
            db.add_log(task_id, "Credenciais globais carregadas no cache para a execução em lote.", "DEBUG")

        for i, client in enumerate(clients):
            # NOVO: Verifica se o usuário solicitou o cancelamento via Firestore
            if task_id:
                try:
                    task_doc = db.firestore_db.collection('tasks').document(task_id).get()
                    if task_doc.exists and task_doc.to_dict().get('status') == 'cancelled':
                        db.add_log(task_id, "⏹️ Interrupção solicitada pelo usuário. Encerrando worker.", "WARNING")
                        sys.exit(0)
                except Exception as e_cancel:
                    logger.error(f"Erro ao checar cancelamento: {e_cancel}")

            client_name = client.get('name', 'Cliente Desconhecido')
            if task_id:
                db.update_task(task_id, {
                    "current": i + 1,
                    "current_client": client_name
                })
                db.add_log(task_id, f"Checando {i+1}/{total}: {client_name}...", "INFO")
            
            try:
                # Injeta a credencial pertinente via cache local em memória
                target_creds = creds_vitoria if "vitoria" in client.get('url_sistema', '').lower() else creds_general
                status, message, snap_url = await run_api_check_for_client(client['id'], task_id=task_id, pre_fetched_creds=target_creds, is_batch_run=True)
                # O status já é atualizado dentro de run_api_check_for_client, mas aqui garantimos o vínculo final
                db.update_client_api_status(client['id'], status, message, task_id=task_id, screenshot_url=snap_url, is_batch=True)
            except Exception as e:
                logger.error(f"Erro ao checar cliente {client.get('id')}: {e}")
                if task_id:
                    db.add_log(task_id, f"ERRO CRÍTICO no cliente {client_name}: {str(e)}", "ERROR")

        if task_id:
            db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
            db.add_log(task_id, "Checagem em lote finalizada.")
            
        # Alerta de Resumo de WhatsApp (Padrão sugerido)
        # Recalcula do banco os status do lote atual
        total_lote = len(clients)
        sucessos = 0
        for c in clients:
            c_data = db.get_client_config(c['id'])
            if c_data.get('api_status') == 'online':
                sucessos += 1
        
        falhas = total_lote - sucessos

        mensagem = f"🤖 *GAX RSUS - Relatório de Checagem em Lote*\n\nChecagem finalizada!\n✅ Online: {sucessos}\n❌ Falhas: {falhas}\n\nAcesse o painel para ver os detalhes."
        # Envio aguardado (await) do resumo final
        await send_whatsapp_alert(mensagem, task_id=task_id)
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"FALHA ESTRUTURAL NO BATCH: {e}\n{error_trace}")
        if task_id:
            db.add_log(task_id, f"FALHA ESTRUTURAL NO PROCESSO: {str(e)}", "ERROR")
            db.update_task(task_id, {"status": "error", "last_log": f"Falha no processo: {str(e)}"})

async def run_single_api_check(client_id, task_id=None):
    """Executa a checagem para um único cliente."""
    try:
        client = db.get_client_config(client_id)
        client_name = client.get('name', client_id) if client else client_id
        
        if task_id:
            db.update_task(task_id, {
                "total": 1, 
                "current": 0, 
                "status": "running",
                "current_client": client_name
            })
            db.add_log(task_id, f"Iniciando checagem individual: {client_name}", "INFO")
        
        status, message, snap_url = await run_api_check_for_client(client_id, task_id=task_id)
        db.update_client_api_status(client_id, status, message, task_id=task_id, screenshot_url=snap_url)
        
        if task_id:
            db.update_task(task_id, {
                "status": "completed", 
                "current": 1,
                "current_client": "Finalizado",
                "progress_percent": 100
            })
            db.add_log(task_id, f"Checagem de {client_name} finalizada: {status.capitalize()}")
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"FALHA NO PROCESSO INDIVIDUAL ({client_id}): {e}\n{error_trace}")
        if task_id:
            db.add_log(task_id, f"ERRO NA INICIALIZAÇÃO: {str(e)}", "ERROR")
            db.update_task(task_id, {"status": "error", "last_log": str(e)})
