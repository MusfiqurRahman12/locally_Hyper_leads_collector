"""
Website scraper – fetches HTML, extracts meta, contact info, pages, pixels.
Respects robots.txt. Identifies itself with a known user agent.
"""
import httpx
import ssl
import re
import logging
from bs4 import BeautifulSoup
from typing import Dict, Any, List, Optional, Set
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

USER_AGENT = "LocalProspectFinderBot/1.0 (+https://localprospectfinder.com/bot)"

# ── Tracking pixel / analytics signatures ──────────────────────────────────

PIXEL_PATTERNS = {
    "google_analytics_ua": r"UA-\d{4,10}-\d{1,4}",
    "google_analytics_ga4": r"G-[A-Z0-9]{8,12}",
    "google_tag_manager": r"GTM-[A-Z0-9]{4,8}",
    "facebook_pixel": r"fbq\s*\(|connect\.facebook\.net|fb\.com/tr",
    "meta_pixel": r"meta\.com/tr",
    "linkedin_insight": r"linkedin\.com/insight|_linkedin_partner_id",
    "tiktok_pixel": r"tiktok\.com/i18n/pixel|ttq\.load",
    "pinterest_tag": r"pintrk\(|ct\.pinterest\.com",
    "microsoft_clarity": r"clarity\.ms|clarity\s*\(",
    "hotjar": r"hotjar\.com|hj\s*\(",
    "google_ads_conversion": r"googleadservices\.com|gtag\s*\(\s*['\"]event['\"]",
    "hubspot": r"js\.hs-scripts\.com|hubspot\.com",
    "intercom": r"intercom\.io|widget\.intercom",
    "drift": r"drift\.com|driftt\.com",
    "zendesk": r"zendesk\.com|zopim",
    "freshchat": r"freshchat\.com|freshworks",
    "crisp": r"crisp\.chat",
    "tawk": r"tawk\.to",
}

CMS_PATTERNS = {
    "wordpress": [r"/wp-content/", r"/wp-includes/", r"wp-json"],
    "shopify": [r"cdn\.shopify\.com", r"shopify\.com/s/files"],
    "wix": [r"wixstatic\.com", r"wix\.com"],
    "squarespace": [r"squarespace\.com", r"static\.squarespace\.com"],
    "joomla": [r"/components/com_", r"joomla"],
    "drupal": [r"/sites/default/files", r"drupal\.js"],
    "webflow": [r"webflow\.com", r"webflow\.io"],
    "framer": [r"framer\.com", r"framerusercontent\.com"],
    "ghost": [r"ghost\.io", r"/ghost/api/"],
    "duda": [r"dudaone\.com", r"multiscreensite\.com"],
    "elementor": [r"elementor"],
    "woocommerce": [r"woocommerce"],
    "magento": [r"magento", r"/mage/"],
    "bigcommerce": [r"bigcommerce\.com", r"cdn\.bigcommerce"],
    "prestashop": [r"prestashop"],
    "opencart": [r"opencart"],
}

BOOKING_PATTERNS = {
    "calendly": r"calendly\.com",
    "acuity": r"acuityscheduling\.com",
    "mindbody": r"mindbodyonline\.com",
    "booksy": r"booksy\.com",
    "zocdoc": r"zocdoc\.com",
    "opentable": r"opentable\.com",
    "rezku": r"rezku\.com",
    "square_appointments": r"squareup\.com/appointments",
    "setmore": r"setmore\.com",
    "simplybook": r"simplybook\.me",
    "vcita": r"vcita\.com",
}

EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)

PHONE_PATTERN = re.compile(
    r"(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})",
)


