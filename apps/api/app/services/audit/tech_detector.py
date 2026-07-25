"""
Technology Detector – uses Wappalyzer API v2 (primary) with HTML pattern matching fallback.
"""
import httpx
import re
import logging
from typing import Dict, Any, Optional, List
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

WAPPALYZER_URL = "https://api.wappalyzer.com/v2/lookup/"

# ── HTML pattern matching signatures ──────────────────────────────────────

HTML_SIGNATURES: Dict[str, Dict[str, Any]] = {
    # CMS
    "WordPress": {"patterns": [r"/wp-content/", r"/wp-includes/", r"wp-json"], "category": "CMS"},
    "Shopify": {"patterns": [r"cdn\.shopify\.com", r"Shopify\.theme"], "category": "Ecommerce"},
    "Wix": {"patterns": [r"wixstatic\.com", r"wix\.com/.*2\.0"], "category": "Website Builder"},
    "Squarespace": {"patterns": [r"squarespace\.com", r"static1\.squarespace"], "category": "Website Builder"},
    "Webflow": {"patterns": [r"webflow\.com", r"webflow\.io"], "category": "Website Builder"},
    "Joomla": {"patterns": [r"/components/com_", r"Joomla\!"], "category": "CMS"},
    "Drupal": {"patterns": [r"sites/default/files", r"drupal\.js", r"Drupal\.settings"], "category": "CMS"},
    "Ghost": {"patterns": [r"ghost\.io", r"/ghost/api/"], "category": "CMS"},
    "Framer": {"patterns": [r"framerusercontent\.com"], "category": "Website Builder"},
    # Page builders
    "Elementor": {"patterns": [r"elementor-"], "category": "WordPress Plugin"},
    "Divi": {"patterns": [r"divi/", r"et_pb_"], "category": "WordPress Plugin"},
    "Beaver Builder": {"patterns": [r"fl-builder"], "category": "WordPress Plugin"},
    # Ecommerce
    "WooCommerce": {"patterns": [r"woocommerce", r"wc-cart"], "category": "Ecommerce"},
    "Magento": {"patterns": [r"magento", r"Mage\.Cookies"], "category": "Ecommerce"},
    "BigCommerce": {"patterns": [r"bigcommerce\.com", r"cdn\.bigcommerce"], "category": "Ecommerce"},
    "OpenCart": {"patterns": [r"opencart"], "category": "Ecommerce"},
    "PrestaShop": {"patterns": [r"prestashop", r"/modules/"], "category": "Ecommerce"},
    # JS Frameworks
    "React": {"patterns": [r"react\.development\.js", r"react\.min\.js", r"__reactFiber", r"data-reactroot"], "category": "JavaScript Framework"},
    "Vue.js": {"patterns": [r"vue\.js", r"vue\.min\.js", r"__vue__"], "category": "JavaScript Framework"},
    "Angular": {"patterns": [r"angular\.js", r"ng-version"], "category": "JavaScript Framework"},
    "Next.js": {"patterns": [r"_next/static", r"next/dist"], "category": "JavaScript Framework"},
    "Nuxt.js": {"patterns": [r"__nuxt", r"_nuxt/"], "category": "JavaScript Framework"},
    "jQuery": {"patterns": [r"jquery\.min\.js", r"jquery-\d"], "category": "JavaScript Library"},
    # Analytics
    "Google Analytics (UA)": {"patterns": [r"UA-\d{4,}-\d", r"google-analytics\.com/analytics\.js"], "category": "Analytics"},
    "Google Analytics 4": {"patterns": [r"G-[A-Z0-9]{8,12}", r"gtag/js\?id=G-"], "category": "Analytics"},
    "Google Tag Manager": {"patterns": [r"GTM-[A-Z0-9]+", r"googletagmanager\.com/gtm\.js"], "category": "Tag Manager"},
    "Facebook Pixel": {"patterns": [r"fbq\s*\(", r"connect\.facebook\.net/.*fbevents"], "category": "Marketing"},
    "Hotjar": {"patterns": [r"hotjar\.com", r"hj\s*\(.*hjid"], "category": "Analytics"},
    "Microsoft Clarity": {"patterns": [r"clarity\.ms", r"clarity\s*\("], "category": "Analytics"},
    # CDN
    "Cloudflare": {"patterns": [r"cloudflare\.com", r"cf-ray", r"__cf_bm"], "category": "CDN"},
    "AWS CloudFront": {"patterns": [r"cloudfront\.net"], "category": "CDN"},
    "Fastly": {"patterns": [r"fastly\.net"], "category": "CDN"},
    "BunnyCDN": {"patterns": [r"b-cdn\.net"], "category": "CDN"},
    # Chat / CRM
    "Intercom": {"patterns": [r"intercom\.io", r"widget\.intercom\.io"], "category": "Customer Support"},
    "Zendesk": {"patterns": [r"zendesk\.com", r"zopim\.com"], "category": "Customer Support"},
    "Drift": {"patterns": [r"drift\.com", r"js\.driftt\.com"], "category": "Customer Support"},
    "HubSpot": {"patterns": [r"js\.hs-scripts\.com", r"hubspot\.com"], "category": "CRM"},
    "Salesforce": {"patterns": [r"salesforce\.com", r"force\.com"], "category": "CRM"},
    "Mailchimp": {"patterns": [r"mailchimp\.com", r"list-manage\.com"], "category": "Email Marketing"},
    "Klaviyo": {"patterns": [r"klaviyo\.com"], "category": "Email Marketing"},
    # Other
    "Bootstrap": {"patterns": [r"bootstrap\.min\.css", r"bootstrap\.min\.js"], "category": "CSS Framework"},
    "Tailwind CSS": {"patterns": [r"tailwind"], "category": "CSS Framework"},
    "Font Awesome": {"patterns": [r"fontawesome", r"font-awesome"], "category": "Font"},
    "Google Fonts": {"patterns": [r"fonts\.googleapis\.com"], "category": "Font"},
}


