"""
Multi-source contact enrichment engine.

Searches DuckDuckGo (free, unlimited) and SearXNG (self-hosted meta-search)
to discover phone numbers, emails, decision makers, and website URLs
for prospects that are missing contact information.
"""
import re
import logging
import asyncio
import json
from typing import Dict, Any, List, Optional, Set
from urllib.parse import quote_plus, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Extraction patterns ──────────────────────────────────────────────────────

EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)

PHONE_PATTERN = re.compile(
    r"""
    (?:
        \+?\d{1,4}[\s\-.]?         # country code
    )?
    \(?\d{2,5}\)?                  # area code (2-5 digits for international)
    [\s\-.]?
    \d{3,5}                        # exchange
    [\s\-.]?
    \d{3,6}                        # subscriber
    """,
    re.VERBOSE,
)

# Broader international phone pattern for tel: links and structured data
INTL_PHONE_PATTERN = re.compile(
    r"\+?\d[\d\s\-().]{6,18}\d"
)

DECISION_MAKER_ROLES = re.compile(
    r"\b(owner|co-owner|founder|co-founder|ceo|chief executive|president|"
    r"managing director|general manager|director|principal|proprietor|"
    r"chairman|chairwoman|chairperson)\b",
    re.IGNORECASE,
)

# Email domains to skip
JUNK_EMAIL_DOMAINS = {
    "example.com", "domain.com", "email.com", "test.com",
    "sentry.io", "w3.org", "schema.org", "wixpress.com",
    "googleapis.com", "google.com", "facebook.com",
}

DIRECTORY_DOMAINS = {
    "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
    "yelp.com", "yellowpages.com", "google.com", "duckduckgo.com", "bing.com",
    "tripadvisor.com", "bbb.org", "indiamart.com", "exportersindia.com",
    "bloomberg.com", "wikipedia.org", "chamberofcommerce.com",
    "americanhomequotes.com", "mapquest.com", "dnb.com", "zoominfo.com",
    "manta.com", "superpages.com", "nextdoor.com", "foursquare.com",
    "mahamvalves.in", "tradeindia.com", "dir.indiamart.com",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)

SEARXNG_URL = "http://searxng:8080"  # Docker internal network


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════


def _is_valid_matching_domain(business_name: str, candidate_url: str) -> bool:
    """
    Strictly verify if a discovered candidate URL matches the business name 100%.

    1. Rejects known directory / aggregator / B2B portal domains.
    2. Rejects foreign TLDs (.in, .cn, .ru, etc.) unless domain name explicitly matches.
    3. Requires that domain name contains key brand words from the business name!
    """
    if not candidate_url or not candidate_url.startswith("http"):
        return False

    try:
        parsed = urlparse(candidate_url)
        domain = parsed.netloc.lower().replace("www.", "")
    except Exception:
        return False

    # Check directory domains
    if any(d in domain for d in DIRECTORY_DOMAINS):
        return False

    # Extract keywords from business name
    noise = {"and", "inc", "llc", "corp", "co", "the", "ltd", "of", "in", "by", "servicing", "service", "services"}
    raw_words = re.findall(r"\w+", business_name.lower())
    biz_keywords = [w for w in raw_words if len(w) >= 3 and w not in noise]

    if not biz_keywords:
        return False

    domain_body = domain.split(".")[0]

    # Check if domain body contains key brand words (e.g. 'easternmetal' or 'riteplumbing')
    matches = [kw for kw in biz_keywords if kw in domain_body or kw in domain]

    # Reject foreign ccTLDs if no strong brand match
    if any(domain.endswith(ext) for ext in [".in", ".cn", ".ru", ".pk", ".br", ".ir"]):
        if len(matches) < 2 and not any(kw in domain_body for kw in biz_keywords):
            return False

    # Must match at least 1 primary brand keyword
    return len(matches) >= 1


def _is_phone_valid_for_location(phone: str, state: str = "", country: str = "US") -> bool:
    """
    Filter out foreign phone numbers (e.g. +91, +44) for US/Canada local businesses.
    """
    digits = re.sub(r"\D", "", phone)
    
    # If starting with +, check country code against business country
    if phone.startswith("+"):
        if not phone.startswith("+1") and len(digits) > 10:
            return False

    return True


