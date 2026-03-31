import asyncio
import requests
import logging

logger = logging.getLogger(__name__)

async def send_whatsapp_alert(text_message: str, task_id: str = None, target_numbers: list = None):
    import api.database as db
    
    url = "https://evolution-api-gax-472418735916.us-central1.run.app/message/sendText/GaxBot"
    api_key = "9236wC!"
    
    # Se nenhum número for passado, usa o padrão do admin (SEM o 9º dígito para DDD 27)
    if not target_numbers:
        target_numbers = ["552797629236"]
        
    headers = {"apikey": api_key, "Content-Type": "application/json"}
    
    if task_id:
        db.add_log(task_id, f"Iniciando envio assíncrono de WhatsApp para {len(target_numbers)} contato(s)...")

    # Função bloqueante isolada para rodar em thread
    def _post_request(payload):
        return requests.post(url, headers=headers, json=payload, timeout=30)

    for numero in target_numbers:
        payload = {"number": numero, "text": text_message}
        try:
            # Executa o request síncrono em uma thread separada para não bloquear o loop do Playwright
            response = await asyncio.to_thread(_post_request, payload)
            
            if response.status_code in [200, 201]:
                logger.info(f"WhatsApp enviado -> {numero}")
                if task_id: db.add_log(task_id, f"Alerta WhatsApp enviado -> {numero}", "SUCCESS")
            else:
                logger.error(f"Falha WhatsApp {numero}: {response.text[:100]}")
                if task_id: db.add_log(task_id, f"Falha WhatsApp {numero}: {response.status_code}", "WARNING")
        except Exception as e:
            logger.error(f"Erro WhatsApp para {numero}: {str(e)}")
            if task_id: db.add_log(task_id, f"Erro WhatsApp {numero}: {str(e)}", "ERROR")
