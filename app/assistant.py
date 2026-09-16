"""
app/assistant.py

A travel assistant that answers questions about Cameroon travel, the user's own
trips, and how to use GlobeTrotter.

Where the answers come from
---------------------------
Every answer is grounded in data the application already holds — the 845-place
catalogue, the hotel list, and the asking user's own itineraries — or in a short
set of written explanations of how the app works. Nothing is invented, and every
factual answer carries the records it was built from, so a claim on screen can
be traced to a row in the catalogue.

This matters more than it might seem. A travel assistant that guesses opening
times or invents a hotel is worse than no assistant at all, because a traveller
cannot tell the difference until they arrive. Refusing to answer is the correct
behaviour when the catalogue is silent.

An optional language model
--------------------------
If ``ANTHROPIC_API_KEY`` is set, the same grounded facts are handed to a model
to phrase more naturally. The retrieved facts are unchanged either way — the
model rewrites, it does not research. With no key set the assistant works
exactly as well, just in plainer sentences, which keeps it dependable in a
demonstration and free to run.

Routes
------
POST /assistant/chat      – ask a question, get a grounded answer
GET  /assistant/starters  – suggested opening questions

Both are usable signed out; signing in adds answers about your own trips.
"""
import os
import re

from flask import Blueprint, current_app, jsonify, request

from app.auth import get_current_user
from app.cameroon_geo import iter_location_units
from app.models import (
    get_all_activities,
    get_all_groups,
    get_all_hotels,
    get_all_itineraries,
    get_all_media,
    get_all_place_requests,
    get_all_places,
    get_all_users,
    get_itineraries_for_user,
    get_user_by_username,
)

assistant_bp = Blueprint("assistant", __name__)

MAX_MESSAGE_LENGTH = 500

#: How many catalogue records a single answer will cite.
MAX_RESULTS = 5


# ---------------------------------------------------------------------------
# How-to answers
#
# Written here rather than fetched, because they describe this application and
# would otherwise be exactly the kind of thing a language model invents.
# ---------------------------------------------------------------------------

HOW_TO = {
    "create": {
        "keywords": ("create", "make", "start", "new", "plan", "build", "how do i plan"),
        "title": "Planning a trip",
        "answer": (
            "Open Itineraries in the sidebar. The first panel is \"Plan a trip in one "
            "step\": type where you are going, choose how many days, and press Build my "
            "itinerary. The whole plan — hotel, places and checkpoints — is filled in "
            "from the Cameroon catalogue, and you can change any of it afterwards. "
            "If you would rather fill everything in yourself, the longer form is "
            "further down the same page."
        ),
    },
    "checkpoint": {
        "keywords": ("checkpoint", "stage", "swap", "reorder", "order", "move", "rearrange"),
        "title": "Changing the order of your stops",
        "answer": (
            "Open a trip and scroll to Trip stages. Each checkpoint has four controls: "
            "the up and down arrows swap it with its neighbour, Edit changes the name, "
            "cost or duration, and Remove drops it. Every change is saved straight "
            "away, and the map and progress panel follow the new order."
        ),
    },
    "share": {
        "keywords": ("share", "shared", "friend", "together", "collaborate", "invite"),
        "title": "Sharing a trip",
        "answer": (
            "Open the trip and use the Share panel. Enter the username of the traveller "
            "you want to share with and choose whether they may view or edit. You can "
            "also make a trip public so other travellers can find and copy it."
        ),
    },
    "pay": {
        "keywords": ("pay", "payment", "mobile money", "receipt", "booking", "book", "reserve"),
        "title": "Payments and bookings",
        "answer": (
            "Each trip has a Payments panel. Choose what you are paying for — the whole "
            "trip, a hotel or a single activity — enter the amount and the method, and a "
            "receipt is recorded against the trip. Reservations are tracked separately "
            "so you can see what is confirmed and what is still pending."
        ),
    },
    "media": {
        "keywords": ("photo", "picture", "image", "video", "upload", "media", "gallery"),
        "title": "Photos and videos",
        "answer": (
            "The Media page holds photos and videos, and you can attach them to a place "
            "so other travellers see them on that place's page. Use the upload form on "
            "the Media page, or the camera control on a place you have visited."
        ),
    },
    "group": {
        "keywords": ("group", "community", "discussion", "forum", "chat with", "members"),
        "title": "Community groups",
        "answer": (
            "The Community page lists travel groups. Join one to read and post in its "
            "discussions, share trips with its members, and see what other people are "
            "planning. You can also create a group of your own."
        ),
    },
    "account": {
        "keywords": ("password", "login", "sign in", "account", "register", "forgot"),
        "title": "Your account",
        "answer": (
            "Register with a username, a phone number and a password. If you forget the "
            "password, use Forgot password on the sign-in screen to get a reset link. "
            "Your profile and preferences live on the Settings page."
        ),
    },
}


