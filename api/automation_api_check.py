import asyncio
import logging
from datetime import datetime
from playwright.async_api import async_playwright
import api.database as db

logger = logging.getLogger(__name__)

async def run_api_check_for_client(client_id, task_id=None):
    """
    Executa a checagem de API para um único cliente RSUS.
    Segue o fluxo: Login > Hamburguer (ABI) > Atendimentos > Hamburguer (Atendimento) > Beneficiário > Atualizar.
    """
    client = db.get_client_config(client_id)
    if not client:
        return "error", "Cliente não encontrado."
        
    url_sistema = client.get('url_sistema')
    client_name = client.get('name', client_id)
    
    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg)
        logger.info(full_msg)

    if not url_sistema:
        return "offline", "URL não configurada."

    # Determina credenciais
    cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"
    log_task(f"Buscando credenciais do tipo: {cred_type}...")
    creds = db.get_rsus_credentials(cred_type)
    
    if not creds or not creds.get('username'):
        msg_erro = f"Credenciais '{cred_type}' não encontradas no sistema. Acesse Configurações > Credenciais RSUS."
        log_task(msg_erro, "ERROR")
        return "offline", msg_erro

    usuario = creds['username']
    senha = creds['password']

    browser = None
    try:
        async with async_playwright() as p:
            log_task(f"Iniciando navegador para {url_sistema}...")
            
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
                "--disable-gpu", "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
                "--disable-web-security", "--allow-running-insecure-content",
                "--ignore-certificate-errors", "--disable-blink-features=AutomationControlled"
            ]
            try:
                browser = await p.chromium.launch(headless=True, args=browser_args)
            except Exception:
                import subprocess, sys
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
            
            # Bloqueia assets pesados para acelerar carregamento
            async def block_assets(route):
                if route.request.resource_type in ["image", "font"]:
                    await route.abort()
                else:
                    await route.continue_()
            await page.route("**/*", block_assets)
            
            page.set_default_navigation_timeout(90000)
            page.set_default_timeout(90000)
            
            # Aceita dialogs automaticamente para não travar
            page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
            
            # INTERCEPTOR DE COOKIES (idêntico ao robô de importação)
            # Força reinjeção de cookies de sessão para contornar restrições SameSite/Secure do Cloud Run
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
                                try:
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
                    except: pass
            page.on("response", handle_response)
            
            # 1. Login (idêntico ao robô de importação)
            try:
                log_task("Realizando login no RSUS...")
                # Navega direto para a URL (portal redireciona para /Account/Login com ReturnUrl)
                await page.goto(url_sistema, wait_until="commit", timeout=60000)
                
                # Trata modal de alerta inicial se houver
                try:
                    alert = page.locator("#_browseralert, .browseralert").first
                    if await alert.is_visible(timeout=2000):
                        await page.keyboard.press("Escape")
                except: pass
                
                # Localiza campo de email (seletor idêntico ao robô de importação)
                email_field = page.locator("input#email, input#Email").first
                if await email_field.count() == 0:
                    for frame in page.frames:
                        f_email = frame.locator("input#email, input#Email").first
                        if await f_email.count() > 0:
                            email_field = f_email
                            break
                
                await email_field.wait_for(state="visible", timeout=25000)
                log_task("Campo de login identificado. Preenchendo credenciais...")
                
                # Usa .type() com delay para compatibilidade com portais AngularJS
                await email_field.click()
                await email_field.type(usuario, delay=40)
                await asyncio.sleep(0.5)
                
                pwd_field = page.locator("input#password, input#Password").first
                await pwd_field.click()
                await pwd_field.type(senha, delay=40)
                await asyncio.sleep(0.5)
                
                btn_login = page.locator("#logIn, button[type='submit']").first
                await btn_login.click()
                
                # Aguarda desaparecimento do botão de login (mais robusto que sleep)
                try:
                    await page.wait_for_selector("#logIn, button[type='submit']", state="hidden", timeout=15000)
                except:
                    log_task("Botão de login ainda visível após clique. Verificando erros na tela...", "WARNING")
                
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
                    await page.goto(url_sistema.split('?')[0].rsplit('/', 1)[0] + "/", wait_until="commit", timeout=30000)
                    # 2. Visita a lista (Index) - O segredo que funcionou no robô de importação
                    # No API Check não temos /novo, então tentamos a raiz novamente ou uma rota conhecida
                    await page.goto(url_sistema, wait_until="commit", timeout=45000)
                    await asyncio.sleep(3)
                
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
                    return "offline", msg_fail

                # Se ainda está na tela de login sem sessão detectada, falhou
                if "Account/Login" in page.url and not has_session:
                    log_task("Falha no login: ainda na tela de login sem sessão válida.", "ERROR")
                    return "offline", "Falha na autenticação RSUS."
                
                log_task("Login bem-sucedido. Sessão estabelecida.")
            except Exception as e:
                log_task(f"Erro no login: {str(e)}", "ERROR")
                return "offline", "Erro ao acessar portal RSUS."

            # 2. Navegação para Atendimentos através da lista de ABIs (Hambúrguer Direito)
            try:
                log_task("Localizando ABI e abrindo menu hambúrguer...")
                
                # REFINAMENTO FINAL: Removemos esperas globais por domcontentloaded/networkidle
                # Iniciamos polling ativo pelos elementos da grid IMEDIATAMENTE.
                
                # Função auxiliar para encontrar e clicar em elementos em qualquer frame
                async def click_in_frames(selector, text_match=None, title_match=None):
                    # Tenta no frame principal
                    target = None
                    if title_match:
                        target = page.locator(f"{selector}[title*='{title_match}']").first
                    elif text_match:
                        target = page.locator(f"{selector}:has-text('{text_match}')").first
                    else:
                        target = page.locator(selector).first
                    
                    if target and await target.count() > 0 and await target.is_visible():
                        await target.click()
                        return True
                    
                    # Tenta nos IFrames
                    for frame in page.frames:
                        try:
                            f_target = None
                            if title_match:
                                f_target = frame.locator(f"{selector}[title*='{title_match}']").first
                            elif text_match:
                                f_target = frame.locator(f"{selector}:has-text('{text_match}')").first
                            else:
                                f_target = frame.locator(selector).first
                            
                            if f_target and await f_target.count() > 0 and await f_target.is_visible():
                                await f_target.click()
                                return True
                        except: continue
                    return False

                # 1. Tenta localizar o hambúrguer (.fa-bars ou button.dropdown-toggle)
                # Implementa o "Triple Jump": se não achar em 15s, força a URL de importação
                found_bars = False
                jump_triggered = False
                
                for i in range(12): # Total de 60s (5s * 12)
                    if await click_in_frames('.fa-bars, button.dropdown-toggle'):
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
                                log_task(f"Tentativa {attempt + 1} de salto para {target_url}...")
                                # timeout reduzido para 15s para fallback rápido
                                await page.goto(target_url, wait_until="commit", timeout=15000)
                                # espera reduzida para 10s
                                await page.wait_for_selector(".fa-bars, button.dropdown-toggle", timeout=10000)
                                log_task("Salto bem-sucedido. Grid detectada.")
                                break
                            except Exception as e_jump:
                                if attempt == 0:
                                    log_task(f"Salto demorado ({str(e_jump)[:30]}). Re-tentando salto rápido...", "WARNING")
                                    await asyncio.sleep(2)
                                else:
                                    log_task("Salto por URL falhou ou demorou demais. Continuando via polling manual...", "WARNING")
                        
                        jump_triggered = True
                        
                    await asyncio.sleep(5)
                
                if not found_bars:
                    raise Exception("Menu de contexto (.fa-bars) não encontrado após polling e Triple Jump.")
                
                # 2. Aguarda o menu aparecer
                await asyncio.sleep(1)
                
                log_task("Menu aberto. Navegando para 'Atendimentos'...")
                found_atend = False
                for _ in range(3):
                    if await click_in_frames('a', title_match='Atendimentos'):
                        found_atend = True
                        break
                    if await click_in_frames('a', text_match='Atendimento'):
                        found_atend = True
                        break
                    await asyncio.sleep(2)
                
                if not found_atend:
                    raise Exception("Link 'Atendimentos' não encontrado.")
                
                await asyncio.sleep(3)
            except Exception as e:
                log_task(f"Erro de navegação (Atendimentos): {str(e)}", "ERROR")
                return "error", f"Falha na navegação: {str(e)[:50]}"

            # 3. Navegação para Beneficiário (Novo hambúrguer na tela de atendimentos)
            try:
                log_task("Na tela de Atendimentos. Abrindo menu do beneficiário...")
                
                found_atend_bars = False
                for _ in range(4):
                    if await click_in_frames('.fa-bars, button.dropdown-toggle'):
                        found_atend_bars = True
                        break
                    await asyncio.sleep(3)
                
                if not found_atend_bars:
                    raise Exception("Menu do atendimento não encontrado.")
                
                await asyncio.sleep(1)
                
                log_task("Menu aberto. Clicando em 'Beneficiário'...")
                if not await click_in_frames('a', title_match='Beneficiário'):
                    if not await click_in_frames('a', text_match='Beneficiário'):
                        raise Exception("Link 'Beneficiário' não encontrado.")
                
                await asyncio.sleep(3)
            except Exception as e:
                log_task(f"Erro de navegação (Beneficiário): {str(e)}", "ERROR")
                return "error", f"Falha ao acessar Beneficiário: {str(e)[:50]}"

            # 4. Atualizar Dados (Modal Final)
            try:
                log_task("Modal de Beneficiário aberta. Rolando e atualizando...")
                
                update_target = page
                found_update = False
                
                for _ in range(4):
                    if await page.locator('button:has-text("Atualizar")').count() > 0:
                        found_update = True
                        break
                    for frame in page.frames:
                        if await frame.locator('button:has-text("Atualizar")').count() > 0:
                            update_target = frame
                            found_update = True
                            break
                    if found_update: break
                    await asyncio.sleep(2)
                
                if not found_update:
                    raise Exception("Botão 'Atualizar' não encontrado.")

                # Rola e clica
                await update_target.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)
                await update_target.locator('button:has-text("Atualizar")').first.click()
                
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
                    return "online", "Conexão RSUS Ativa e funcional."
                elif any(k in all_text for k in error_keywords):
                    log_task("Mensagem de erro detectada no portal após clique em Atualizar.", "WARNING")
                    return "offline", "Portal retornou erro na atualização (Offline)."
                
                # Fallback: se clicou e não deu erro explícito, assumimos online
                log_task("Portal processou sem erro explícito. Assumindo conexão ATIVA.", "SUCCESS")
                return "online", "Conexão operacional (sem erro reportado)."
                
            except Exception as e:
                log_task(f"Erro na etapa final: {str(e)}", "ERROR")
                return "error", f"Erro no formulário final: {str(e)[:50]}"

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        log_task(f"Erro inesperado: {str(e)}", "ERROR")
        if task_id:
            db.add_log(task_id, f"TRACEBACK: {error_detail}", "ERROR")
        return "error", f"Erro técnico: {str(e)}"
    finally:
        if browser:
            try:
                await browser.close()
            except: pass

