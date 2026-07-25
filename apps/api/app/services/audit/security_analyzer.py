"""
Security Analyzer – checks SSL, HTTPS, security headers, exposed paths.
Makes direct HTTP requests. No third-party APIs required.
"""
import httpx
import ssl
import socket
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.core.config import get_settings
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
settings = get_settings()

SECURITY_HEADERS = [
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "x-xss-protection",
    "strict-transport-security",
    "referrer-policy",
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
]

EXPOSED_PATHS = [
    ("/wp-admin/", "WordPress Admin Login"),
    ("/wp-login.php", "WordPress Login Page"),
    ("/administrator/", "Joomla Admin Login"),
    ("/.git/config", "Git Configuration File"),
    ("/backup.zip", "Backup Archive"),
    ("/backup.sql", "Database Backup"),
    ("/phpinfo.php", "PHP Info Page"),
    ("/config.php", "Configuration File"),
    ("/.env", "Environment File"),
    ("/adminer.php", "Adminer Database Tool"),
]


async def check_ssl(hostname: str) -> Dict[str, Any]:
    """Check SSL certificate validity and expiry."""
    result = {
        "has_ssl": False,
        "ssl_valid": False,
        "ssl_expiry": None,
        "ssl_days_remaining": None,
        "ssl_issuer": None,
        "ssl_error": None,
    }
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((hostname, 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                result["has_ssl"] = True
                result["ssl_valid"] = True

                # Expiry
                not_after = cert.get("notAfter")
                if not_after:
                    expiry = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                    days = (expiry - datetime.utcnow()).days
                    result["ssl_expiry"] = expiry.isoformat()
                    result["ssl_days_remaining"] = days

                # Issuer
                issuer = dict(x[0] for x in cert.get("issuer", []))
                result["ssl_issuer"] = issuer.get("organizationName")
    except ssl.SSLCertVerificationError as e:
        result["has_ssl"] = True
        result["ssl_valid"] = False
        result["ssl_error"] = str(e)
    except (ConnectionRefusedError, socket.timeout, OSError):
        result["ssl_error"] = "Port 443 not accessible"
    except Exception as e:
        result["ssl_error"] = str(e)
    return result


async def analyze_security(url: str) -> Dict[str, Any]:
    """Full security audit of a website URL."""
    parsed = urlparse(url)
    hostname = parsed.netloc or parsed.path

    result: Dict[str, Any] = {
        "url": url,
        "https_enforced": False,
        "http_redirects_to_https": False,
        "ssl": {},
        "headers_present": {},
        "headers_missing": [],
        "security_score_headers": 0,
        "exposed_paths": [],
        "mixed_content_risk": False,
        "directory_listing": False,
        "findings": [],
    }

    # SSL Check
    result["ssl"] = await check_ssl(hostname)

    async with httpx.AsyncClient(
        timeout=settings.request_timeout_seconds,
        follow_redirects=False,
        verify=False,
    ) as client:

        # HTTPS enforcement
        http_url = url.replace("https://", "http://").replace("http://", "http://")
        if not http_url.startswith("http://"):
            http_url = f"http://{hostname}"
        try:
            http_resp = await client.get(http_url)
            if http_resp.status_code in (301, 302, 307, 308):
                location = http_resp.headers.get("location", "")
                result["http_redirects_to_https"] = location.startswith("https://")
        except Exception:
            pass

        # Main HTTPS request for headers
        try:
            main_resp = await client.get(url, follow_redirects=True)
            result["https_enforced"] = str(main_resp.url).startswith("https://")
            resp_headers = {k.lower(): v for k, v in main_resp.headers.items()}

            # Check each security header
            present = {}
            missing = []
            for header in SECURITY_HEADERS:
                if header in resp_headers:
                    present[header] = resp_headers[header]
                else:
                    missing.append(header)

            result["headers_present"] = present
            result["headers_missing"] = missing
            result["security_score_headers"] = int(
                (len(SECURITY_HEADERS) - len(missing)) / len(SECURITY_HEADERS) * 100
            )

            # Mixed content risk heuristic
            if result["https_enforced"]:
                # If page has http:// asset refs, mixed content risk exists
                page_content = main_resp.text[:50000]
                result["mixed_content_risk"] = (
                    "http://" in page_content and "https://" in page_content
                    and url.startswith("https://")
                )

        except Exception as e:
            logger.warning(f"Security headers check failed for {url}: {e}")

        # Check exposed paths
        for path, label in EXPOSED_PATHS:
            check_url = f"https://{hostname}{path}"
            try:
                path_resp = await client.get(check_url, follow_redirects=False)
                if path_resp.status_code == 200:
                    result["exposed_paths"].append({
                        "path": path,
                        "label": label,
                        "status_code": 200,
                    })
            except Exception:
                pass

    # Generate findings
    findings = []

    if not result["ssl"].get("ssl_valid"):
        findings.append({"finding": "Invalid or Missing SSL Certificate", "evidence": result["ssl"].get("ssl_error", "SSL not valid"), "priority": "HIGH", "category": "ssl"})

    if not result["https_enforced"]:
        findings.append({"finding": "HTTPS Not Enforced", "evidence": "Site does not redirect or serve over HTTPS.", "priority": "HIGH", "category": "https"})

    ssl_days = result["ssl"].get("ssl_days_remaining")
    if ssl_days is not None and ssl_days < 30:
        findings.append({
            "finding": "SSL Certificate Expiring Soon",
            "evidence": f"SSL expires in {ssl_days} days.",
            "priority": "HIGH" if ssl_days < 7 else "MEDIUM",
            "category": "ssl",
        })

    critical_headers = ["strict-transport-security", "content-security-policy", "x-frame-options"]
    for h in critical_headers:
        if h in result["headers_missing"]:
            findings.append({
                "finding": f"Missing Security Header: {h}",
                "evidence": f"The {h} header is not present in HTTP responses.",
                "priority": "HIGH" if h in ("strict-transport-security", "content-security-policy") else "MEDIUM",
                "category": "security_headers",
            })

    for exposed in result["exposed_paths"]:
        findings.append({
            "finding": f"Exposed Sensitive Path: {exposed['label']}",
            "evidence": f"URL {exposed['path']} returned HTTP 200.",
            "priority": "HIGH",
            "category": "exposed_paths",
        })

    if result.get("mixed_content_risk"):
        findings.append({
            "finding": "Mixed Content Risk Detected",
            "evidence": "Page served over HTTPS contains references to HTTP resources.",
            "priority": "MEDIUM",
            "category": "mixed_content",
        })

    result["findings"] = findings

    # Overall security score
    score = 100
    for f in findings:
        if f["priority"] == "HIGH":
            score -= 20
        elif f["priority"] == "MEDIUM":
            score -= 10
        else:
            score -= 5
    result["score"] = max(0, score)

    return result
