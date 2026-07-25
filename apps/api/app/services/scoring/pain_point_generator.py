"""
Pain Point Generator – converts triggered scoring rules + audit findings into
structured, evidence-based pain points ready for sales teams.
"""
from typing import Dict, Any, List


# Maps scoring rule keys to pain point templates
PAIN_POINT_TEMPLATES: Dict[str, Dict[str, str]] = {
    "no_website": {
        "finding": "Business Has No Website",
        "business_impact": "Customers cannot find or research the business online. Up to 97% of consumers search online before buying locally — this business is invisible to them.",
        "category": "website",
    },
    "website_unreachable": {
        "finding": "Website Is Broken or Unreachable",
        "business_impact": "Existing and potential customers receive errors when trying to visit the site. This directly damages credibility and loses leads in real-time.",
        "category": "website",
    },
    "no_https": {
        "finding": "Website Does Not Use HTTPS / Invalid SSL",
        "business_impact": "Browsers display 'Not Secure' warnings to visitors. Google demotes non-HTTPS sites in search results. Customer data is at risk.",
        "category": "security",
    },
    "poor_performance": {
        "finding": "Slow Website Loading Speed",
        "business_impact": "A 1-second delay in page load can reduce conversions by up to 7%. Slow sites rank lower in Google and frustrate mobile users.",
        "category": "performance",
    },
    "very_poor_performance": {
        "finding": "Critical Website Performance Issues",
        "business_impact": "With a PageSpeed score under 50, the site experiences high bounce rates and poor Google rankings. Mobile users will abandon it within seconds.",
        "category": "performance",
    },
    "no_seo_basics": {
        "finding": "Missing Core SEO Elements",
        "business_impact": "The website lacks basic SEO signals (title tags, meta descriptions, headings), making it nearly invisible to search engines and losing potential customers daily.",
        "category": "seo",
    },
    "no_schema": {
        "finding": "No Structured Data / Schema Markup",
        "business_impact": "Without schema, the business misses out on rich snippets (star ratings, hours, FAQs) in Google search results that drive higher click-through rates.",
        "category": "seo",
    },
    "no_analytics": {
        "finding": "No Website Analytics Installed",
        "business_impact": "The business has no visibility into who visits their website, where they come from, or what they do. Marketing spend cannot be measured or optimized.",
        "category": "analytics",
    },
    "no_retargeting_pixels": {
        "finding": "No Retargeting / Ad Tracking Pixels",
        "business_impact": "Without retargeting pixels, the business cannot show targeted ads to visitors who didn't convert. They're losing warm leads that visited but didn't call or book.",
        "category": "marketing",
    },
    "no_facebook_pixel": {
        "finding": "No Facebook / Meta Pixel Installed",
        "business_impact": "Cannot run Facebook or Instagram retargeting campaigns. Missing one of the most cost-effective advertising channels for local businesses.",
        "category": "marketing",
    },
    "no_booking_system": {
        "finding": "No Online Booking or Appointment System",
        "business_impact": "Customers cannot book online — they must call during business hours. Studies show 40% of bookings happen outside business hours. Revenue is being lost.",
        "category": "features",
    },
    "no_email_capture": {
        "finding": "No Email List / Newsletter Signup",
        "business_impact": "The business has no way to capture visitor emails and build a customer list for promotions, follow-ups, or repeat business campaigns.",
        "category": "marketing",
    },
    "no_live_chat": {
        "finding": "No Live Chat or Chatbot",
        "business_impact": "Visitors with questions leave without converting. Live chat increases lead conversion by up to 40% by capturing intent in the moment.",
        "category": "features",
    },
    "no_social_presence": {
        "finding": "No Social Media Presence Detected",
        "business_impact": "The business has no discoverable social media profiles. Competitors with active social presence attract customers who search on Facebook and Instagram.",
        "category": "social",
    },
    "limited_social": {
        "finding": "Very Limited Social Media Presence",
        "business_impact": "Only 1 social platform found. Multi-platform presence is needed to reach different demographics and build brand trust.",
        "category": "social",
    },
    "few_reviews": {
        "finding": "Very Few Customer Reviews",
        "business_impact": "With fewer than 10 reviews, the business struggles to establish trust with new customers. 88% of consumers trust online reviews as much as personal recommendations.",
        "category": "reputation",
    },
    "poor_rating": {
        "finding": "Below-Average Google Rating",
        "business_impact": "A rating below 3.5 stars causes customers to choose competitors. Negative reviews without responses signal poor customer service.",
        "category": "reputation",
    },
    "security_issues": {
        "finding": "Missing HTTP Security Headers",
        "business_impact": "Without security headers, the site is vulnerable to XSS, clickjacking, and data injection attacks. This is a liability risk for the business and its customers.",
        "category": "security",
    },
    "exposed_paths": {
        "finding": "Sensitive Files or Admin Pages Exposed",
        "business_impact": "Publicly accessible admin pages or config files create serious security vulnerabilities and could lead to data breaches, legal liability, or site takeover.",
        "category": "security",
    },
    "no_privacy_policy": {
        "finding": "No Privacy Policy Page",
        "business_impact": "A missing privacy policy is illegal in many jurisdictions (GDPR, CCPA) and required by Google Ads, Facebook Ads, and most email marketing platforms.",
        "category": "legal",
    },
}


