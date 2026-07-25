from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.db.session import create_db_and_tables
from app.api.v1 import search, prospects, scans, export, settings as settings_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_db_and_tables()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title="Local Prospect Finder API",
    description="AI-powered local business prospect discovery and analysis platform",
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

# CORS – allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(search.router, prefix="/api/v1", tags=["Search & Discovery"])
app.include_router(prospects.router, prefix="/api/v1", tags=["Prospects"])
app.include_router(scans.router, prefix="/api/v1", tags=["Scans"])
app.include_router(export.router, prefix="/api/v1", tags=["Export"])
app.include_router(settings_router.router, prefix="/api/v1", tags=["Settings"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "local-prospect-finder-api"}