async def run_batch_api_check(task_id=None):
    """Executa a checagem para todos os clientes ativos com atualização de progresso."""
    try:
        clients = db.get_all_clients()
        total = len(clients)
        
        if task_id:
            db.update_task(task_id, {"total": total, "current": 0, "status": "running"})
            db.add_log(task_id, f"Iniciando checagem em lote para {total} clientes...")

        for i, client in enumerate(clients):
            client_name = client.get('name', 'Cliente Desconhecido')
            if task_id:
                db.update_task(task_id, {
                    "current": i + 1,
                    "current_client": client_name
                })
                db.add_log(task_id, f"Checando {i+1}/{total}: {client_name}...", "INFO")
            
            try:
                status, message = await run_api_check_for_client(client['id'], task_id=task_id)
                db.update_client_api_status(client['id'], status, message)
            except Exception as e:
                logger.error(f"Erro ao checar cliente {client.get('id')}: {e}")
                if task_id:
                    db.add_log(task_id, f"ERRO CRÍTICO no cliente {client_name}: {str(e)}", "ERROR")

        if task_id:
            db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
            db.add_log(task_id, "Checagem em lote finalizada.")
            
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
        
        status, message = await run_api_check_for_client(client_id, task_id=task_id)
        db.update_client_api_status(client_id, status, message)
        
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
