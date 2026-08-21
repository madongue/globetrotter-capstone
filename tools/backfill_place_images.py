"""Give image-less catalogue entries a contextual city photograph.

Most of the OpenStreetMap import arrived without imagery, which leaves the
photo-led place view looking broken. Until a real photograph of each place
exists, this falls back to a picture of the city it is in -- reusing the
curated destination images already committed to the repository, so no new
licensing is involved.

Every record filled this way is marked, so the interface can be honest about
it and a real photo can replace it later:

    image_is_contextual: true
    image_context_note:  "Contextual photograph of <city> ..."

City names are matched loosely, because the import writes them with accents
and subdivision suffixes -- "Buéa", "Kribi II" and "Douala IV" all resolve to
the destination images for Buea, Kribi and Douala.

    python tools/backfill_place_images.py --dry-run
    python tools/backfill_place_images.py
    python tools/backfill_place_images.py --revert
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

#: Catalogue files to fill, and the field holding their city name.
TARGETS = {
    "places": ("city", "location"),
    "hotels": ("city", "location"),
    "activities": ("city", "location"),
}

#: Trailing subdivision markers the OSM import appends to city names.
SUFFIX = re.compile(r"\s+(?:i{1,3}|iv|v|vi{1,3}|ix|x|\d+)(?:er|e|eme|ème)?$", re.I)


def normalise(name: str) -> str:
    """Reduce a city name to a comparable key.

    "Buéa" -> "buea", "Kribi II" -> "kribi", "Douala IV" -> "douala"
    """
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", str(name))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.strip().lower()
    text = SUFFIX.sub("", text).strip()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def load(name: str) -> list:
    path = DATA / f"{name}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def save(name: str, records: list) -> None:
    path = DATA / f"{name}.json"
    path.write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def build_city_images() -> dict:
    """Map a normalised city name to a destination image and its attribution."""
    images = {}
    for destination in load("destinations"):
        image_url = (destination.get("image_url") or "").strip()
        if not image_url.startswith("/images/"):
            continue
        key = normalise(destination.get("name", ""))
        if key:
            images[key] = {
                "url": image_url,
                "city": destination.get("name", ""),
                "source_url": destination.get("image_source_url", ""),
                "license": destination.get("image_license", ""),
                "author": destination.get("image_author", ""),
            }
    return images


def city_key_for(record: dict, fields: tuple) -> str:
    for field in fields:
        key = normalise(record.get(field, ""))
        if key:
            return key
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report without writing")
    parser.add_argument(
        "--revert",
        action="store_true",
        help="remove every contextual image this script added",
    )
    args = parser.parse_args()

    if args.revert:
        total = 0
        for name in TARGETS:
            records = load(name)
            removed = 0
            for record in records:
                if record.pop("image_is_contextual", None):
                    record.pop("image_context_note", None)
                    for field in ("image_url", "images", "image_source_url",
                                  "image_license", "image_author"):
                        record.pop(field, None)
                    removed += 1
            if removed and not args.dry_run:
                save(name, records)
            print(f"{name}: reverted {removed}")
            total += removed
        print(f"\n{total} record(s) reverted.")
        return 0

    city_images = build_city_images()
    if not city_images:
        print("No destination images found to borrow from.")
        return 1
    print(f"{len(city_images)} city image(s) available\n")

    grand_total = 0
    for name, fields in TARGETS.items():
        records = load(name)
        if not records:
            continue

        filled = 0
        unmatched: dict[str, int] = {}
        for record in records:
            if (record.get("image_url") or "").strip():
                continue

            key = city_key_for(record, fields)
            source = city_images.get(key)
            if not source:
                unmatched[key or "(no city)"] = unmatched.get(key or "(no city)", 0) + 1
                continue

            note = (
                f"Contextual photograph of {source['city']}. "
                "No photograph of this specific place is available yet."
            )
            record["image_url"] = source["url"]
            record["image_is_contextual"] = True
            record["image_context_note"] = note
            if source["source_url"]:
                record["image_source_url"] = source["source_url"]
            if source["license"]:
                record["image_license"] = source["license"]
            if source["author"]:
                record["image_author"] = source["author"]
            record["images"] = [
                {
                    "url": source["url"],
                    "source_url": source["source_url"],
                    "license": source["license"],
                    "author": source["author"],
                    "license_note": note,
                }
            ]
            filled += 1

        total = len(records)
        with_image = sum(1 for r in records if (r.get("image_url") or "").strip())
        print(
            f"{name}: filled {filled} -> {with_image}/{total} "
            f"({100 * with_image // max(total, 1)}%) now have an image"
        )
        if unmatched:
            top = sorted(unmatched.items(), key=lambda kv: -kv[1])[:5]
            summary = ", ".join(f"{city} ({count})" for city, count in top)
            print(f"  still unmatched: {summary}")

        if filled and not args.dry_run:
            save(name, records)
        grand_total += filled

    verb = "would fill" if args.dry_run else "filled"
    print(f"\n{verb} {grand_total} record(s).")
    if args.dry_run:
        print("Re-run without --dry-run to write the changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
