import os

import requests

try:
    from dotenv import load_dotenv
    # Procura o arquivo .env no diretório atual ou acima (raiz do projeto)
    load_dotenv(os.path.join(os.getcwd(), '.env'))
except ImportError:
    pass

# To use Firebase Client Auth, we need the Web API Key from the Firebase project.
# Since we don't have it hardcoded, we should expect it from an environment variable.
# For Cloud Run, the user will need to set FIREBASE_API_KEY.
import logging

logger = logging.getLogger(__name__)

FIREBASE_API_KEY = os.environ.get("FIREBASE_API_KEY", "")
if not FIREBASE_API_KEY:
    logger.warning("FIREBASE_API_KEY não foi encontrada nas variáveis de ambiente.")

def sign_in_with_email_and_password(email, password):
    if not FIREBASE_API_KEY:
        raise ValueError("FIREBASE_API_KEY environment variable not set.")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    data = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }

    response = requests.post(url, json=data, timeout=10)
    if response.status_code == 200:
        return response.json()
    else:
        # Handle errors like INVALID_LOGIN_CREDENTIALS
        error_msg = response.json().get("error", {}).get("message", "Unknown error")
        raise Exception(error_msg)

def create_user_with_email_and_password(email, password, first_name="", last_name=""):
    if not FIREBASE_API_KEY:
        raise ValueError("FIREBASE_API_KEY environment variable not set.")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
    data = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }

    response = requests.post(url, json=data, timeout=10)
    if response.status_code == 200:
        user_data = response.json()
        try:
            from api.database import create_user_profile
            create_user_profile(email, first_name, last_name)
        except Exception as e:
            print(f"Warning: Failed to create user profile in Firestore: {e}")
        return user_data
    else:
        error_msg = response.json().get("error", {}).get("message", "Unknown error")
        raise Exception(error_msg)

def update_user_credentials(current_email, new_email=None, new_password=None):
    """Updates user email and/or password directly in Firebase Auth using Admin SDK."""
    from firebase_admin import auth as admin_auth

    try:
        user_record = admin_auth.get_user_by_email(current_email)
        update_args = {}

        if new_email and new_email != current_email:
            update_args['email'] = new_email

        if new_password:
            update_args['password'] = new_password

        if update_args:
            admin_auth.update_user(user_record.uid, **update_args)
            return True
        return False

    except Exception as e:
        raise Exception(f"Failed to update credentials in Auth: {str(e)}")

def exchange_google_code_for_token(code, client_id, client_secret, redirect_uri):
    """Exchanges Google authorization code for tokens."""
    url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }
    response = requests.post(url, data=data, timeout=10)
    if response.status_code == 200:
        return response.json()
    else:
        error_msg = response.json().get("error_description", response.text)
        raise Exception(f"Failed to exchange code: {error_msg}")

def sign_in_with_google_id_token(id_token):
    """Signs into Firebase Auth using a Google ID token."""
    if not FIREBASE_API_KEY:
        raise ValueError("FIREBASE_API_KEY environment variable not set.")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key={FIREBASE_API_KEY}"
    data = {
        "postBody": f"id_token={id_token}&providerId=google.com",
        "requestUri": "http://localhost",
        "returnIdpCredential": True,
        "returnSecureToken": True
    }
    response = requests.post(url, json=data, timeout=10)
    if response.status_code == 200:
        return response.json()
    else:
        error_msg = response.json().get("error", {}).get("message", "Unknown error")
        raise Exception(f"Firebase sign in failed: {error_msg}")

def send_password_reset_email(email):
    if not FIREBASE_API_KEY:
        raise ValueError("FIREBASE_API_KEY environment variable not set.")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key={FIREBASE_API_KEY}"
    data = {
        "requestType": "PASSWORD_RESET",
        "email": email
    }

    response = requests.post(url, json=data, timeout=10)
    if response.status_code == 200:
        return True
    else:
        error_msg = response.json().get("error", {}).get("message", "Unknown error")
        raise Exception(error_msg)
