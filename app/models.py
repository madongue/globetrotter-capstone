"""
app/models.py

Data models and persistence helpers.

Each collection (users, itineraries, destinations, ...) is a list of JSON
documents. Where those documents actually live depends on the configured
storage backend (see :mod:`app.store`):

  * ``DATABASE_URL`` unset -> JSON files under the /data directory. This is the
    default for local development and the test suite.
  * ``DATABASE_URL`` set   -> a SQL database (Postgres in production). Required
    on hosts with an ephemeral filesystem, where anything written to local disk
    is wiped on every redeploy.

Every function below works identically against either backend, so callers
never need to know which one is active.
"""
import json
import os

from app.store import build_store, collection_name_for

# Resolve the /data directory relative to this file's location so the app
# works regardless of the current working directory.
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(_BASE_DIR, "data")

USERS_FILE = os.path.join(DATA_DIR, "users.json")
ITINERARIES_FILE = os.path.join(DATA_DIR, "itineraries.json")
DESTINATIONS_FILE = os.path.join(DATA_DIR, "destinations.json")
HOTELS_FILE = os.path.join(DATA_DIR, "hotels.json")
ACTIVITIES_FILE = os.path.join(DATA_DIR, "activities.json")
PLACES_FILE = os.path.join(DATA_DIR, "places.json")
GROUPS_FILE = os.path.join(DATA_DIR, "groups.json")
MEDIA_FILE = os.path.join(DATA_DIR, "media.json")
NOTIFICATIONS_FILE = os.path.join(DATA_DIR, "notifications.json")
INVITES_FILE = os.path.join(DATA_DIR, "invites.json")
AUDIT_LOG_FILE = os.path.join(DATA_DIR, "audit_log.json")
PLACE_REQUESTS_FILE = os.path.join(DATA_DIR, "place_requests.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")


# ---------------------------------------------------------------------------
# Storage plumbing
#
# Collections are addressed by the data-file constants above. Both backends
# resolve a collection from that path's basename ("users.json" -> "users"),
# which keeps the file constants meaningful for the JSON backend and lets the
# test suite keep monkeypatching them to temp files.
#
# Reads and writes are serialised per collection, and mutating helpers below
# (save_*/update_*/remove_*) hold that lock ONCE around their full
# read-modify-write, so concurrent workers can't interleave and lose each
# other's changes.
# ---------------------------------------------------------------------------

#: Collection name -> the module-level constant holding its data-file path.
_COLLECTION_PATHS = {
    "users": "USERS_FILE",
    "itineraries": "ITINERARIES_FILE",
    "destinations": "DESTINATIONS_FILE",
    "hotels": "HOTELS_FILE",
    "activities": "ACTIVITIES_FILE",
    "places": "PLACES_FILE",
    "groups": "GROUPS_FILE",
    "media": "MEDIA_FILE",
    "notifications": "NOTIFICATIONS_FILE",
    "invites": "INVITES_FILE",
    "audit_log": "AUDIT_LOG_FILE",
    "place_requests": "PLACE_REQUESTS_FILE",
}


def _path_for_collection(collection: str) -> str:
    """Resolve a collection name back to its current data-file path.

    Looked up dynamically rather than cached because the test suite
    monkeypatches these constants between tests.
    """
    constant = _COLLECTION_PATHS.get(collection)
    if constant:
        return globals()[constant]
    return os.path.join(DATA_DIR, f"{collection}.json")


_store = None


def get_store():
    """Return the active storage backend, creating it on first use."""
    global _store
    if _store is None:
        _store = build_store(_path_for_collection)
    return _store


def reset_store() -> None:
    """Drop the cached backend so the next call re-reads DATABASE_URL.

    Used by tests and by the migration script when switching backends.
    """
    global _store
    _store = None


def _locked(filepath: str):
    """Hold an exclusive lock on *filepath*'s collection for the block."""
    return get_store().locked(collection_name_for(filepath))


def _read_json_unlocked(filepath: str) -> list:
    """Return the collection's documents. Caller must already hold its lock."""
    return get_store().read(collection_name_for(filepath))


