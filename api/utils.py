import asyncio
import requests
import logging

logger = logging.getLogger(__name__)

async def send_whatsapp_alert(text_message: str, task_id: str = None, target_numbers: list = None):
    import api.database as db
    
    # Busca config do banco de dados (URL, API Key, números de destino)
    config = db.get_whatsapp_config()
    url_base = config.get("url", "http://34.75.185.221:8080")
    api_key = config.get("api_key", "92367wC!")
    
    # Se nenhum número for passado como override, usa os configurados no banco
    if not target_numbers:
        target_numbers = config.get("target_numbers", ["5527997629236"])
        
    url = f"{url_base}/message/sendText/GaxBot"
    headers = {"apikey": api_key, "Content-Type": "application/json"}
    
    if task_id:
        db.add_log(task_id, f"Iniciando envio assíncrono de WhatsApp para {len(target_numbers)} contato(s)...")

    # Função bloqueante isolada para rodar em thread
    def _post_request(payload):
        return requests.post(url, headers=headers, json=payload, timeout=60)

    for numero in target_numbers:
        payload = {
            "number": numero,
            "text": text_message,
            "textMessage": {
                "text": text_message
            }
        }
        try:
            start_time = asyncio.get_event_loop().time()
            # Executa o request síncrono em uma thread separada para não bloquear o loop do Playwright
            response = await asyncio.to_thread(_post_request, payload)
            duration = asyncio.get_event_loop().time() - start_time
            
            if response.status_code in [200, 201]:
                msg_ok = f"WhatsApp enviado -> {numero} (Tempo: {duration:.2f}s)"
                logger.info(msg_ok)
                if task_id: db.add_log(task_id, msg_ok, "SUCCESS")
            else:
                msg_bad = f"Erro {response.status_code} Evolution: {response.text}"
                logger.error(msg_bad)
                if task_id: db.add_log(task_id, msg_bad, "WARNING")
        except Exception as e:
            logger.error(f"Erro WhatsApp para {numero}: {str(e)}")
            if task_id: db.add_log(task_id, f"Erro WhatsApp {numero}: {str(e)}", "ERROR")
