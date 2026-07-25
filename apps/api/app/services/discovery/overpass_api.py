"""
Business Discovery via OpenStreetMap Overpass API + Nominatim geocoding.
Completely free, no API key required.
Nominatim: address → lat/lng
Overpass API: query businesses near a point by category.
"""
import httpx
import logging
import time
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "LocalProspectFinder/1.0 (open-source; contact@localprospectfinder.com)"

# ── OSM amenity/tag mapping for business categories ─────────────────────

CATEGORY_OSM_MAP: Dict[str, Dict[str, Any]] = {
    "dentists":         {"amenity": ["dentist"]},
    "law_firms":        {"office": ["lawyer", "legal"]},
    "restaurants":      {"amenity": ["restaurant", "fast_food", "cafe"]},
    "roofing":          {"craft": ["roofer"]},
    "hvac":             {"craft": ["hvac", "heating_engineer"]},
    "construction":     {"craft": ["builder", "construction"], "office": ["construction"]},
    "medical_clinics":  {"amenity": ["clinic", "doctors", "hospital"]},
    "real_estate":      {"office": ["real_estate_agent", "estate_agent"]},
    "hotels":           {"tourism": ["hotel", "motel", "guest_house"]},
    "schools":          {"amenity": ["school", "college", "university"]},
    "plumbing":         {"craft": ["plumber"]},
    "electricians":     {"craft": ["electrician"]},
    "salons":           {"shop": ["hairdresser", "beauty", "nail_salon"]},
    "gyms":             {"leisure": ["fitness_centre", "sports_centre"]},
    "auto_repair":      {"shop": ["car_repair", "tyres", "automotive"]},
    "accounting":       {"office": ["accountant", "accounting"]},
    "insurance":        {"office": ["insurance"]},
    "veterinary":       {"amenity": ["veterinary"]},
    "pharmacies":       {"amenity": ["pharmacy"]},
    "bakeries":         {"shop": ["bakery"]},
    "supermarkets":     {"shop": ["supermarket", "convenience"]},
    "banks":            {"amenity": ["bank"]},
    "hotels_bb":        {"tourism": ["hotel", "bed_and_breakfast"]},
    "bars":             {"amenity": ["bar", "pub", "nightclub"]},
    "general":          {"amenity": ["*"], "shop": ["*"], "office": ["*"]},
}


def _build_overpass_query(
    lat: float,
    lng: float,
    radius_meters: float,
    category: str,
) -> str:
    """Build Overpass QL query for a given category and radius."""
    osm_tags = CATEGORY_OSM_MAP.get(category.lower().replace(" ", "_"), CATEGORY_OSM_MAP["general"])

    parts = []
    for tag_key, tag_values in osm_tags.items():
        for val in tag_values:
            if val == "*":
                # Any value for this key
                for node_type in ["node", "way", "relation"]:
                    parts.append(f'{node_type}["{tag_key}"](around:{int(radius_meters)},{lat},{lng});')
            else:
                for node_type in ["node", "way", "relation"]:
                    parts.append(f'{node_type}["{tag_key}"="{val}"](around:{int(radius_meters)},{lat},{lng});')

    union = "\n  ".join(parts)
    query = f"""
[out:json][timeout:60];
(
  {union}
);
out center tags;
"""
    return query


