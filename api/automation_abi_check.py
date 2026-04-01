import asyncio
import logging
import time
import base64
from datetime import datetime
from playwright.async_api import async_playwright
import api.database as db
from api.utils import send_whatsapp_alert

logger = logging.getLogger(__name__)

async def run_abi_check_for_client(client_id, task_id=None, pre_fetched_creds=None, is_batch_run=False):
    """Wrapper para a checagem de ABI para um único cliente."""
    client = db.get_client_config(client_id)
    client_name = client.get('name', client_id) if client else client_id
    
    active_abi_doc = db.get_active_abi()
    active_abi = active_abi_doc.get('ABI', 'Desconhecido') if active_abi_doc else 'Desconhecido'

    try:
        status, message, snap_url = await _run_abi_check_logic(client_id, active_abi, task_id, pre_fetched_creds)
        
        # Atualiza status no banco
        db.update_client_abi_status(client_id, active_abi, status, message, task_id)
        
        return status, message, snap_url
    except Exception as e:
        status, message = "Falha", f"Erro crítico: {str(e)}"
        db.update_client_abi_status(client_id, active_abi, status, message, task_id)
        return status, message, None

async def _run_abi_check_logic(client_id, active_abi, task_id=None, pre_fetched_creds=None):
    """Lógica interna da checagem de ABI no RSUS."""
    client = db.get_client_config(client_id)
    if not client:
        return "Falha", "Cliente não encontrado.", None
        
    url_sistema = client.get('url_sistema')
    client_name = client.get('name', client_id)
    
    def log_task(msg, level="INFO"):
        full_msg = f"[{client_name}] {msg}"
        if task_id:
            db.add_log(task_id, full_msg)
        logger.info(full_msg)

    if not url_sistema:
        return "Falha", "URL não configurada.", None

    cred_type = "unimed_vitoria" if "vitoria" in url_sistema.lower() else "general"

    browser = None
    try:
        async with async_playwright() as p:
            log_task(f"Iniciando navegador para checar ABI {active_abi}...")
            
            browser_args = [
                "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
                "--disable-gpu", "--window-size=1920,1080",
                "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
                "--disable-web-security", "--allow-running-insecure-content",
                "--ignore-certificate-errors", "--disable-blink-features=AutomationControlled"
            ]
            
            # Launch browser
            try:
                browser = await p.chromium.launch(headless=True, args=browser_args)
            except Exception:
                import subprocess, sys
                subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
                browser = await p.chromium.launch(headless=True, args=browser_args)

            # Fetch creds
            if pre_fetched_creds:
                creds = pre_fetched_creds
            else:
                creds = await asyncio.to_thread(db.get_rsus_credentials, cred_type)
            
            if not creds or not creds.get('username'):
                msg_erro = f"Credenciais '{cred_type}' não encontradas."
                log_task(msg_erro, "ERROR")
                await browser.close()
                return "Falha", msg_erro, None

            usuario = creds['username']
            senha = creds['password']

            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                ignore_https_errors=True,
                timezone_id="America/Sao_Paulo",
                locale="pt-BR"
            )
            page = await context.new_page()
            page.set_default_navigation_timeout(60000)
            page.set_default_timeout(60000)
            
            # Login
            log_task("Realizando login no RSUS...")
            await page.goto(url_sistema, wait_until="commit")
            
            email_field = page.locator("input#email, input#Email").first
            await email_field.wait_for(state="visible", timeout=20000)
            await email_field.type(usuario, delay=30)
            
            pwd_field = page.locator("input#password, input#Password").first
            await pwd_field.type(senha, delay=30)
            
            await page.click("#logIn, button[type='submit']")
            
            # Aguarda dashboard
            try:
                await page.wait_for_selector(".navbar, .main-sidebar", timeout=30000)
            except:
                # Tenta forçar salto se estiver preso
                await page.goto(url_sistema.replace("/Account/Login", "/"), wait_until="commit")
                await asyncio.sleep(2)

            log_task("Navegando para 'Importações'...")
            # Força URL de importação para ser mais rápido
            base_url = url_sistema.split('/Account')[0] if '/Account' in url_sistema else url_sistema.rsplit('/', 1)[0]
            import_url = f"{base_url.rstrip('/')}/importacao"
            await page.goto(import_url, wait_until="domcontentloaded")
            
            log_task(f"Buscando ABI {active_abi} na grid...")
            # Aguarda a grid carregar
            await page.wait_for_selector("table", timeout=20000)
            
            # Localizar a linha do ABI
            # O ABI pode estar como '105º' ou '105'
            abi_clean = active_abi.replace('º', '').strip()
            
            # XPath para achar a linha que contém o ABI
            target_row = page.locator(f"tr:has-text('{active_abi}'), tr:has-text('{abi_clean}º')").first
            
            if await target_row.count() == 0:
                log_task(f"ABI {active_abi} não encontrado na grid de importações.", "WARNING")
                await browser.close()
                return "Nao Importado", f"ABI {active_abi} não localizado.", None

            # Ler Status Arquivo (geralmente uma coluna com texto fixo)
            # Vamos buscar o texto da linha e verificar se contém 'Importado'
            row_text = await target_row.inner_text()
            
            if "Importado" not in row_text:
                log_task(f"ABI {active_abi} encontrado, mas status não é 'Importado'.", "INFO")
                await browser.close()
                return "Pendente", f"Status: {row_text.split()[-1] if row_text else 'Indefinido'}", None

            # Se chegamos aqui, está Importado. Agora ver logs de análise.
            log_task("ABI Importado. Abrindo logs de análise...")
            
            # Clicar no hambúrguer da linha (última célula)
            hamburger = target_row.locator("td").last().locator("button, a, .fa-bars").first
            await hamburger.click()
            await asyncio.sleep(1.5)
            
            # Clicar em "Logs Análise"
            logs_btn = page.locator(".dropdown-menu a:has-text('Logs Análise')").first
            if await logs_btn.count() == 0:
                logs_btn = page.locator("a:has-text('Logs Análise')").first
            
            await logs_btn.click()
            
            # Aguarda a tela de logs
            log_task("Aguardando carregamento da tela de análises...")
            await page.wait_for_selector("table", timeout=20000)
            await asyncio.sleep(2)
            
            # Ler a coluna 'Resultado' na primeira linha
            # O cabeçalho 'Resultado' ajuda a localizar a célula certa se houver várias
            # Mas por padrão pegamos a primeira linha de dados
            first_log_row = page.locator("table tbody tr").first
            
            if await first_log_row.count() == 0:
                log_task("Nenhum log de análise encontrado.", "INFO")
                await browser.close()
                return "Importado, falta analisar", "Arquivo importado, mas sem logs de análise.", None
            
            # Busca pelo texto 'Sucesso' ou 'Falha' em toda a linha de log
            log_result_text = await first_log_row.inner_text()
            
            if "Sucesso" in log_result_text:
                log_task("RSUS: Análise concluída com Sucesso!", "SUCCESS")
                await browser.close()
                return "Importado e Analisado", "Análise concluída com sucesso.", None
            elif "Falha" in log_result_text or "Erro" in log_result_text:
                log_task("RSUS: Falha detectada na análise.", "ERROR")
                await browser.close()
                return "Falha", f"Erro: {log_result_text[:50]}", None
            else:
                log_task(f"RSUS: Resultado inconclusivo: {log_result_text[:30]}", "WARNING")
                await browser.close()
                return "Importado, falta analisar", f"Resultado parcial: {log_result_text[:50]}", None

    except Exception as e:
        log_task(f"Erro na execução para o cliente: {str(e)}", "ERROR")
        if browser: await browser.close()
        return "Falha", f"Erro técnico: {str(e)[:100]}", None

