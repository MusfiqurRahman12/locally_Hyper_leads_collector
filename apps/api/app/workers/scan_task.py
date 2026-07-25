"""
Full scan orchestration Celery task.
Runs all 7 audit stages for a prospect and writes results to the database.
"""
import asyncio
import logging
from datetime import datetime
from uuid import UUID
from typing import Dict, Any, Optional

from celery import Task
from sqlmodel import select

from app.workers.celery_app import celery_app
from app.db.session import AsyncSessionLocal
from app.models.scan import Scan, ScanStatus
from app.models.audit_result import AuditResult
from app.models.pain_point import PainPoint, RecommendedService
from app.models.prospect import Prospect

from app.services.audit.website_scraper import WebsiteScraper
from app.services.audit.seo_analyzer import analyze_seo
from app.services.audit.performance_analyzer import analyze_performance, get_performance_findings
from app.services.audit.security_analyzer import analyze_security
from app.services.audit.tech_detector import detect_technologies, get_tech_findings
from app.services.audit.marketing_analyzer import analyze_marketing
from app.services.audit.social_analyzer import analyze_social
from app.services.scoring.lead_scorer import calculate_lead_score
from app.services.scoring.pain_point_generator import (
    generate_pain_points,
    generate_service_recommendations,
)

logger = logging.getLogger(__name__)

SCAN_STAGES = [
    ("Scraping website", 10),
    ("Analyzing SEO", 25),
    ("Running performance audit", 40),
    ("Checking security", 55),
    ("Detecting technology stack", 65),
    ("Analyzing marketing setup", 75),
    ("Checking social presence", 82),
    ("Calculating lead score", 90),
    ("Generating pain points", 95),
    ("Finalizing", 100),
]


async def _update_scan_status(
    scan_id: str,
    status: ScanStatus,
    stage: Optional[str] = None,
    progress: int = 0,
    error: Optional[str] = None,
):
    async with AsyncSessionLocal() as session:
        scan = await session.get(Scan, UUID(scan_id))
        if scan:
            scan.status = status
            if stage:
                scan.current_stage = stage
            scan.progress_pct = progress
            if error:
                scan.error_message = error
            if status == ScanStatus.RUNNING and not scan.started_at:
                scan.started_at = datetime.utcnow()
            if status in (ScanStatus.DONE, ScanStatus.FAILED):
                scan.completed_at = datetime.utcnow()
            session.add(scan)
            await session.commit()


async def _save_audit_result(
    scan_id: str,
    prospect_id: str,
    result_type: str,
    score: Optional[int],
    data: Dict[str, Any],
    findings: list,
):
    async with AsyncSessionLocal() as session:
        # Remove existing result of this type for this scan
        existing = await session.exec(
            select(AuditResult).where(
                AuditResult.scan_id == UUID(scan_id),
                AuditResult.result_type == result_type,
            )
        )
        for old in existing.all():
            await session.delete(old)

        result = AuditResult(
            scan_id=UUID(scan_id),
            prospect_id=UUID(prospect_id),
            result_type=result_type,
            score=score,
            data=data,
            findings=findings,
        )
        session.add(result)
        await session.commit()


