"""
Marketing Analyzer – detects pixels, analytics, tracking, email capture, CTA quality.
Input: website scrape data (pixels dict).
"""
from typing import Dict, Any, List


MARKETING_TOOLS = {
    "google_analytics_ga4": "Google Analytics 4",
    "google_analytics_ua": "Google Analytics (UA)",
    "google_tag_manager": "Google Tag Manager",
    "facebook_pixel": "Facebook/Meta Pixel",
    "meta_pixel": "Meta Pixel",
    "linkedin_insight": "LinkedIn Insight Tag",
    "tiktok_pixel": "TikTok Pixel",
    "pinterest_tag": "Pinterest Tag",
    "microsoft_clarity": "Microsoft Clarity",
    "hotjar": "Hotjar",
    "google_ads_conversion": "Google Ads Conversion Tracking",
    "hubspot": "HubSpot",
    "intercom": "Intercom",
    "drift": "Drift Chat",
    "zendesk": "Zendesk",
    "freshchat": "Freshchat",
    "crisp": "Crisp Chat",
    "tawk": "Tawk.to Chat",
}

RETARGETING_PIXELS = [
    "facebook_pixel", "meta_pixel", "linkedin_insight",
    "tiktok_pixel", "pinterest_tag", "google_ads_conversion"
]

ANALYTICS_TOOLS = [
    "google_analytics_ga4", "google_analytics_ua",
    "microsoft_clarity", "hotjar"
]

CHAT_TOOLS = ["intercom", "drift", "zendesk", "freshchat", "crisp", "tawk"]


def analyze_marketing(scrape_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze marketing setup from scrape data."""
    pixels = scrape_data.get("pixels", {})
    findings: List[Dict[str, str]] = []

    # Detected tools
    detected_tools = [
        {"key": k, "name": MARKETING_TOOLS[k]}
        for k in MARKETING_TOOLS
        if pixels.get(k, False)
    ]

    # Analytics
    has_analytics = any(pixels.get(k, False) for k in ANALYTICS_TOOLS)
    has_ga4 = pixels.get("google_analytics_ga4", False)
    has_gtm = pixels.get("google_tag_manager", False)
    has_retargeting = any(pixels.get(k, False) for k in RETARGETING_PIXELS)
    has_facebook_pixel = pixels.get("facebook_pixel", False) or pixels.get("meta_pixel", False)
    has_chat = any(pixels.get(k, False) for k in CHAT_TOOLS) or scrape_data.get("has_live_chat", False)
    has_email_capture = scrape_data.get("has_newsletter_form", False)

    # Findings
    score = 100

    if not has_analytics:
        score -= 20
        findings.append({
            "finding": "No Web Analytics Detected",
            "evidence": "No Google Analytics, GA4, Clarity, or Hotjar found.",
            "priority": "HIGH",
            "category": "analytics",
        })

    if not has_ga4 and has_analytics:
        score -= 5
        findings.append({
            "finding": "Using Legacy Analytics (Not GA4)",
            "evidence": "Universal Analytics (UA) is detected but GA4 is not. UA is deprecated.",
            "priority": "MEDIUM",
            "category": "analytics",
        })

    if not has_gtm:
        score -= 8
        findings.append({
            "finding": "No Tag Manager Detected",
            "evidence": "Google Tag Manager not found. Managing tracking without GTM is inefficient.",
            "priority": "MEDIUM",
            "category": "analytics",
        })

    if not has_retargeting:
        score -= 15
        findings.append({
            "finding": "No Retargeting Pixels Detected",
            "evidence": "No Facebook Pixel, LinkedIn Insight, TikTok Pixel, or Google Ads conversion tracking found.",
            "priority": "HIGH",
            "category": "retargeting",
        })

    if not has_facebook_pixel:
        score -= 5
        findings.append({
            "finding": "No Facebook/Meta Pixel",
            "evidence": "Meta Pixel not found. Cannot run Facebook/Instagram retargeting ads.",
            "priority": "MEDIUM",
            "category": "retargeting",
        })

    if not has_chat:
        score -= 5
        findings.append({
            "finding": "No Live Chat or Chat Widget",
            "evidence": "No chat platform detected (Intercom, Drift, Zendesk, Tawk, Crisp).",
            "priority": "LOW",
            "category": "engagement",
        })

    if not has_email_capture:
        score -= 8
        findings.append({
            "finding": "No Email Capture / Newsletter Form",
            "evidence": "No newsletter signup or email capture form detected.",
            "priority": "MEDIUM",
            "category": "email_marketing",
        })

    score = max(0, score)

    return {
        "score": score,
        "findings": findings,
        "data": {
            "detected_tools": detected_tools,
            "has_analytics": has_analytics,
            "has_ga4": has_ga4,
            "has_gtm": has_gtm,
            "has_retargeting": has_retargeting,
            "has_facebook_pixel": has_facebook_pixel,
            "has_linkedin_pixel": pixels.get("linkedin_insight", False),
            "has_tiktok_pixel": pixels.get("tiktok_pixel", False),
            "has_chat": has_chat,
            "has_email_capture": has_email_capture,
            "has_cookie_consent": scrape_data.get("has_cookie_consent", False),
            "total_pixels": sum(1 for v in pixels.values() if v),
        },
    }