# ---------------------------------------------------------------------------
# General Cameroon travel guidance
#
# Deliberately short and non-committal. Anything that changes — prices, opening
# hours, visa rules, security conditions — is answered by pointing at an
# authority rather than by asserting a value that may be a year out of date.
# ---------------------------------------------------------------------------

GUIDANCE = {
    "when": {
        "keywords": ("when", "best time", "season", "weather", "rain", "dry", "climate"),
        "title": "When to travel",
        "answer": (
            "Cameroon has two broad seasons. The dry season, roughly November to "
            "February in the south and October to April in the north, is the easier time "
            "to travel — roads are more reliable and the coast and parks are at their "
            "best. The rainy season brings heavier travel times, especially on unpaved "
            "roads. Conditions vary a lot by region, so check locally close to your "
            "dates."
        ),
    },
    "money": {
        "keywords": ("currency", "money", "cash", "fcfa", "franc", "exchange", "card"),
        "title": "Money",
        "answer": (
            "Prices in GlobeTrotter are in Central African CFA francs (FCFA). Cash and "
            "mobile money are widely used; card acceptance is limited outside larger "
            "hotels in Douala and Yaoundé. Carry small notes for transport and markets."
        ),
    },
    "safety": {
        "keywords": ("safe", "safety", "danger", "security", "risk"),
        "title": "Safety",
        "answer": (
            "Conditions differ sharply between regions and can change, so this is not "
            "something to take from an app. Check your own government's current travel "
            "advice for Cameroon before booking, and ask locally once you arrive. For "
            "everyday care: keep valuables out of sight, agree taxi fares before "
            "setting off, and travel between towns during daylight."
        ),
    },
    "visa": {
        "keywords": ("visa", "passport", "entry", "vaccination", "yellow fever", "border"),
        "title": "Entry requirements",
        "answer": (
            "Entry rules and vaccination requirements depend on your nationality and "
            "change without notice, so check with a Cameroonian embassy or consulate "
            "rather than relying on this app. Yellow fever vaccination is commonly "
            "required — confirm what applies to you well before you travel."
        ),
    },
    "language": {
        "keywords": ("language", "speak", "french", "english", "translate"),
        "title": "Languages",
        "answer": (
            "Cameroon is officially bilingual: French is dominant in most regions, "
            "English in the North West and South West. Many other languages are spoken "
            "locally. GlobeTrotter itself is available in English and French — use the "
            "picker in the header."
        ),
    },
}


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())


def _known_cities() -> list:
    """Every city name the Cameroon geography knows, longest first.

    Longest first so that a message mentioning "Buea" does not match a shorter
    city name contained inside another word.
    """
    names = {unit["city"] for unit in iter_location_units() if unit.get("city")}
    return sorted(names, key=len, reverse=True)


def _find_location(message: str) -> str | None:
    """Return the Cameroon city named in the message, if any."""
    text = _normalise(message)
    for city in _known_cities():
        if re.search(rf"\b{re.escape(_normalise(city).strip())}\b", text):
            return city
    return None


def _matches(message: str, keywords) -> bool:
    text = _normalise(message)
    return any(re.search(rf"\b{re.escape(word)}\b", text) for word in keywords)


def _record_summary(record: dict, cost_field: str = "cost") -> dict:
    """Trim a catalogue record to what an answer needs to show and cite."""
    return {
        "id": record.get("id"),
        "name": record.get("name", ""),
        "location": record.get("location", ""),
        "category": record.get("category", ""),
        "cost": record.get(cost_field, 0) or 0,
        # Most catalogue records carry a stand-in photograph of the surrounding
        # city rather than of themselves. Showing one beside a named place
        # claims it is a picture of that place, so a contextual image is left
        # out and the entry simply appears without one.
        "image_url": "" if record.get("image_is_contextual") else record.get("image_url", ""),
    }