async def run_full_scan(scan_id: str, prospect_id: str):
    """Async scan orchestration pipeline."""
    # Load prospect
    async with AsyncSessionLocal() as session:
        prospect = await session.get(Prospect, UUID(prospect_id))
        if not prospect:
            raise ValueError(f"Prospect {prospect_id} not found")
        prospect_dict = {
            "id": str(prospect.id),
            "name": prospect.name,
            "website": prospect.website,
            "phone": prospect.phone,
            "google_rating": prospect.google_rating,
            "review_count": prospect.review_count,
            "social_links": prospect.social_links or {},
        }

    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Initializing scan", 5)

    website = prospect_dict.get("website")

    # ── Stage 1: Website Scraping ────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Scraping website", 10)
    scrape_data: Dict[str, Any] = {}
    html_content: Optional[str] = None

    if website:
        try:
            scraper = WebsiteScraper(website)
            scrape_data = await scraper.scrape()
            html_content = scrape_data.get("html_content")
        except Exception as e:
            logger.error(f"Scraping failed for {website}: {e}")
            scrape_data = {"reachable": False, "error": str(e)}

        await _save_audit_result(
            scan_id, prospect_id, "WEBSITE",
            score=100 if scrape_data.get("reachable") else 0,
            data=scrape_data,
            findings=[],
        )
    else:
        scrape_data = {"reachable": False, "no_website": True}

    # ── Stage 2: SEO Analysis ────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Analyzing SEO", 25)
    seo_result: Dict[str, Any] = {"score": 0, "findings": [], "data": {}}
    if website and scrape_data.get("reachable"):
        try:
            seo_result = analyze_seo(scrape_data)
        except Exception as e:
            logger.error(f"SEO analysis failed: {e}")

    await _save_audit_result(
        scan_id, prospect_id, "SEO",
        score=seo_result.get("score"),
        data=seo_result.get("data", {}),
        findings=seo_result.get("findings", []),
    )

    # ── Stage 3: Performance ─────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Running performance audit", 40)
    perf_result: Dict[str, Any] = {}
    if website and scrape_data.get("reachable"):
        try:
            mobile, desktop = await asyncio.gather(
                analyze_performance(website, "mobile"),
                analyze_performance(website, "desktop"),
                return_exceptions=True,
            )
            perf_result = {
                "mobile": mobile if not isinstance(mobile, Exception) else {"error": str(mobile)},
                "desktop": desktop if not isinstance(desktop, Exception) else {"error": str(desktop)},
            }
        except Exception as e:
            logger.error(f"Performance audit failed: {e}")
            perf_result = {"error": str(e)}

    perf_findings = get_performance_findings(perf_result)
    perf_score = perf_result.get("mobile", {}).get("scores", {}).get("performance") if perf_result else None
    await _save_audit_result(
        scan_id, prospect_id, "PERFORMANCE",
        score=perf_score,
        data=perf_result,
        findings=perf_findings,
    )

    # ── Stage 4: Security ────────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Checking security", 55)
    security_result: Dict[str, Any] = {}
    if website:
        try:
            security_result = await analyze_security(website)
        except Exception as e:
            logger.error(f"Security audit failed: {e}")
            security_result = {"error": str(e)}

    await _save_audit_result(
        scan_id, prospect_id, "SECURITY",
        score=security_result.get("score"),
        data=security_result,
        findings=security_result.get("findings", []),
    )

    # ── Stage 5: Technology ──────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Detecting technology stack", 65)
    tech_result: Dict[str, Any] = {"technologies": [], "by_category": {}}
    if website:
        try:
            tech_result = await detect_technologies(website, html_content)
        except Exception as e:
            logger.error(f"Tech detection failed: {e}")

    tech_findings = get_tech_findings(tech_result)
    await _save_audit_result(
        scan_id, prospect_id, "TECHNOLOGY",
        score=None,
        data=tech_result,
        findings=tech_findings,
    )

    # ── Stage 6: Marketing ───────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Analyzing marketing setup", 75)
    marketing_result: Dict[str, Any] = {"score": 0, "findings": [], "data": {}}
    if website and scrape_data.get("reachable"):
        try:
            marketing_result = analyze_marketing(scrape_data)
        except Exception as e:
            logger.error(f"Marketing analysis failed: {e}")

    await _save_audit_result(
        scan_id, prospect_id, "MARKETING",
        score=marketing_result.get("score"),
        data=marketing_result.get("data", {}),
        findings=marketing_result.get("findings", []),
    )

    # ── Stage 7: Social Media ────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Checking social presence", 82)
    social_result: Dict[str, Any] = {"score": 0, "findings": [], "data": {}}
    try:
        social_links = scrape_data.get("social_links") or prospect_dict.get("social_links") or {}
        social_result = await analyze_social(social_links)
    except Exception as e:
        logger.error(f"Social analysis failed: {e}")

    await _save_audit_result(
        scan_id, prospect_id, "SOCIAL",
        score=social_result.get("score"),
        data=social_result.get("data", {}),
        findings=social_result.get("findings", []),
    )

    # ── Stage 8: Lead Scoring ─────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Calculating lead score", 90)
    score_result = calculate_lead_score(
        scrape_data=scrape_data,
        seo_data=seo_result,
        performance_data=perf_result,
        security_data=security_result,
        marketing_data=marketing_result,
        social_data=social_result,
        prospect_data=prospect_dict,
    )

    # ── Stage 9: Pain Points & Services ──────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.RUNNING, "Generating pain points", 95)
    pain_points = generate_pain_points(
        score_result.get("triggered_rules", []),
        scrape_data, seo_result, security_result,
    )
    service_recs = generate_service_recommendations(score_result.get("triggered_rules", []))

    # Save pain points and services to DB
    async with AsyncSessionLocal() as session:
        # Clear old pain points for this prospect
        old_pp = await session.exec(
            select(PainPoint).where(PainPoint.scan_id == UUID(scan_id))
        )
        for pp in old_pp.all():
            await session.delete(pp)

        old_svc = await session.exec(
            select(RecommendedService).where(RecommendedService.scan_id == UUID(scan_id))
        )
        for svc in old_svc.all():
            await session.delete(svc)

        for pp in pain_points:
            session.add(PainPoint(
                prospect_id=UUID(prospect_id),
                scan_id=UUID(scan_id),
                finding=pp["finding"],
                evidence=pp["evidence"],
                business_impact=pp["business_impact"],
                priority=pp["priority"],
                category=pp["category"],
            ))

        for svc in service_recs:
            session.add(RecommendedService(
                prospect_id=UUID(prospect_id),
                scan_id=UUID(scan_id),
                service=svc["service"],
                reason=svc["reason"],
                priority=svc["priority"],
            ))

        # Update prospect with score
        prospect = await session.get(Prospect, UUID(prospect_id))
        if prospect:
            prospect.lead_score = score_result["score"]
            prospect.priority = score_result["priority"]
            prospect.last_scan_date = datetime.utcnow()
            session.add(prospect)

        await session.commit()

    # ── Done ──────────────────────────────────────────────────────────────────
    await _update_scan_status(scan_id, ScanStatus.DONE, "Completed", 100)
    logger.info(f"Scan {scan_id} completed. Score: {score_result['score']}, Priority: {score_result['priority']}")


@celery_app.task(bind=True, name="app.workers.scan_task.run_scan_task")
def run_scan_task(self: Task, scan_id: str, prospect_id: str):
    """Celery entry point for scan pipeline."""
    try:
        asyncio.run(run_full_scan(scan_id, prospect_id))
    except Exception as e:
        logger.error(f"Scan {scan_id} failed with exception: {e}")
        asyncio.run(_update_scan_status(
            scan_id, ScanStatus.FAILED,
            stage="Failed",
            progress=0,
            error=str(e)
        ))
        raise
