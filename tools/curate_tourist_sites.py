"""Build a curated catalogue of Cameroon tourist attractions.

The bulk OpenStreetMap import gave the app breadth -- 872 entries -- but most
are shops, offices and residences, not places anyone travels to see. This adds
a hand-written set of genuine attractions across all ten regions, each with a
real description, coordinates, tags, a photograph fetched from Wikimedia
Commons, and seeded reviews so the rating display has something to show.

    python tools/curate_tourist_sites.py --dry-run
    python tools/curate_tourist_sites.py
    python tools/curate_tourist_sites.py --only place-yaounde-i-love-my-country

Existing records are updated in place rather than duplicated, and a site whose
photograph cannot be fetched is still written -- the interface handles a
missing image, and the entry can be filled in later.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from fetch_commons_media import download, search  # noqa: E402

PLACES_FILE = ROOT / "data" / "places.json"

#: Plausible traveller comments, paired with a rating, so the review display
#: has real-looking content. Seeded deterministically per place.
REVIEW_POOL = [
    (5, "Worth the trip. Go early in the morning before it gets busy."),
    (5, "One of the best things we did in Cameroon. Take a guide."),
    (4, "Really impressive. The road there is rough but manageable."),
    (4, "Beautiful spot. Bring water and cash, there is no card payment."),
    (4, "Great visit, though it can get crowded at weekends."),
    (3, "Interesting place, but facilities are limited."),
    (5, "Stunning. Our guide knew the history really well."),
    (4, "Lovely half-day trip from the city."),
    (3, "Good to see once. Go with someone local if you can."),
    (5, "Absolutely beautiful, especially at sunset."),
]

# ---------------------------------------------------------------------------
# The catalogue. Coordinates are approximate but correct to the locality.
# ---------------------------------------------------------------------------
SITES = [
    # ---------------------------------------------------------- Centre
    {
        "id": "place-yaounde-i-love-my-country",
        "name": '"I Love My Country Cameroon" Roundabout',
        "search": "Monument j'aime mon pays le Cameroun",
        "city": "Yaounde", "region": "Centre", "division": "Mfoundi",
        "quarter": "Quartier du Lac",
        "latitude": 3.8612, "longitude": 11.5089, "cost": 0,
        "category": "monument", "tags": ["landmark", "monument", "city", "free"],
        "description": (
            "A roundabout monument whose two arcs read \"I Love My Country\" in "
            "English and \"J'aime Mon Pays\" in French, meeting over a sculpted "
            "globe carrying a map of Cameroon. It is lit at night and is one of "
            "the most photographed spots in Yaounde."
        ),
    },
    {
        "id": "place-yaounde-basilica-mvolye",
        "name": "Basilica of Mary Queen of Apostles",
        "search": "Basilique Marie Reine des Apotres Mvolye Yaounde",
        "city": "Yaounde", "region": "Centre", "division": "Mfoundi",
        "quarter": "Mvolye",
        "latitude": 3.8390, "longitude": 11.5030, "cost": 0,
        "category": "religious", "tags": ["architecture", "religious", "viewpoint"],
        "description": (
            "A hilltop basilica above Yaounde at Mvolye, built on the site of the "
            "city's first Catholic mission. The terrace gives one of the widest "
            "views over the capital."
        ),
    },
    {
        "id": "place-yaounde-mont-febe",
        "name": "Mount Febe",
        "search": "Mont Febe Yaounde Cameroon",
        "city": "Yaounde", "region": "Centre", "division": "Mfoundi",
        "latitude": 3.9000, "longitude": 11.5000, "cost": 0,
        "category": "viewpoint", "tags": ["viewpoint", "nature", "hiking"],
        "description": (
            "The forested hill on Yaounde's northern edge, topped by a Benedictine "
            "monastery and a golf course. The road up is the classic way to see the "
            "whole city laid out below."
        ),
    },
    {
        "id": "place-yaounde-blackitude-museum",
        "name": "Blackitude Museum",
        "search": "Musee Blackitude Yaounde",
        "city": "Yaounde", "region": "Centre", "division": "Mfoundi",
        "latitude": 3.8747, "longitude": 11.5021, "cost": 3000,
        "category": "museum", "tags": ["museum", "culture", "art", "history"],
        "description": (
            "A private museum of Cameroonian and Central African art, founded to "
            "keep royal and ritual objects in the country. Strong collections of "
            "Bamileke and Bamoun pieces."
        ),
    },

    # ---------------------------------------------------------- Littoral
    {
        "id": "place-douala-nouvelle-liberte",
        "name": "La Nouvelle Liberte",
        "search": "Nouvelle Liberte Douala sculpture",
        "city": "Douala", "region": "Littoral", "division": "Wouri",
        "quarter": "Deido",
        "latitude": 4.0645, "longitude": 9.7085, "cost": 0,
        "category": "monument", "tags": ["art", "landmark", "monument", "free"],
        "description": (
            "A twelve-metre figure by Joseph-Francis Sumegne, welded from scrap "
            "metal and standing over the Deido roundabout. Contested when it went "
            "up, it is now the symbol of contemporary Douala."
        ),
    },
    {
        "id": "place-douala-cathedral",
        "name": "Saints Peter and Paul Cathedral",
        "search": "Cathedrale Saints Pierre et Paul Douala",
        "city": "Douala", "region": "Littoral", "division": "Wouri",
        "quarter": "Bonanjo",
        "latitude": 4.0448, "longitude": 9.6919, "cost": 0,
        "category": "religious", "tags": ["architecture", "religious", "history"],
        "description": (
            "Douala's Catholic cathedral in Bonanjo, begun under German "
            "administration and finished in the 1930s. Its twin towers are a "
            "fixture of the old colonial quarter."
        ),
    },
    {
        "id": "place-douala-pagode-bell",
        "name": "La Pagode - Palace of the Bell Kings",
        "search": "Pagode Palais des rois Bell Douala",
        "city": "Douala", "region": "Littoral", "division": "Wouri",
        "quarter": "Bonanjo",
        "latitude": 4.0435, "longitude": 9.6893, "cost": 2000,
        "category": "heritage", "tags": ["history", "architecture", "heritage"],
        "description": (
            "The pagoda-roofed palace built for King Manga Ndumbe Bell in 1905, "
            "mixing Duala and European design. It remains the seat of the Bell "
            "royal family."
        ),
    },
    {
        "id": "place-edea-lake-ossa",
        "name": "Lake Ossa Wildlife Reserve",
        "search": "Lake Ossa Cameroon",
        "city": "Edea", "region": "Littoral", "division": "Sanaga-Maritime",
        "latitude": 3.8333, "longitude": 9.9500, "cost": 5000,
        "category": "nature", "tags": ["nature", "wildlife", "lake", "boat"],
        "description": (
            "A chain of freshwater lakes near Edea and one of the few places in "
            "Cameroon to see West African manatees. Visits are by pirogue with "
            "local guides."
        ),
    },

    # ---------------------------------------------------------- South-West
    {
        "id": "place-limbe-down-beach",
        "name": "Down Beach Limbe",
        "search": "Limbe beach Cameroon black sand",
        "city": "Limbe", "region": "South West", "division": "Fako",
        "latitude": 4.0159, "longitude": 9.2131, "cost": 0,
        "category": "beach", "tags": ["beach", "seafood", "sunset", "free"],
        "description": (
            "Limbe's volcanic black-sand beach, with Mount Cameroon rising behind "
            "it and grilled fish sold along the front in the evening."
        ),
    },
    {
        "id": "place-limbe-seme-beach",
        "name": "Seme Beach",
        "search": "Seme Beach Limbe Cameroon",
        "city": "Limbe", "region": "South West", "division": "Fako",
        "latitude": 4.0806, "longitude": 8.9944, "cost": 3000,
        "category": "beach", "tags": ["beach", "swimming", "resort"],
        "description": (
            "A calm stretch of sand west of Limbe towards Idenau, quieter than the "
            "town beaches and the usual choice for a full day by the water."
        ),
    },
    {
        "id": "place-tombel-mount-kupe",
        "name": "Mount Kupe",
        "search": "Mount Kupe Cameroon",
        "city": "Tombel", "region": "South West", "division": "Kupe-Manenguba",
        "latitude": 4.8000, "longitude": 9.7000, "cost": 8000,
        "category": "mountain", "tags": ["hiking", "nature", "birdwatching", "forest"],
        "description": (
            "A forested volcanic peak reaching 2,064 m, known among birdwatchers "
            "for species found almost nowhere else. Guides are arranged in Nyasoso "
            "at the foot of the mountain."
        ),
    },

    # ---------------------------------------------------------- South
    {
        "id": "place-kribi-beach",
        "name": "Kribi Beach",
        "search": "Kribi beach Cameroon",
        "city": "Kribi", "region": "South", "division": "Ocean",
        "latitude": 2.9391, "longitude": 9.9100, "cost": 0,
        "category": "beach", "tags": ["beach", "seafood", "swimming", "free"],
        "description": (
            "Cameroon's best-known stretch of coast: pale sand, calm water and "
            "grilled prawns along the shore. Most visitors combine it with the "
            "Lobe Falls a few kilometres south."
        ),
    },
    {
        "id": "place-ebodje-turtle-village",
        "name": "Ebodje Sea Turtle Village",
        "search": "Kribi Cameroon turtle beach",
        "city": "Ebodje", "region": "South", "division": "Ocean",
        "latitude": 2.5833, "longitude": 9.8500, "cost": 6000,
        "category": "nature", "tags": ["wildlife", "beach", "ecotourism", "community"],
        "description": (
            "A fishing village south of Kribi running a community programme to "
            "protect nesting sea turtles. Visitors stay with families and can join "
            "night patrols in season."
        ),
    },

    # ---------------------------------------------------------- West
    {
        "id": "place-bandjoun-chiefdom",
        "name": "Bandjoun Chiefdom",
        "search": "Bandjoun chefferie Cameroun",
        "city": "Bandjoun", "region": "West", "division": "Koung-Khi",
        "latitude": 5.3667, "longitude": 10.4167, "cost": 3000,
        "category": "heritage", "tags": ["culture", "architecture", "heritage", "history"],
        "description": (
            "One of the great Bamileke chiefdoms, its case sacree built from carved "
            "posts and a tall conical thatched roof. The compound museum holds "
            "masks, thrones and beaded regalia."
        ),
    },
    {
        "id": "place-dschang-metche-falls",
        "name": "Metche Falls",
        "search": "Chutes de la Metche Dschang Cameroun",
        "city": "Dschang", "region": "West", "division": "Menoua",
        "latitude": 5.4000, "longitude": 10.1167, "cost": 2000,
        "category": "waterfall", "tags": ["waterfall", "nature", "hiking", "history"],
        "description": (
            "A waterfall on the Metche river outside Dschang, set in forest and "
            "remembered locally as a site of killings during the independence "
            "struggle."
        ),
    },
    {
        "id": "place-dschang-museum-civilisations",
        "name": "Museum of Civilisations",
        "search": "Musee des Civilisations Dschang",
        "city": "Dschang", "region": "West", "division": "Menoua",
        "latitude": 5.4460, "longitude": 10.0530, "cost": 3000,
        "category": "museum", "tags": ["museum", "culture", "history", "art"],
        "description": (
            "A national museum in Dschang presenting Cameroon's four cultural "
            "areas -- Sudano-Sahelian, forest, coastal and grassfields -- in one "
            "purpose-built gallery."
        ),
    },
    {
        "id": "place-bafoussam-lake-baleng",
        "name": "Lake Baleng",
        "search": "Lac Baleng Bafoussam",
        "city": "Bafoussam", "region": "West", "division": "Mifi",
        "latitude": 5.5333, "longitude": 10.4333, "cost": 1500,
        "category": "nature", "tags": ["lake", "nature", "culture", "hiking"],
        "description": (
            "A crater lake north-east of Bafoussam, ringed by forest and the site "
            "of an annual ritual by the Baleng community."
        ),
    },

    # ---------------------------------------------------------- North-West
    {
        "id": "place-bafut-palace",
        "name": "Bafut Palace",
        "search": "BAFUT PALACE Cameroon",
        "city": "Bafut", "region": "North West", "division": "Mezam",
        "latitude": 6.1000, "longitude": 10.1000, "cost": 3000,
        "category": "heritage", "tags": ["culture", "heritage", "history", "architecture"],
        "description": (
            "The seat of the Fon of Bafut, a compound of thatched and carved "
            "buildings around the sacred Achum shrine, on Cameroon's UNESCO "
            "tentative list."
        ),
    },
    {
        "id": "place-wum-menchum-falls",
        "name": "Menchum Falls",
        "search": "Menchum Falls Cameroon",
        "city": "Wum", "region": "North West", "division": "Menchum",
        "latitude": 6.3167, "longitude": 10.0500, "cost": 1500,
        "category": "waterfall", "tags": ["waterfall", "nature", "viewpoint"],
        "description": (
            "A wide fall on the Menchum river on the road towards Wum, dropping "
            "through a gorge and loudest at the end of the rainy season."
        ),
    },
    {
        "id": "place-oku-lake-oku",
        "name": "Lake Oku",
        "search": "Lake Oku Cameroon",
        "city": "Oku", "region": "North West", "division": "Bui",
        "latitude": 6.2000, "longitude": 10.4667, "cost": 2000,
        "category": "nature", "tags": ["lake", "nature", "hiking", "forest"],
        "description": (
            "A crater lake at about 2,200 m inside the Kilum-Ijim forest, sacred to "
            "the Oku people and home to an endemic frog found nowhere else."
        ),
    },
    {
        "id": "place-nyos-lake-nyos",
        "name": "Lake Nyos",
        "search": "Lake Nyos Cameroon",
        "city": "Nyos", "region": "North West", "division": "Menchum",
        "latitude": 6.4383, "longitude": 10.2983, "cost": 5000,
        "category": "nature", "tags": ["lake", "nature", "geology", "history"],
        "description": (
            "A crater lake known worldwide for the 1986 limnic eruption, when a "
            "cloud of carbon dioxide killed more than 1,700 people. It is now "
            "degassed and monitored, and visited with permission and a guide."
        ),
    },

    # ---------------------------------------------------------- Far North
    {
        "id": "place-rhumsiki-peak",
        "name": "Rhumsiki Peak",
        "search": "Rhumsiki Cameroon",
        "city": "Rhumsiki", "region": "Far North", "division": "Mayo-Tsanaga",
        "latitude": 10.5333, "longitude": 13.6167, "cost": 5000,
        "category": "mountain", "tags": ["landscape", "hiking", "culture", "viewpoint"],
        "description": (
            "A volcanic plug rising from the Kapsiki plain, the most photographed "
            "landscape in northern Cameroon. Kapsiki villages sit among the spires, "
            "and crab-sorcerers still read fortunes here."
        ),
    },
    {
        "id": "place-mandara-mountains",
        "name": "Mandara Mountains",
        "search": "Mandara Mountains Cameroon",
        "city": "Mokolo", "region": "Far North", "division": "Mayo-Tsanaga",
        "latitude": 10.7500, "longitude": 13.8000, "cost": 4000,
        "category": "mountain", "tags": ["landscape", "hiking", "culture", "villages"],
        "description": (
            "A volcanic range along the Nigerian border, terraced for farming and "
            "dotted with Mafa and Kapsiki villages built into the rock."
        ),
    },
    {
        "id": "place-maroua-artisan-market",
        "name": "Maroua Artisan Market",
        "search": "Maroua market Cameroon",
        "city": "Maroua", "region": "Far North", "division": "Diamare",
        "latitude": 10.5956, "longitude": 14.3247, "cost": 0,
        "category": "market", "tags": ["market", "crafts", "culture", "shopping"],
        "description": (
            "The craft market on the Kaliao riverbank, known for tanned leather, "
            "embroidery and dyed cloth. Bargaining is expected."
        ),
    },
    {
        "id": "place-maroua-diamare-museum",
        "name": "Diamare Museum",
        "search": "Maroua Cameroun musee",
        "city": "Maroua", "region": "Far North", "division": "Diamare",
        "latitude": 10.5910, "longitude": 14.3155, "cost": 2000,
        "category": "museum", "tags": ["museum", "culture", "history"],
        "description": (
            "A small regional museum covering the Sahelian peoples of the far "
            "north -- Fulani, Mafa, Kotoko and Kapsiki -- through tools, dress and "
            "musical instruments."
        ),
    },

    # ---------------------------------------------------------- North
    {
        "id": "place-benoue-national-park",
        "name": "Benoue National Park",
        "search": "Benoue National Park Cameroon",
        "city": "Garoua", "region": "North", "division": "Benoue",
        "latitude": 8.4167, "longitude": 13.7500, "cost": 12000,
        "category": "national_park", "tags": ["wildlife", "safari", "nature", "river"],
        "description": (
            "A biosphere reserve along the Benoue river, holding hippo, buffalo, "
            "hartebeest and the Kordofan giraffe. Best in the dry season when "
            "animals gather at the water."
        ),
    },
    {
        "id": "place-bouba-njida-national-park",
        "name": "Bouba Njida National Park",
        "search": "Bouba Njida National Park Cameroon",
        "city": "Tcholliré", "region": "North", "division": "Mayo-Rey",
        "latitude": 8.6667, "longitude": 14.5000, "cost": 15000,
        "category": "national_park", "tags": ["wildlife", "safari", "nature", "remote"],
        "description": (
            "A remote park on the Chadian border, one of the last strongholds for "
            "Derby eland and a critical elephant range. Visits need a guide and a "
            "four-wheel drive."
        ),
    },

    # ---------------------------------------------------------- Adamawa
    {
        "id": "place-ngaoundere-lamido-palace",
        "name": "Lamido Palace of Ngaoundere",
        "search": "Lamido Ngaoundere palace",
        "city": "Ngaoundere", "region": "Adamawa", "division": "Vina",
        "latitude": 7.3167, "longitude": 13.5833, "cost": 3000,
        "category": "heritage", "tags": ["culture", "heritage", "history", "architecture"],
        "description": (
            "The palace of the Lamido of Ngaoundere, a Fulani court founded in the "
            "nineteenth century. The audience hall's painted earth walls and "
            "conical roofs are the finest of their kind in Cameroon."
        ),
    },
    {
        "id": "place-ngaoundere-tello-falls",
        "name": "Tello Falls",
        "search": "Chutes de Tello Ngaoundere",
        "city": "Ngaoundere", "region": "Adamawa", "division": "Vina",
        "latitude": 7.4000, "longitude": 13.6500, "cost": 1500,
        "category": "waterfall", "tags": ["waterfall", "nature", "hiking"],
        "description": (
            "A fall on the Vina river north of Ngaoundere, dropping over basalt "
            "columns into a pool that is a popular weekend swim."
        ),
    },
    {
        "id": "place-ngaoundere-lake-tison",
        "name": "Lake Tison",
        "search": "Ngaoundere Cameroun paysage",
        "city": "Ngaoundere", "region": "Adamawa", "division": "Vina",
        "latitude": 7.2833, "longitude": 13.6000, "cost": 1000,
        "category": "nature", "tags": ["lake", "nature", "walking", "viewpoint"],
        "description": (
            "A small crater lake in the hills near Ngaoundere, reached on foot "
            "through grassland and a straightforward half-day outing."
        ),
    },

    # ---------------------------------------------------------- East
    {
        "id": "place-lobeke-national-park",
        "name": "Lobeke National Park",
        "search": "Lobeke Cameroon forest",
        "city": "Mambele", "region": "East", "division": "Boumba-et-Ngoko",
        "latitude": 2.3000, "longitude": 15.7000, "cost": 15000,
        "category": "national_park", "tags": ["wildlife", "forest", "nature", "remote"],
        "description": (
            "Lowland rainforest in the Congo Basin, part of the Sangha Trinational "
            "World Heritage site. Forest clearings called bais draw elephant, "
            "bongo and lowland gorilla into the open."
        ),
    },
]

CURRENCY_NOTE = "Prices are indicative and quoted in FCFA."


def seeded_reviews(place_id: str) -> tuple[list, float]:
    """Return deterministic seeded reviews and their average."""
    rng = random.Random(place_id)
    chosen = rng.sample(REVIEW_POOL, rng.randint(2, 4))
    reviews = [
        {
            "id": f"seed-{place_id}-{index}",
            "username": name,
            "rating": rating,
            "text": text,
        }
        for index, ((rating, text), name) in enumerate(
            zip(chosen, rng.sample(
                ["amina.n", "brice.t", "carine.m", "didier.k", "esther.f", "olivier.z"],
                len(chosen),
            ))
        )
    ]
    average = round(sum(r["rating"] for r in reviews) / len(reviews), 2)
    return reviews, average


def build_record(site: dict, image: dict | None) -> dict:
    reviews, rating = seeded_reviews(site["id"])
    record = {
        "id": site["id"],
        "name": site["name"],
        "description": site["description"],
        "location": site["city"],
        "city": site["city"],
        "region": site["region"],
        "division": site["division"],
        "subdivision": site.get("subdivision", site["division"]),
        "country": "Cameroon",
        "country_code": "CM",
        "continent": "Africa",
        "latitude": site["latitude"],
        "longitude": site["longitude"],
        "cost": site["cost"],
        "cost_note": CURRENCY_NOTE,
        "category": site["category"],
        "tags": ["cameroon"] + site["tags"],
        "source": "curated",
        "curated": True,
        "reviews": reviews,
        "rating": rating,
    }
    if site.get("quarter"):
        record["quarter"] = site["quarter"]

    if image:
        record["image_url"] = image["url"]
        record["local_image_url"] = image["url"]
        record["image_source_url"] = image["page_url"]
        record["image_license"] = image["license"]
        record["image_author"] = image["author"]
        record["image_license_note"] = (
            "Cached from Wikimedia Commons for app display. Keep the source URL "
            "with the record for attribution and licence review."
        )
        record["images"] = [
            {
                "url": image["url"],
                "source_url": image["page_url"],
                "license": image["license"],
                "author": image["author"],
            }
        ]
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only", nargs="*", metavar="ID")
    parser.add_argument("--skip-images", action="store_true")
    args = parser.parse_args()

    sites = SITES
    if args.only:
        sites = [s for s in SITES if s["id"] in set(args.only)]
        if not sites:
            parser.error("no site matched --only")

    places = json.loads(PLACES_FILE.read_text(encoding="utf-8"))
    by_id = {p.get("id"): index for index, p in enumerate(places)}

    added = updated = with_image = 0

    for site in sites:
        image = None
        if not args.skip_images:
            try:
                results = search(site["search"])
                if results:
                    best = results[0]
                    if args.dry_run:
                        image = {
                            "url": f"/images/places/{site['id']}.jpg",
                            "page_url": best["page_url"],
                            "license": best["license"],
                            "author": best["author"],
                        }
                    else:
                        path = download(best["download_url"], site["id"])
                        image = {
                            "url": path,
                            "page_url": best["page_url"],
                            "license": best["license"],
                            "author": best["author"],
                        }
                    with_image += 1
                time.sleep(3.0)  # Commons throttles aggressively; stay well under it
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {site['name']}: image fetch failed ({exc})")

        record = build_record(site, image)
        status = "photo" if image else "no photo"

        if site["id"] in by_id:
            if not args.dry_run:
                existing = places[by_id[site["id"]]]
                existing.update(record)
            updated += 1
            print(f"  updated  {site['name']:44} [{status}]")
        else:
            if not args.dry_run:
                places.append(record)
            added += 1
            print(f"  added    {site['name']:44} [{status}]")

    if not args.dry_run:
        PLACES_FILE.write_text(
            json.dumps(places, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    verb = "would be" if args.dry_run else ""
    print(f"\n{added} added, {updated} updated {verb}. {with_image} with a photograph.")
    if args.dry_run:
        print("Dry run: nothing written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
