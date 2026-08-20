"""
Import Cameroon tourism catalogue data from open sources.

Sources:
- OpenStreetMap via Overpass API for names, categories, coordinates, and tags.
- Wikimedia Commons API for reusable photo/video metadata where a good match exists.

The importer merges into data/hotels.json and data/places.json without deleting
existing curated records.
"""
from __future__ import annotations

import argparse
import http.client
import json
import os
import re
import socket
import sys
import time
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.parse import quote_plus
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.cameroon_geo import enrich_cameroon_item, infer_cameroon_geo  # noqa: E402


OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
]
COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "GlobeTrotterCapstone/1.0 tourism-data-import"

CAMEROON_BBOX = "1.4,8.0,13.3,16.3"

OVERPASS_SELECTORS = [
    '["tourism"~"^(hotel|guest_house|hostel|motel|camp_site|resort)$"]',
    '["amenity"~"^(restaurant|cafe|bar|fast_food|food_court|pub)$"]',
    '["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park)$"]',
    '["historic"]',
    '["natural"~"^(waterfall|beach|peak|volcano|cave_entrance|spring|bay|cliff|forest|hot_spring)$"]',
    '["leisure"~"^(park|nature_reserve|garden|resort|water_park)$"]',
]

OVERPASS_QUERY_TEMPLATE = """
[out:json][timeout:75];
(
  node{selector}({bbox});
);
out body qt{limit};
"""


CATEGORY_TAGS = {
    "hotel": ["hotel", "stay", "lodging", "accommodation"],
    "restaurant": ["restaurant", "food", "dining"],
    "natural_site": ["natural", "nature", "waterfall", "beach", "mountain", "forest", "park"],
    "monument": ["monument", "historic", "heritage", "history"],
    "museum": ["museum", "culture", "history"],
    "man_made_site": ["attraction", "sightseeing", "tourism"],
}


def read_json(path: Path) -> list:
    if not path.exists():
        return []
    content = path.read_text(encoding="utf-8").strip()
    if not content:
        return []
    data = json.loads(content)
    return data if isinstance(data, list) else []


def write_json(path: Path, data: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "item"


def overpass_fetch(query: str) -> list[dict]:
    body = urlencode({"data": query}).encode("utf-8")
    last_error: Exception | None = None
    for url in OVERPASS_URLS:
        request = Request(
            url,
            data=body,
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept-Encoding": "identity",
                "Connection": "close",
            },
            method="POST",
        )
        for _attempt in range(1):
            try:
                with urlopen(request, timeout=25) as response:
                    return json.loads(response.read().decode("utf-8")).get("elements", [])
            except (
                HTTPError,
                URLError,
                TimeoutError,
                http.client.IncompleteRead,
                http.client.RemoteDisconnected,
                json.JSONDecodeError,
            ) as exc:
                last_error = exc
                time.sleep(1)
    print(f"Warning: unable to fetch one Overpass slice: {last_error}", file=sys.stderr)
    return []