def _write_json_unlocked(filepath: str, data: list) -> None:
    """Replace the collection's documents. Caller must already hold its lock."""
    get_store().write(collection_name_for(filepath), data)


def _read_json(filepath: str) -> list:
    """Return every document in the collection backing *filepath*."""
    with _locked(filepath):
        return _read_json_unlocked(filepath)


def _write_json(filepath: str, data: list) -> None:
    """Replace every document in the collection backing *filepath*."""
    with _locked(filepath):
        _write_json_unlocked(filepath, data)


# ---------------------------------------------------------------------------
# Catalogue seeding
#
# The curated catalogue (destinations, places, hotels, activities) is seed data
# committed to git, not user data. With the JSON backend it is simply read from
# those files. With a database backend a fresh database starts empty, so
# without this the app would come up with nothing to discover -- no places, no
# search results -- until someone remembered to run the migration script.
# ---------------------------------------------------------------------------

#: Collections safe to import from disk when the store has none. User data is
#: deliberately absent: an empty users table means a new deployment, not a
#: deployment missing its seed.
SEED_COLLECTIONS = ("destinations", "places", "hotels", "activities")


def seed_catalogue_if_empty(logger=None) -> dict:
    """Load the committed catalogue into empty collections.

    Returns a mapping of collection name to how many documents were imported.
    Never raises: a failure to seed must not stop the application booting.
    """
    imported = {}
    store = get_store()

    for collection in SEED_COLLECTIONS:
        try:
            seed_path = os.path.join(DATA_DIR, f"{collection}.json")
            if not os.path.exists(seed_path):
                continue

            with _locked(collection_path_for(collection)):
                if _read_json_unlocked(collection_path_for(collection)):
                    continue  # already populated; never overwrite live edits

                with open(seed_path, "r", encoding="utf-8") as handle:
                    content = handle.read().strip()
                if not content:
                    continue
                documents = json.loads(content)
                if not isinstance(documents, list) or not documents:
                    continue

                _write_json_unlocked(collection_path_for(collection), documents)
                imported[collection] = len(documents)
        except Exception:  # noqa: BLE001 - seeding is best-effort
            if logger:
                logger.warning("could not seed %s catalogue", collection, exc_info=True)

    if imported and logger:
        summary = ", ".join(f"{count} {name}" for name, count in imported.items())
        logger.info("Seeded catalogue into empty store: %s", summary)
    return imported


def collection_path_for(collection: str) -> str:
    """Public alias for resolving a collection to its data-file path."""
    return _path_for_collection(collection)


# ---------------------------------------------------------------------------
# User helpers
# ---------------------------------------------------------------------------

def get_all_users() -> list:
    """Return all registered users."""
    return _read_json(USERS_FILE)


def get_user_by_username(username: str) -> dict | None:
    """Return the user dict for *username*, or None if not found."""
    users = get_all_users()
    for user in users:
        if user.get("username") == username:
            return user
    return None


def get_user_by_email(email: str) -> dict | None:
    """Return the user dict for *email*, or None if not found."""
    users = get_all_users()
    for user in users:
        if user.get("email") == email:
            return user
    return None


def normalize_phone(phone: str) -> str:
    """Normalize a phone number for safe storage and lookup."""
    if not phone:
        return ""
    return "".join(ch for ch in phone.strip() if ch.isdigit() or ch == "+")


def get_user_by_phone(phone: str) -> dict | None:
    """Return the user dict for *phone*, or None if not found."""
    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        return None

    users = get_all_users()
    for user in users:
        if normalize_phone(user.get("phone", "")) == normalized_phone:
            return user
    return None


def get_user_by_google_id(google_id: str) -> dict | None:
    """Return the user dict for *google_id*, or None if not found."""
    users = get_all_users()
    for user in users:
        if user.get("google_id") == google_id:
            return user
    return None


def save_user(user: dict) -> None:
    """Append *user* to the users store."""
    with _locked(USERS_FILE):
        users = _read_json_unlocked(USERS_FILE)
        users.append(user)
        _write_json_unlocked(USERS_FILE, users)


