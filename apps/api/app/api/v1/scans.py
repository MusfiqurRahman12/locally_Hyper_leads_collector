"""
Scan trigger and status endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from uuid import UUID
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.scan import Scan, ScanCreate, ScanRead, ScanStatus
from app.models.prospect import Prospect
from app.workers.scan_task import run_scan_task

router = APIRouter()


class BulkScanRequest(BaseModel):
    prospect_ids: List[UUID]


@router.post("/scans", response_model=ScanRead)
async def trigger_scan(
    request: ScanCreate,
    session: AsyncSession = Depends(get_session),
):
    """Trigger a full audit scan for a prospect."""
    prospect = await session.get(Prospect, request.prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    # Check for already running scan
    existing_result = await session.exec(
        select(Scan).where(
            Scan.prospect_id == request.prospect_id,
            Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING])
        )
    )
    if existing_result.first():
        raise HTTPException(status_code=409, detail="A scan is already running for this prospect.")

    scan = Scan(prospect_id=request.prospect_id)
    session.add(scan)
    await session.commit()
    await session.refresh(scan)

    # Dispatch Celery task
    task = run_scan_task.delay(str(scan.id), str(request.prospect_id))
    scan.task_id = task.id
    session.add(scan)
    await session.commit()
    await session.refresh(scan)

    return scan


@router.post("/scans/bulk")
async def trigger_bulk_scan(
    request: BulkScanRequest,
    session: AsyncSession = Depends(get_session),
):
    """Trigger scans for multiple prospects."""
    results = []
    for prospect_id in request.prospect_ids:
        prospect = await session.get(Prospect, prospect_id)
        if not prospect:
            results.append({"prospect_id": str(prospect_id), "status": "not_found"})
            continue

        # Skip if already running
        existing = await session.exec(
            select(Scan).where(
                Scan.prospect_id == prospect_id,
                Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING])
            )
        )
        if existing.first():
            results.append({"prospect_id": str(prospect_id), "status": "already_running"})
            continue

        scan = Scan(prospect_id=prospect_id)
        session.add(scan)
        await session.commit()
        await session.refresh(scan)

        task = run_scan_task.delay(str(scan.id), str(prospect_id))
        scan.task_id = task.id
        session.add(scan)
        await session.commit()

        results.append({"prospect_id": str(prospect_id), "scan_id": str(scan.id), "status": "queued"})

    return {"results": results}


@router.get("/scans/{scan_id}", response_model=ScanRead)
async def get_scan_status(scan_id: UUID, session: AsyncSession = Depends(get_session)):
    """Get the current status of a scan."""
    scan = await session.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/prospects/{prospect_id}/scans")
async def get_prospect_scans(prospect_id: UUID, session: AsyncSession = Depends(get_session)):
    """List all scans for a prospect."""
    result = await session.exec(
        select(Scan)
        .where(Scan.prospect_id == prospect_id)
        .order_by(Scan.triggered_at.desc())
    )
    scans = result.all()
    return {
        "scans": [
            {
                "id": str(s.id),
                "status": s.status,
                "progress_pct": s.progress_pct,
                "current_stage": s.current_stage,
                "triggered_at": s.triggered_at.isoformat(),
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "error_message": s.error_message,
            }
            for s in scans
        ]
    }