def _parse_osm_element(element: Dict[str, Any]) -> Dict[str, Any]:
    """Convert an OSM element (node/way/relation) to our internal schema."""
    tags = element.get("tags", {})

    # Get coordinates
    if element.get("type") == "node":
        lat = element.get("lat")
        lng = element.get("lon")
    else:
        # way/relation has a center
        center = element.get("center", {})
        lat = center.get("lat")
        lng = center.get("lon")

    # Build address from OSM addr:* tags
    addr_parts = []
    if tags.get("addr:housenumber"):
        addr_parts.append(tags["addr:housenumber"])
    if tags.get("addr:street"):
        addr_parts.append(tags["addr:street"])
    address = " ".join(addr_parts) if addr_parts else None

    # Category detection from tags
    primary_type = (
        tags.get("amenity")
        or tags.get("shop")
        or tags.get("office")
        or tags.get("craft")
        or tags.get("tourism")
        or tags.get("leisure")
        or "business"
    )

    # Parse opening hours (OSM uses a specific format)
    opening_hours_raw = tags.get("opening_hours")

    # Social / contact
    website = tags.get("website") or tags.get("url")
    phone = tags.get("phone") or tags.get("contact:phone")
    email = tags.get("email") or tags.get("contact:email")

    social_links = {}
    if tags.get("contact:facebook") or tags.get("facebook"):
        social_links["facebook"] = tags.get("contact:facebook") or tags.get("facebook")
    if tags.get("contact:instagram") or tags.get("instagram"):
        social_links["instagram"] = tags.get("contact:instagram") or tags.get("instagram")
    if tags.get("contact:twitter"):
        social_links["twitter_x"] = tags.get("contact:twitter")
    if tags.get("contact:linkedin"):
        social_links["linkedin"] = tags.get("contact:linkedin")
    if tags.get("contact:youtube"):
        social_links["youtube"] = tags.get("contact:youtube")

    name = tags.get("name") or tags.get("brand") or "Unnamed Business"

    return {
        "place_id": f"osm_{element.get('type', 'node')}_{element.get('id')}",
        "name": name,
        "category": primary_type,
        "sub_categories": [v for k, v in tags.items() if k in ("amenity", "shop", "craft", "office", "leisure", "tourism") and v],
        "address": address,
        "city": tags.get("addr:city"),
        "state": tags.get("addr:state") or tags.get("addr:province"),
        "country": tags.get("addr:country"),
        "postal_code": tags.get("addr:postcode"),
        "lat": lat,
        "lng": lng,
        "phone": phone,
        "website": website,
        "email": email,
        "maps_url": f"https://www.openstreetmap.org/{element.get('type', 'node')}/{element.get('id')}",
        "google_rating": None,
        "review_count": None,
        "opening_hours": {"raw": opening_hours_raw} if opening_hours_raw else None,
        "business_status": "OPERATIONAL" if name != "Unnamed Business" else "UNKNOWN",
        "description": tags.get("description"),
        "data_source": "openstreetmap",
        "social_links": social_links if social_links else None,
        "contact_details": {
            "email": email,
            "phone": phone,
            "website": website,
        },
    }


async def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """Convert address/city string to lat/lng using Nominatim."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={"q": address, "format": "json", "limit": 1},
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            results = resp.json()
            if results:
                return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        logger.error(f"Geocoding failed for '{address}': {e}")
    return None


async def reverse_geocode(lat: float, lng: float) -> Dict[str, str]:
    """Get address info from lat/lng."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                NOMINATIM_REVERSE_URL,
                params={"lat": lat, "lon": lng, "format": "json"},
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            data = resp.json()
            addr = data.get("address", {})
            return {
                "city": addr.get("city") or addr.get("town") or addr.get("village"),
                "state": addr.get("state"),
                "country": addr.get("country"),
                "country_code": addr.get("country_code", "").upper(),
                "postal_code": addr.get("postcode"),
                "display_name": data.get("display_name"),
            }
    except Exception as e:
        logger.error(f"Reverse geocode failed: {e}")
    return {}


async def search_businesses(
    lat: float,
    lng: float,
    radius_meters: float = 5000,
    category: str = "general",
    keyword: Optional[str] = None,
    max_results: int = 100,
) -> List[Dict[str, Any]]:
    """
    Query Overpass API for businesses near lat/lng.
    Applies a 1-second delay to respect Overpass usage policy.
    """
    query = _build_overpass_query(lat, lng, radius_meters, category)

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            # Overpass recommends not hammering – 1s politeness delay
            await _polite_delay()
            resp = await client.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"Overpass API request failed: {e}")
        return []

    elements = data.get("elements", [])

    # Filter: must have a name
    named = [e for e in elements if e.get("tags", {}).get("name")]

    # Keyword filter (post-fetch)
    if keyword:
        kw = keyword.lower()
        named = [
            e for e in named
            if kw in e.get("tags", {}).get("name", "").lower()
            or kw in str(e.get("tags", {})).lower()
        ]

    parsed = [_parse_osm_element(e) for e in named[:max_results]]

    # Deduplicate by name+address
    seen = set()
    unique = []
    for p in parsed:
        key = f"{p['name']}_{p['address']}"
        if key not in seen:
            seen.add(key)
            unique.append(p)

    return unique


_last_request_time = 0.0

async def _polite_delay():
    """Ensure at least 1s between Overpass requests."""
    global _last_request_time
    import asyncio
    now = time.time()
    wait = 1.0 - (now - _last_request_time)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_request_time = time.time()


# ── Category helpers ──────────────────────────────────────────────────────

def get_available_categories() -> List[Dict[str, str]]:
    """Return list of supported categories for the UI."""
    return [
        {"key": k, "label": k.replace("_", " ").title()}
        for k in CATEGORY_OSM_MAP.keys()
    ]
