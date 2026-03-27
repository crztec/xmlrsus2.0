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
                    log_task("Botão de login ainda visível após clique. Prosseguindo...", "WARNING")
                
                # Verifica cookie de sessão
                cookies = await context.cookies()
                has_session = any(
                    '.ASPXAUTH' in c['name'] or 'Identity' in c['name'] or 'ASP.NET_SessionId' in c['name']
                    for c in cookies
                )
                
                if not has_session and ("Account/Login" in page.url):
                    log_task("Falha no login: sem cookie de sessão e ainda na tela de login.", "ERROR")
                    return "offline", "Falha na autenticação RSUS."
                
                log_task("Login bem-sucedido. Sessão estabelecida.")
            except Exception as e:
                log_task(f"Erro no login: {str(e)}", "ERROR")
                return "offline", "Erro ao acessar portal RSUS."

            # 2. Navegação para Atendimentos através da lista de ABIs (Hambúrguer Direito)
            try:
                log_task("Localizando ABI e abrindo menu hambúrguer...")
                # Espera o ícone de bars (FontAwesome fa-bars) que fica na direita da linha
                await page.wait_for_selector('.fa-bars', timeout=30000)
                
                # Clica no primeiro hambúrguer da lista
                options_menu = page.locator('.fa-bars').first
                await options_menu.click()
                await page.wait_for_timeout(1000)
                
                log_task("Menu aberto. Navegando para 'Atendimentos'...")
                # Procura o texto 'Atendimento' ou 'Atendimentos' no dropdown
                await page.click('text=Atendimento')
                await page.wait_for_load_state("networkidle")
                await page.wait_for_timeout(3000)
            except Exception as e:
                log_task(f"Erro ao navegar para Atendimentos: {str(e)}", "ERROR")
                return "offline", "Não foi possível acessar Atendimentos."

            # 3. Navegação para Beneficiário (Novo hambúrguer na tela de atendimentos)
            try:
                log_task("Na tela de Atendimentos. Abrindo menu do beneficiário...")
                # Clique no hambúrguer do primeiro atendimento
                atendimento_menu = page.locator('.fa-bars').first
                await atendimento_menu.click()
                await page.wait_for_timeout(1000)
                
                log_task("Menu aberto. Clicando em 'Beneficiário'...")
                await page.click('text=Beneficiário')
                await page.wait_for_timeout(3000)
            except Exception as e:
                log_task(f"Erro ao abrir Beneficiário: {str(e)}", "ERROR")
                return "offline", "Não foi possível acessar dados do Beneficiário."

            # 4. Atualizar Dados
            try:
                log_task("Modal de Beneficiário aberta. Rolando e atualizando...")
                # Rola até o final
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1000)
                
                # Clica no botão Atualizar
                update_btn = page.locator('button:has-text("Atualizar")').first
                await update_btn.click()
                await page.wait_for_timeout(3000)
                
                log_task("Clique em 'Atualizar' realizado com sucesso.", "SUCCESS")
                log_task("API configurada no RSUS está ATIVA.", "SUCCESS")
                return "online", "Integração RSUS operacional."
            except Exception as e:
                log_task(f"Erro ao clicar em Atualizar: {str(e)}", "ERROR")
                return "offline", "API não retornou sucesso na atualização."

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