def _in_location(records: list, city: str) -> list:
    needle = _normalise(city).strip()
    found = []
    for record in records:
        haystack = _normalise(
            " ".join([
                record.get("location", ""),
                record.get("city", ""),
                record.get("division", ""),
                record.get("region", ""),
            ])
        )
        if needle and needle in haystack:
            found.append(record)
    return found


# Categories that make a place worth recommending, best first. Mirrors the
# ranking the itinerary generator uses so the assistant and the planner do not
# disagree about what is worth seeing.
SIGHTSEEING_ORDER = (
    "national_park", "waterfall", "beach", "mountain", "natural_site", "nature",
    "viewpoint", "museum", "heritage", "monument", "religious", "market",
    "man_made_site",
)


def _rank(record: dict) -> tuple:
    category = (record.get("category") or "").lower()
    try:
        position = SIGHTSEEING_ORDER.index(category)
    except ValueError:
        position = len(SIGHTSEEING_ORDER)
    return (0 if record.get("curated") else 1, position, record.get("name", ""))


# Imported records sometimes carry only their type as a name. Recommending a
# hotel called "Hotel", or pricing a trip from one, reads as a missing value.
GENERIC_NAMES = {"hotel", "hôtel", "motel", "auberge", "lodge", "restaurant", "bar"}


def _drop_generic_names(records: list) -> list:
    """Prefer properly named records, falling back if that leaves nothing."""
    named = [r for r in records if (r.get("name") or "").strip().lower() not in GENERIC_NAMES]
    return named or records


def _is_how_to_question(message: str) -> bool:
    """True for "how do I …" phrasing, which asks about the app, not a place.

    Without this, "How do I share a trip?" is captured by the trip-planning
    intent — it does contain the word "trip" — and the traveller is told how to
    build an itinerary when they asked how to share one.
    """
    text = _normalise(message).strip()
    return bool(re.match(r"^(how (do|can|would) i|how to|where do i|can i)\b", text))


def _money(amount) -> str:
    try:
        return f"{float(amount):,.0f} FCFA"
    except (TypeError, ValueError):
        return "price unknown"


# ---------------------------------------------------------------------------
# Answer builders. Each returns (reply, sources, suggestions) or None when it
# has nothing to say, so the router can fall through to the next one.
# ---------------------------------------------------------------------------

def _answer_places(message: str, city: str | None):
    if not city:
        return None
    if not _matches(message, (
        "see", "visit", "do", "place", "places", "attraction", "attractions",
        "where", "go", "sights", "things", "recommend", "suggestion", "show",
    )):
        return None

    matches = sorted(_in_location(get_all_places(), city), key=_rank)
    sightseeing = [p for p in matches if (p.get("category") or "").lower() in SIGHTSEEING_ORDER]
    chosen = (sightseeing or matches)[:MAX_RESULTS]

    if not chosen:
        return (
            f"I do not have anything catalogued for {city} yet, so I would rather say "
            f"so than guess. Try Kribi, Yaounde, Limbe or Buea, which have the fullest "
            f"listings — or add the place yourself with Suggest a place.",
            [],
            ["What can I see in Kribi?", "Places to visit in Limbe"],
        )

    lines = [f"Here is what is catalogued in {city}:"]
    for place in chosen:
        label = (place.get("category") or "place").replace("_", " ")
        lines.append(f"• {place.get('name')} — {label}")
    lines.append(
        f"That is {len(chosen)} of {len(matches)} entries I hold for {city}. "
        f"Ask me to plan a trip there and I will build a full day around them."
    )
    return (
        "\n".join(lines),
        [_record_summary(p) for p in chosen],
        [f"Plan a 2-day trip to {city}", f"Hotels in {city}", f"What will {city} cost?"],
    )


