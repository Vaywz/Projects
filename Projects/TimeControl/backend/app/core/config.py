import json
from typing import List
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
import secrets


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "HitexisTimeControl"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api"

    @field_validator('DEBUG', mode='before')
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            value = v.strip().lower()
            if value in {"1", "true", "yes", "on", "debug", "development", "dev"}:
                return True
            if value in {"0", "false", "no", "off", "release", "production", "prod", ""}:
                return False
        return v

    # Database
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "hitexis_time"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = ""
    DATABASE_URL_SYNC: str = ""

    # JWT
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:3000,"
        "http://localhost:4000,"
        "http://127.0.0.1:3000,"
        "http://127.0.0.1:4000"
    )

    @field_validator('SECRET_KEY', mode='before')
    @classmethod
    def validate_secret_key(cls, v):
        if v is None or str(v).strip() == "":
            return secrets.token_urlsafe(32)

        value = str(v).strip()
        blocked_values = {
            "change-me-in-production",
            "your-secret-key",
            "your-secret-key-here-change-me-in-production",
        }
        if value in blocked_values or len(value) < 32:
            raise ValueError("SECRET_KEY must be a strong secret with at least 32 characters")
        return value

    def get_cors_origins(self) -> List[str]:
        value = self.BACKEND_CORS_ORIGINS.strip()
        if not value:
            return []
        if value.startswith("["):
            return [str(origin).strip() for origin in json.loads(value) if str(origin).strip()]
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @model_validator(mode='after')
    def build_database_urls(self):
        if not self.DATABASE_URL or not self.DATABASE_URL_SYNC:
            if not self.POSTGRES_PASSWORD:
                raise ValueError("Set DATABASE_URL or POSTGRES_PASSWORD")

            user = quote_plus(self.POSTGRES_USER)
            password = quote_plus(self.POSTGRES_PASSWORD)
            host = self.POSTGRES_HOST
            port = self.POSTGRES_PORT
            db = quote_plus(self.POSTGRES_DB)
            if not self.DATABASE_URL:
                self.DATABASE_URL = f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}"
            if not self.DATABASE_URL_SYNC:
                self.DATABASE_URL_SYNC = f"postgresql://{user}:{password}@{host}:{port}/{db}"
        return self

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Microsoft Graph email
    MS_TENANT_ID: str = ""
    MS_CLIENT_ID: str = ""
    MS_CLIENT_SECRET: str = ""
    MS_FROM_EMAIL: str = ""
    MS_FROM_NAME: str = "HitexisTimeControl"

    @field_validator('MS_FROM_NAME', mode='before')
    @classmethod
    def parse_ms_from_name(cls, v):
        if v == '' or v is None:
            return 'HitexisTimeControl'
        return v

    # File storage
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024  # 5MB

    # Frontend URL (for email links)
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = (".env", "../.env")
        case_sensitive = True
        extra = "ignore"


settings = Settings()