def overpass_elements(max_items: int = 0) -> list[dict]:
    elements = []
    seen = set()
    per_query_limit = max(25, min(300, max_items // len(OVERPASS_SELECTORS))) if max_items else 0
    for selector in OVERPASS_SELECTORS:
        if max_items and len(elements) >= max_items:
            break
        remaining = max_items - len(elements) if max_items else 0
        limit = f" {min(per_query_limit, remaining)}" if max_items else ""
        query = OVERPASS_QUERY_TEMPLATE.format(selector=selector, bbox=CAMEROON_BBOX, limit=limit)
        for element in overpass_fetch(query):
            key = (element.get("type"), element.get("id"))
            if key in seen:
                continue
            seen.add(key)
            elements.append(element)
            if max_items and len(elements) >= max_items:
                break
    return elements


def overpass_elements_old(max_items: int = 0) -> list[dict]:
    limit = f" {max_items}" if max_items else ""
    query = OVERPASS_QUERY_TEMPLATE.format(limit=limit)
    body = urlencode({"data": query}).encode("utf-8")
    last_error: Exception | None = None
    for url in OVERPASS_URLS:
        request = Request(
            url,
            data=body,
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept-Encoding": "identity",
                "Connection": "close",
            },
            method="POST",
        )
        for _attempt in range(2):
            try:
                with urlopen(request, timeout=300) as response:
                    return json.loads(response.read().decode("utf-8")).get("elements", [])
            except (
                HTTPError,
                URLError,
                TimeoutError,
                http.client.IncompleteRead,
                http.client.RemoteDisconnected,
                json.JSONDecodeError,
            ) as exc:
                last_error = exc
                time.sleep(2)
    raise RuntimeError(f"Unable to fetch Overpass data: {last_error}")


def coordinates_for(element: dict) -> tuple[float | None, float | None]:
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    center = element.get("center") or {}
    return center.get("lat"), center.get("lon")


def classify(tags: dict) -> str:
    tourism = tags.get("tourism", "")
    amenity = tags.get("amenity", "")
    historic = tags.get("historic", "")
    natural = tags.get("natural", "")
    leisure = tags.get("leisure", "")

    if tourism in {"hotel", "guest_house", "hostel", "motel", "camp_site", "resort"}:
        return "hotel"
    if amenity in {"restaurant", "cafe", "bar", "fast_food", "food_court", "pub"}:
        return "restaurant"
    if tourism == "museum":
        return "museum"
    if historic or tourism in {"gallery"}:
        return "monument"
    if natural or leisure in {"park", "nature_reserve", "garden"}:
        return "natural_site"
    return "man_made_site"


def estimate_cost(category: str, tags: dict) -> tuple[int, str]:
    if category == "hotel":
        if tags.get("stars") in {"4", "5"}:
            return 85000, "Estimated hotel budget; confirm current nightly price before booking."
        if tags.get("tourism") in {"guest_house", "hostel", "camp_site"}:
            return 25000, "Estimated budget lodging price; confirm current nightly price before booking."
        return 50000, "Estimated mid-range hotel price; confirm current nightly price before booking."
    if category == "restaurant":
        if tags.get("amenity") in {"bar", "pub"}:
            return 8000, "Estimated food/drink budget; confirm menu prices locally."
        if tags.get("amenity") in {"fast_food", "cafe"}:
            return 5000, "Estimated casual meal budget; confirm menu prices locally."
        return 12000, "Estimated restaurant meal budget; confirm menu prices locally."
    if category in {"museum", "monument"}:
        return 5000, "Estimated entry/guide budget; confirm current site fees locally."
    if category == "natural_site":
        return 10000, "Estimated guide/access budget; confirm current access and transport fees locally."
    return 5000, "Estimated visitor budget; confirm current local fees before travel."


def source_urls_for(element: dict, tags: dict) -> list[str]:
    urls = []
    for key in ("website", "url", "contact:website", "wikipedia", "wikidata"):
        value = tags.get(key)
        if not value:
            continue
        if key == "wikipedia" and ":" in value:
            lang, title = value.split(":", 1)
            urls.append(f"https://{lang}.wikipedia.org/wiki/{quote_plus(title.replace(' ', '_'))}")
        elif key == "wikidata":
            urls.append(f"https://www.wikidata.org/wiki/{value}")
        else:
            urls.append(value)
    urls.append(f"https://www.openstreetmap.org/{element['type']}/{element['id']}")
    return urls


def commons_media(name: str, *, sleep_seconds: float = 0.2) -> dict:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrnamespace": "6",
        "gsrlimit": "5",
        "gsrsearch": f"{name} Cameroon",
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": "900",
    }
    try:
        request = Request(
            f"{COMMONS_API_URL}?{urlencode(params)}",
            headers={"User-Agent": USER_AGENT},
        )
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        time.sleep(sleep_seconds)
    except (HTTPError, URLError, TimeoutError, socket.timeout, json.JSONDecodeError):
        return {}

    pages = payload.get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        mime = info.get("mime", "")
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        metadata = info.get("extmetadata") or {}
        media_item = {
            "url": url,
            "source_url": info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/{quote_plus(page.get('title', ''))}",
            "license": (metadata.get("LicenseShortName") or {}).get("value", ""),
            "author": re.sub("<[^>]+>", "", (metadata.get("Artist") or {}).get("value", "")),
            "license_note": "Media discovered via Wikimedia Commons API; verify attribution before production use.",
        }
        if mime.startswith("video/"):
            return {"videos": [media_item]}
        if mime.startswith("image/"):
            return {"image_url": url, "images": [media_item]}
    return {}


