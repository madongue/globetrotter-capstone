"""
app/models.py

Data models and file I/O helpers.

All persistent data is stored in JSON files under the /data directory.
  - data/users.json       – registered users
  - data/itineraries.json – user itineraries
  - data/destinations.json – static destination catalogue (seed data)
"""
import json
import os

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
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")


# ---------------------------------------------------------------------------
# Generic file I/O helpers
# ---------------------------------------------------------------------------

def _read_json(filepath: str) -> list:
    """Read a JSON file and return its contents as a Python list.

    Returns an empty list if the file does not exist or is empty.
    """
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r", encoding="utf-8") as fh:
        content = fh.read().strip()
        if not content:
            return []
        data = json.loads(content)
        return data if isinstance(data, list) else []


def _write_json(filepath: str, data: list) -> None:
    """Serialise *data* and write it to *filepath* (pretty-printed)."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


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
    users = get_all_users()
    users.append(user)
    _write_json(USERS_FILE, users)


def update_user(updated_user: dict) -> None:
    """Persist changes to an existing user."""
    users = get_all_users()
    for index, user in enumerate(users):
        if user.get("username") == updated_user.get("username"):
            users[index] = updated_user
            _write_json(USERS_FILE, users)
            return
    raise ValueError("User not found")


def get_user_by_reset_token(token: str) -> dict | None:
    """Return the user dict matching a password reset token."""
    users = get_all_users()
    for user in users:
        if user.get("password_reset_token") == token:
            return user
    return None


def get_user_by_google_id(google_id: str) -> dict | None:
    """Return the user dict for a Google account identifier."""
    users = get_all_users()
    for user in users:
        if user.get("google_id") == google_id:
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
    hotels = get_all_hotels()
    hotels.append(hotel)
    _write_json(HOTELS_FILE, hotels)


def get_all_activities() -> list:
    """Return all activities available in the platform."""
    return _read_json(ACTIVITIES_FILE)


def save_activity(activity: dict) -> None:
    """Append *activity* to the activities store."""
    activities = get_all_activities()
    activities.append(activity)
    _write_json(ACTIVITIES_FILE, activities)


def get_all_places() -> list:
    """Return all places available in the platform."""
    return _read_json(PLACES_FILE)


def save_place(place: dict) -> None:
    """Append *place* to the places store."""
    places = get_all_places()
    places.append(place)
    _write_json(PLACES_FILE, places)


def update_hotel(updated_hotel: dict) -> None:
    hotels = get_all_hotels()
    for index, hotel in enumerate(hotels):
        if hotel.get("id") == updated_hotel.get("id"):
            hotels[index] = updated_hotel
            _write_json(HOTELS_FILE, hotels)
            return
    raise ValueError("Hotel not found")


def update_activity(updated_activity: dict) -> None:
    activities = get_all_activities()
    for index, activity in enumerate(activities):
        if activity.get("id") == updated_activity.get("id"):
            activities[index] = updated_activity
            _write_json(ACTIVITIES_FILE, activities)
            return
    raise ValueError("Activity not found")


def update_place(updated_place: dict) -> None:
    places = get_all_places()
    for index, place in enumerate(places):
        if place.get("id") == updated_place.get("id"):
            places[index] = updated_place
            _write_json(PLACES_FILE, places)
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
    groups = get_all_groups()
    groups.append(group)
    _write_json(GROUPS_FILE, groups)


def update_group(updated_group: dict) -> None:
    """Persist changes to an existing group."""
    groups = get_all_groups()
    for index, group in enumerate(groups):
        if group.get("id") == updated_group.get("id"):
            groups[index] = updated_group
            _write_json(GROUPS_FILE, groups)
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
    media_items = get_all_media()
    media_items.append(media)
    _write_json(MEDIA_FILE, media_items)


def update_media(updated_media: dict) -> None:
    """Persist changes to an existing media post."""
    media_items = get_all_media()
    for index, item in enumerate(media_items):
        if item.get("id") == updated_media.get("id"):
            media_items[index] = updated_media
            _write_json(MEDIA_FILE, media_items)
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
    notifications = get_all_notifications()
    notifications.append(notification)
    _write_json(NOTIFICATIONS_FILE, notifications)


def update_notification(updated_notification: dict) -> None:
    """Persist changes to an existing notification."""
    notifications = get_all_notifications()
    for index, notification in enumerate(notifications):
        if notification.get("id") == updated_notification.get("id"):
            notifications[index] = updated_notification
            _write_json(NOTIFICATIONS_FILE, notifications)
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
    invites = get_all_invites()
    invites.append(invite)
    _write_json(INVITES_FILE, invites)


def update_invite(updated_invite: dict) -> None:
    invites = get_all_invites()
    for index, invite in enumerate(invites):
        if invite.get("token") == updated_invite.get("token"):
            invites[index] = updated_invite
            _write_json(INVITES_FILE, invites)
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
    entries = get_all_audit_entries()
    entries.append(entry)
    _write_json(AUDIT_LOG_FILE, entries)


def remove_hotel_by_id(hotel_id: str) -> bool:
    """Remove a hotel by ID and return True if removed."""
    hotels = get_all_hotels()
    updated = [hotel for hotel in hotels if hotel.get("id") != hotel_id]
    if len(updated) == len(hotels):
        return False
    _write_json(HOTELS_FILE, updated)
    return True


def remove_activity_by_id(activity_id: str) -> bool:
    """Remove an activity by ID and return True if removed."""
    activities = get_all_activities()
    updated = [activity for activity in activities if activity.get("id") != activity_id]
    if len(updated) == len(activities):
        return False
    _write_json(ACTIVITIES_FILE, updated)
    return True


def remove_place_by_id(place_id: str) -> bool:
    """Remove a place by ID and return True if removed."""
    places = get_all_places()
    updated = [place for place in places if place.get("id") != place_id]
    if len(updated) == len(places):
        return False
    _write_json(PLACES_FILE, updated)
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
    itineraries = get_all_itineraries()
    itineraries.append(itinerary)
    _write_json(ITINERARIES_FILE, itineraries)


def get_itinerary_by_id(itinerary_id: str) -> dict | None:
    """Return the itinerary dict for *itinerary_id*, or None if not found."""
    itineraries = get_all_itineraries()
    for itinerary in itineraries:
        if itinerary.get("id") == itinerary_id:
            return itinerary
    return None


def update_itinerary(updated_itinerary: dict) -> None:
    """Persist changes to an existing itinerary."""
    itineraries = get_all_itineraries()
    for index, itinerary in enumerate(itineraries):
        if itinerary.get("id") == updated_itinerary.get("id"):
            itineraries[index] = updated_itinerary
            _write_json(ITINERARIES_FILE, itineraries)
            return
    raise ValueError("Itinerary not found")
