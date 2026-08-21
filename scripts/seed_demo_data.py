"""Populate a GlobeTrotter instance with believable demo data.

An empty app demos badly: every counter reads zero and the community feed is
blank. This fills it through the public API -- the same endpoints a real user
hits -- so nothing here depends on which storage backend is configured, and it
works against a local server or a deployed one.

    python scripts/seed_demo_data.py                         # localhost:5000
    python scripts/seed_demo_data.py --base-url https://your-app.onrender.com

Re-running reuses existing accounts rather than duplicating them, but it does
add another set of trips and posts each time. That is harmless for a demo --
it just makes the app look busier -- but run it once if you want exact counts.

Note on rate limits: /login allows 5 attempts per minute, so the script signs
in as only a handful of accounts and registers the rest without logging in.
Registration alone is enough for a traveller to count towards the platform
figures.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:5000"
PASSWORD = "GlobeTrotter2026"

#: Registered but not signed in -- enough to make the community look populated.
TRAVELLERS = [
    "amina.n", "brice.t", "carine.m", "didier.k", "esther.f", "fabrice.o",
    "grace.b", "herve.n", "ingrid.s", "junior.w", "kelly.a", "landry.p",
    "murielle.d", "nadege.y", "olivier.z", "pascale.r", "quentin.l",
    "rosine.e", "samuel.g", "therese.v",
]

#: These sign in and actually create content.
PLANNERS = ["awa.travels", "bilo.explores", "cyrille.trips", "diane.journeys"]

TRIPS = [
    {
        "owner": "awa.travels",
        "title": "Kribi beaches and Lobe Falls",
        "location": "Kribi",
        "start_date": "2026-09-12",
        "end_date": "2026-09-16",
        "public": True,
        "payment": 85000,
    },
    {
        "owner": "bilo.explores",
        "title": "Mount Cameroon trek from Buea",
        "location": "Buea",
        "start_date": "2026-10-03",
        "end_date": "2026-10-07",
        "public": True,
        "payment": 120000,
    },
    {
        "owner": "cyrille.trips",
        "title": "Foumban palace and Bamoun crafts",
        "location": "Foumban",
        "start_date": "2026-09-25",
        "end_date": "2026-09-28",
        "public": True,
        "payment": 65000,
    },
    {
        "owner": "diane.journeys",
        "title": "Limbe wildlife and black sand coast",
        "location": "Limbe",
        "start_date": "2026-11-08",
        "end_date": "2026-11-11",
        "public": False,
        "payment": 0,
    },
    {
        "owner": "awa.travels",
        "title": "Yaounde city weekend",
        "location": "Yaounde",
        "start_date": "2026-12-05",
        "end_date": "2026-12-07",
        "public": False,
        "payment": 40000,
    },
]

POSTS = [
    ("awa.travels", "Sunset over the Lobe Falls where the river meets the sea."),
    ("bilo.explores", "Above the clouds on the Mount Cameroon ascent."),
    ("cyrille.trips", "Bamoun brasswork at the Foumban craft market."),
    ("diane.journeys", "Black sand and palm shade along the Limbe coast."),
]

GROUPS = [
    ("awa.travels", "Cameroon Coast Explorers", "Kribi, Limbe and everything along the Atlantic."),
    ("bilo.explores", "Highland Trekkers", "Mount Cameroon, Manengouba and the western highlands."),
]


def phone_for(index: int) -> str:
    """A distinct, valid-looking Cameroonian mobile number per account."""
    return f"+2376{5000000 + index * 7919:07d}"[:13]


class Api:
    def __init__(self, base_url: str, verbose: bool = False):
        self.base = base_url.rstrip("/") + "/api"
        self.verbose = verbose

    def call(self, method: str, path: str, payload=None, token=None, retries=3):
        url = f"{self.base}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", f"Bearer {token}")

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read().decode()
                return response.status, (json.loads(body) if body else None)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            # /login is throttled; wait out the window rather than failing the seed.
            if exc.code == 429 and retries > 0:
                if self.verbose:
                    print("    rate limited, waiting 60s...")
                time.sleep(60)
                return self.call(method, path, payload, token, retries - 1)
            try:
                return exc.code, json.loads(body)
            except ValueError:
                return exc.code, {"error": body[:200]}
        except urllib.error.URLError as exc:
            raise SystemExit(f"\nCannot reach {url}\n  {exc.reason}\n")

    def register(self, username: str, index: int) -> bool:
        status, _ = self.call(
            "POST",
            "/register",
            {"username": username, "password": PASSWORD, "phone": phone_for(index)},
        )
        return status in (201, 409)

    def login(self, username: str) -> str | None:
        status, body = self.call(
            "POST", "/login", {"username": username, "password": PASSWORD}
        )
        if status == 200 and body:
            return body.get("token")
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE, help=f"default: {DEFAULT_BASE}")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    api = Api(args.base_url, args.verbose)
    print(f"Seeding {args.base_url}\n")

    status, _ = api.call("GET", "/health")
    if status != 200:
        raise SystemExit(f"App is not healthy at {args.base_url} (status {status})")

    # --- travellers --------------------------------------------------------
    print("Registering travellers")
    registered = 0
    for index, username in enumerate(TRAVELLERS):
        if api.register(username, index):
            registered += 1
    print(f"  {registered}/{len(TRAVELLERS)} accounts ready")

    # --- planners ----------------------------------------------------------
    print("\nSigning in the accounts that create content")
    tokens: dict[str, str] = {}
    for offset, username in enumerate(PLANNERS):
        api.register(username, len(TRAVELLERS) + offset)
        token = api.login(username)
        if token:
            tokens[username] = token
            print(f"  {username}")
        else:
            print(f"  {username} -- could not sign in, skipping their content")

    if not tokens:
        raise SystemExit("No planner accounts could sign in; nothing further to seed.")

    # --- trips -------------------------------------------------------------
    print("\nCreating trips")
    created = 0
    for trip in TRIPS:
        token = tokens.get(trip["owner"])
        if not token:
            continue
        status, body = api.call(
            "POST",
            "/itineraries",
            {
                "title": trip["title"],
                "location": trip["location"],
                "start_date": trip["start_date"],
                "end_date": trip["end_date"],
            },
            token=token,
        )
        if status != 201 or not body:
            print(f"  {trip['title']} -- failed ({status})")
            continue
        trip_id = body.get("id")
        created += 1
        print(f"  {trip['title']}")

        if trip["public"]:
            api.call(
                "PUT", f"/itineraries/{trip_id}", {"visibility": "public"}, token=token
            )
        if trip["payment"]:
            api.call(
                "POST",
                f"/itineraries/{trip_id}/pay",
                {"amount": trip["payment"]},
                token=token,
            )
    print(f"  {created} trip(s) created")

    # --- groups ------------------------------------------------------------
    print("\nCreating community groups")
    for owner, name, description in GROUPS:
        token = tokens.get(owner)
        if not token:
            continue
        status, _ = api.call(
            "POST", "/groups", {"name": name, "description": description}, token=token
        )
        if status == 201:
            print(f"  {name}")

    # --- feed --------------------------------------------------------------
    print("\nPosting to the community feed")
    for owner, caption in POSTS:
        token = tokens.get(owner)
        if not token:
            continue
        status, _ = api.call(
            "POST",
            "/media",
            {"type": "photo", "url": "/images/destinations/Douala.JPG", "caption": caption},
            token=token,
        )
        if status == 201:
            print(f"  {caption[:52]}...")

    # --- result ------------------------------------------------------------
    status, stats = api.call("GET", "/stats")
    print("\n" + "-" * 46)
    if status == 200 and stats:
        print("Platform now shows")
        for key in (
            "total_travellers", "active_today", "joined_this_week",
            "total_trips", "public_trips",
        ):
            print(f"  {key:20} {stats.get(key)}")
    print("-" * 46)
    print(f"\nEvery demo account uses the password: {PASSWORD}")
    print(f"Sign in as {PLANNERS[0]} to show a populated dashboard.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
