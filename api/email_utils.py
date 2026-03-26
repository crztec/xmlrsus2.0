import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

def send_verification_email(to_email, code, action_type):
    """
    Sends a 6-digit verification code to the user's email.
    action_type should be 'email_change' or 'password_change'.
    """
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        logger.warning(f"SMTP credentials not set. Code for {to_email} is: {code}")
        return False

    subject = "Código de Verificação - GAX"
    if action_type == 'email_change':
        body = f"Você solicitou a alteração do seu e-mail no GAX.\n\nSeu código de confirmação é: {code}\n\nEste código expira em 10 minutos."
    else:
        body = f"Você solicitou a alteração da sua senha no GAX.\n\nSeu código de confirmação é: {code}\n\nEste código expira em 10 minutos."

    try:
        msg = MIMEMultipart()
        msg['From'] = f"GAX Sistema <{smtp_user}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Verification email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False
