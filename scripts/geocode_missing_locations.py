"""Reverse-geocode places/hotels that have coordinates but no region/city/quarter.

Uses OpenStreetMap Nominatim (free, no API key). Respects the 1 request/sec
usage policy. Safe to re-run: it skips any item that already has a region,
subdivision, or quarter, and checkpoints to disk every 20 updates so an
interruption does not lose progress.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
FILES = ["places.json", "hotels.json"]
HEADERS = {
    "User-Agent": "GlobeTrotterCapstoneApp/1.0 (student capstone project; "
                  "contact: nguend.johann@ictuniversity.edu.cm)"
}

REGION_MAP = {
    "adamaoua": "Adamawa", "adamawa": "Adamawa",
    "centre": "Centre", "center": "Centre",
    "est": "East", "east": "East",
    "extreme-nord": "Far North", "extreme nord": "Far North",
    "far north": "Far North", "far-north": "Far North",
    "littoral": "Littoral",
    "nord": "North", "north": "North",
    "nord-ouest": "North West", "nord ouest": "North West",
    "north-west": "North West", "north west": "North West", "northwest": "North West",
    "sud": "South", "south": "South",
    "sud-ouest": "South West", "sud ouest": "South West",
    "south-west": "South West", "south west": "South West", "southwest": "South West",
    "ouest": "West", "west": "West",
}


def normalize_region(raw):
    if not raw:
        return ""
    key = raw.strip().lower().replace("\u00e9", "e").replace("\u00e8", "e")
    return REGION_MAP.get(key, raw.strip())


def reverse_geocode(lat, lon):
    params = urllib.parse.urlencode({
        "lat": lat, "lon": lon, "format": "jsonv2",
        "addressdetails": 1, "accept-language": "en,fr",
    })
    url = "https://nominatim.openstreetmap.org/reverse?" + params
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def process_file(fname):
    path = os.path.join(BASE, fname)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    updated = 0
    skipped_no_coords = 0
    total_targets = sum(
        1 for item in data
        if not (item.get("region") or item.get("subdivision") or item.get("quarter"))
    )
    seen = 0

    for item in data:
        if item.get("region") or item.get("subdivision") or item.get("quarter"):
            continue
        seen += 1
        lat, lon = item.get("latitude"), item.get("longitude")
        if not lat or not lon:
            skipped_no_coords += 1
            continue
        try:
            result = reverse_geocode(lat, lon)
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR {fname} {item.get('id')}: {exc}", flush=True)
            time.sleep(1.1)
            continue

        addr = result.get("address", {})
        region = normalize_region(addr.get("state", ""))
        division = addr.get("county") or addr.get("state_district") or ""
        city = (
            addr.get("city") or addr.get("town") or addr.get("village")
            or addr.get("municipality") or division or ""
        )
        quarter = (
            addr.get("suburb") or addr.get("neighbourhood")
            or addr.get("quarter") or addr.get("city_district") or ""
        )

        item["region"] = region
        item["division"] = division
        item["subdivision"] = item.get("subdivision") or division
        item["city"] = city
        if quarter:
            item["quarter"] = quarter
        item["country"] = "Cameroon"
        item["country_code"] = "CM"

        loc_parts = [p for p in [quarter, city, region, "Cameroon"] if p]
        item["location"] = ", ".join(dict.fromkeys(loc_parts))
        item["map_query"] = f"{item.get('name', '')}, {item['location']}"

        updated += 1
        print(
            f"[{fname}] {seen}/{total_targets} '{item.get('name', '')[:40]}' "
            f"-> region={region!r} city={city!r} quarter={quarter!r}",
            flush=True,
        )

        if updated % 20 == 0:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"--- checkpoint saved ({updated} updated so far) ---", flush=True)

        time.sleep(1.1)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"DONE {fname}: {updated} updated, {skipped_no_coords} skipped (no coords)", flush=True)


if __name__ == "__main__":
    for fname in FILES:
        process_file(fname)
    print("ALL DONE", flush=True)
