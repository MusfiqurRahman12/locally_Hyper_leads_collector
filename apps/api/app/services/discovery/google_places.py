"""
Google Places API v1 (New) business discovery service.
Uses FieldMask for cost control - only requests needed fields.
"""
import httpx
from typing import Optional, List, Dict, Any
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

PLACES_BASE_URL = "https://places.googleapis.com/v1/places"

# FieldMask – only billed fields we actually need (avoids Pro-tier billing)
FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.primaryType",
    "places.types",
    "places.formattedAddress",
    "places.addressComponents",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.nationalPhoneNumber",
    "places.websiteUri",
    "places.googleMapsUri",
    "places.regularOpeningHours",
    "places.businessStatus",
    "places.editorialSummary",
])


def _build_headers(api_key: str) -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }


def _parse_address_components(components: List[Dict]) -> Dict[str, str]:
    result = {}
    type_map = {
        "locality": "city",
        "administrative_area_level_1": "state",
        "country": "country",
        "postal_code": "postal_code",
    }
    for comp in components:
        for t in comp.get("types", []):
            if t in type_map:
                result[type_map[t]] = comp.get("longText", "")
    return result


def _parse_place(place: Dict[str, Any]) -> Dict[str, Any]:
    """Map a raw Places API v1 place object to our internal schema."""
    location = place.get("location", {})
    address_components = _parse_address_components(
        place.get("addressComponents", [])
    )
    display_name = place.get("displayName", {})
    opening_hours = place.get("regularOpeningHours", {})
    editorial = place.get("editorialSummary", {})

    return {
        "place_id": place.get("id"),
        "name": display_name.get("text", "Unknown"),
        "category": place.get("primaryType"),
        "sub_categories": place.get("types", []),
        "address": place.get("formattedAddress"),
        "city": address_components.get("city"),
        "state": address_components.get("state"),
        "country": address_components.get("country"),
        "postal_code": address_components.get("postal_code"),
        "lat": location.get("latitude"),
        "lng": location.get("longitude"),
        "phone": place.get("nationalPhoneNumber"),
        "website": place.get("websiteUri"),
        "maps_url": place.get("googleMapsUri"),
        "google_rating": place.get("rating"),
        "review_count": place.get("userRatingCount"),
        "opening_hours": {
            "periods": opening_hours.get("periods", []),
            "weekday_descriptions": opening_hours.get("weekdayDescriptions", []),
        } if opening_hours else None,
        "business_status": place.get("businessStatus", "UNKNOWN"),
        "description": editorial.get("text"),
        "data_source": "google_places",
    }


async def search_nearby(
    lat: float,
    lng: float,
    radius_meters: float,
    included_types: Optional[List[str]] = None,
    keyword: Optional[str] = None,
    max_results: int = 60,
    api_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Search for businesses near a lat/lng point within radius_meters."""
    key = api_key or settings.google_places_api_key
    if not key:
        raise ValueError("Google Places API key is required for business discovery.")

    all_places = []
    page_token = None

    async with httpx.AsyncClient(timeout=30) as client:
        while len(all_places) < max_results:
            payload: Dict[str, Any] = {
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": radius_meters,
                    }
                },
                "maxResultCount": min(20, max_results - len(all_places)),
            }

            if included_types:
                payload["includedTypes"] = included_types

            if keyword:
                payload["textQuery"] = keyword

            if page_token:
                payload["pageToken"] = page_token

            try:
                resp = await client.post(
                    f"{PLACES_BASE_URL}:searchNearby",
                    json=payload,
                    headers=_build_headers(key),
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Google Places API error: {e.response.status_code} – {e.response.text}")
                break
            except Exception as e:
                logger.error(f"Google Places API request failed: {e}")
                break

            places = data.get("places", [])
            if not places:
                break

            all_places.extend([_parse_place(p) for p in places])
            page_token = data.get("nextPageToken")

            if not page_token:
                break

    return all_places[:max_results]


async def search_text(
    query: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_meters: Optional[float] = None,
    max_results: int = 60,
    api_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Text-based search, optionally biased toward a location."""
    key = api_key or settings.google_places_api_key
    if not key:
        raise ValueError("Google Places API key is required.")

    all_places = []
    page_token = None

    async with httpx.AsyncClient(timeout=30) as client:
        while len(all_places) < max_results:
            payload: Dict[str, Any] = {
                "textQuery": query,
                "maxResultCount": min(20, max_results - len(all_places)),
            }

            if lat and lng and radius_meters:
                payload["locationBias"] = {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": radius_meters,
                    }
                }

            if page_token:
                payload["pageToken"] = page_token

            try:
                resp = await client.post(
                    f"{PLACES_BASE_URL}:searchText",
                    json=payload,
                    headers=_build_headers(key),
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error(f"Google Places text search failed: {e}")
                break

            places = data.get("places", [])
            if not places:
                break

            all_places.extend([_parse_place(p) for p in places])
            page_token = data.get("nextPageToken")

            if not page_token:
                break

    return all_places[:max_results]


# Category mapping: friendly name → Google Place types
CATEGORY_TYPE_MAP = {
    "dentists": ["dentist"],
    "law_firms": ["lawyer"],
    "restaurants": ["restaurant", "food"],
    "roofing": ["roofing_contractor"],
    "hvac": ["hvac_contractor"],
    "construction": ["general_contractor"],
    "medical_clinics": ["doctor", "medical_clinic"],
    "real_estate": ["real_estate_agency"],
    "hotels": ["lodging", "hotel"],
    "schools": ["school", "university"],
    "ecommerce": [],  # text-search only
    "manufacturing": [],  # text-search only
    "plumbing": ["plumber"],
    "electricians": ["electrician"],
    "salons": ["hair_care", "beauty_salon"],
    "gyms": ["gym"],
    "auto_repair": ["car_repair"],
    "accounting": ["accounting"],
    "insurance": ["insurance_agency"],
    "veterinary": ["veterinary_care"],
}


def get_place_types(category: str) -> List[str]:
    return CATEGORY_TYPE_MAP.get(category.lower().replace(" ", "_"), [])
