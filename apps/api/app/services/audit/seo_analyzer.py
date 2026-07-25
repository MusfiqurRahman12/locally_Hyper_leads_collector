"""
SEO Analyzer – produces a structured SEO audit with score and findings.
Input: scraped data from WebsiteScraper.
"""
from typing import Dict, Any, List, Optional


def analyze_seo(scrape_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Takes website scrape data and produces an SEO audit.
    Returns: { score, findings, data }
    """
    findings: List[Dict[str, Any]] = []
    score = 100  # start from perfect, deduct

    if not scrape_data.get("reachable"):
        return {
            "score": 0,
            "findings": [_finding("No Website Reachable", "Website returned no response or an error.", "HIGH", "website")],
            "data": {},
        }

    seo = scrape_data.get("seo_meta", {})
    pages = scrape_data.get("pages_found", {})

    # ── Title ────────────────────────────────────────────────────────────────
    title = seo.get("title")
    title_len = seo.get("title_length", 0)
    if not title:
        score -= 15
        findings.append(_finding("Missing Page Title", "The homepage has no <title> tag.", "HIGH", "title"))
    elif title_len < 30:
        score -= 8
        findings.append(_finding(
            "Page Title Too Short",
            f"Title is {title_len} chars (ideal: 50–60). Title: \"{title}\"", "MEDIUM", "title"
        ))
    elif title_len > 65:
        score -= 5
        findings.append(_finding(
            "Page Title Too Long",
            f"Title is {title_len} chars (ideal: 50–60). May be truncated in SERPs.", "LOW", "title"
        ))

    # ── Meta Description ─────────────────────────────────────────────────────
    desc = seo.get("meta_description")
    desc_len = seo.get("meta_description_length", 0)
    if not desc:
        score -= 10
        findings.append(_finding("Missing Meta Description", "No meta description found. Missed opportunity for SERP click-through.", "HIGH", "meta"))
    elif desc_len < 100:
        score -= 5
        findings.append(_finding("Meta Description Too Short", f"Only {desc_len} chars (ideal: 150–160).", "MEDIUM", "meta"))
    elif desc_len > 165:
        score -= 3
        findings.append(_finding("Meta Description Too Long", f"{desc_len} chars (may be truncated in SERPs).", "LOW", "meta"))

    # ── H1 ───────────────────────────────────────────────────────────────────
    h1_count = seo.get("h1_count", 0)
    if h1_count == 0:
        score -= 12
        findings.append(_finding("Missing H1 Tag", "No H1 heading found on homepage.", "HIGH", "headings"))
    elif h1_count > 1:
        score -= 6
        findings.append(_finding(
            "Multiple H1 Tags",
            f"{h1_count} H1 tags found. Only one H1 per page is recommended.",
            "MEDIUM", "headings"
        ))

    # ── Canonical ────────────────────────────────────────────────────────────
    if not seo.get("canonical"):
        score -= 5
        findings.append(_finding("Missing Canonical Tag", "No canonical URL defined. Risk of duplicate content issues.", "MEDIUM", "canonical"))

    # ── Open Graph ───────────────────────────────────────────────────────────
    if not seo.get("has_open_graph"):
        score -= 5
        findings.append(_finding("Missing Open Graph Tags", "No OG tags found. Social media sharing will use uncontrolled previews.", "MEDIUM", "social_seo"))

    # ── Twitter Cards ────────────────────────────────────────────────────────
    if not seo.get("has_twitter_cards"):
        score -= 3
        findings.append(_finding("Missing Twitter Card Tags", "No Twitter/X card meta tags.", "LOW", "social_seo"))

    # ── Schema Markup ─────────────────────────────────────────────────────────
    if not seo.get("has_schema_markup"):
        score -= 8
        findings.append(_finding(
            "No Structured Data / Schema Markup",
            "No JSON-LD schema found. Missing out on rich snippets in search results.",
            "HIGH", "schema"
        ))

    # ── Images ───────────────────────────────────────────────────────────────
    missing_alt = seo.get("images_missing_alt", 0)
    total_images = seo.get("images_total", 0)
    if missing_alt > 0 and total_images > 0:
        pct = round(missing_alt / total_images * 100)
        severity = "HIGH" if pct > 50 else "MEDIUM" if pct > 20 else "LOW"
        score -= min(10, pct // 10)
        findings.append(_finding(
            "Images Missing Alt Text",
            f"{missing_alt} of {total_images} images ({pct}%) are missing alt attributes. Hurts accessibility and SEO.",
            severity, "images"
        ))

    # ── Sitemap ──────────────────────────────────────────────────────────────
    if not scrape_data.get("has_sitemap"):
        score -= 5
        findings.append(_finding("No XML Sitemap Found", "Sitemap helps search engines discover and index pages.", "MEDIUM", "sitemap"))

    # ── Robots.txt ──────────────────────────────────────────────────────────
    if not scrape_data.get("has_robots"):
        score -= 3
        findings.append(_finding("No robots.txt Found", "Missing robots.txt file.", "LOW", "robots"))

    # ── Contact Page ─────────────────────────────────────────────────────────
    if not pages.get("contact"):
        score -= 3
        findings.append(_finding("No Contact Page Detected", "No dedicated contact page found. Impacts local SEO and user trust.", "MEDIUM", "local_seo"))

    # ── About Page ───────────────────────────────────────────────────────────
    if not pages.get("about"):
        score -= 2
        findings.append(_finding("No About Page Detected", "Missing About page reduces E-E-A-T signals.", "LOW", "local_seo"))

    # ── Privacy Policy ────────────────────────────────────────────────────────
    if not pages.get("privacy_policy"):
        score -= 3
        findings.append(_finding(
            "No Privacy Policy Page",
            "Missing privacy policy is a legal requirement in many jurisdictions (GDPR, CCPA).",
            "HIGH", "legal"
        ))

    score = max(0, score)

    return {
        "score": score,
        "findings": findings,
        "data": {
            "title": seo.get("title"),
            "title_length": seo.get("title_length"),
            "meta_description": seo.get("meta_description"),
            "meta_description_length": seo.get("meta_description_length"),
            "canonical": seo.get("canonical"),
            "h1_count": h1_count,
            "h1s": seo.get("h1s", []),
            "h2s": seo.get("h2s", []),
            "has_open_graph": seo.get("has_open_graph"),
            "has_twitter_cards": seo.get("has_twitter_cards"),
            "has_schema_markup": seo.get("has_schema_markup"),
            "schema_count": seo.get("schema_count", 0),
            "images_total": total_images,
            "images_missing_alt": missing_alt,
            "has_sitemap": scrape_data.get("has_sitemap"),
            "sitemap_url": scrape_data.get("sitemap_url"),
            "has_robots": scrape_data.get("has_robots"),
            "internal_links_count": seo.get("internal_links_count", 0),
            "external_links_count": seo.get("external_links_count", 0),
            "pages_found": scrape_data.get("pages_found", {}),
        },
    }


def _finding(finding: str, evidence: str, priority: str, category: str) -> Dict[str, str]:
    return {
        "finding": finding,
        "evidence": evidence,
        "priority": priority,
        "category": category,
    }
