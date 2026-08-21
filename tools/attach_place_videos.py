"""Attach freely-licensed Wikimedia Commons video to curated places.

The place view has a "Watch" section that only appears when a place has
footage, and nothing in the catalogue had any. Commons hosts a modest but
genuine set of Cameroon video under CC licences -- the Ekom Nkam falls, drills
at the Limbe Wildlife Centre, the Mount Cameroon race -- and this caches those
against the places they actually show.

Each mapping is written by hand rather than searched, because a keyword match
will happily attach a video of a flooded street in Douala to a beach resort.

    python tools/attach_place_videos.py --dry-run
    python tools/attach_place_videos.py
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from fetch_commons_media import download, search  # noqa: E402

PLACES_FILE = ROOT / "data" / "places.json"
VIDEO_DIR = ROOT / "client" / "public" / "videos" / "places"

#: place id -> (Commons search term, exact file title, caption)
#: The title is matched exactly so a search ranking change cannot silently
#: swap in unrelated footage.
VIDEO_MAP = [
    (
        "place-ekom-nkam-waterfalls",
        "Ekom Nkam Cameroon waterfall",
        "File:Ekom Nkam 01.webm",
        "The falls in full flow at the end of the rainy season.",
    ),
    (
        "place-limbe-wildlife-centre",
        "Drill Limbe Cameroon",
        "File:Drill Limbe.webm",
        "Drills at the wildlife centre, a species found only here and in Nigeria.",
    ),
    (
        "place-buea-mount-cameroon",
        "Cameroon Mountain Race",
        "File:Cameroon Mountain Race.webm",
        "The Mount Cameroon Race of Hope, run to the summit and back each February.",
    ),
    (
        "place-kribi-beach",
        "Kribi Cameroon beach",
        "File:People playing at the beach.webm",
        "An afternoon on the sand at Kribi.",
    ),
    (
        "place-foumban-royal-palace",
        "Cameroon folk dance culture",
        "File:Cameroon folk dance.webm",
        "Traditional dance, still central to court ceremony in the grassfields.",
    ),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    places = json.loads(PLACES_FILE.read_text(encoding="utf-8"))
    by_id = {p.get("id"): p for p in places}

    attached = 0
    for place_id, term, title, caption in VIDEO_MAP:
        place = by_id.get(place_id)
        if not place:
            print(f"  ! {place_id}: not in catalogue")
            continue

        try:
            results = search(term, want="video", limit=20)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {place['name']}: search failed ({exc})")
            continue

        match = next((r for r in results if r["title"] == title), None)
        if not match:
            available = ", ".join(r["title"] for r in results[:3]) or "nothing"
            print(f"  ! {place['name']}: {title} not found (saw {available})")
            continue

        if args.dry_run:
            print(f"  would attach {title} -> {place['name']}")
            attached += 1
            time.sleep(3)
            continue

        try:
            # For video, Commons' thumburl is a poster-frame JPEG, not the
            # file itself -- downloading it would ship a broken <video>.
            url = download(match["full_url"], place_id, directory=VIDEO_DIR)
            url = url.replace("/images/places/", "/videos/places/")
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {place['name']}: download failed ({exc})")
            continue

        size_kb = (VIDEO_DIR / Path(url).name).stat().st_size // 1024
        place["videos"] = [
            {
                "id": f"video-{place_id}",
                "url": url,
                "caption": caption,
                "source_url": match["page_url"],
                "license": match["license"],
                "author": match["author"],
                "license_note": (
                    "Cached from Wikimedia Commons for app display. Keep the "
                    "source URL with the record for attribution."
                ),
            }
        ]
        print(f"  attached {place['name']:38} {size_kb:>6} KB  {match['license']}")
        attached += 1
        time.sleep(3)

    if not args.dry_run and attached:
        PLACES_FILE.write_text(
            json.dumps(places, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    print(f"\n{attached} video(s) {'would be ' if args.dry_run else ''}attached.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
