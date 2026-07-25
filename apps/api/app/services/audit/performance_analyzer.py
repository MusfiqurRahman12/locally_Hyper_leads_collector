"""
Performance Analyzer – calls Google PageSpeed Insights API v5.
Returns Core Web Vitals, Lighthouse scores, and improvement opportunities.
"""
import httpx
import logging
from typing import Dict, Any, List, Optional
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PSI_URL = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed"


def _extract_score(categories: Dict, key: str) -> Optional[int]:
    cat = categories.get(key, {})
    score = cat.get("score")
    return int(score * 100) if score is not None else None


def _extract_metric(audits: Dict, key: str) -> Optional[str]:
    audit = audits.get(key, {})
    return audit.get("displayValue")


def _extract_numeric_metric(audits: Dict, key: str) -> Optional[float]:
    audit = audits.get(key, {})
    num = audit.get("numericValue")
    return round(num, 2) if num is not None else None


def _extract_opportunities(audits: Dict) -> List[Dict[str, Any]]:
    """Extract actionable improvement opportunities from Lighthouse."""
    opportunity_keys = [
        "render-blocking-resources",
        "unused-css-rules",
        "unused-javascript",
        "uses-optimized-images",
        "uses-webp-images",
        "uses-text-compression",
        "uses-responsive-images",
        "efficient-animated-content",
        "uses-long-cache-ttl",
        "total-byte-weight",
        "dom-size",
        "no-document-write",
        "uses-http2",
        "uses-passive-event-listeners",
        "image-alt",
    ]
    opportunities = []
    for key in opportunity_keys:
        audit = audits.get(key, {})
        if audit.get("score") is not None and audit.get("score") < 1:
            savings = audit.get("details", {}).get("overallSavingsMs")
            opportunities.append({
                "key": key,
                "title": audit.get("title", ""),
                "description": audit.get("description", ""),
                "display_value": audit.get("displayValue", ""),
                "savings_ms": round(savings) if savings else None,
                "score": audit.get("score"),
            })
    return opportunities


async def analyze_performance(url: str, strategy: str = "mobile") -> Dict[str, Any]:
    """
    Run a PageSpeed Insights audit.
    strategy: 'mobile' or 'desktop'
    """
    params = {
        "url": url,
        "strategy": strategy,
        "category": ["performance", "accessibility", "best-practices", "seo"],
    }
    if settings.pagespeed_api_key:
        params["key"] = settings.pagespeed_api_key

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(PSI_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"PSI API error {e.response.status_code}: {e.response.text[:200]}")
        return {"error": f"PSI API error: {e.response.status_code}", "strategy": strategy}
    except Exception as e:
        logger.error(f"PSI request failed: {e}")
        return {"error": str(e), "strategy": strategy}

    lhr = data.get("lighthouseResult", {})
    categories = lhr.get("categories", {})
    audits = lhr.get("audits", {})

    performance_score = _extract_score(categories, "performance")
    accessibility_score = _extract_score(categories, "accessibility")
    best_practices_score = _extract_score(categories, "best-practices")
    seo_score = _extract_score(categories, "seo")

    return {
        "strategy": strategy,
        "url": url,
        "scores": {
            "performance": performance_score,
            "accessibility": accessibility_score,
            "best_practices": best_practices_score,
            "seo": seo_score,
        },
        "core_web_vitals": {
            "lcp": {
                "value": _extract_numeric_metric(audits, "largest-contentful-paint"),
                "display": _extract_metric(audits, "largest-contentful-paint"),
            },
            "fcp": {
                "value": _extract_numeric_metric(audits, "first-contentful-paint"),
                "display": _extract_metric(audits, "first-contentful-paint"),
            },
            "cls": {
                "value": _extract_numeric_metric(audits, "cumulative-layout-shift"),
                "display": _extract_metric(audits, "cumulative-layout-shift"),
            },
            "inp": {
                "value": _extract_numeric_metric(audits, "interaction-to-next-paint"),
                "display": _extract_metric(audits, "interaction-to-next-paint"),
            },
            "ttfb": {
                "value": _extract_numeric_metric(audits, "server-response-time"),
                "display": _extract_metric(audits, "server-response-time"),
            },
            "speed_index": {
                "value": _extract_numeric_metric(audits, "speed-index"),
                "display": _extract_metric(audits, "speed-index"),
            },
            "tti": {
                "value": _extract_numeric_metric(audits, "interactive"),
                "display": _extract_metric(audits, "interactive"),
            },
            "tbt": {
                "value": _extract_numeric_metric(audits, "total-blocking-time"),
                "display": _extract_metric(audits, "total-blocking-time"),
            },
        },
        "resource_metrics": {
            "total_requests": _extract_metric(audits, "network-requests"),
            "total_page_size": _extract_metric(audits, "total-byte-weight"),
            "dom_size": _extract_metric(audits, "dom-size"),
        },
        "opportunities": _extract_opportunities(audits),
    }


def score_from_performance(perf_data: Dict[str, Any]) -> int:
    """Convert performance API data into a 0–100 audit score."""
    mobile = perf_data.get("mobile", {})
    scores = mobile.get("scores", {})
    perf = scores.get("performance")
    if perf is None:
        return 50  # unknown
    return perf


def get_performance_findings(perf_data: Dict[str, Any]) -> List[Dict[str, str]]:
    """Generate findings from performance data."""
    findings = []
    mobile = perf_data.get("mobile", {})
    scores = mobile.get("scores", {})
    cwv = mobile.get("core_web_vitals", {})

    perf_score = scores.get("performance", 100)
    if perf_score is not None and perf_score < 50:
        findings.append({
            "finding": "Very Poor Mobile Performance Score",
            "evidence": f"PageSpeed score: {perf_score}/100 (mobile)",
            "priority": "HIGH",
            "category": "performance",
        })
    elif perf_score is not None and perf_score < 70:
        findings.append({
            "finding": "Below-Average Mobile Performance",
            "evidence": f"PageSpeed score: {perf_score}/100 (mobile)",
            "priority": "MEDIUM",
            "category": "performance",
        })

    lcp = cwv.get("lcp", {}).get("value")
    if lcp and lcp > 4000:
        findings.append({
            "finding": "Poor Largest Contentful Paint (LCP)",
            "evidence": f"LCP: {cwv['lcp']['display']} (target: < 2.5s)",
            "priority": "HIGH",
            "category": "core_web_vitals",
        })

    cls = cwv.get("cls", {}).get("value")
    if cls and cls > 0.25:
        findings.append({
            "finding": "Poor Cumulative Layout Shift (CLS)",
            "evidence": f"CLS: {cwv['cls']['display']} (target: < 0.1)",
            "priority": "HIGH",
            "category": "core_web_vitals",
        })

    a11y = scores.get("accessibility", 100)
    if a11y is not None and a11y < 70:
        findings.append({
            "finding": "Accessibility Issues Detected",
            "evidence": f"Lighthouse accessibility score: {a11y}/100",
            "priority": "HIGH" if a11y < 50 else "MEDIUM",
            "category": "accessibility",
        })

    for opp in mobile.get("opportunities", []):
        if opp.get("savings_ms") and opp["savings_ms"] > 500:
            findings.append({
                "finding": opp["title"],
                "evidence": opp.get("display_value", ""),
                "priority": "MEDIUM",
                "category": "performance_opportunity",
            })

    return findings
