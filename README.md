# 🔍 Local Prospect Finder

AI-powered local business prospect discovery and sales intelligence platform.

## Features

- **Free Business Discovery** — OpenStreetMap Overpass API (no API key needed)
- **7-Dimension Audit** — SEO · Performance · Security · Technology · Marketing · Social · UX
- **Lead Scoring** — Weighted 0–100 opportunity score per prospect
- **Pain Points** — Evidence-based findings for sales conversations
- **Service Recommendations** — Auto-generated from audit findings
- **Export** — CSV · Excel · JSON
- **Live Map** — Leaflet.js with OpenStreetMap (free)
- **Background Scans** — Celery + Redis async pipeline

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) |
| Task Queue | Celery + Redis |
| Database | PostgreSQL 16 + SQLModel |
| Map | Leaflet.js + OpenStreetMap |
| Discovery | OpenStreetMap Overpass API |
| Performance | Google PageSpeed Insights API (free) |
| Tech Detection | HTML pattern matching (+ Wappalyzer if key provided) |

## Quick Start (Docker Compose)

```bash
# 1. Clone the repo
git clone https://github.com/MusfiqurRahman12/Local-Prospects-Finder.git
cd Local-Prospects-Finder

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
        discovery/       # OpenStreetMap integration
        audit/           # 6 audit services
        scoring/         # Lead scorer + pain point generator
      workers/           # Celery tasks
      api/v1/            # REST endpoints
      models/            # SQLModel tables
  web/                   # Next.js 15 frontend
    src/
      app/               # Pages (/, /dashboard, /prospect/[id])
      components/        # All UI components
      lib/               # API client
      types/             # TypeScript types
docker-compose.yml
.env.example
```

## Roadmap

- **Phase 2**: Scheduled rescans, competitor comparison, historical tracking
- **Phase 3**: AI-generated outreach emails, proposals, cold call scripts

## License

MIT
