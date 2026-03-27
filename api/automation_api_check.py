import asyncio
import logging
from playwright.async_api import async_playwright
import api.database as db

logger = logging.getLogger(__name__)

async def check_single_rsus_api(client_id, url_sistema, usuario, senha):
    """
    Executa a checagem de API para um único cliente RSUS.
    Retorna (status, mensagem)
    """
    browser = None
    try:
        async with async_playwright() as p:
            # Reutiliza configurações de browser do robô principal (headless mode)
            browser = await p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
            context = await browser.new_context(viewport={'width': 1280, 'height': 720})
            page = await context.new_page()
            
            # 1. Login
            try:
                await page.goto(url_sistema, wait_until="networkidle", timeout=60000)
                await page.fill('input[name="usuario"]', usuario)
                await page.fill('input[name="senha"]', senha)
                await page.click('button[type="submit"]') # Ajustar seletor se necessário
                await page.wait_for_timeout(5000)
                
                if "login" in page.url.lower():
                    return "offline", "Falha na autenticação (Credenciais inválidas ou timeout)."
            except Exception as e:
                return "offline", f"Erro no acesso/login: {str(e)}"

            # 2. Navegação para Atendimentos
            try:
                # Menu hambúrguer superior direito (Ajustado conforme print)
                # O print mostra o menu de Atendimentos dentro da lista de importações
                # Mas a instrução diz: Menu hambúrguer superior direito -> Atendimentos
                await page.goto(f"{url_sistema}/atendimento/0", wait_until="networkidle", timeout=30000)
            except Exception as e:
                return "offline", f"Erro ao navegar para Atendimentos: {str(e)}"

            # 3. Selecionar Beneficiário do primeiro atendimento
            try:
                # Clica no menu hambúrguer do primeiro atendimento na lista
                first_menu = page.locator('.btn-group > .dropdown-toggle').first
                await first_menu.click()
                await page.wait_for_timeout(1000)
                
                # Selecionar "Beneficiário"
                await page.click('text=Beneficiário')
                await page.wait_for_timeout(3000)
            except Exception as e:
                return "offline", f"Erro ao abrir modal de Beneficiário: {str(e)}"

            # 4. Atualizar Dados
            try:
                # Rolar até o final da modal e clicar em Atualizar
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                # Procura o botão Atualizar na modal
                btn_atualizar = page.locator('button:has-text("Atualizar")').last
                await btn_atualizar.scroll_into_view_if_needed()
                await btn_atualizar.click()
                
                # Aguardar barra verde e mensagem
                # 'Os dados foram atualizados'
                msg_locator = page.locator('text=Os dados foram atualizados')
                try:
                    await msg_locator.wait_for(state="visible", timeout=20000)
                    return "online", "API Online: Dados atualizados com sucesso."
                except:
                    # Tenta capturar qualquer outra mensagem de erro que apareça no popup
                    popup_text = await page.inner_text('.modal-body') if await page.locator('.modal-body').count() > 0 else "Timeout aguardando confirmação."
                    return "offline", f"API Offline/Erro: {popup_text}"
            except Exception as e:
                return "offline", f"Erro no clique de Atualizar: {str(e)}"

    except Exception as e:
        logger.error(f"Erro inesperado na automação para {client_id}: {e}")
        return "error", f"Erro interno na automação: {str(e)}"
    finally:
        if browser:
            await browser.close()

async def run_batch_api_check():
    """
    Percorre todos os clientes cadastrados e executa a checagem.
    """
    clients = db.get_all_clients()
    for client in clients:
        client_id = client['id']
        url = client['url_sistema']
        
        if not url:
            db.update_client_api_status(client_id, "unknown", "URL não configurada.")
            continue
            
        # Determina credenciais
        cred_type = "unimed_vitoria" if "vitoria" in url.lower() else "general"
        creds = db.get_rsus_credentials(cred_type)
        
        if not creds:
            db.update_client_api_status(client_id, "unknown", f"Credenciais '{cred_type}' não encontradas no sistema.")
            continue
            
        status, message = await check_single_rsus_api(client_id, url, creds['username'], creds['password'])
        db.update_client_api_status(client_id, status, message)
        logger.info(f"Check finalizado para {client['name']}: {status}")
        
        # Pequeno delay entre clientes para não sobrecarregar
        await asyncio.sleep(2)
