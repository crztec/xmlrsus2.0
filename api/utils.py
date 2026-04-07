import asyncio
import requests
import logging

logger = logging.getLogger(__name__)

async def send_whatsapp_alert(text_message: str, task_id: str = None, target_numbers: list = None):
    import api.database as db
    
    config = db.get_whatsapp_config()
    url_base = config.get("url", "").rstrip("/")
    api_key = config.get("api_key", "")
    instance_name = config.get("instance_name", "GaxBot")
    if not instance_name:
        instance_name = "GaxBot"
    
    if not target_numbers:
        target_numbers = config.get("target_numbers", [])
        
    url = f"{url_base}/message/sendText/{instance_name}"
    headers = {"apikey": api_key, "Content-Type": "application/json"}
    
    if task_id:
        db.add_log(task_id, f"Iniciando envio de WhatsApp para {len(target_numbers)} destino(s)...")

    def _post_request(payload):
        return requests.post(url, headers=headers, json=payload, timeout=60)

    for numero in target_numbers:
        jid = numero.strip()

        # O Formato EXATO que a v1.8.2 exige (textMessage)
        payload = {
            "number": jid,
            "textMessage": {
                "text": text_message
            }
        }
        
        try:
            start_time = asyncio.get_event_loop().time()
            response = await asyncio.to_thread(_post_request, payload)
            duration = asyncio.get_event_loop().time() - start_time
            
            if response.status_code in [200, 201]:
                msg_ok = f"WhatsApp enviado -> {jid} (Tempo: {duration:.2f}s)"
                logger.info(msg_ok)
                if task_id: db.add_log(task_id, msg_ok, "SUCCESS")
            else:
                raw_res = response.text
                msg_bad = f"Erro {response.status_code} Evolution para {jid}: {raw_res}"
                logger.error(msg_bad)
                if task_id: db.add_log(task_id, msg_bad, "WARNING")
        except Exception as e:
            logger.error(f"Erro WhatsApp para {jid}: {str(e)}")
            if task_id: db.add_log(task_id, f"Erro WhatsApp {jid}: {str(e)}", "ERROR")