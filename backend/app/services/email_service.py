# app/services/email_service.py
import aiosmtplib, logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

logger = logging.getLogger(__name__)

async def send_verification_email(to_email: str, name: str, token: str):
    verify_url = f"https://yourdomain.com/verify-email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0A0F1E;color:#C4D9F0;padding:32px;border-radius:12px">
      <h2 style="color:#0066FF">⚡ Verify your APEX AI account</h2>
      <p>Hi {name}, thanks for signing up.</p>
      <p>Click the button below to verify your email address:</p>
      <a href="{verify_url}" style="display:inline-block;background:#0066FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
        Verify Email
      </a>
      <p style="color:#4A6FA5;font-size:12px;margin-top:24px">Link expires in 24 hours. If you didn't register, ignore this email.</p>
    </div>
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Verify your APEX AI Trading account"
    msg["From"]    = settings.FROM_EMAIL
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASS,
            start_tls=True,
        )
        logger.info(f"Verification email sent to {to_email}")
    except Exception as e:
        logger.error(f"Email send failed: {e}")