def normalize_element(element: dict, include_media: bool, media_remaining: int) -> tuple[str, dict, bool]:
    tags = element.get("tags") or {}
    name = (tags.get("name:en") or tags.get("name") or "").strip()
    if not name:
        return "", {}, False

    lat, lon = coordinates_for(element)
    if lat is None or lon is None:
        return "", {}, False

    category = classify(tags)
    cost, cost_note = estimate_cost(category, tags)
    geo = infer_cameroon_geo(name, tags.get("addr:city", ""), tags.get("addr:suburb", ""))
    city = tags.get("addr:city") or geo.get("city", "")
    location = ", ".join(part for part in [tags.get("addr:street"), city, geo.get("region"), "Cameroon"] if part)
    osm_id = f"osm-{element['type']}-{element['id']}"

    base = {
        "id": f"{'hotel' if category == 'hotel' else 'place'}-{slugify(osm_id)}",
        "name": name,
        "location": location or f"{name}, Cameroon",
        "latitude": float(lat),
        "longitude": float(lon),
        **geo,
        "category": category,
        "osm_type": element["type"],
        "osm_id": element["id"],
        "source": "openstreetmap",
        "source_urls": source_urls_for(element, tags),
        "description": tags.get("description") or f"{name} is listed in OpenStreetMap as a Cameroon {category.replace('_', ' ')}.",
        "tags": sorted(set([*CATEGORY_TAGS.get(category, []), "cameroon"])),
        "related_services": [],
        "cost_note": cost_note,
        "map_query": f"{name}, Cameroon",
        "map_info": {
            "provider": "openstreetmap",
            "query": f"{name}, Cameroon",
            "latitude": float(lat),
            "longitude": float(lon),
            "openstreetmap_url": f"https://www.openstreetmap.org/{element['type']}/{element['id']}",
            "cameroon_focus": True,
            "country_focus": "Cameroon",
        },
    }

    if category == "hotel":
        base["cost_per_night"] = cost
        base["rating"] = 0
    else:
        base["cost"] = cost

    used_media = False
    if include_media and media_remaining > 0:
        media = commons_media(name)
        if media:
            base.update(media)
            used_media = True

    return "hotels" if category == "hotel" else "places", enrich_cameroon_item(base), used_media


def merge(existing: list, imported: list) -> tuple[list, int]:
    by_key = {}
    for item in existing:
        key = (item.get("source"), item.get("osm_type"), str(item.get("osm_id")))
        if item.get("osm_id"):
            by_key[key] = item

    existing_names = {
        (item.get("name", "").strip().lower(), item.get("city", "").strip().lower(), item.get("category", ""))
        for item in existing
    }

    added = 0
    merged = list(existing)
    for item in imported:
        osm_key = (item.get("source"), item.get("osm_type"), str(item.get("osm_id")))
        name_key = (item.get("name", "").strip().lower(), item.get("city", "").strip().lower(), item.get("category", ""))
        if item.get("osm_id") and osm_key in by_key:
            continue
        if name_key in existing_names:
            continue
        merged.append(item)
        added += 1
        if item.get("osm_id"):
            by_key[osm_key] = item
        existing_names.add(name_key)
    return merged, added


def enrich_existing_media(limit: int) -> dict:
    results = {}
    for target in ("hotels", "places"):
        path = DATA_DIR / f"{target}.json"
        items = read_json(path)
        updated = 0
        attempts = 0
        for item in items:
            if attempts >= limit:
                break
            if item.get("image_url") or item.get("images") or item.get("videos"):
                continue
            attempts += 1
            media = commons_media(item.get("name", ""))
            if not media:
                continue
            item.update(media)
            updated += 1
        write_json(path, items)
        results[target] = {"media_attempts": attempts, "media_added": updated, "total": len(items)}
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Cameroon tourism POIs from OpenStreetMap and Wikimedia Commons.")
    parser.add_argument("--max-items", type=int, default=1500, help="Maximum OSM records to import; 0 means no limit.")
    parser.add_argument("--media-limit", type=int, default=80, help="Maximum imported records to enrich with Wikimedia Commons media.")
    parser.add_argument("--media-only", type=int, default=0, help="Only enrich this many existing hotels and places with Wikimedia Commons media.")
    parser.add_argument("--no-media", action="store_true", help="Skip Wikimedia Commons media lookup.")
    args = parser.parse_args()

    if args.media_only:
        print(json.dumps(enrich_existing_media(args.media_only), indent=2))
        return 0

    elements = overpass_elements(args.max_items)
    imported = {"hotels": [], "places": []}
    media_remaining = 0 if args.no_media else args.media_limit

    for element in elements:
        if args.max_items and sum(len(values) for values in imported.values()) >= args.max_items:
            break
        target, item, used_media = normalize_element(element, not args.no_media, media_remaining)
        if not target:
            continue
        imported[target].append(item)
        if used_media:
            media_remaining -= 1

    totals = {}
    for target, items in imported.items():
        path = DATA_DIR / f"{target}.json"
        existing = read_json(path)
        merged, added = merge(existing, items)
        merged.sort(key=lambda item: (item.get("region", ""), item.get("city", ""), item.get("category", ""), item.get("name", "")))
        write_json(path, merged)
        totals[target] = {"fetched": len(items), "added": added, "total": len(merged)}

    print(json.dumps(totals, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
