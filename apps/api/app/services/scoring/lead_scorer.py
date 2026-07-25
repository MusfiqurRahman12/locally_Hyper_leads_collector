"""
Lead Scorer – calculates opportunity score 0–100 from all audit results.
Higher score = more opportunity (more problems = better prospect for services).
"""
from typing import Dict, Any, List, Optional


SCORING_RULES = [
    # Website presence
    {"key": "no_website",              "label": "No Website",                    "points": 50, "priority": "HIGH"},
    {"key": "website_unreachable",     "label": "Broken/Unreachable Website",    "points": 40, "priority": "HIGH"},
    {"key": "no_https",                "label": "No HTTPS / SSL",                "points": 15, "priority": "HIGH"},
    # Performance
    {"key": "poor_performance",        "label": "Poor Website Performance",      "points": 20, "priority": "MEDIUM"},
    {"key": "very_poor_performance",   "label": "Very Poor Performance (<50)",    "points": 30, "priority": "HIGH"},
    # SEO
    {"key": "no_seo_basics",           "label": "Missing Core SEO Elements",     "points": 20, "priority": "HIGH"},
    {"key": "no_schema",               "label": "No Structured Data",            "points": 8,  "priority": "MEDIUM"},
    {"key": "no_sitemap",              "label": "No XML Sitemap",                "points": 5,  "priority": "LOW"},
    # Analytics & Marketing
    {"key": "no_analytics",            "label": "No Analytics Platform",         "points": 10, "priority": "HIGH"},
    {"key": "no_retargeting_pixels",   "label": "No Retargeting Pixels",         "points": 10, "priority": "MEDIUM"},
    {"key": "no_facebook_pixel",       "label": "No Facebook/Meta Pixel",        "points": 5,  "priority": "MEDIUM"},
    {"key": "no_gtm",                  "label": "No Tag Manager",                "points": 5,  "priority": "LOW"},
    # Booking & Features
    {"key": "no_booking_system",       "label": "No Online Booking System",      "points": 15, "priority": "MEDIUM"},
    {"key": "no_email_capture",        "label": "No Email Capture Form",         "points": 8,  "priority": "MEDIUM"},
    {"key": "no_live_chat",            "label": "No Live Chat",                  "points": 5,  "priority": "LOW"},
    # Social
    {"key": "no_social_presence",      "label": "No Social Media Presence",      "points": 10, "priority": "MEDIUM"},
    {"key": "limited_social",          "label": "Limited Social Media Presence", "points": 5,  "priority": "LOW"},
    # Reviews
    {"key": "few_reviews",             "label": "Low Review Count (<10)",         "points": 10, "priority": "MEDIUM"},
    {"key": "poor_rating",             "label": "Poor Google Rating (<3.5)",     "points": 8,  "priority": "MEDIUM"},
    # Security
    {"key": "security_issues",         "label": "Security Header Issues",        "points": 10, "priority": "MEDIUM"},
    {"key": "exposed_paths",           "label": "Exposed Sensitive Paths",       "points": 15, "priority": "HIGH"},
    # Legal
    {"key": "no_privacy_policy",       "label": "No Privacy Policy",             "points": 5,  "priority": "MEDIUM"},
]


def calculate_lead_score(
    scrape_data: Dict[str, Any],
    seo_data: Dict[str, Any],
    performance_data: Dict[str, Any],
    security_data: Dict[str, Any],
    marketing_data: Dict[str, Any],
    social_data: Dict[str, Any],
    prospect_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Calculate opportunity score based on all audit results.
    Returns { score, priority, triggered_rules, max_possible }
    """
    triggered: List[Dict[str, Any]] = []
    total_points = 0

    def add_rule(key: str, override_label: Optional[str] = None):
        nonlocal total_points
        rule = next((r for r in SCORING_RULES if r["key"] == key), None)
        if rule:
            triggered.append({
                "key": key,
                "label": override_label or rule["label"],
                "points": rule["points"],
                "priority": rule["priority"],
            })
            total_points += rule["points"]

    # ── Website presence ────────────────────────────────────────────────────
    has_website = bool(prospect_data.get("website"))
    if not has_website:
        add_rule("no_website")
    elif not scrape_data.get("reachable", True):
        add_rule("website_unreachable")

    # ── Security ─────────────────────────────────────────────────────────────
    if has_website:
        ssl_valid = security_data.get("ssl", {}).get("ssl_valid", True)
        https_enforced = security_data.get("https_enforced", True)
        if not ssl_valid or not https_enforced:
            add_rule("no_https")

        exposed = security_data.get("exposed_paths", [])
        if exposed:
            add_rule("exposed_paths")

        header_score = security_data.get("security_score_headers", 100)
        if header_score < 50:
            add_rule("security_issues")

    # ── Performance ──────────────────────────────────────────────────────────
    if has_website and scrape_data.get("reachable"):
        mobile_perf = performance_data.get("mobile", {}).get("scores", {}).get("performance")
        if mobile_perf is not None:
            if mobile_perf < 50:
                add_rule("very_poor_performance")
            elif mobile_perf < 70:
                add_rule("poor_performance")

    # ── SEO ──────────────────────────────────────────────────────────────────
    if has_website:
        seo_score = seo_data.get("score", 100)
        if seo_score < 50:
            add_rule("no_seo_basics")

        seo_inner = seo_data.get("data", {})
        if not seo_inner.get("has_schema_markup"):
            add_rule("no_schema")
        if not seo_inner.get("has_sitemap"):
            add_rule("no_sitemap")
        if not scrape_data.get("pages_found", {}).get("privacy_policy"):
            add_rule("no_privacy_policy")

    # ── Marketing ────────────────────────────────────────────────────────────
    mkt = marketing_data.get("data", {})
    if not mkt.get("has_analytics"):
        add_rule("no_analytics")
    if not mkt.get("has_retargeting"):
        add_rule("no_retargeting_pixels")
    if not mkt.get("has_facebook_pixel"):
        add_rule("no_facebook_pixel")
    if not mkt.get("has_gtm"):
        add_rule("no_gtm")
    if not mkt.get("has_chat"):
        add_rule("no_live_chat")
    if not mkt.get("has_email_capture"):
        add_rule("no_email_capture")

    # ── Booking ──────────────────────────────────────────────────────────────
    booking_systems = scrape_data.get("booking_systems", {})
    has_booking = any(booking_systems.values())
    if not has_booking:
        add_rule("no_booking_system")

    # ── Social ───────────────────────────────────────────────────────────────
    active_social = social_data.get("data", {}).get("active_count", 0)
    if active_social == 0:
        add_rule("no_social_presence")
    elif active_social < 2:
        add_rule("limited_social")

    # ── Reviews ──────────────────────────────────────────────────────────────
    review_count = prospect_data.get("review_count") or 0
    rating = prospect_data.get("google_rating")
    if review_count < 10:
        add_rule("few_reviews")
    if rating and rating < 3.5:
        add_rule("poor_rating")

    # ── Normalize to 0–100 ───────────────────────────────────────────────────
    max_possible = sum(r["points"] for r in SCORING_RULES)
    normalized_score = min(100, int(total_points / max_possible * 100))

    # Priority
    if normalized_score >= 60:
        priority = "HIGH"
    elif normalized_score >= 30:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    return {
        "score": normalized_score,
        "raw_points": total_points,
        "max_possible": max_possible,
        "priority": priority,
        "triggered_rules": triggered,
    }