def update_user(updated_user: dict) -> None:
    """Persist changes to an existing user."""
    with _locked(USERS_FILE):
        users = _read_json_unlocked(USERS_FILE)
        for index, user in enumerate(users):
            if user.get("username") == updated_user.get("username"):
                users[index] = updated_user
                _write_json_unlocked(USERS_FILE, users)
                return
        raise ValueError("User not found")


def get_user_by_reset_token(token: str) -> dict | None:
    """Return the user dict matching a password reset token."""
    users = get_all_users()
    for user in users:
        if user.get("password_reset_token") == token:
            return user
    return None


# ---------------------------------------------------------------------------
# Destination helpers
# ---------------------------------------------------------------------------

def get_all_destinations() -> list:
    """Return all destinations from the static catalogue."""
    return _read_json(DESTINATIONS_FILE)


def get_all_hotels() -> list:
    """Return all hotels available in the platform."""
    return _read_json(HOTELS_FILE)


def save_hotel(hotel: dict) -> None:
    """Append *hotel* to the hotels store."""
    with _locked(HOTELS_FILE):
        hotels = _read_json_unlocked(HOTELS_FILE)
        hotels.append(hotel)
        _write_json_unlocked(HOTELS_FILE, hotels)


def get_all_activities() -> list:
    """Return all activities available in the platform."""
    return _read_json(ACTIVITIES_FILE)


def save_activity(activity: dict) -> None:
    """Append *activity* to the activities store."""
    with _locked(ACTIVITIES_FILE):
        activities = _read_json_unlocked(ACTIVITIES_FILE)
        activities.append(activity)
        _write_json_unlocked(ACTIVITIES_FILE, activities)


def get_all_places() -> list:
    """Return all places available in the platform."""
    return _read_json(PLACES_FILE)


def save_place(place: dict) -> None:
    """Append *place* to the places store."""
    with _locked(PLACES_FILE):
        places = _read_json_unlocked(PLACES_FILE)
        places.append(place)
        _write_json_unlocked(PLACES_FILE, places)


def update_hotel(updated_hotel: dict) -> None:
    with _locked(HOTELS_FILE):
        hotels = _read_json_unlocked(HOTELS_FILE)
        for index, hotel in enumerate(hotels):
            if hotel.get("id") == updated_hotel.get("id"):
                hotels[index] = updated_hotel
                _write_json_unlocked(HOTELS_FILE, hotels)
                return
        raise ValueError("Hotel not found")


def update_activity(updated_activity: dict) -> None:
    with _locked(ACTIVITIES_FILE):
        activities = _read_json_unlocked(ACTIVITIES_FILE)
        for index, activity in enumerate(activities):
            if activity.get("id") == updated_activity.get("id"):
                activities[index] = updated_activity
                _write_json_unlocked(ACTIVITIES_FILE, activities)
                return
        raise ValueError("Activity not found")


def update_place(updated_place: dict) -> None:
    with _locked(PLACES_FILE):
        places = _read_json_unlocked(PLACES_FILE)
        for index, place in enumerate(places):
            if place.get("id") == updated_place.get("id"):
                places[index] = updated_place
                _write_json_unlocked(PLACES_FILE, places)
                return
        raise ValueError("Place not found")


def get_all_groups() -> list:
    """Return all community groups."""
    return _read_json(GROUPS_FILE)


def get_group_by_id(group_id: str) -> dict | None:
    """Return the group dict with the given ID."""
    groups = get_all_groups()
    for group in groups:
        if group.get("id") == group_id:
            return group
    return None


def save_group(group: dict) -> None:
    """Append *group* to the groups store."""
    with _locked(GROUPS_FILE):
        groups = _read_json_unlocked(GROUPS_FILE)
        groups.append(group)
        _write_json_unlocked(GROUPS_FILE, groups)