def _answer_hotels(message: str, city: str | None):
    if not _matches(message, ("hotel", "hotels", "stay", "sleep", "accommodation", "lodge", "room")):
        return None
    if not city:
        return (
            "Tell me which town and I will list what is catalogued there — for example "
            "\"hotels in Kribi\".",
            [],
            ["Hotels in Kribi", "Hotels in Douala", "Hotels in Buea"],
        )

    matches = _in_location(get_all_hotels(), city)
    chosen = sorted(_drop_generic_names(matches), key=lambda h: h.get("cost_per_night") or 0)[:MAX_RESULTS]

    if not chosen:
        return (
            f"I have no hotels catalogued for {city}. Kribi, Douala, Yaounde and Limbe "
            f"have the fullest listings.",
            [],
            ["Hotels in Kribi", "Hotels in Douala"],
        )

    lines = [f"Hotels catalogued in {city}, cheapest first:"]
    for hotel in chosen:
        lines.append(f"• {hotel.get('name')} — {_money(hotel.get('cost_per_night'))} a night")
    lines.append("Prices come from the catalogue and are a guide, not a live quote.")
    return (
        "\n".join(lines),
        [_record_summary(h, "cost_per_night") for h in chosen],
        [f"Plan a 3-day trip to {city}", f"What can I see in {city}?"],
    )


def _answer_budget(message: str, city: str | None):
    if not _matches(message, (
        "cost", "costs", "budget", "price", "prices", "expensive", "cheap",
        "afford", "how much", "much",
    )):
        return None
    if not city:
        return (
            "Tell me the town and how many days, and I will add up what the catalogue "
            "says — for example \"how much for 3 days in Kribi?\".",
            [],
            ["How much for 3 days in Kribi?", "Cost of a weekend in Limbe"],
        )

    days_match = re.search(r"(\d+)\s*(?:day|days|night|nights)", _normalise(message))
    days = max(1, min(int(days_match.group(1)), 14)) if days_match else 3

    # Priced from the same shortlist the hotel answer would give, so the two
    # cannot quote different nightly rates for the same town.
    hotels = sorted(
        _drop_generic_names(_in_location(get_all_hotels(), city)),
        key=lambda h: h.get("cost_per_night") or 0,
    )
    places = sorted(_in_location(get_all_places(), city), key=_rank)
    activities = _in_location(get_all_activities(), city)

    if not hotels and not places:
        return (
            f"I have nothing catalogued for {city}, so any figure I gave you would be "
            f"invented. Try Kribi, Yaounde, Limbe or Buea.",
            [],
            ["How much for 3 days in Kribi?"],
        )

    nightly = next((h.get("cost_per_night") or 0 for h in hotels if h.get("cost_per_night")), 0)
    stay = nightly * max(days - 1, 1)
    stops = places[: days * 2]
    sightseeing_cost = sum(p.get("cost") or 0 for p in stops)
    activity_cost = sum(a.get("cost") or 0 for a in activities[:days])
    total = stay + sightseeing_cost + activity_cost

    lines = [f"A rough {days}-day estimate for {city}, from catalogue prices:"]
    if nightly:
        lines.append(f"• Accommodation — {_money(stay)} ({max(days - 1, 1)} nights at {_money(nightly)})")
    if sightseeing_cost:
        lines.append(f"• Places to visit — {_money(sightseeing_cost)} across {len(stops)} stops")
    if activity_cost:
        lines.append(f"• Activities — {_money(activity_cost)}")
    lines.append(f"Estimated total: {_money(total)}")
    lines.append(
        "This covers what is in the catalogue only — not transport to the town, food, "
        "or anything you book yourself."
    )
    return (
        "\n".join(lines),
        [_record_summary(p) for p in stops[:MAX_RESULTS]],
        [f"Plan a {days}-day trip to {city}", f"Hotels in {city}"],
    )


def _answer_plan(message: str, city: str | None):
    if not _matches(message, ("plan", "itinerary", "trip", "organise", "organize", "arrange")):
        return None
    if city:
        days_match = re.search(r"(\d+)\s*(?:day|days)", _normalise(message))
        days = max(1, min(int(days_match.group(1)), 14)) if days_match else 2
        return (
            f"I can build that for you. Open Itineraries, type {city} into \"Plan a trip "
            f"in one step\", set {days} days, and press Build my itinerary — the hotel, "
            f"places and checkpoints are filled in from the catalogue. You can reorder "
            f"or edit every checkpoint afterwards.",
            [],
            [f"What can I see in {city}?", f"Hotels in {city}", "How do I swap checkpoints?"],
        )
    return (
        HOW_TO["create"]["answer"],
        [],
        ["Plan a 3-day trip to Kribi", "What can I see in Yaounde?"],
    )


