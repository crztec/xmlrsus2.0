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
    creds = db.get_rsus_credentials(cred_type)
    
    if not creds or not creds.get('username'):
        log_task(f"Credenciais '{cred_type}' não encontradas no sistema.", "ERROR")
        return "offline", f"Credenciais '{cred_type}' não configuradas."

    usuario = creds['username']
    senha = creds['password']

    browser = None
    try:
        async with async_playwright() as p:
            log_task(f"Iniciando navegador para {url_sistema}...")
            # Headless false para debug local se necessário, mas no servidor deve ser True
            browser = await p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
            context = await browser.new_context(viewport={'width': 1280, 'height': 800})
            page = await context.new_page()
            
            # 1. Login
            try:
                log_task("Realizando login no RSUS...")
                await page.goto(url_sistema, wait_until="networkidle", timeout=60000)
                await page.fill('input[name="usuario"]', usuario)
                await page.fill('input[name="senha"]', senha)
                await page.click('button[type="submit"]') 
                await page.wait_for_timeout(5000)
                
                if "login" in page.url.lower():
                    log_task("Falha no login: permaneceu na página de login.", "ERROR")
                    return "offline", "Falha na autenticação RSUS."
                log_task("Login bem-sucedido.")
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
        
        status, message = await run_api_check_for_client(client['id'], task_id=task_id)
        db.update_client_api_status(client['id'], status, message)

    if task_id:
        db.update_task(task_id, {"status": "completed", "current_client": "Finalizado"})
        db.add_log(task_id, "Checagem em lote finalizada com sucesso.")

async def run_single_api_check(client_id, task_id=None):
    """Executa a checagem para um único cliente."""
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
        print(f"DEBUG: Tarefa {task_id} iniciada no processo para {client_name}")
    
    status, message = await run_api_check_for_client(client_id, task_id=task_id)
    db.update_client_api_status(client_id, status, message)
    
    if task_id:
        db.update_task(task_id, {
            "status": "completed", 
            "current": 1,
            "current_client": "Finalizado"
        })
        db.add_log(task_id, f"Checagem de {client_name} finalizada: {status}")