SERVICE_RECOMMENDATIONS: Dict[str, List[str]] = {
    "no_website": ["Website Development"],
    "website_unreachable": ["Website Development", "Hosting Migration"],
    "no_https": ["Security Hardening", "SSL Setup"],
    "poor_performance": ["Speed Optimization", "Hosting Migration"],
    "very_poor_performance": ["Speed Optimization", "Website Redesign", "Hosting Migration"],
    "no_seo_basics": ["SEO", "Local SEO"],
    "no_schema": ["Local SEO", "SEO"],
    "no_sitemap": ["SEO"],
    "no_analytics": ["Analytics Setup"],
    "no_retargeting_pixels": ["Conversion Tracking", "Marketing Automation"],
    "no_facebook_pixel": ["Conversion Tracking"],
    "no_gtm": ["Analytics Setup"],
    "no_booking_system": ["Booking System"],
    "no_email_capture": ["Marketing Automation", "CRM Integration"],
    "no_live_chat": ["CRM Integration"],
    "no_social_presence": ["Social Media Management"],
    "limited_social": ["Social Media Management"],
    "few_reviews": ["Google Business Optimization"],
    "poor_rating": ["Google Business Optimization"],
    "security_issues": ["Security Hardening"],
    "exposed_paths": ["Security Hardening", "Maintenance Plan"],
    "no_privacy_policy": ["Website Redesign"],
}


def generate_pain_points(
    triggered_rules: List[Dict[str, Any]],
    scrape_data: Dict[str, Any],
    seo_data: Dict[str, Any],
    security_data: Dict[str, Any],
) -> List[Dict[str, str]]:
    """Generate evidence-based pain points from scoring triggers."""
    pain_points = []

    for rule in triggered_rules:
        key = rule["key"]
        template = PAIN_POINT_TEMPLATES.get(key)
        if not template:
            continue

        # Build evidence from actual audit data
        evidence = _build_evidence(key, scrape_data, seo_data, security_data)

        pain_points.append({
            "finding": template["finding"],
            "evidence": evidence,
            "business_impact": template["business_impact"],
            "priority": rule["priority"],
            "category": template["category"],
        })

    return pain_points


def generate_service_recommendations(triggered_rules: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Generate unique service recommendations from triggered rules."""
    seen_services = set()
    recommendations = []

    # Sort by priority (HIGH first)
    sorted_rules = sorted(
        triggered_rules,
        key=lambda r: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(r["priority"], 3)
    )

    for rule in sorted_rules:
        services = SERVICE_RECOMMENDATIONS.get(rule["key"], [])
        for service in services:
            if service not in seen_services:
                seen_services.add(service)
                recommendations.append({
                    "service": service,
                    "reason": f"Triggered by: {rule['label']}",
                    "priority": rule["priority"],
                })

    return recommendations


def _build_evidence(
    key: str,
    scrape_data: Dict[str, Any],
    seo_data: Dict[str, Any],
    security_data: Dict[str, Any],
) -> str:
    """Build specific, factual evidence string for each pain point."""
    evidence_builders = {
        "no_website": lambda: "No public website URL found in Google Places listing.",
        "website_unreachable": lambda: f"HTTP request to website returned status {scrape_data.get('status_code', 'unknown')} or connection error.",
        "no_https": lambda: (
            f"SSL valid: {security_data.get('ssl', {}).get('ssl_valid', False)}. "
            f"HTTPS enforced: {security_data.get('https_enforced', False)}. "
            f"SSL error: {security_data.get('ssl', {}).get('ssl_error', 'none')}."
        ),
        "no_seo_basics": lambda: f"SEO score: {seo_data.get('score', 0)}/100. Missing: title={not bool(seo_data.get('data', {}).get('title'))}, H1={seo_data.get('data', {}).get('h1_count', 0)==0}, meta desc={not bool(seo_data.get('data', {}).get('meta_description'))}.",
        "no_schema": lambda: "No JSON-LD or Microdata schema.org markup detected on homepage.",
        "exposed_paths": lambda: f"Exposed paths found: {', '.join(p['label'] for p in security_data.get('exposed_paths', []))}.",
        "no_privacy_policy": lambda: "No privacy policy page detected when crawling the website.",
    }

    builder = evidence_builders.get(key)
    if builder:
        try:
            return builder()
        except Exception:
            pass

    return f"Detected during automated website analysis. Rule: {key}."
