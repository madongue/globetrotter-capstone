"""Cameroon-focused geography and Google Maps location helpers."""

import re

CAMEROON_COUNTRY = "Cameroon"
CAMEROON_COUNTRY_CODE = "CM"

CAMEROON_GEOGRAPHY = [
    {
        "region": "Adamawa",
        "divisions": [
            {"name": "Vina", "subdivisions": [{"name": "Ngaoundere I", "cities": [{"name": "Ngaoundere", "quarters": ["Centre Commercial", "Joli Soir", "Sabongari"]}]}]},
            {"name": "Mbere", "subdivisions": [{"name": "Meiganga", "cities": [{"name": "Meiganga", "quarters": ["Centre Ville", "Gare Routiere"]}]}]},
        ],
    },
    {
        "region": "Centre",
        "divisions": [
            {"name": "Mfoundi", "subdivisions": [{"name": "Yaounde I", "cities": [{"name": "Yaounde", "quarters": ["Bastos", "Mokolo", "Melen", "Etoudi", "Ngoa-Ekelle", "Mvog-Ada"]}]}]},
            {"name": "Nyong-et-Kelle", "subdivisions": [{"name": "Eseka", "cities": [{"name": "Eseka", "quarters": ["Centre Ville", "Gare"]}]}]},
        ],
    },
    {
        "region": "East",
        "divisions": [
            {"name": "Lom-et-Djerem", "subdivisions": [{"name": "Bertoua I", "cities": [{"name": "Bertoua", "quarters": ["Mokolo", "Nkolbikon", "Tigaza"]}]}]},
            {"name": "Kadey", "subdivisions": [{"name": "Batouri", "cities": [{"name": "Batouri", "quarters": ["Centre Ville", "Mokolo"]}]}]},
        ],
    },
    {
        "region": "Far North",
        "divisions": [
            {"name": "Diamare", "subdivisions": [{"name": "Maroua I", "cities": [{"name": "Maroua", "quarters": ["Domayo", "Djarengol", "Pitoare"]}]}]},
            {"name": "Mayo-Sava", "subdivisions": [{"name": "Mora", "cities": [{"name": "Mora", "quarters": ["Centre Ville", "Mandara"]}]}]},
        ],
    },
    {
        "region": "Littoral",
        "divisions": [
            {"name": "Wouri", "subdivisions": [{"name": "Douala I", "cities": [{"name": "Douala", "quarters": ["Akwa", "Bonanjo", "Bonapriso", "Deido", "Bali", "Makepe"]}]}]},
            {"name": "Sanaga-Maritime", "subdivisions": [{"name": "Edea I", "cities": [{"name": "Edea", "quarters": ["Centre Ville", "Pongo"]}]}]},
            {"name": "Moungo", "subdivisions": [{"name": "Nkongsamba I", "cities": [{"name": "Nkongsamba", "quarters": ["Centre Ville", "Poola"]}]}]},
        ],
    },
    {
        "region": "North",
        "divisions": [
            {"name": "Benoue", "subdivisions": [{"name": "Garoua I", "cities": [{"name": "Garoua", "quarters": ["Plateau", "Roumde Adjia", "Poumpoumre"]}]}]},
            {"name": "Mayo-Louti", "subdivisions": [{"name": "Guider", "cities": [{"name": "Guider", "quarters": ["Centre Ville", "Mayo-Louti"]}]}]},
        ],
    },
    {
        "region": "North West",
        "divisions": [
            {"name": "Mezam", "subdivisions": [{"name": "Bamenda I", "cities": [{"name": "Bamenda", "quarters": ["Commercial Avenue", "Mankon", "Nkwen", "Up Station"]}]}]},
            {"name": "Bui", "subdivisions": [{"name": "Kumbo", "cities": [{"name": "Kumbo", "quarters": ["Tobin", "Squares"]}]}]},
        ],
    },
    {
        "region": "South",
        "divisions": [
            {"name": "Ocean", "subdivisions": [{"name": "Kribi I", "cities": [{"name": "Kribi", "quarters": ["Centre Ville", "Mboa Manga", "Londji", "Grand Batanga"]}]}]},
            {"name": "Mvila", "subdivisions": [{"name": "Ebolowa I", "cities": [{"name": "Ebolowa", "quarters": ["Angale", "Nko'ovos"]}]}]},
        ],
    },
    {
        "region": "South West",
        "divisions": [
            {"name": "Fako", "subdivisions": [{"name": "Buea", "cities": [{"name": "Buea", "quarters": ["Molyko", "Great Soppo", "Bonduma", "Mile 17"]}, {"name": "Limbe", "quarters": ["Down Beach", "Mile 4", "Bota", "Mokunda"]}]}]},
            {"name": "Meme", "subdivisions": [{"name": "Kumba I", "cities": [{"name": "Kumba", "quarters": ["Kosala", "Fiango", "Buea Road"]}]}]},
        ],
    },
    {
        "region": "West",
        "divisions": [
            {"name": "Mifi", "subdivisions": [{"name": "Bafoussam I", "cities": [{"name": "Bafoussam", "quarters": ["Tamja", "Djeleng", "Banengo"]}]}]},
            {"name": "Menoua", "subdivisions": [{"name": "Dschang", "cities": [{"name": "Dschang", "quarters": ["Foto", "Foreke", "Campus"]}]}]},
            {"name": "Noun", "subdivisions": [{"name": "Foumban", "cities": [{"name": "Foumban", "quarters": ["Njinka", "Centre Ville"]}]}]},
        ],
    },
]


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower().replace("é", "e").replace("è", "e").replace("'", "")