def _answer_my_trips(message: str, username: str | None):
    if not _matches(message, ("my", "mine", "i have", "saved")):
        return None
    if not _matches(message, ("trip", "trips", "itinerary", "itineraries", "plan", "plans")):
        return None

    if not username:
        return (
            "Sign in and I can tell you about your own trips — what you have saved, "
            "where they go and what they cost.",
            [],
            ["How do I create an account?", "Plan a 2-day trip to Limbe"],
        )

    trips = get_itineraries_for_user(username)
    if not trips:
        return (
            "You have no trips saved yet. Open Itineraries and use \"Plan a trip in one "
            "step\" — two fields and you will have a full plan.",
            [],
            ["Plan a 3-day trip to Kribi", "What can I see in Limbe?"],
        )

    lines = [f"You have {len(trips)} trip{'s' if len(trips) != 1 else ''} saved:"]
    for trip in trips[:MAX_RESULTS]:
        stops = len(trip.get("stages") or [])
        total = (trip.get("cost_breakdown") or {}).get("total_budget")
        lines.append(
            f"• {trip.get('title')} — {trip.get('location')}, {stops} checkpoints"
            + (f", {_money(total)}" if total else "")
        )
    return (
        "\n".join(lines),
        [],
        ["How do I swap checkpoints?", "How do I share a trip?"],
    )


def _answer_how_to(message: str):
    for entry in HOW_TO.values():
        if _matches(message, entry["keywords"]):
            return (
                entry["answer"],
                [],
                ["Plan a 3-day trip to Kribi", "What can I see in Limbe?"],
            )
    return None


def _answer_guidance(message: str):
    for entry in GUIDANCE.values():
        if _matches(message, entry["keywords"]):
            return (entry["answer"], [], ["Plan a 2-day trip to Kribi", "When should I travel?"])
    return None


GREETING_WORDS = ("hi", "hello", "hey", "bonjour", "salut", "good morning", "good evening")

FALLBACK = (
    "I can help with places to visit in Cameroon, hotels and rough costs, your own "
    "trips, and how to use GlobeTrotter. I answer from the catalogue this app holds, "
    "so if something is not in it I will say so rather than guess. Try one of these:"
)


# ---------------------------------------------------------------------------
# What the assistant can offer to do
#
# The bot proposes actions; it does not take them. That distinction matters
# more than it sounds. A bot that acts on its own reading of a sentence will
# eventually approve the wrong suggestion or promote the wrong account, and
# nobody will be able to say why. Proposing leaves the decision with the person
# who is accountable for it, and costs them one click either way.
#
# Each action names the roles that may see it, so an administrator is offered
# the review queue and a traveller never is.
# ---------------------------------------------------------------------------

#: id, label, where it goes, who may see it, and what makes it relevant.
ACTIONS = (
    # Everyone
    {"id": "explore", "label": "Browse all 845 places", "path": "/explore",
     "roles": ("user", "admin"),
     "keywords": ("place", "places", "see", "visit", "explore", "where",
                  "attraction", "beach", "waterfall", "park")},
    {"id": "plan", "label": "Plan a trip in two fields", "path": "/trips",
     "roles": ("user", "admin"),
     "keywords": ("plan", "trip", "itinerary", "days", "budget", "cost", "how much")},
    {"id": "my-trips", "label": "Open my trips", "path": "/trips",
     "roles": ("user", "admin"),
     "keywords": ("my trip", "my trips", "my itinerary", "checkpoint", "swap", "reorder")},
    {"id": "saved", "label": "See my saved places", "path": "/saved",
     "roles": ("user", "admin"),
     "keywords": ("save", "saved", "wishlist", "bookmark", "later")},
    {"id": "community", "label": "Open the community", "path": "/community",
     "roles": ("user", "admin"),
     "keywords": ("group", "groups", "community", "chat", "call", "friend",
                  "discussion", "together", "video call", "audio call")},
    {"id": "media", "label": "See travellers' photos", "path": "/media",
     "roles": ("user", "admin"),
     "keywords": ("photo", "photos", "picture", "video", "media", "upload")},
    {"id": "suggest", "label": "Suggest a place or a correction", "path": "/suggest",
     "roles": ("user", "admin"),
     "keywords": ("suggest", "missing", "add a place", "wrong", "correct",
                  "incorrect", "outdated", "update", "mistake")},
    {"id": "settings", "label": "Change language or currency", "path": "/settings",
     "roles": ("user", "admin"),
     "keywords": ("language", "french", "english", "currency", "fcfa", "euro",
                  "setting", "settings", "notification")},
    {"id": "profile", "label": "Open my profile", "path": "/profile",
     "roles": ("user", "admin"),
     "keywords": ("profile", "account", "interests", "sign out", "my account")},

    # Administrators only
    {"id": "admin-queue", "label": "Review what is waiting", "path": "/admin",
     "roles": ("admin",),
     "keywords": ("pending", "review", "approve", "reject", "queue", "request",
                  "requests", "suggestion", "moderate", "waiting", "group",
                  "groups")},
    {"id": "admin-stats", "label": "Open platform analytics", "path": "/admin",
     "roles": ("admin",),
     "keywords": ("how many", "statistic", "stats", "analytics", "total",
                  "numbers", "count", "growth", "platform")},
    {"id": "admin-users", "label": "Manage accounts and roles", "path": "/admin",
     "roles": ("admin",),
     "keywords": ("user", "users", "account", "accounts", "role", "roles",
                  "promote", "demote", "permission", "administrator")},
)

