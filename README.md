# 🚀 Locally Hyper Leads Collector & Sales Intelligence Platform

AI-powered local business prospect discovery, Google Maps lead scraper, deep website auditor, and sales intelligence platform.

## Features

- **Google Maps Scraper Extension** — High-speed Chrome extension to scrape and qualify local B2B contractors with direct backend synchronization
- **Free Business Discovery** — OpenStreetMap Overpass API & SearXNG integration (zero paid API keys required)
- **7-Dimension Digital Audit** — SEO · Performance · Security · Technology Stack · Marketing & Pixels · Social · UX
- **Bulk Scraper & Enrichment** — Contact enrichment (emails, phone numbers, social handles)
- **Lead Scoring** — Weighted 0–100 opportunity score per prospect
- **Pain Points Discovery** — Evidence-based findings and audit insights for high-converting sales conversations
- **Service Recommendations** — Auto-generated upsell recommendations from audit findings
- **Export** — CSV · Excel · JSON format exports for your CRM
- **Live Interactive Map** — Leaflet.js with OpenStreetMap
- **Background Scans** — Celery + Redis asynchronous multi-worker pipeline

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome MV3 (JavaScript, Content Scripts, Popup UI) |
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) |
| Task Queue | Celery + Redis |
| Database | PostgreSQL 16 + SQLModel |
| Map | Leaflet.js + OpenStreetMap |
| Discovery | OpenStreetMap Overpass API + SearXNG |
| Performance | Google PageSpeed Insights API |
| Tech Detection | HTML pattern matching (+ Wappalyzer if key provided) |

## Quick Start (Docker Compose)

```bash
# 1. Clone the repo
git clone https://github.com/MusfiqurRahman12/locally_Hyper_leads_collector.git
cd locally_Hyper_leads_collector

# 2. Copy env file
cp .env.example .env
# Edit .env if you want to add optional API keys

# 3. Start all services
docker compose up -d

# 4. Open the app
open http://localhost:3000
```

## Local Development (Without Docker)

### Backend

```bash
cd apps/api
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r requirements.txt

# Start PostgreSQL and Redis (or use Docker just for those):
docker compose up postgres redis -d

# Run API
uvicorn app.main:app --reload --port 8000

# Run Celery worker (separate terminal)
celery -A app.workers.celery_app worker --loglevel=info
```

### Frontend

```bash
cd apps/web
npm install
npm run dev
# Opens at http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env`. All variables are optional except for running:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `PAGESPEED_API_KEY` | Optional | Improves PSI quota (free API) |
| `WAPPALYZER_API_KEY` | Optional | Enables Wappalyzer tech detection |

> **No Google Places API key needed!** Discovery uses the free OpenStreetMap Overpass API.

## Usage

1. **Search** — Enter a city and business type on the home page
2. **Review** — Browse discovered businesses in the dashboard (table or map view)
3. **Scan** — Click "Run Scan" on any prospect to trigger a full audit
4. **Analyze** — View SEO, Performance, Security, Tech, Marketing results
5. **Export** — Download CSV/Excel/JSON for your CRM

## Project Structure

```
apps/
  api/                   # FastAPI backend
    app/
      services/
        discovery/       # OpenStreetMap & SearXNG integration
        audit/           # Audit services (SEO, tech, contact enrichment)
        scoring/         # Lead scorer + pain point generator
      workers/           # Celery async scan tasks
      api/v1/            # REST endpoints (batch ingestion, search, prospects)
      models/            # SQLModel tables
  web/                   # Next.js 15 frontend
    src/
      app/               # Pages (/, /dashboard, /bulk-scraper, /prospect/[id])
      components/        # UI & audit score panels
      lib/               # API client
      types/             # TypeScript types
extension/               # Chrome MV3 Google Maps Lead Scraper & Exporter
docker-compose.yml
searxng-settings.yml
.env.example
```

## Roadmap

- **Phase 2**: Scheduled rescans, competitor comparison, historical tracking
- **Phase 3**: AI-generated outreach emails, proposals, cold call scripts

## License

MIT
