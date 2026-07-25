"""
Settings endpoints – runtime API key management stored in a local config.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()


class SettingsRead(BaseModel):
    has_pagespeed_key: bool
    has_wappalyzer_key: bool
    has_google_places_key: bool
    environment: str
    scan_concurrency: int
    max_crawl_pages: int
    discovery_source: str


@router.get("/settings", response_model=SettingsRead)
async def get_app_settings():
    """Return current platform configuration (no secrets exposed)."""
    return SettingsRead(
        has_pagespeed_key=settings.has_pagespeed,
        has_wappalyzer_key=settings.has_wappalyzer,
        has_google_places_key=settings.has_google_places,
        environment=settings.environment,
        scan_concurrency=settings.scan_concurrency,
        max_crawl_pages=settings.max_crawl_pages,
        discovery_source="openstreetmap" if not settings.has_google_places else "google_places",
    )