#: Offered when nothing in the message matches: what each role does most.
DEFAULT_ACTION_IDS = {
    "user": ("plan", "explore", "community"),
    "admin": ("admin-queue", "admin-stats", "plan"),
    None: ("explore", "plan"),
}

MAX_ACTIONS = 3


def _actions_for(message, role, city=None, days=None):
    """The few things this role could do next, given what was just asked.

    Two kinds come back. Most are somewhere to go: the client follows the
    `path`. One is something to do -- when the conversation has settled on a
    destination, the first action *creates that trip* and opens it, because
    "plan a trip to Limbe" followed by a button that merely opens the planning
    page and forgets the destination is a button that did nothing.

    The list is never empty. An assistant that answers and then offers nothing
    leaves the person to work out for themselves what the answer was for, so
    when scoring finds too few the remainder is padded from what that role does
    most.
    """
    allowed = [a for a in ACTIONS if role in a["roles"]] if role else []
    if not allowed:
        # Signed out: offer what anyone can look at, not what needs an account.
        allowed = [a for a in ACTIONS if a["id"] in ("explore", "plan")]

    lowered = (message or "").lower()
    scored = []
    for action in allowed:
        hits = sum(1 for keyword in action["keywords"] if keyword in lowered)
        if hits:
            scored.append((hits, action))
    scored.sort(key=lambda pair: -pair[0])
    chosen = [action for _, action in scored]

    # Pad, never truncate to nothing: the defaults fill whatever is left.
    wanted = DEFAULT_ACTION_IDS.get(role, DEFAULT_ACTION_IDS[None])
    by_id = {a["id"]: a for a in allowed}
    for action_id in wanted:
        if len(chosen) >= MAX_ACTIONS:
            break
        action = by_id.get(action_id)
        if action and action not in chosen:
            chosen.append(action)
    for action in allowed:
        if len(chosen) >= MAX_ACTIONS:
            break
        if action not in chosen:
            chosen.append(action)

    chosen = chosen[:MAX_ACTIONS]
    actions = [{"id": a["id"], "label": a["label"], "path": a["path"]} for a in chosen]

    # The one action that does the thing rather than pointing at it. Offered
    # only when a real destination was recognised, and only to someone signed
    # in -- creating a trip needs an account to own it.
    if city and role:
        nights = days or 3
        actions.insert(0, {
            "id": "create-trip",
            "label": f"Create a {nights}-day trip to {city}",
            "path": "/trips",
            "run": {"kind": "create_trip", "location": city, "days": nights},
        })
        actions = actions[:MAX_ACTIONS]

    return actions


# ---------------------------------------------------------------------------
# Administrator answers
#
# These read the same collections the admin dashboard reads. An administrator
# who asks "how many users do I have" should get the number, not directions to
# a page that shows the number.
# ---------------------------------------------------------------------------

