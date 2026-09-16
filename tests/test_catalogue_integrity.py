"""The committed catalogue describes Cameroon, and only Cameroon.

Two faults were found in it and corrected by tools/clean_catalogue.py:

  1. Fifty-six places carried an administrative region from a neighbouring
     country — Maiduguri and Calabar in Nigeria, Malabo and Sampaka on Bioko,
     Ouésso in Congo, Oyem in Gabon, Bayanga in the Central African Republic —
     while every one was stamped ``country: Cameroon``. The import set that
     field itself rather than deriving it, and queried a bounding box that
     reached across the borders.

  2. Forty-three records spelled Littoral as "Litoral", splitting one of the
     ten regions in two for every filter that reads the field.

These tests fail if either returns — through a re-import, a merge, or a new
record added by hand.
"""
import json
import os

import pytest

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

#: Cameroon's ten regions. A closed set, fixed by the constitution rather than
#: by this application, so a value outside it is an error and not a new entry.
CAMEROON_REGIONS = {
    "Adamawa", "Centre", "East", "Far North", "Littoral",
    "North", "North West", "South", "South West", "West",
}

CATALOGUES = ("places", "hotels", "activities", "destinations")

#: Cities in neighbouring countries that the bad import brought in. Named so a
#: regression reports something recognisable rather than a bare count.
FOREIGN_CITIES = {
    "maiduguri", "calabar", "bauchi", "jos", "kano", "dutse", "lafia",
    "malabo", "sampaka", "moka", "belebu", "ouésso", "ouesso", "souanké",
    "souanke", "oyem", "minvoul", "bayanga",
}


def load(name):
    with open(os.path.join(DATA_DIR, f"{name}.json"), encoding="utf-8") as handle:
        return json.load(handle)


@pytest.mark.parametrize("name", CATALOGUES)
def test_every_region_is_one_of_cameroons_ten(name):
    offenders = sorted({
        (record.get("region") or "").strip()
        for record in load(name)
        if (record.get("region") or "").strip()
        and (record.get("region") or "").strip() not in CAMEROON_REGIONS
    })
    assert not offenders, (
        f"{name}.json carries regions that are not Cameroonian: {offenders}. "
        f"Run tools/clean_catalogue.py to inspect and correct them."
    )


@pytest.mark.parametrize("name", CATALOGUES)
def test_littoral_is_spelled_one_way(name):
    """"Litoral" split one region into two everywhere a filter read it."""
    rows = load(name)
    bad_region = [r.get("name") for r in rows if (r.get("region") or "").strip() == "Litoral"]
    bad_location = [r.get("name") for r in rows if "Litoral" in str(r.get("location") or "")]
    assert not bad_region, f"{name}.json still spells Littoral as 'Litoral': {bad_region[:5]}"
    assert not bad_location, f"{name}.json has 'Litoral' in a location string: {bad_location[:5]}"


@pytest.mark.parametrize("name", CATALOGUES)
def test_no_record_names_a_city_in_another_country(name):
    """The region check would pass if someone relabelled without removing."""
    offenders = [
        f"{record.get('name')} ({record.get('city')})"
        for record in load(name)
        if (record.get("city") or "").strip().lower() in FOREIGN_CITIES
    ]
    assert not offenders, (
        f"{name}.json describes places outside Cameroon: {offenders[:6]}"
    )


def test_every_record_says_it_is_in_cameroon():
    """The field that was wrong before is now true of everything that remains."""
    for name in CATALOGUES:
        for record in load(name):
            country = (record.get("country") or "Cameroon").strip()
            assert country == "Cameroon", f"{name}.json: {record.get('name')} says {country!r}"


def test_the_catalogue_is_still_substantial():
    """A cleanup that removed most of the catalogue would be a different bug."""
    places = load("places")
    assert len(places) > 800, f"only {len(places)} places remain — too many were removed"
    assert len(load("hotels")) > 300
