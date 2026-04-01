import asyncio
import logging
import time
import base64
from datetime import datetime
from playwright.async_api import async_playwright
import api.database as db
from api.utils import send_whatsapp_alert

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
            await send_whatsapp_alert(msg, task_id=task_id, target_numbers=["5527997629236"])
            
        return status, message, snap_url
    except Exception as e:
        status, message = "error", f"Erro inesperado: {str(e)}"
        if not is_batch_run:
            msg = f"❌ *GAX RSUS - Erro na Checagem*\n\nOperadora: {client_name}\nErro: {str(e)[:100]}"
            await send_whatsapp_alert(msg, task_id=task_id, target_numbers=["5527997629236"])
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
            log_task(f"Iniciando navegador e buscando credenciais simultaneamente...")
            
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
                "--disable-gpu", "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
                "--disable-web-security", "--allow-running-insecure-content",
                "--ignore-certificate-errors", "--disable-blink-features=AutomationControlled"
            ]
            
            async def launch_browser():
                try:
                    return await p.chromium.launch(headless=True, args=browser_args)
                except Exception:
                    import subprocess, sys
                    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
                    return await p.chromium.launch(headless=True, args=browser_args)

            async def fetch_creds():
                if pre_fetched_creds:
                    return pre_fetched_creds
                return await asyncio.to_thread(db.get_rsus_credentials, cred_type)

            # Dispara ambas as tarefas I/O bound simultaneamente
            creds, browser = await asyncio.gather(
                fetch_creds(),
                launch_browser()
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
            page.on("console", lambda msg: log_task(f"[BROWSER JS] {msg.text}", "WARNING") if msg.type == "error" else None)
            
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
                log_task("Campo de login identificado. Preenchendo credenciais...")
                
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
                    log_task("Botão de login ainda visível após clique. Verificando erros na tela...", "WARNING")
                
                # ESTABILIZAÇÃO DE SESSÃO: Aguarda elemento real em vez de networkidle
                update_progress(55)
                log_task("Aguardando carregamento da interface pós-login...")
                try:
                    # Foca em um seletor que indica que a página carregou algo além do rodapé/loading
                    await page.wait_for_selector(".navbar, .main-sidebar, .content-header, #wrapper", timeout=60000)
                except Exception:
                    log_task("Interface principal não detectada em 60s. Continuando com pausa de segurança...", "WARNING")
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
                    log_task("Sessão detectada mas preso na tela de Login. Forçando Salto Triplo (Hiper-Otimizado)...")
                    # 1. Toca na raiz (wait: commit)
                    await page.goto(url_sistema.split('?')[0].rsplit('/', 1)[0] + "/", wait_until="commit", timeout=15000)
                    # 2. Visita a lista (Index) - O segredo que funcionou no robô de importação
                    # No API Check não temos /novo, então tentamos a raiz novamente ou uma rota conhecida
                    await page.goto(url_sistema, wait_until="commit", timeout=20000)
                    log_task("Pausa de 2s para processamento de cookies após salto de sessão...")
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
                log_task("Localizando ABI e abrindo menu hambúrguer...")
                if await is_cancelled(): 
                    if browser: await browser.close()
                    return "offline", "Tarefa cancelada pelo usuário.", None
                
                # REFINAMENTO FINAL: Removemos esperas globais por domcontentloaded/networkidle
                # Iniciamos polling ativo pelos elementos da grid IMEDIATAMENTE.
                
                # Função auxiliar para encontrar e clicar em elementos em qualquer frame (incluindo aninhados)
                async def click_in_frames(selector, text_match=None, title_match=None):
                    # 1. Tenta no frame principal primário
                    try:
                        target = None
                        if title_match:
                            target = page.locator(f"{selector}[title*='{title_match}']").first
                        elif text_match:
                            target = page.locator(f"{selector}:has-text('{text_match}')").first
                        else:
                            target = page.locator(selector).first
                        
                        if target and await target.count() > 0 and await target.is_visible():
                            await target.click(force=True)
                            return True
                    except: pass
                    
                    # 2. Varredura recursiva de todos os frames (Playwright page.frames retorna todos os frames ativos)
                    for frame in page.frames:
                        try:
                            # Ignora frames sem URL ou de trackers comuns se necessário, mas aqui buscamos em tudo
                            f_target = None
                            if title_match:
                                f_target = frame.locator(f"{selector}[title*='{title_match}']").first
                            elif text_match:
                                f_target = frame.locator(f"{selector}:has-text('{text_match}')").first
                            else:
                                f_target = frame.locator(selector).first
                            
                            if f_target and await f_target.count() > 0 and await f_target.is_visible():
                                # Garante scroll para visibilidade se estiver enterrado
                                await f_target.scroll_into_view_if_needed()
                                await f_target.click(force=True)
                                return True
                        except: continue
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
                        log_task("Grid não detectada manualmente. Tentando 'Triple Jump' como recurso...")
                        # Limpa sufixos common e força a rota de importação
                        base_url = url_sistema.split('/login')[0]
                        target_url = f"{base_url.rstrip('/')}/importacao"
                        
                        # Tenta o salto com timeouts reduzidos para não bloquear a navegação manual
                        for attempt in range(2):
                            try:
                                base_url = url_sistema.split('/login')[0] if '/login' in url_sistema else url_sistema.rsplit('/', 1)[0]
                                base_url = base_url.rstrip('/')
                                
                                # 1º SALTO: Raiz do portal
                                log_task(f"Salto 1/2: {base_url}/ (Raiz)...")
                                try:
                                    await page.goto(f"{base_url}/", wait_until="commit", timeout=15000)
                                except Exception: pass
                                await asyncio.sleep(1)
                                
                                # 2º SALTO: Destino Final com wait_until=domcontentloaded para evitar tela branca de SPA (Timeout 30s)
                                log_task(f"Salto 2/2: {target_url} (Final)...")
                                try:
                                    await page.goto(target_url, wait_until="domcontentloaded", timeout=25000)
                                except Exception: pass
                                
                                # Busca agressiva por qualquer sinal de vida (60s timeout)
                                log_task("Aguardando renderização da grid (max 60s)...")
                                try:
                                    await page.wait_for_selector(".fa-bars, button.dropdown-toggle, .grid, .loading", timeout=60000)
                                except:
                                    # Fallback em caso de tela branca profunda: Reload Tático e IFrame Scroll
                                    log_task("Tela possivelmente branca. Forçando Reload Tático (domcontentloaded)...", "WARNING")
                                    try:
                                        await page.reload(wait_until="commit", timeout=15000)
                                        await page.wait_for_load_state("domcontentloaded", timeout=15000)
                                        await asyncio.sleep(2)
                                    except: pass

                                    log_task("Forçando scroll em todos os IFrames disponíveis...", "WARNING")
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

                                log_task("Navegação bem-sucedida. Grid detectada.")
                                break
                            except Exception as e_jump:
                                if attempt == 0:
                                    log_task(f"Salto demorado ({str(e_jump)[:30]}). Re-tentando salto rápido...", "WARNING")
                                    await asyncio.sleep(2)
                                else:
                                    log_task("Salto por URL falhou ou demorou demais. Continuando via polling manual...", "WARNING")
                        
                        jump_triggered = True
                        
                    await asyncio.sleep(5)
                
                # FALLBACK DE RECARGA: Se após tudo ainda não achar o menu, tenta dar um refresh
                if not found_bars:
                    log_task("Grid ainda não encontrada. Tentando recarregar a página (Reload Fallback)...", "WARNING")
                    # Usa commit seguido de wait_for_load_state relaxado
                    try:
                        await page.reload(wait_until="commit", timeout=15000)
                        await page.wait_for_load_state("domcontentloaded", timeout=10000)
                    except: pass
                    await asyncio.sleep(3)
                    if await click_in_frames("tr:has-text('Importado') .fa-bars, tr:has-text('Importado') button.dropdown-toggle"):
                        log_task("Grid encontrada após recarga da página.")
                        found_bars = True
                
                if not found_bars:
                    raise Exception("Menu de contexto (.fa-bars) não encontrado após polling e Triple Jump.")
                
                # LOG DE MÉTODO DE NAVEGAÇÃO
                if jump_triggered:
                    log_task("Acesso realizado via Salto Direto (Triple Jump)")
                else:
                    log_task("Acesso realizado via Navegação Manual")
                
                # 2. Aguarda o menu aparecer
                await asyncio.sleep(1)
                
                log_task("Menu aberto. Navegando para 'Atendimentos'...")
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
                # CAPTURA DE SCREENSHOT FORENSE EM CASO DE ERRO (BASE64)
                screenshot_url = None
                try:
                    log_task("Pausa de 2s para renderização antes do print forense...")
                    await asyncio.sleep(2)
                    log_task("Capturando print forense da falha (Formato Base64)...")
                    img_bytes = await page.screenshot(full_page=False)
                    base64_img = f"data:image/png;base64,{base64.b64encode(img_bytes).decode('utf-8')}"
                    log_task(f"Screenshot gerado com sucesso. Tamanho: {len(base64_img)} caracteres.")
                    screenshot_url = base64_img
                except Exception as e_shot:
                    log_task(f"Erro ao capturar screenshot: {str(e_shot)}", "WARNING")

                log_task(f"Erro de navegação (Atendimentos): {str(e)}", "ERROR")
                return "error", f"Falha na navegação: {str(e)[:50]}", screenshot_url

            # 3. Navegação para Beneficiário (Novo hambúrguer na tela de atendimentos)
            try:
                log_task("Na tela de Atendimentos. Abrindo menu do beneficiário...")
                if await is_cancelled(): 
                    if browser: await browser.close()
                    return "offline", "Tarefa cancelada pelo usuário.", None
                found_bars_benef = False
                for _ in range(5):
                    if await click_in_frames('.fa-bars, button.dropdown-toggle'):
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
                return "error", f"Erro no Beneficiário: {str(e)[:50]}", screenshot_url

            # 4. Ação de Atualização e Verificação Final
            try:
                log_task("Modal de Beneficiário aberta. Rolando e atualizando...")
                if await is_cancelled(): 
                    if browser: await browser.close()
                    return "offline", "Tarefa cancelada pelo usuário.", None
                
                found_update = False
                for _ in range(5):
                    # Tenta encontrar por texto (botões, links, divs)
                    if await click_in_frames('*', text_match='Atualizar'):
                        found_update = True
                        break
                    # Tenta encontrar por input value
                    if await click_in_frames("input[value='Atualizar'], input[value='ATUALIZAR']"):
                        found_update = True
                        break
                    # Tenta encontrar com uppercase
                    if await click_in_frames('*', text_match='ATUALIZAR'):
                        found_update = True
                        break
                    await asyncio.sleep(2)
                
                if not found_update:
                    raise Exception("Botão 'Atualizar' não localizado na tela de Beneficiário.")
                
                log_task("Clique em 'Atualizar' realizado. Aguardando resposta do portal...")
                
                # --- VERIFICAÇÃO FINAL: ONLINE VS OFFLINE ---
                # Aguarda modal de sucesso ou erro (plural/singular)
                await asyncio.sleep(4)
                
                # Pega todo o texto visível (incluindo frames) para detectar a modal
                all_text = await page.evaluate("document.body.innerText")
                for frame in page.frames:
                    try:
                        all_text += " " + await frame.evaluate("document.body.innerText")
                    except: pass
                
                all_text = all_text.lower()
                
                success_keywords = ['atualizado', 'sucesso', 'concluído', 'ok']
                error_keywords = ['erro', 'falha', 'indisponível', 'tente novamente', 'conexão']
                
                if any(k in all_text for k in success_keywords):
                    log_task("Mensagem de sucesso detectada: API configurada no RSUS está ATIVA.", "SUCCESS")
                    return "online", "Conexão RSUS Ativa e funcional.", None
                elif any(k in all_text for k in error_keywords):
                    log_task("Mensagem de erro detectada no portal após clique em Atualizar.", "WARNING")
                    return "offline", "Portal retornou erro na atualização (Offline).", None
                
                # Fallback: se clicou e não deu erro explícito, assumimos online
                log_task("Portal processou sem erro explícito. Assumindo conexão ATIVA.", "SUCCESS")
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
                        db.add_log(task_id, "Interrupção solicitada pelo usuário. Finalizando processo...", "WARNING")
                        break
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
                db.update_client_api_status(client['id'], status, message, task_id=task_id, screenshot_url=snap_url)
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
        await send_whatsapp_alert(mensagem, task_id=task_id, target_numbers=["5527997629236"])
            
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
                "current_client": "Finalizado"
            })
            db.add_log(task_id, f"Checagem de {client_name} finalizada: {status}")
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"FALHA NO PROCESSO INDIVIDUAL ({client_id}): {e}\n{error_trace}")
        if task_id:
            db.add_log(task_id, f"ERRO NA INICIALIZAÇÃO: {str(e)}", "ERROR")
            db.update_task(task_id, {"status": "error", "last_log": str(e)})
