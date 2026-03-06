# ============================================================
# APP CONFIG
# ============================================================
# app/config.py
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    JWT_SECRET:        str = os.getenv("JWT_SECRET", "CHANGE_THIS_IN_PRODUCTION_USE_256_BIT_KEY")
    JWT_ALGORITHM:     str = "HS256"
    DATABASE_URL:      str = os.getenv("DATABASE_URL", "postgresql+asyncpg://apex_user:apex_pass@localhost:5432/apex_trading")
    REDIS_URL:         str = os.getenv("REDIS_URL", "redis://localhost:6379")
    SMTP_HOST:         str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT:         int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER:         str = os.getenv("SMTP_USER", "")
    SMTP_PASS:         str = os.getenv("SMTP_PASS", "")
    FROM_EMAIL:        str = os.getenv("FROM_EMAIL", "noreply@apexai.trade")
    TWELVE_DATA_KEY:   str = os.getenv("TWELVE_DATA_API_KEY", "demo")
    AIRTEL_CLIENT_ID:  str = os.getenv("AIRTEL_CLIENT_ID", "")
    AIRTEL_SECRET:     str = os.getenv("AIRTEL_CLIENT_SECRET", "")
    ENVIRONMENT:       str = os.getenv("ENVIRONMENT", "development")

    class Config:
        extra = 'ignore'
        env_file = ".env"

settings = Settings()