class WebsiteScraper:
    def __init__(self, url: str):
        self.url = url.rstrip("/")
        self.base_domain = urlparse(url).netloc
        self.visited: Set[str] = set()
        self.pages_found: Dict[str, bool] = {
            "home": False,
            "about": False,
            "services": False,
            "contact": False,
            "blog": False,
            "products": False,
            "faq": False,
            "privacy_policy": False,
            "terms": False,
            "booking": False,
            "portfolio": False,
            "testimonials": False,
            "team": False,
            "careers": False,
            "shop": False,
        }
        self._robots: Optional[RobotFileParser] = None

    def _get_robots(self) -> RobotFileParser:
        if self._robots is None:
            rp = RobotFileParser()
            try:
                rp.set_url(urljoin(self.url, "/robots.txt"))
                rp.read()
            except Exception:
                pass
            self._robots = rp
        return self._robots

    def _can_fetch(self, url: str) -> bool:
        try:
            return self._get_robots().can_fetch(USER_AGENT, url)
        except Exception:
            return True

    def _is_same_domain(self, url: str) -> bool:
        try:
            return urlparse(url).netloc == self.base_domain
        except Exception:
            return False

    def _detect_page_type(self, url: str, soup: BeautifulSoup):
        url_lower = url.lower()
        text_lower = soup.get_text().lower()
        title = (soup.title.string or "").lower() if soup.title else ""

        checks = {
            "about": ["about", "our-story", "who-we-are"],
            "services": ["services", "what-we-do", "solutions"],
            "contact": ["contact", "get-in-touch", "reach-us"],
            "blog": ["blog", "news", "articles", "posts"],
            "products": ["products", "shop", "store", "catalogue"],
            "faq": ["faq", "frequently-asked"],
            "privacy_policy": ["privacy", "privacy-policy"],
            "terms": ["terms", "terms-of-service", "terms-and-conditions"],
            "booking": ["book", "appointment", "schedule", "reserve"],
            "portfolio": ["portfolio", "work", "case-studies", "projects"],
            "testimonials": ["testimonials", "reviews", "what-our-clients"],
            "team": ["team", "staff", "our-people", "meet-the"],
            "careers": ["careers", "jobs", "hiring", "join-us"],
            "shop": ["shop", "store", "woocommerce", "ecommerce"],
        }

        for page_type, keywords in checks.items():
            if any(kw in url_lower or kw in title for kw in keywords):
                self.pages_found[page_type] = True

    def _extract_emails(self, html: str) -> List[str]:
        emails = EMAIL_PATTERN.findall(html)
        filtered = [
            e for e in set(emails)
            if not any(bad in e.lower() for bad in ["example.com", "domain.com", "your@", "@sentry", "@w3.org"])
        ]
        return filtered[:10]

    def _extract_phones(self, html: str) -> List[str]:
        phones = PHONE_PATTERN.findall(html)
        return list(set(["".join(p) for p in phones]))[:5]

    def _detect_pixels(self, html: str) -> Dict[str, bool]:
        detected = {}
        for name, pattern in PIXEL_PATTERNS.items():
            detected[name] = bool(re.search(pattern, html, re.IGNORECASE))
        return detected

    def _detect_cms(self, html: str) -> Optional[str]:
        for cms, patterns in CMS_PATTERNS.items():
            if any(re.search(p, html, re.IGNORECASE) for p in patterns):
                return cms
        return None

    def _detect_booking(self, html: str) -> Dict[str, bool]:
        detected = {}
        for system, pattern in BOOKING_PATTERNS.items():
            detected[system] = bool(re.search(pattern, html, re.IGNORECASE))
        return detected

    def _extract_social_links(self, soup: BeautifulSoup) -> Dict[str, Optional[str]]:
        socials = {
            "facebook": None, "instagram": None, "linkedin": None,
            "youtube": None, "tiktok": None, "pinterest": None,
            "twitter_x": None, "whatsapp": None,
        }
        patterns = {
            "facebook": r"facebook\.com/(?!sharer|share|dialog)([^/?\"'\s]+)",
            "instagram": r"instagram\.com/([^/?\"'\s]+)",
            "linkedin": r"linkedin\.com/(company|in)/([^/?\"'\s]+)",
            "youtube": r"youtube\.com/(channel|c|@|user)/([^/?\"'\s]+)",
            "tiktok": r"tiktok\.com/@([^/?\"'\s]+)",
            "pinterest": r"pinterest\.com/([^/?\"'\s]+)",
            "twitter_x": r"(?:twitter|x)\.com/([^/?\"'\s]+)",
            "whatsapp": r"wa\.me/(\d+)|whatsapp\.com",
        }
        all_links = [a.get("href", "") for a in soup.find_all("a", href=True)]
        full_html = str(soup)

        for platform, pattern in patterns.items():
            for link in all_links:
                if re.search(pattern, link, re.IGNORECASE):
                    socials[platform] = link
                    break
            if not socials[platform]:
                match = re.search(pattern, full_html, re.IGNORECASE)
                if match:
                    socials[platform] = match.group(0)

        return socials

    def _extract_seo_meta(self, soup: BeautifulSoup, url: str) -> Dict[str, Any]:
        title_tag = soup.find("title")
        title = title_tag.string.strip() if title_tag else None

        desc_meta = soup.find("meta", attrs={"name": "description"})
        description = desc_meta.get("content", "").strip() if desc_meta else None

        canonical = None
        canonical_tag = soup.find("link", rel="canonical")
        if canonical_tag:
            canonical = canonical_tag.get("href")

        # H tags
        h1s = [h.get_text(strip=True) for h in soup.find_all("h1")]
        h2s = [h.get_text(strip=True) for h in soup.find_all("h2")][:5]

        # Images without alt
        images = soup.find_all("img")
        images_missing_alt = [
            img.get("src", "") for img in images
            if not img.get("alt") and img.get("src")
        ]

        # Open Graph
        og_title = soup.find("meta", property="og:title")
        og_desc = soup.find("meta", property="og:description")
        og_image = soup.find("meta", property="og:image")

        # Twitter Cards
        tw_card = soup.find("meta", attrs={"name": "twitter:card"})
        tw_title = soup.find("meta", attrs={"name": "twitter:title"})

        # Schema
        schema_tags = soup.find_all("script", type="application/ld+json")
        has_schema = len(schema_tags) > 0

        # Internal links
        all_links = [a.get("href", "") for a in soup.find_all("a", href=True)]
        internal_links = [l for l in all_links if self._is_same_domain(urljoin(url, l)) or l.startswith("/")]
        external_links = [l for l in all_links if l.startswith("http") and not self._is_same_domain(l)]

        return {
            "title": title,
            "title_length": len(title) if title else 0,
            "meta_description": description,
            "meta_description_length": len(description) if description else 0,
            "canonical": canonical,
            "h1s": h1s,
            "h1_count": len(h1s),
            "h2s": h2s,
            "images_total": len(images),
            "images_missing_alt": len(images_missing_alt),
            "has_open_graph": bool(og_title),
            "og_title": og_title.get("content") if og_title else None,
            "og_description": og_desc.get("content") if og_desc else None,
            "og_image": og_image.get("content") if og_image else None,
            "has_twitter_cards": bool(tw_card),
            "has_schema_markup": has_schema,
            "schema_count": len(schema_tags),
            "internal_links_count": len(internal_links),
            "external_links_count": len(external_links),
        }

    async def scrape(self) -> Dict[str, Any]:
        """Main entry point – scrapes homepage + key pages."""
        result: Dict[str, Any] = {
            "url": self.url,
            "reachable": False,
            "redirects_to_https": False,
            "final_url": self.url,
            "status_code": None,
            "has_sitemap": False,
            "has_robots": False,
            "sitemap_url": None,
            "robots_url": None,
            "cms_detected": None,
            "pages_found": self.pages_found,
            "seo_meta": {},
            "social_links": {},
            "emails": [],
            "phones": [],
            "pixels": {},
            "booking_systems": {},
            "contact_form_found": False,
            "has_live_chat": False,
            "has_newsletter_form": False,
            "has_cookie_consent": False,
        }

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        }

        async with httpx.AsyncClient(
            timeout=settings.request_timeout_seconds,
            follow_redirects=True,
            headers=headers,
            verify=False,  # We check SSL separately
        ) as client:
            # Fetch homepage
            try:
                resp = await client.get(self.url)
                result["status_code"] = resp.status_code
                result["reachable"] = resp.status_code < 400
                result["final_url"] = str(resp.url)
                result["redirects_to_https"] = str(resp.url).startswith("https://")
            except Exception as e:
                logger.warning(f"Cannot reach {self.url}: {e}")
                return result

            if not result["reachable"]:
                return result

            html = resp.text
            soup = BeautifulSoup(html, "lxml")
            self.pages_found["home"] = True

            # Page type detection on homepage
            self._detect_page_type(self.url, soup)

            # Check robots.txt
            try:
                robots_resp = await client.get(urljoin(self.url, "/robots.txt"))
                result["has_robots"] = robots_resp.status_code == 200
                result["robots_url"] = urljoin(self.url, "/robots.txt")
            except Exception:
                pass

            # Check sitemap
            for sitemap_path in ["/sitemap.xml", "/sitemap_index.xml", "/sitemap/"]:
                try:
                    sitemap_resp = await client.get(urljoin(self.url, sitemap_path))
                    if sitemap_resp.status_code == 200:
                        result["has_sitemap"] = True
                        result["sitemap_url"] = urljoin(self.url, sitemap_path)
                        break
                except Exception:
                    pass

            # Core extractions
            result["seo_meta"] = self._extract_seo_meta(soup, self.url)
            result["social_links"] = self._extract_social_links(soup)
            result["emails"] = self._extract_emails(html)
            result["phones"] = self._extract_phones(html)
            result["pixels"] = self._detect_pixels(html)
            result["cms_detected"] = self._detect_cms(html)
            result["booking_systems"] = self._detect_booking(html)

            # Feature detection
            result["contact_form_found"] = bool(
                soup.find("form") and
                any(kw in html.lower() for kw in ["contact", "message", "inquiry", "enquiry"])
            )
            result["has_live_chat"] = any(result["pixels"].get(p, False) for p in [
                "intercom", "drift", "zendesk", "freshchat", "crisp", "tawk"
            ])
            result["has_newsletter_form"] = bool(
                re.search(r"newsletter|subscribe|email.*sign.?up", html, re.IGNORECASE)
            )
            result["has_cookie_consent"] = bool(
                re.search(r"cookie.*consent|gdpr|cookiebot|onetrust|cookieyea", html, re.IGNORECASE)
            )

            # Crawl additional key pages (depth 1)
            links = [a.get("href", "") for a in soup.find_all("a", href=True)]
            key_page_keywords = [
                "about", "services", "contact", "blog", "privacy", "terms",
                "booking", "appointment", "portfolio", "testimonials", "team"
            ]
            crawled = 0
            for link in links:
                if crawled >= 8:
                    break
                abs_url = urljoin(self.url, link)
                if (
                    self._is_same_domain(abs_url)
                    and abs_url not in self.visited
                    and any(kw in abs_url.lower() for kw in key_page_keywords)
                    and self._can_fetch(abs_url)
                ):
                    self.visited.add(abs_url)
                    try:
                        page_resp = await client.get(abs_url)
                        if page_resp.status_code == 200:
                            page_soup = BeautifulSoup(page_resp.text, "lxml")
                            self._detect_page_type(abs_url, page_soup)
                            # Merge emails/phones from inner pages
                            result["emails"] = list(set(
                                result["emails"] + self._extract_emails(page_resp.text)
                            ))[:10]
                            crawled += 1
                    except Exception:
                        pass

            result["pages_found"] = self.pages_found

        return result
