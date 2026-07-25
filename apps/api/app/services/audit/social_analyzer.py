"""
Social Media Analyzer – verifies social profile presence from website-extracted links.
"""
import httpx
import logging
from typing import Dict, Any, List, Optional
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PLATFORMS = ["facebook", "instagram", "linkedin", "youtube", "tiktok", "pinterest", "twitter_x"]


async def verify_social_profile(url: str) -> bool:
    """HEAD request to check if a social URL is reachable."""
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.head(url, headers={"User-Agent": "Mozilla/5.0"})
            return resp.status_code < 400
    except Exception:
        return False


async def analyze_social(social_links: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """Analyze social media presence from extracted links."""
    results: Dict[str, Any] = {}
    active_count = 0
    missing_platforms: List[str] = []

    for platform in PLATFORMS:
        link = social_links.get(platform)
        if link:
            is_active = await verify_social_profile(link)
            results[platform] = {
                "present": True,
                "url": link,
                "reachable": is_active,
            }
            if is_active:
                active_count += 1
        else:
            results[platform] = {
                "present": False,
                "url": None,
                "reachable": False,
            }
            missing_platforms.append(platform)

    # Presence score
    presence_score = int(active_count / len(PLATFORMS) * 100)

    findings: List[Dict[str, str]] = []

    if active_count == 0:
        findings.append({
            "finding": "No Social Media Presence Found",
            "evidence": "No links to any social platforms found on the website.",
            "priority": "HIGH",
            "category": "social",
        })
    elif active_count < 2:
        findings.append({
            "finding": "Very Limited Social Media Presence",
            "evidence": f"Only {active_count} social platform(s) found out of {len(PLATFORMS)} checked.",
            "priority": "MEDIUM",
            "category": "social",
        })

    if not results.get("facebook", {}).get("present"):
        findings.append({
            "finding": "No Facebook Page Linked",
            "evidence": "No Facebook profile or page link found on website.",
            "priority": "MEDIUM",
            "category": "social",
        })

    if not results.get("instagram", {}).get("present"):
        findings.append({
            "finding": "No Instagram Account Linked",
            "evidence": "No Instagram link found on website.",
            "priority": "LOW",
            "category": "social",
        })

    return {
        "score": presence_score,
        "findings": findings,
        "data": {
            "platforms": results,
            "active_count": active_count,
            "missing_platforms": missing_platforms,
            "presence_score": presence_score,
        },
    }