def update_group(updated_group: dict) -> None:
    """Persist changes to an existing group."""
    with _locked(GROUPS_FILE):
        groups = _read_json_unlocked(GROUPS_FILE)
        for index, group in enumerate(groups):
            if group.get("id") == updated_group.get("id"):
                groups[index] = updated_group
                _write_json_unlocked(GROUPS_FILE, groups)
                return
        raise ValueError("Group not found")


def get_all_media() -> list:
    """Return all shared media posts."""
    return _read_json(MEDIA_FILE)


def get_media_by_id(media_id: str) -> dict | None:
    """Return the media entry for *media_id*, or None if not found."""
    media_items = get_all_media()
    for item in media_items:
        if item.get("id") == media_id:
            return item
    return None


def save_media(media: dict) -> None:
    """Append *media* to the media store."""
    with _locked(MEDIA_FILE):
        media_items = _read_json_unlocked(MEDIA_FILE)
        media_items.append(media)
        _write_json_unlocked(MEDIA_FILE, media_items)


def update_media(updated_media: dict) -> None:
    """Persist changes to an existing media post."""
    with _locked(MEDIA_FILE):
        media_items = _read_json_unlocked(MEDIA_FILE)
        for index, item in enumerate(media_items):
            if item.get("id") == updated_media.get("id"):
                media_items[index] = updated_media
                _write_json_unlocked(MEDIA_FILE, media_items)
                return
        raise ValueError("Media not found")


def get_all_notifications() -> list:
    """Return all user notifications."""
    return _read_json(NOTIFICATIONS_FILE)


def get_notifications_for_user(username: str, unread_only: bool = False) -> list:
    """Return notifications addressed to *username*."""
    notifications = [
        item for item in get_all_notifications()
        if item.get("username") == username
    ]
    if unread_only:
        notifications = [item for item in notifications if not item.get("read")]
    return notifications


def save_notification(notification: dict) -> None:
    """Append *notification* to the notifications store."""
    with _locked(NOTIFICATIONS_FILE):
        notifications = _read_json_unlocked(NOTIFICATIONS_FILE)
        notifications.append(notification)
        _write_json_unlocked(NOTIFICATIONS_FILE, notifications)


def update_notification(updated_notification: dict) -> None:
    """Persist changes to an existing notification."""
    with _locked(NOTIFICATIONS_FILE):
        notifications = _read_json_unlocked(NOTIFICATIONS_FILE)
        for index, notification in enumerate(notifications):
            if notification.get("id") == updated_notification.get("id"):
                notifications[index] = updated_notification
                _write_json_unlocked(NOTIFICATIONS_FILE, notifications)
                return
        raise ValueError("Notification not found")


def get_all_invites() -> list:
    """Return all trip invite records."""
    return _read_json(INVITES_FILE)


def get_invite_by_token(token: str) -> dict | None:
    for invite in get_all_invites():
        if invite.get("token") == token:
            return invite
    return None


def save_invite(invite: dict) -> None:
    with _locked(INVITES_FILE):
        invites = _read_json_unlocked(INVITES_FILE)
        invites.append(invite)
        _write_json_unlocked(INVITES_FILE, invites)


def update_invite(updated_invite: dict) -> None:
    with _locked(INVITES_FILE):
        invites = _read_json_unlocked(INVITES_FILE)
        for index, invite in enumerate(invites):
            if invite.get("token") == updated_invite.get("token"):
                invites[index] = updated_invite
                _write_json_unlocked(INVITES_FILE, invites)
                return
        raise ValueError("Invite not found")


def get_all_audit_entries() -> list:
    """Return all audit log entries."""
    return _read_json(AUDIT_LOG_FILE)


def get_audit_entries_for_itinerary(itinerary_id: str) -> list:
    return [
        entry for entry in get_all_audit_entries()
        if entry.get("entity_type") == "itinerary" and entry.get("entity_id") == itinerary_id
    ]


def save_audit_entry(entry: dict) -> None:
    with _locked(AUDIT_LOG_FILE):
        entries = _read_json_unlocked(AUDIT_LOG_FILE)
        entries.append(entry)
        _write_json_unlocked(AUDIT_LOG_FILE, entries)