async def run_batch_abi_check(task_id):
    """Executa a checagem de ABI para todos os clientes ativos."""
    try:
        clients = db.get_all_clients()
        total = len(clients)
        
        db.update_task(task_id, {"total": total, "current": 0, "status": "running"})
        db.add_log(task_id, f"Iniciando checagem de ABI em lote para {total} clientes...")

        # Cache de credenciais
        creds_general = db.get_rsus_credentials('general')
        creds_vitoria = db.get_rsus_credentials('unimed_vitoria')

        for i, client in enumerate(clients):
            # Check cancelamento
            task_doc = db.firestore_db.collection('tasks').document(task_id).get()
            if task_doc.exists and task_doc.to_dict().get('status') == 'cancelled':
                db.add_log(task_id, "Cancelado pelo usuário.", "WARNING")
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
        await send_whatsapp_alert(msg, task_id=task_id, target_numbers=["5527997629236"])

    except Exception as e:
        db.add_log(task_id, f"Erro estrutural no lote: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})

async def run_single_abi_check(client_id, task_id):
    """Executa a checagem individual para um cliente."""
    try:
        client = db.get_client_config(client_id)
        db.update_task(task_id, {"total": 1, "current": 0, "status": "running", "current_client": client.get('name')})
        
        await run_abi_check_for_client(client_id, task_id=task_id)
        
        db.update_task(task_id, {"status": "completed", "current": 1, "current_client": "Finalizado"})
    except Exception as e:
        db.add_log(task_id, f"Erro: {str(e)}", "ERROR")
        db.update_task(task_id, {"status": "error"})
