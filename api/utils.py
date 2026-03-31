import requests
import logging

logger = logging.getLogger(__name__)

def send_whatsapp_alert(text_message: str):
    """
    Envia uma mensagem de texto via WhatsApp usando a Evolution API.
    """
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
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        if response.status_code in [200, 201]:
            logger.info("Alerta de WhatsApp enviado com sucesso.")
        else:
            logger.error(f"Erro ao enviar alerta via WhatsApp (Status {response.status_code}): {response.text}")
    except Exception as e:
        logger.error(f"Erro de conexão ao enviar alerta via WhatsApp: {e}")