async def detect_via_wappalyzer(url: str) -> Optional[Dict[str, Any]]:
    """Call Wappalyzer API v2."""
    if not settings.wappalyzer_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                WAPPALYZER_URL,
                params={"urls": url, "sets": "all"},
                headers={"x-api-key": settings.wappalyzer_api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data:
                entry = data[0]
                technologies = entry.get("technologies", [])
                return {
                    "source": "wappalyzer",
                    "technologies": [
                        {
                            "name": t.get("name"),
                            "category": t.get("categories", [{}])[0].get("name") if t.get("categories") else "Unknown",
                            "version": t.get("versions", [None])[0] if t.get("versions") else None,
                        }
                        for t in technologies
                    ],
                }
    except Exception as e:
        logger.warning(f"Wappalyzer API failed for {url}: {e}")
    return None


def detect_via_html(html_content: str) -> Dict[str, Any]:
    """Pattern-match HTML/JS content against known technology signatures."""
    detected = []
    for tech_name, config in HTML_SIGNATURES.items():
        for pattern in config["patterns"]:
            if re.search(pattern, html_content, re.IGNORECASE):
                detected.append({
                    "name": tech_name,
                    "category": config["category"],
                    "version": None,
                })
                break  # Only add once per technology

    return {
        "source": "html_pattern_matching",
        "technologies": detected,
    }


async def detect_technologies(url: str, html_content: Optional[str] = None) -> Dict[str, Any]:
    """Main entry point – tries Wappalyzer first, falls back to HTML patterns."""
    wappalyzer_result = await detect_via_wappalyzer(url)

    if wappalyzer_result:
        techs = wappalyzer_result["technologies"]
        # Optionally supplement with HTML patterns for anything missed
        if html_content:
            html_result = detect_via_html(html_content)
            existing_names = {t["name"] for t in techs}
            for t in html_result["technologies"]:
                if t["name"] not in existing_names:
                    techs.append(t)
        result = {
            "source": "wappalyzer+html",
            "technologies": techs,
        }
    elif html_content:
        result = detect_via_html(html_content)
    else:
        result = {"source": "none", "technologies": []}

    # Organize by category
    by_category: Dict[str, List[str]] = {}
    for tech in result["technologies"]:
        cat = tech.get("category", "Other")
        by_category.setdefault(cat, []).append(tech["name"])

    result["by_category"] = by_category

    # Convenience flags
    cms_list = by_category.get("CMS", []) + by_category.get("Website Builder", []) + by_category.get("Ecommerce", [])
    result["cms"] = cms_list[0] if cms_list else None
    result["has_analytics"] = bool(by_category.get("Analytics") or by_category.get("Tag Manager"))
    result["has_ecommerce"] = bool(by_category.get("Ecommerce"))
    result["has_crm"] = bool(by_category.get("CRM"))
    result["has_chat"] = bool(by_category.get("Customer Support"))
    result["has_cdn"] = bool(by_category.get("CDN"))

    return result


def get_tech_findings(tech_data: Dict[str, Any]) -> List[Dict[str, str]]:
    findings = []
    if not tech_data.get("has_analytics"):
        findings.append({
            "finding": "No Analytics Platform Detected",
            "evidence": "No Google Analytics, GA4, GTM, or similar analytics found.",
            "priority": "HIGH",
            "category": "marketing",
        })
    if not tech_data.get("has_cdn"):
        findings.append({
            "finding": "No CDN Detected",
            "evidence": "No content delivery network identified. May result in slower load times for distant visitors.",
            "priority": "LOW",
            "category": "performance",
        })
    return findings
