import os
import base64
import hashlib
import logging
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

# Load secret key from environment
env_key = os.environ.get("ENCRYPTION_KEY", "")

def get_fernet_key(raw_key: str) -> bytes:
    # Fernet requires a 32-byte key, urlsafe base64-encoded.
    # We hash the raw_key using SHA-256 to get 32 bytes, then base64 encode it.
    if not raw_key:
        raw_key = "gax_default_stable_encryption_key_for_query_builder_2.0"
        logger.warning("ENCRYPTION_KEY não encontrada nas variáveis de ambiente! Utilizando chave fallback determinística.")
    
    hashed = hashlib.sha256(raw_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(hashed)

# Initialize Fernet
fernet_key = get_fernet_key(env_key)
cipher = Fernet(fernet_key)

def encrypt_password(password: str) -> str:
    if not password:
        return ""
    try:
        return cipher.encrypt(password.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"Erro ao criptografar: {e}")
        return ""

def decrypt_password(encrypted_password: str) -> str:
    if not encrypted_password:
        return ""
    try:
        return cipher.decrypt(encrypted_password.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"Falha ao descriptografar: {e}")
        return ""
