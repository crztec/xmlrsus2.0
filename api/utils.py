import requests
import logging

logger = logging.getLogger(__name__)

def send_whatsapp_alert(text_message: str, task_id: str = None):
    """
    Envia uma mensagem de texto via WhatsApp usando a Evolution API.
    Acompanha o task_id para registrar log no console técnico do painel.
    """
    # Import tardio para evitar dependência circular
    import api.database as db
    
    url = "https://evolution-api-gax-472418735916.us-central1.run.app/message/sendText/GaxBot"
    api_key = "9236wC!"
    target_number = "5527997629236" 
    
    headers = {
        "apikey": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "number": target_number,
        "text": text_message
    }
    
    if task_id:
        db.add_log(task_id, f"Iniciando envio de alerta WhatsApp para {target_number}...")
    
    try:
        # Timeout curto para não travar o robô se a API estiver instável (12s)
        response = requests.post(url, headers=headers, json=payload, timeout=12)
        
        if response.status_code in [200, 201]:
            logger.info("Alerta de WhatsApp enviado com sucesso.")
            if task_id:
                db.add_log(task_id, "Alerta de WhatsApp enviado com sucesso.", "SUCCESS")
        else:
            msg_fail = f"Falha WhatsApp (Status {response.status_code}): {response.text[:100]}"
            logger.error(msg_fail)
            if task_id:
                db.add_log(task_id, msg_fail, "WARNING")
    except requests.exceptions.Timeout:
        msg_timeout = "Erro: Timeout na Evolution API (12s excedidos). O envio foi abortado para não atrasar a automação."
        logger.error(msg_timeout)
        if task_id:
            db.add_log(task_id, msg_timeout, "ERROR")
    except Exception as e:
        msg_crit = f"Erro crítico WhatsApp: {str(e)}"
        logger.error(msg_crit)
        if task_id:
            db.add_log(task_id, msg_crit, "ERROR")
