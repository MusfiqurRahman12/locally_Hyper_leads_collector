"""
Prospects CRUD endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.prospect import Prospect, ProspectRead, ProspectList
from app.models.audit_result import AuditResult
from app.models.pain_point import PainPoint, RecommendedService
from app.models.scan import Scan

router = APIRouter()


@router.get("/prospects", response_model=dict)
async def list_prospects(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = None,
    category: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    priority: Optional[str] = None,
    has_website: Optional[bool] = None,
    min_score: Optional[int] = Query(default=None, ge=0, le=100),
    max_score: Optional[int] = Query(default=None, ge=0, le=100),
    sort_by: str = Query(default="created_at", regex="^(lead_score|name|city|created_at|review_count)$"),
    sort_dir: str = Query(default="desc", regex="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
):
    """List prospects with filtering, sorting, and pagination."""
    query = select(Prospect)

    # Filters
    if search:
        term = f"%{search}%"
        query = query.where(
            (Prospect.name.ilike(term)) |
            (Prospect.address.ilike(term)) |
            (Prospect.city.ilike(term)) |
            (Prospect.state.ilike(term)) |
            (Prospect.category.ilike(term))
        )
    if category:
        query = query.where(Prospect.category.ilike(f"%{category}%"))
    if city:
        query = query.where(Prospect.city.ilike(f"%{city}%"))
    if state:
        query = query.where(Prospect.state.ilike(f"%{state}%"))
    if priority:
        query = query.where(Prospect.priority == priority.upper())
    if has_website is not None:
        if has_website:
            query = query.where(Prospect.website.isnot(None))
        else:
            query = query.where(Prospect.website.is_(None))
    if min_score is not None:
        query = query.where(Prospect.lead_score >= min_score)
    if max_score is not None:
        query = query.where(Prospect.lead_score <= max_score)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.exec(count_query)
    total = total_result.one()

    # Sort
    sort_col = getattr(Prospect, sort_by, Prospect.created_at)
    if sort_dir == "desc":
        query = query.order_by(sort_col.desc().nullslast(), Prospect.created_at.desc())
    else:
        query = query.order_by(sort_col.asc().nullsfirst(), Prospect.created_at.desc())

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await session.exec(query)
    prospects = result.all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "prospects": [
            {
                "id": str(p.id),
                "name": p.name,
                "category": p.category,
                "address": p.address,
                "city": p.city,
                "state": p.state,
                "phone": p.phone,
                "email": p.email,
                "website": p.website,
                "google_rating": p.google_rating,
                "review_count": p.review_count,
                "lead_score": p.lead_score,
                "priority": p.priority,
                "business_status": p.business_status,
                "lat": p.lat,
                "lng": p.lng,
                "owner_name": p.owner_name,
                "contact_details": p.contact_details,
                "data_source": p.data_source,
                "last_scan_date": p.last_scan_date.isoformat() if p.last_scan_date else None,
            }
            for p in prospects
        ],
    }


@router.get("/prospects/{prospect_id}")
async def get_prospect(prospect_id: UUID, session: AsyncSession = Depends(get_session)):
    """Get full prospect detail including all audit results."""
    prospect = await session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    # Get latest scan
    scans_result = await session.exec(
        select(Scan)
        .where(Scan.prospect_id == prospect_id)
        .order_by(Scan.triggered_at.desc())
        .limit(1)
    )
    latest_scan = scans_result.first()

    # Get audit results
    audit_results = {}
    if latest_scan:
        results_result = await session.exec(
            select(AuditResult).where(AuditResult.scan_id == latest_scan.id)
        )
        for ar in results_result.all():
            audit_results[ar.result_type] = {
                "score": ar.score,
                "data": ar.data,
                "findings": ar.findings,
            }

    # Get pain points
    pp_result = await session.exec(
        select(PainPoint)
        .where(PainPoint.prospect_id == prospect_id)
        .order_by(PainPoint.created_at.desc())
        .limit(50)
    )
    pain_points = [
        {
            "finding": pp.finding,
            "evidence": pp.evidence,
            "business_impact": pp.business_impact,
            "priority": pp.priority,
            "category": pp.category,
        }
        for pp in pp_result.all()
    ]

    # Get recommended services
    svc_result = await session.exec(
        select(RecommendedService)
        .where(RecommendedService.prospect_id == prospect_id)
        .order_by(RecommendedService.created_at.desc())
        .limit(20)
    )
    services = [
        {"service": s.service, "reason": s.reason, "priority": s.priority}
        for s in svc_result.all()
    ]

    return {
        "id": str(prospect.id),
        "name": prospect.name,
        "category": prospect.category,
        "sub_categories": prospect.sub_categories,
        "address": prospect.address,
        "city": prospect.city,
        "state": prospect.state,
        "country": prospect.country,
        "postal_code": prospect.postal_code,
        "lat": prospect.lat,
        "lng": prospect.lng,
        "phone": prospect.phone,
        "website": prospect.website,
        "email": prospect.email,
        "maps_url": prospect.maps_url,
        "google_rating": prospect.google_rating,
        "review_count": prospect.review_count,
        "business_status": prospect.business_status,
        "description": prospect.description,
        "social_links": prospect.social_links,
        "lead_score": prospect.lead_score,
        "priority": prospect.priority,
        "data_source": prospect.data_source,
        "last_scan_date": prospect.last_scan_date.isoformat() if prospect.last_scan_date else None,
        "created_at": prospect.created_at.isoformat(),
        "scan": {
            "id": str(latest_scan.id),
            "status": latest_scan.status,
            "progress_pct": latest_scan.progress_pct,
            "current_stage": latest_scan.current_stage,
            "triggered_at": latest_scan.triggered_at.isoformat(),
            "completed_at": latest_scan.completed_at.isoformat() if latest_scan.completed_at else None,
        } if latest_scan else None,
        "audit_results": audit_results,
        "pain_points": pain_points,
        "recommended_services": services,
    }


@router.delete("/prospects/{prospect_id}", status_code=204)
async def delete_prospect(prospect_id: UUID, session: AsyncSession = Depends(get_session)):
    """Delete a prospect and all associated data."""
    prospect = await session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    await session.delete(prospect)
    await session.commit()


# ─── Batch Ingestion Models & Endpoints (Google Maps Extension Sync) ────────────

class ProspectBatchItem(BaseModel):
    name: str
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = "United States"
    postal_code: Optional[str] = None
    category: Optional[str] = None
    google_rating: Optional[float] = None
    review_count: Optional[int] = None
    business_status: Optional[str] = "OPERATIONAL"
    data_source: Optional[str] = "gmaps_extension"
    description: Optional[str] = None
    maps_url: Optional[str] = None
    demo_url: Optional[str] = None


class ProspectBatchRequest(BaseModel):
    prospects: List[ProspectBatchItem]
    auto_audit: bool = True


class ProspectBatchResponse(BaseModel):
    total_received: int
    prospects_created: int
    prospects_existing: int
    scans_triggered: int


@router.post("/prospects/batch", response_model=ProspectBatchResponse)
async def import_prospects_batch(
    request: ProspectBatchRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Ingest a batch of scraped prospects (e.g. from Google Maps Extension).
    Deduplicates by phone, website, or name+city, updates existing records,
    and optionally dispatches background audit scans.
    """
    if not request.prospects:
        return ProspectBatchResponse(
            total_received=0,
            prospects_created=0,
            prospects_existing=0,
            scans_triggered=0,
        )

    created_count = 0
    existing_count = 0
    scans_triggered = 0
    new_prospect_ids = []

    for item in request.prospects:
        name = item.name.strip()
        phone = item.phone.strip() if item.phone else None
        website = item.website.strip() if item.website else None
        if website and not website.startswith("http"):
            website = f"https://{website}"

        # ── Deduplication Checks ──
        existing_prospect = None
        if phone:
            clean_digits = "".join(filter(str.isdigit, phone))
            if len(clean_digits) >= 10:
                last_10 = clean_digits[-10:]
                stmt = select(Prospect).where(Prospect.phone.ilike(f"%{last_10}%"))
                res = await session.exec(stmt)
                existing_prospect = res.first()

        if not existing_prospect and website:
            stmt = select(Prospect).where(Prospect.website == website)
            res = await session.exec(stmt)
            existing_prospect = res.first()

        if not existing_prospect and item.city:
            stmt = select(Prospect).where(
                Prospect.name.ilike(name),
                Prospect.city.ilike(item.city.strip()),
            )
            res = await session.exec(stmt)
            existing_prospect = res.first()

        if existing_prospect:
            existing_count += 1
            updated = False
            if not existing_prospect.phone and phone:
                existing_prospect.phone = phone
                updated = True
            if not existing_prospect.website and website:
                existing_prospect.website = website
                updated = True
            if not existing_prospect.address and item.address:
                existing_prospect.address = item.address
                updated = True
            if item.google_rating is not None and existing_prospect.google_rating is None:
                existing_prospect.google_rating = item.google_rating
                updated = True
            if item.review_count is not None and existing_prospect.review_count is None:
                existing_prospect.review_count = item.review_count
                updated = True
            if updated:
                session.add(existing_prospect)
        else:
            prospect = Prospect(
                name=name,
                phone=phone,
                website=website,
                address=item.address,
                city=item.city,
                state=item.state,
                country=item.country,
                postal_code=item.postal_code,
                category=item.category,
                google_rating=item.google_rating,
                review_count=item.review_count,
                business_status=item.business_status or "OPERATIONAL",
                data_source=item.data_source or "gmaps_extension",
                description=item.description,
                maps_url=item.maps_url,
                social_links={"demo_url": item.demo_url} if item.demo_url else None,
            )
            session.add(prospect)
            created_count += 1
            await session.flush()
            new_prospect_ids.append(prospect.id)

    await session.commit()

    # ── Trigger background audit scans for new prospects with websites ──
    if request.auto_audit and new_prospect_ids:
        try:
            from app.workers.scan_task import run_scan_task
            for pid in new_prospect_ids:
                p = await session.get(Prospect, pid)
                if p and p.website:
                    try:
                        scan = Scan(prospect_id=pid)
                        session.add(scan)
                        await session.commit()
                        await session.refresh(scan)

                        task = run_scan_task.delay(str(scan.id), str(pid))
                        scan.task_id = task.id
                        session.add(scan)
                        await session.commit()
                        scans_triggered += 1
                    except Exception:
                        pass
        except ImportError:
            pass

    return ProspectBatchResponse(
        total_received=len(request.prospects),
        prospects_created=created_count,
        prospects_existing=existing_count,
        scans_triggered=scans_triggered,
    )
