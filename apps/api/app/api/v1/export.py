"""
Export endpoints – CSV, Excel, JSON.
"""
import io
import json
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
from uuid import UUID
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
import pandas as pd
from datetime import datetime

from app.db.session import get_session
from app.models.prospect import Prospect
from app.models.pain_point import PainPoint, RecommendedService

router = APIRouter()


async def _get_export_data(
    session: AsyncSession,
    prospect_ids: Optional[List[UUID]] = None,
    priority: Optional[str] = None,
) -> List[dict]:
    """Fetch prospects with pain points and services for export."""
    query = select(Prospect)
    if prospect_ids:
        query = query.where(Prospect.id.in_(prospect_ids))
    if priority:
        query = query.where(Prospect.priority == priority.upper())

    result = await session.exec(query.order_by(Prospect.lead_score.desc().nullslast()))
    prospects = result.all()

    rows = []
    for p in prospects:
        # Get pain points
        pp_result = await session.exec(
            select(PainPoint).where(PainPoint.prospect_id == p.id).limit(10)
        )
        pain_points = pp_result.all()

        # Get services
        svc_result = await session.exec(
            select(RecommendedService).where(RecommendedService.prospect_id == p.id).limit(10)
        )
        services = svc_result.all()

        social = p.social_links or {}

        rows.append({
            "Business Name": p.name,
            "Category": p.category or "",
            "Address": p.address or "",
            "City": p.city or "",
            "State": p.state or "",
            "Country": p.country or "",
            "Postal Code": p.postal_code or "",
            "Phone": p.phone or "",
            "Email": p.email or "",
            "Website": p.website or "",
            "Google Rating": p.google_rating or "",
            "Review Count": p.review_count or 0,
            "Business Status": p.business_status or "",
            "Lead Score": p.lead_score or 0,
            "Priority": p.priority or "",
            "Facebook": social.get("facebook", ""),
            "Instagram": social.get("instagram", ""),
            "LinkedIn": social.get("linkedin", ""),
            "YouTube": social.get("youtube", ""),
            "TikTok": social.get("tiktok", ""),
            "Maps URL": p.maps_url or "",
            "Pain Points": " | ".join(pp.finding for pp in pain_points),
            "Recommended Services": " | ".join(svc.service for svc in services),
            "Data Source": p.data_source or "openstreetmap",
            "Last Scan Date": p.last_scan_date.isoformat() if p.last_scan_date else "",
        })

    return rows


@router.get("/export/csv")
async def export_csv(
    priority: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    """Export prospects to CSV."""
    rows = await _get_export_data(session, priority=priority)
    if not rows:
        raise HTTPException(status_code=404, detail="No prospects to export.")

    df = pd.DataFrame(rows)
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    stream.seek(0)

    filename = f"prospects_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/excel")
async def export_excel(
    priority: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    """Export prospects to Excel (.xlsx)."""
    rows = await _get_export_data(session, priority=priority)
    if not rows:
        raise HTTPException(status_code=404, detail="No prospects to export.")

    df = pd.DataFrame(rows)
    stream = io.BytesIO()

    with pd.ExcelWriter(stream, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Prospects")
        ws = writer.sheets["Prospects"]
        # Auto-width columns
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 60)

    stream.seek(0)
    filename = f"prospects_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/json")
async def export_json(
    priority: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    """Export prospects to JSON."""
    rows = await _get_export_data(session, priority=priority)
    if not rows:
        raise HTTPException(status_code=404, detail="No prospects to export.")

    filename = f"prospects_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    content = json.dumps(rows, indent=2, default=str)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
