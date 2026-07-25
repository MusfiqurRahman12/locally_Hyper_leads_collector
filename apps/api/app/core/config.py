from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "Local Prospect Finder API"
    environment: str = "development"
    secret_key: str = "changeme"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://lpf:lpfpassword@localhost:5432/local_prospect_finder"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Google APIs
    google_places_api_key: Optional[str] = None
    pagespeed_api_key: Optional[str] = None

    # Wappalyzer
    wappalyzer_api_key: Optional[str] = None

    # Scanning limits
    max_crawl_depth: int = 2
    max_crawl_pages: int = 20
    request_timeout_seconds: int = 30
    scan_concurrency: int = 4

    @property
    def has_google_places(self) -> bool:
        return bool(self.google_places_api_key)

    @property
    def has_wappalyzer(self) -> bool:
        return bool(self.wappalyzer_api_key)

    @property
    def has_pagespeed(self) -> bool:
        return bool(self.pagespeed_api_key)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