def _contains_location_value(text: str, value: str) -> bool:
    normalized_value = _normalize(value)
    if not normalized_value:
        return False
    return re.search(rf"(?<![a-z0-9]){re.escape(normalized_value)}(?![a-z0-9])", text) is not None


def iter_location_units():
    for region in CAMEROON_GEOGRAPHY:
        for division in region["divisions"]:
            for subdivision in division["subdivisions"]:
                for city in subdivision["cities"]:
                    yield {
                        "region": region["region"],
                        "division": division["name"],
                        "subdivision": subdivision["name"],
                        "city": city["name"],
                        "quarters": city.get("quarters", []),
                    }


def cameroon_location_payload() -> dict:
    return {
        "country": CAMEROON_COUNTRY,
        "country_code": CAMEROON_COUNTRY_CODE,
        "regions": CAMEROON_GEOGRAPHY,
    }


def infer_cameroon_geo(*parts: str) -> dict:
    text = _normalize(" ".join(part for part in parts if part))
    best = {}
    best_score = 0
    for unit in iter_location_units():
        values = [unit["region"], unit["division"], unit["subdivision"], unit["city"], *unit["quarters"]]
        matched_values = [_normalize(value) for value in values if _contains_location_value(text, value)]
        if matched_values and max(len(value) for value in matched_values) > best_score:
            best_score = max(len(value) for value in matched_values)
            best = {
                "country": CAMEROON_COUNTRY,
                "country_code": CAMEROON_COUNTRY_CODE,
                "region": unit["region"],
                "division": unit["division"],
                "subdivision": unit["subdivision"],
                "city": unit["city"],
                "quarters": unit["quarters"],
            }
            for quarter in unit["quarters"]:
                if _contains_location_value(text, quarter):
                    best["quarter"] = quarter
                    break
    if best:
        return best
    return {"country": CAMEROON_COUNTRY, "country_code": CAMEROON_COUNTRY_CODE}


def ensure_cameroon_location(location: str) -> str:
    location = (location or "").strip()
    if not location:
        return CAMEROON_COUNTRY
    normalized = _normalize(location)
    if "cameroon" in normalized or "cameroun" in normalized:
        return location
    return f"{location}, {CAMEROON_COUNTRY}"


def location_search_text(item: dict) -> str:
    values = [
        item.get("name", ""),
        item.get("location", ""),
        item.get("country", ""),
        item.get("region", ""),
        item.get("division", ""),
        item.get("subdivision", ""),
        item.get("city", ""),
        item.get("quarter", ""),
        item.get("description", ""),
        " ".join(item.get("quarters", [])),
        " ".join(item.get("tags", [])),
    ]
    return _normalize(" ".join(value for value in values if value))


def enrich_cameroon_item(item: dict) -> dict:
    enriched = dict(item)
    geo = infer_cameroon_geo(
        enriched.get("name", ""),
        enriched.get("location", ""),
        enriched.get("description", ""),
        enriched.get("region", ""),
        enriched.get("division", ""),
        enriched.get("subdivision", ""),
        enriched.get("city", ""),
        enriched.get("quarter", ""),
    )
    for key, value in geo.items():
        enriched.setdefault(key, value)
    enriched["country"] = CAMEROON_COUNTRY
    enriched["country_code"] = CAMEROON_COUNTRY_CODE
    enriched["continent"] = "Africa"
    enriched["location"] = ensure_cameroon_location(enriched.get("location") or enriched.get("name", ""))
    _attach_travel_metadata(enriched)
    return enriched


def _attach_travel_metadata(item: dict) -> None:
    tags = " ".join(item.get("tags", [])).lower()
    text = _normalize(" ".join([
        item.get("name", ""),
        item.get("description", ""),
        tags,
    ]))
    is_outdoor = any(term in text for term in ["hiking", "mountain", "waterfall", "national park", "wildlife", "lake", "rainforest", "nature"])
    if not is_outdoor:
        return

    if any(term in text for term in ["mountain", "hiking", "manengouba"]):
        difficulty = "hard"
        guide_required = True
        transport_note = "Use a local guide and confirm trail access, weather, and pickup transport before departure."
    elif any(term in text for term in ["national park", "wildlife", "rainforest", "safari"]):
        difficulty = "moderate"
        guide_required = True
        transport_note = "Plan with a licensed guide or park operator; road conditions and access points can change seasonally."
    elif any(term in text for term in ["waterfall", "lake"]):
        difficulty = "moderate"
        guide_required = True
        transport_note = "Use local transport or a verified guide for the last-mile access road and site entry."
    else:
        difficulty = "easy"
        guide_required = False
        transport_note = "Confirm local taxi, moto, or private-car access before travel."

    item.setdefault("difficulty", difficulty)
    item.setdefault("guide_required", guide_required)
    item.setdefault("best_season", "Dry season is usually easier for road access; confirm current local conditions before travel.")
    item.setdefault("transport_note", transport_note)
    item.setdefault("safety_notes", [
        "Confirm current security and weather conditions locally before departure.",
        "Travel with a charged phone, water, and FCFA cash for entry, guide, and transport fees.",
    ])


def matches_cameroon_filters(item: dict, filters: dict) -> bool:
    searchable = location_search_text(item)
    for field in ("region", "division", "subdivision", "city", "quarter", "location"):
        expected = _normalize(filters.get(field))
        if expected and expected not in searchable:
            return False
    return True