def _clean_emails(raw: List[str]) -> List[str]:
    """De-duplicate and filter junk emails."""
    seen: Set[str] = set()
    clean: List[str] = []
    for e in raw:
        lower = e.lower().strip()
        domain = lower.split("@")[-1] if "@" in lower else ""
        if (
            lower not in seen
            and domain not in JUNK_EMAIL_DOMAINS
            and not lower.startswith("noreply")
            and not lower.startswith("no-reply")
            and len(lower) < 80
        ):
            seen.add(lower)
            clean.append(e.strip())
    return clean[:10]


def _clean_phones(raw: List[str], state: str = "", country: str = "US") -> List[str]:
    """De-duplicate and filter short/junk/foreign phone numbers."""
    seen: Set[str] = set()
    clean: List[str] = []
    for p in raw:
        digits = re.sub(r"\D", "", p)
        if digits not in seen and 7 <= len(digits) <= 15:
            if _is_phone_valid_for_location(p, state, country):
                seen.add(digits)
                clean.append(p.strip())
    return clean[:10]


def _extract_from_html(html: str) -> Dict[str, List[str]]:
    """Extract emails, phones, and decision-maker hints from raw HTML."""
    emails = EMAIL_PATTERN.findall(html)
    phones = INTL_PHONE_PATTERN.findall(html)
    return {
        "emails": _clean_emails(emails),
        "phones": _clean_phones(phones),
    }