def _answer_admin_overview(message, role):
    if role != "admin":
        return None
    if not _matches(message, ("how many", "stats", "statistic", "analytics", "total",
                              "overview", "numbers", "count", "platform")):
        return None

    users = get_all_users()
    admin_count = sum(1 for u in users if u.get("role") == "admin")
    itineraries = get_all_itineraries()
    public_count = sum(1 for i in itineraries if i.get("visibility") == "public")
    pending = [r for r in get_all_place_requests() if r.get("status") == "pending"]

    lines = [
        "Here is where the platform stands right now:",
        "- {} registered account{} ({} administrator{})".format(
            len(users), "" if len(users) == 1 else "s",
            admin_count, "" if admin_count == 1 else "s"),
        "- {} itinerar{} ({} public)".format(
            len(itineraries), "y" if len(itineraries) == 1 else "ies", public_count),
        "- {} community groups, {} photos posted".format(
            len(get_all_groups()), len(get_all_media())),
        "- {} places, {} hotels, {} activities in the catalogue".format(
            len(get_all_places()), len(get_all_hotels()), len(get_all_activities())),
        "- {} suggestion{} waiting for review".format(
            len(pending), "" if len(pending) == 1 else "s"),
        "- {} group{} waiting for approval".format(
            len([g for g in get_all_groups() if (g.get("status") or "approved") == "pending"]),
            "" if len([g for g in get_all_groups()
                       if (g.get("status") or "approved") == "pending"]) == 1 else "s"),
    ]
    return ("\n".join(lines), ["admin/stats"],
            ["What is waiting for review?", "Who are the administrators?"])


def _answer_pending_queue(message, role):
    if role != "admin":
        return None
    if not _matches(message, ("pending", "waiting", "review", "queue", "approve",
                              "reject", "request", "requests", "moderate")):
        return None

    pending = [r for r in get_all_place_requests() if r.get("status") == "pending"]
    waiting_groups = [g for g in get_all_groups() if (g.get("status") or "approved") == "pending"]

    if not pending and not waiting_groups:
        return ("Nothing is waiting for review - the queue is empty.",
                ["place_requests", "groups"],
                ["How many users do I have?", "Who are the administrators?"])

    lines = []
    if waiting_groups:
        lines.append("{} group{} waiting for approval:".format(
            len(waiting_groups), "" if len(waiting_groups) == 1 else "s"))
        for group in waiting_groups[:MAX_RESULTS]:
            lines.append("- {}, asked for by {}".format(
                group.get("name"), group.get("created_by")))
        if pending:
            lines.append("")

    if not pending:
        lines.append("Open the admin dashboard to approve or reject them.")
        return ("\n".join(lines), ["groups"],
                ["How many users do I have?", "Show me the platform numbers"])

    lines.append("{} suggestion{} waiting for you:".format(
        len(pending), "" if len(pending) == 1 else "s"))
    for item in pending[:MAX_RESULTS]:
        kind = "correction to" if item.get("mode") == "edit" else "new"
        name = item.get("target_name") or item.get("name")
        lines.append("- {} {} in {}, sent by {}".format(
            kind, name, item.get("location"), item.get("submitted_by")))
    if len(pending) > MAX_RESULTS:
        lines.append("...and {} more.".format(len(pending) - MAX_RESULTS))
    lines.append("Open the admin dashboard to approve or reject them.")
    return ("\n".join(lines), ["place_requests"],
            ["How many users do I have?", "Show me the platform numbers"])


def _answer_admin_users(message, role):
    if role != "admin":
        return None
    if not _matches(message, ("who is admin", "administrators", "admin accounts",
                              "which users", "who are the", "promote", "demote",
                              "roles")):
        return None

    users = get_all_users()
    admins = [u.get("username") for u in users if u.get("role") == "admin"]
    reply = "{} account{} in total. {} You can promote or demote anyone from the Accounts table on the admin dashboard.".format(
        len(users),
        "" if len(users) == 1 else "s",
        ("Administrators: " + ", ".join(admins) + ".") if admins else "There are no administrators.",
    )
    return (reply, ["admin/users"],
            ["What is waiting for review?", "Show me the platform numbers"])