def remove_hotel_by_id(hotel_id: str) -> bool:
    """Remove a hotel by ID and return True if removed."""
    with _locked(HOTELS_FILE):
        hotels = _read_json_unlocked(HOTELS_FILE)
        updated = [hotel for hotel in hotels if hotel.get("id") != hotel_id]
        if len(updated) == len(hotels):
            return False
        _write_json_unlocked(HOTELS_FILE, updated)
        return True


def remove_activity_by_id(activity_id: str) -> bool:
    """Remove an activity by ID and return True if removed."""
    with _locked(ACTIVITIES_FILE):
        activities = _read_json_unlocked(ACTIVITIES_FILE)
        updated = [activity for activity in activities if activity.get("id") != activity_id]
        if len(updated) == len(activities):
            return False
        _write_json_unlocked(ACTIVITIES_FILE, updated)
        return True


def remove_place_by_id(place_id: str) -> bool:
    """Remove a place by ID and return True if removed."""
    with _locked(PLACES_FILE):
        places = _read_json_unlocked(PLACES_FILE)
        updated = [place for place in places if place.get("id") != place_id]
        if len(updated) == len(places):
            return False
        _write_json_unlocked(PLACES_FILE, updated)
        return True


# ---------------------------------------------------------------------------
# Itinerary helpers
# ---------------------------------------------------------------------------

def get_all_itineraries() -> list:
    """Return all itineraries across all users."""
    return _read_json(ITINERARIES_FILE)


def get_itineraries_for_user(username: str) -> list:
    """Return itineraries that belong to or include *username* as a participant or shared user."""
    return [
        it for it in get_all_itineraries()
        if (
            it.get("username") == username
            or username in it.get("participants", [])
            or username in it.get("shared_with", [])
        )
    ]


def save_itinerary(itinerary: dict) -> None:
    """Append *itinerary* to the itineraries store."""
    with _locked(ITINERARIES_FILE):
        itineraries = _read_json_unlocked(ITINERARIES_FILE)
        itineraries.append(itinerary)
        _write_json_unlocked(ITINERARIES_FILE, itineraries)


def get_itinerary_by_id(itinerary_id: str) -> dict | None:
    """Return the itinerary dict for *itinerary_id*, or None if not found."""
    itineraries = get_all_itineraries()
    for itinerary in itineraries:
        if itinerary.get("id") == itinerary_id:
            return itinerary
    return None


def update_itinerary(updated_itinerary: dict) -> None:
    """Persist changes to an existing itinerary."""
    with _locked(ITINERARIES_FILE):
        itineraries = _read_json_unlocked(ITINERARIES_FILE)
        for index, itinerary in enumerate(itineraries):
            if itinerary.get("id") == updated_itinerary.get("id"):
                itineraries[index] = updated_itinerary
                _write_json_unlocked(ITINERARIES_FILE, itineraries)
                return


def get_all_place_requests() -> list:
    """Return all submitted place/hotel/activity requests."""
    return _read_json(PLACE_REQUESTS_FILE)


def get_place_request_by_id(request_id: str) -> dict | None:
    for item in get_all_place_requests():
        if item.get("id") == request_id:
            return item
    return None


def get_place_requests_for_user(username: str) -> list:
    return [item for item in get_all_place_requests() if item.get("submitted_by") == username]


def save_place_request(item: dict) -> None:
    with _locked(PLACE_REQUESTS_FILE):
        items = _read_json_unlocked(PLACE_REQUESTS_FILE)
        items.append(item)
        _write_json_unlocked(PLACE_REQUESTS_FILE, items)


def update_place_request(updated: dict) -> None:
    with _locked(PLACE_REQUESTS_FILE):
        items = _read_json_unlocked(PLACE_REQUESTS_FILE)
        for index, item in enumerate(items):
            if item.get("id") == updated.get("id"):
                items[index] = updated
                _write_json_unlocked(PLACE_REQUESTS_FILE, items)
                return
        raise ValueError("Place request not found")
