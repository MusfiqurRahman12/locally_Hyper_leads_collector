"""
Prospects CRUD endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
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
    sort_by: str = Query(default="lead_score", regex="^(lead_score|name|city|created_at|review_count)$"),
    sort_dir: str = Query(default="desc", regex="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
):
    """List prospects with filtering, sorting, and pagination."""
    query = select(Prospect)

    # Filters
    if search:
        query = query.where(
            (Prospect.name.ilike(f"%{search}%")) |
            (Prospect.address.ilike(f"%{search}%"))
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
    sort_col = getattr(Prospect, sort_by, Prospect.lead_score)
    if sort_dir == "desc":
        query = query.order_by(sort_col.desc().nullslast())
    else:
        query = query.order_by(sort_col.asc().nullsfirst())

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
                "website": p.website,
                "google_rating": p.google_rating,
                "review_count": p.review_count,
                "lead_score": p.lead_score,
                "priority": p.priority,
                "business_status": p.business_status,
                "lat": p.lat,
                "lng": p.lng,
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