def _route(message: str, username: str | None, role: str | None = None):
    """Pick an answer for the message. Order matters: the most specific first."""
    city = _find_location(message)

    if _matches(message, GREETING_WORDS) and len(message.split()) <= 4:
        return (
            "Hello. I am the GlobeTrotter travel assistant. Ask me where to go in "
            "Cameroon, what a trip might cost, or how anything in the app works.",
            [],
            ["What can I see in Kribi?", "How much for 3 days in Limbe?", "How do I plan a trip?"],
        )

    # Asked before the intent chain: "How do I share a trip?" contains "trip"
    # and would otherwise be answered by the trip planner.
    if _is_how_to_question(message):
        how_to = _answer_how_to(message)
        if how_to:
            return how_to

    for builder in (
        # Administrator questions first. "How many users do I have?" contains
        # no city and no trip, and would otherwise reach the fallback.
        lambda: _answer_pending_queue(message, role),
        lambda: _answer_admin_users(message, role),
        lambda: _answer_admin_overview(message, role),
        lambda: _answer_my_trips(message, username),
        lambda: _answer_budget(message, city),
        lambda: _answer_hotels(message, city),
        lambda: _answer_places(message, city),
        lambda: _answer_plan(message, city),
        lambda: _answer_how_to(message),
        lambda: _answer_guidance(message),
    ):
        result = builder()
        if result:
            return result

    # A city was named but the intent was unclear — listing what is there is a
    # better answer than admitting defeat.
    if city:
        places = _answer_places(f"what can I see in {city}", city)
        if places:
            return places

    return (
        FALLBACK,
        [],
        [
            "What can I see in Kribi?",
            "How much for 3 days in Limbe?",
            "How do I swap checkpoints?",
            "When is the best time to travel?",
        ],
    )


def _rephrase_with_model(question: str, grounded: str) -> str:
    """Ask a language model to phrase the grounded answer more naturally.

    The facts are fixed before this runs; the model is given them and told to
    rewrite rather than research. If anything at all goes wrong — no key, no
    package, a network failure, a slow response — the grounded answer is
    returned unchanged, so this can only improve the wording, never remove it.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return grounded

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=os.environ.get("ASSISTANT_MODEL", "claude-sonnet-5"),
            max_tokens=500,
            system=(
                "You rewrite travel answers for GlobeTrotter, a Cameroon trip planner. "
                "You are given a traveller's question and a factual answer drawn from "
                "the application's own catalogue. Rewrite the answer so it reads "
                "naturally and warmly. Use only the facts you are given: never add a "
                "place, price, date or claim that is not already there, and never drop "
                "a caveat. Keep it under 120 words."
            ),
            messages=[{
                "role": "user",
                "content": f"Question: {question}\n\nFactual answer to rewrite:\n{grounded}",
            }],
            timeout=10.0,
        )
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        return text or grounded
    except Exception:
        current_app.logger.info("Assistant language model unavailable; using grounded answer.")
        return grounded


@assistant_bp.route("/assistant/chat", methods=["POST"])
def assistant_chat():
    """Answer a traveller's question from the application's own data.

    Expected JSON body: ``{"message": "What can I see in Kribi?"}``

    Returns 200 with ``{reply, sources, suggestions, grounded}``. Works signed
    out; a signed-in caller also gets answers about their own trips.
    """
    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()

    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({
            "error": f"message must be {MAX_MESSAGE_LENGTH} characters or fewer",
        }), 400

    username = get_current_user(request)
    # The role decides both what the assistant will answer and what it offers
    # to do next: an administrator asking about the review queue gets the
    # queue, a traveller asking the same thing does not learn it exists.
    user = get_user_by_username(username) if username else None
    role = (user or {}).get("role") if user else None

    reply, sources, suggestions = _route(message, username, role)

    # The same extraction the answers use, so the offered trip matches the
    # trip that was just described rather than a second guess at the sentence.
    city = _find_location(message)
    days_match = re.search(r"(\d+)\s*[- ]?\s*day", message.lower())
    days = max(1, min(int(days_match.group(1)), 14)) if days_match else None

    return jsonify({
        "reply": _rephrase_with_model(message, reply),
        "sources": sources,
        "suggestions": suggestions,
        # Things this role can actually do, given what was just asked. The
        # interface renders them as links; the assistant never follows them
        # itself.
        "actions": _actions_for(message, role, city, days),
        "role": role or "guest",
        # Lets the interface show that the answer came from the catalogue
        # rather than from a model's memory.
        "grounded": True,
    }), 200


@assistant_bp.route("/assistant/starters", methods=["GET"])
def assistant_starters():
    """Opening questions, so the traveller is not faced with an empty box."""
    return jsonify({
        "greeting": (
            "Ask me anything about travelling in Cameroon or using GlobeTrotter. "
            "I answer from this app's own catalogue, so I will tell you when "
            "something is not in it."
        ),
        "starters": [
            "What can I see in Kribi?",
            "How much for 3 days in Limbe?",
            "Hotels in Yaounde",
            "How do I plan a trip?",
            "How do I swap checkpoints?",
            "When is the best time to travel?",
        ],
    }), 200