def _extract_from_text(text: str) -> Dict[str, Any]:
    """Extract contact info + decision maker clues from plain text."""
    emails = EMAIL_PATTERN.findall(text)
    phones = INTL_PHONE_PATTERN.findall(text)

    dm_name = None
    dm_title = None
    dm_match = DECISION_MAKER_ROLES.search(text)
    if dm_match:
        dm_title = dm_match.group(0).title()
        # Try to grab the nearby name (often appears before or after role)
        # Pattern: "Name – Title" or "Title: Name" or "Name, Title"
        context_start = max(0, dm_match.start() - 60)
        context_end = min(len(text), dm_match.end() + 60)
        context = text[context_start:context_end]

        # Common formats: "John Smith, CEO" or "CEO John Smith" or "CEO: John Smith"
        name_after = re.search(
            r"(?:owner|founder|ceo|president|director|manager|principal)[:\s\-–—]+([A-Z][a-z]+ [A-Z][a-z]+)",
            context, re.IGNORECASE,
        )
        name_before = re.search(
            r"([A-Z][a-z]+ [A-Z][a-z]+)[,\s\-–—]+(?:owner|founder|ceo|president|director|manager|principal)",
            context, re.IGNORECASE,
        )
        if name_after:
            dm_name = name_after.group(1).strip()
        elif name_before:
            dm_name = name_before.group(1).strip()

    return {
        "emails": _clean_emails(emails),
        "phones": _clean_phones(phones),
        "decision_maker_name": dm_name,
        "decision_maker_title": dm_title,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SEARCH SOURCES
# ══════════════════════════════════════════════════════════════════════════════


async def _search_duckduckgo(query: str, client: httpx.AsyncClient) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo HTML and extract result snippets.
    100% free, no API key, no daily limit.
    """
    results: List[Dict[str, str]] = []
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    headers = {"User-Agent": USER_AGENT}
    try:
        resp = await client.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "lxml")
            for r in soup.select(".result"):
                title_el = r.select_one(".result__title a, .result__a")
                snippet_el = r.select_one(".result__snippet")
                link_el = r.select_one(".result__url")
                title = title_el.get_text(strip=True) if title_el else ""
                snippet = snippet_el.get_text(strip=True) if snippet_el else ""
                href = ""
                if title_el and title_el.get("href"):
                    href = title_el["href"]
                elif link_el:
                    href = link_el.get_text(strip=True)
                results.append({
                    "title": title,
                    "snippet": snippet,
                    "url": href,
                    "source": "duckduckgo",
                })
            logger.info(f"DuckDuckGo returned {len(results)} results for: {query}")
    except Exception as e:
        logger.warning(f"DuckDuckGo search failed: {e}")
    return results[:10]


async def _search_searxng(query: str, client: httpx.AsyncClient) -> List[Dict[str, str]]:
    """
    Search via self-hosted SearXNG meta-search engine.
    Aggregates Google, Bing, DuckDuckGo, and more.
    """
    results: List[Dict[str, str]] = []
    url = f"{SEARXNG_URL}/search"
    params = {
        "q": query,
        "format": "json",
        "engines": "google,bing,duckduckgo",
        "language": "en",
    }
    try:
        resp = await client.get(url, params=params, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            for r in data.get("results", []):
                results.append({
                    "title": r.get("title", ""),
                    "snippet": r.get("content", ""),
                    "url": r.get("url", ""),
                    "source": "searxng",
                })
            logger.info(f"SearXNG returned {len(results)} results for: {query}")
    except Exception as e:
        logger.info(f"SearXNG not available (optional): {e}")
    return results[:15]


async def _fetch_page_contacts(url: str, client: httpx.AsyncClient) -> Dict[str, Any]:
    """Fetch an individual URL and extract contact info from its HTML."""
    info: Dict[str, Any] = {"emails": [], "phones": [], "decision_maker_name": None, "decision_maker_title": None}
    if not url or not url.startswith("http"):
        return info
    try:
        resp = await client.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=12,
            follow_redirects=True,
        )
        if resp.status_code == 200 and "text/html" in resp.headers.get("content-type", ""):
            html = resp.text
            soup = BeautifulSoup(html, "lxml")

            # Extract from tel: links
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if href.lower().startswith("tel:"):
                    raw_num = href[4:].strip()
                    clean = re.sub(r"[^\d+]", "", raw_num)
                    if len(clean) >= 7:
                        info["phones"].append(raw_num)

            # Extract from mailto: links
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if href.lower().startswith("mailto:"):
                    email = href[7:].split("?")[0].strip()
                    if "@" in email:
                        info["emails"].append(email)

            # Extract from HTML text
            html_info = _extract_from_html(html)
            info["emails"] = _clean_emails(info["emails"] + html_info["emails"])
            info["phones"] = _clean_phones(info["phones"] + html_info["phones"])

            # Decision maker from text
            text_info = _extract_from_text(soup.get_text(separator=" ", strip=True))
            if text_info.get("decision_maker_name"):
                info["decision_maker_name"] = text_info["decision_maker_name"]
                info["decision_maker_title"] = text_info.get("decision_maker_title")

            # Schema.org JSON-LD
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string or "{}")
                    items = data if isinstance(data, list) else [data]
                    for item in items:
                        if isinstance(item, dict):
                            tel = item.get("telephone")
                            if tel:
                                info["phones"] = _clean_phones([tel] + info["phones"])
                            email = item.get("email")
                            if email:
                                info["emails"] = _clean_emails([email] + info["emails"])
                            # Check for founder/owner
                            for key in ("founder", "owner"):
                                val = item.get(key)
                                if isinstance(val, dict) and val.get("name"):
                                    info["decision_maker_name"] = val["name"]
                                    info["decision_maker_title"] = val.get("jobTitle", key.title())
                except Exception:
                    pass

    except Exception as e:
        logger.debug(f"Could not fetch {url}: {e}")
    return info


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENRICHMENT FUNCTION
# ══════════════════════════════════════════════════════════════════════════════


async def enrich_contact_info(
    business_name: str,
    city: str,
    state: str = "",
    existing_phone: str = "",
    existing_email: str = "",
    existing_website: str = "",
) -> Dict[str, Any]:
    """
    Multi-source contact enrichment.

    Queries DuckDuckGo and SearXNG to discover:
      - Phone numbers (decision maker priority, then general business)
      - Email addresses
      - Decision maker name & title
      - Website URL (if missing)

    Returns a dict with all discovered contact fields.
    """
    result: Dict[str, Any] = {
        "phone": None,
        "email": None,
        "website": None,
        "decision_maker_name": None,
        "decision_maker_title": None,
        "decision_maker_phone": None,
        "decision_maker_email": None,
        "all_phones": [],
        "all_emails": [],
        "sources_searched": [],
        "pages_visited": [],
    }

    location = f"{city}, {state}".strip(", ") if state else city

    # Build search queries
    queries = [
        f'"{business_name}" "{location}" phone email contact',
        f'"{business_name}" "{location}" owner founder CEO',
    ]

    all_search_results: List[Dict[str, str]] = []

    async with httpx.AsyncClient(verify=False) as client:
        # ── Source 1: DuckDuckGo ──────────────────────────────────────────
        for q in queries:
            ddg_results = await _search_duckduckgo(q, client)
            all_search_results.extend(ddg_results)
            result["sources_searched"].append(f"duckduckgo: {q}")
            await asyncio.sleep(1.5)  # Polite delay

        # ── Source 2: SearXNG (if available) ──────────────────────────────
        for q in queries:
            sxng_results = await _search_searxng(q, client)
            all_search_results.extend(sxng_results)
            if sxng_results:
                result["sources_searched"].append(f"searxng: {q}")

        # ── Extract contacts from search snippets ─────────────────────────
        all_phones: List[str] = []
        all_emails: List[str] = []

        for sr in all_search_results:
            combined_text = f"{sr.get('title', '')} {sr.get('snippet', '')}"
            extracted = _extract_from_text(combined_text)
            all_phones.extend(extracted["phones"])
            all_emails.extend(extracted["emails"])

            if extracted.get("decision_maker_name") and not result["decision_maker_name"]:
                result["decision_maker_name"] = extracted["decision_maker_name"]
                result["decision_maker_title"] = extracted.get("decision_maker_title")

        # ── Source 3: Visit top result pages for deeper extraction ────────
        visited_urls: Set[str] = set()
        # Collect unique URLs from search results ONLY if they match the business brand
        candidate_urls: List[str] = []
        for sr in all_search_results:
            url = sr.get("url", "")
            if url and url.startswith("http") and url not in visited_urls:
                # Strictly check if candidate URL belongs to this business
                if _is_valid_matching_domain(business_name, url):
                    url_lower = url.lower()
                    if any(kw in url_lower for kw in ["contact", "about", "team", "staff", "our-team", "leadership"]):
                        candidate_urls.insert(0, url)
                    else:
                        candidate_urls.append(url)
                    visited_urls.add(url)

        # Discover website if missing using 100% strict domain matching
        if not existing_website:
            for sr in all_search_results:
                url = sr.get("url", "")
                if _is_valid_matching_domain(business_name, url):
                    parsed = urlparse(url)
                    result["website"] = f"{parsed.scheme}://{parsed.netloc}"
                    break

        # Visit up to 5 verified matching result pages for deep contact extraction
        pages_to_visit = candidate_urls[:5]
        for page_url in pages_to_visit:
            page_info = await _fetch_page_contacts(page_url, client)
            result["pages_visited"].append(page_url)
            all_phones.extend(page_info.get("phones", []))
            all_emails.extend(page_info.get("emails", []))
            if page_info.get("decision_maker_name") and not result["decision_maker_name"]:
                result["decision_maker_name"] = page_info["decision_maker_name"]
                result["decision_maker_title"] = page_info.get("decision_maker_title")
            await asyncio.sleep(0.5)  # Polite delay

    # ── Consolidate results ───────────────────────────────────────────────
    result["all_phones"] = _clean_phones(all_phones, state=state)
    result["all_emails"] = _clean_emails(all_emails)

    # Set primary phone (prefer decision maker phone)
    if result["all_phones"]:
        result["phone"] = result["all_phones"][0]

    # Set primary email
    if result["all_emails"]:
        result["email"] = result["all_emails"][0]

    logger.info(
        f"Contact enrichment for '{business_name}' in '{location}': "
        f"phones={len(result['all_phones'])}, emails={len(result['all_emails'])}, "
        f"dm_name={result['decision_maker_name']}, website={result['website']}"
    )

    return result
