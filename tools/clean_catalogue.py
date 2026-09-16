"""Correct two faults in the committed Cameroon catalogue.

Written as a script rather than a one-off edit so the change is reviewable,
repeatable, and says out loud what it removed and why.

Fault one — places that are not in Cameroon
-------------------------------------------
Fifty-six place records carry an administrative region belonging to a
neighbouring country: Borno, Bauchi, Cross River, Plateau, Kano, Gombe, Jigawa,
Ebonyi and Adamawa State (Nigeria), Bioko Norte and Bioko Sur (Equatorial
Guinea), Woleu-Ntem (Gabon), and Sangha and Sangha-Mbaéré (Congo and the
Central African Republic). Every one of them is nevertheless stamped
``country: Cameroon``, because the OpenStreetMap import set that field itself
rather than deriving it, while the bounding box it queried reached across the
borders.

They were inspected before being removed rather than deleted on the strength of
the region label alone. Their ``city`` fields settle it: Maiduguri and Calabar
in Nigeria, Malabo and Sampaka on Bioko, Ouésso in Congo. Not one carries a
Cameroonian city, division or quarter anywhere in its record, so there is no
correct information to preserve — the whole record describes somewhere else.

A bounding box is deliberately *not* used as the test. Cameroon is not a
rectangle, and a rectangle drawn around it also covers parts of six
neighbouring countries: checked that way, 55 of these 56 look like they are
inside. The region label, which reverse geocoding assigned from the same
coordinate, is the reliable signal.

Fault two — one region spelled two ways
---------------------------------------
Thirty-three places and ten hotels spell Littoral as "Litoral". Cameroon has
ten regions; a filter reading that field sees eleven, and the two halves of
Littoral never appear together. These are corrected, not removed.

Usage
-----
    python tools/clean_catalogue.py            # report only, changes nothing
    python tools/clean_catalogue.py --apply    # write the corrections
"""
from __future__ import annotations

import argparse
import json
import os
from collections import Counter

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

#: Cameroon's ten regions. A closed set — anything else is either the known
#: misspelling below or a record from another country.
CAMEROON_REGIONS = {
    "Adamawa", "Centre", "East", "Far North", "Littoral",
    "North", "North West", "South", "South West", "West",
}

#: Misspelling → correct spelling.
REGION_CORRECTIONS = {"Litoral": "Littoral"}

CATALOGUES = ("places", "hotels", "activities", "destinations")


def load(name: str) -> list:
    with open(os.path.join(DATA_DIR, f"{name}.json"), encoding="utf-8") as handle:
        return json.load(handle)


def save(name: str, rows: list) -> None:
    with open(os.path.join(DATA_DIR, f"{name}.json"), "w", encoding="utf-8") as handle:
        json.dump(rows, handle, ensure_ascii=False, indent=2)


def region_of(record: dict) -> str:
    return (record.get("region") or "").strip()


def is_foreign(record: dict) -> bool:
    """True when the record's region belongs to another country.

    An empty region is not foreign — it is merely unknown, and those records
    are left alone.
    """
    region = REGION_CORRECTIONS.get(region_of(record), region_of(record))
    return bool(region) and region not in CAMEROON_REGIONS


def clean(apply_changes: bool) -> int:
    removed_total = 0
    fixed_total = 0

    for name in CATALOGUES:
        rows = load(name)
        foreign = [r for r in rows if is_foreign(r)]
        kept = [r for r in rows if not is_foreign(r)]

        fixed = 0
        for record in kept:
            corrected = REGION_CORRECTIONS.get(region_of(record))
            if corrected:
                record["region"] = corrected
                # The location string repeats the region, so it needs the same
                # correction or the two disagree on screen.
                location = record.get("location")
                if isinstance(location, str) and "Litoral" in location:
                    record["location"] = location.replace("Litoral", "Littoral")
                fixed += 1

        removed_total += len(foreign)
        fixed_total += fixed

        print(f"{name}: {len(rows)} -> {len(kept)}  removed {len(foreign)}, region corrected {fixed}")

        if foreign:
            by_region = Counter(region_of(r) for r in foreign)
            for region, count in by_region.most_common():
                cities = sorted({(r.get("city") or "?") for r in foreign if region_of(r) == region})
                print(f"    {region:20} {count:3}  ({', '.join(cities[:4])})")

        if apply_changes and (foreign or fixed):
            save(name, kept)

    print()
    print(f"total removed: {removed_total}   total region corrections: {fixed_total}")
    if not apply_changes:
        print("(report only — pass --apply to write these changes)")
    return removed_total


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the corrections to data/")
    clean(parser.parse_args().apply)


if __name__ == "__main__":
    main()
