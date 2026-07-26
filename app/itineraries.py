"""
app/itineraries.py

Create and list itineraries for the authenticated user.

Routes
------
POST /itineraries – create a new itinerary
GET  /itineraries – list all itineraries for the logged-in user

Both routes require a valid JWT in the Authorization header.
"""
import uuid
import datetime

from flask import Blueprint, request, jsonify

from app.auth import get_current_user
from app.models import (
    get_all_hotels,
    get_all_activities,
    get_all_places,
    get_itineraries_for_user,
    get_itinerary_by_id,
    get_user_by_username,
    get_all_groups,
    get_group_by_id,
    save_group,
    update_group,
    get_all_media,
    get_media_by_id,
    save_media,
    update_media,
    save_itinerary,
    update_itinerary,
)

itineraries_bp = Blueprint("itineraries", __name__)


def _calculate_cost_breakdown(data: dict) -> dict:
    hotel_cost = data.get("hotel", {}).get("cost_per_night", 0) or 0
    activities = data.get("activities", [])
    activity_cost = sum((activity.get("cost", 0) or 0) for activity in activities)
    places = data.get("places_to_visit", [])
    place_cost = sum((place.get("cost", 0) or 0) for place in places)
    return {
        "hotel_cost": hotel_cost,
        "activity_cost": activity_cost,
        "place_cost": place_cost,
        "total_budget": hotel_cost + activity_cost + place_cost,
    }


def _parse_budget(data: dict, default: float) -> float:
    budget = data.get("budget")
    if budget is None:
        return default
    try:
        return float(budget)
    except (TypeError, ValueError):
        return default


def _match_resources(resources: list, location: str, budget: float, cost_field: str):
    location_lower = location.lower()
    matches = []
    for resource in resources:
        if not resource.get("location"):
            continue
        if location_lower not in resource.get("location", "").lower():
            continue
        cost = resource.get(cost_field, 0) or 0
        if cost > budget:
            continue
        matches.append(resource)
    return matches


def _find_trip_suggestions(location: str, budget: float) -> dict:
    return {
        "hotels": _match_resources(get_all_hotels(), location, budget, "cost_per_night")[:3],
        "activities": _match_resources(get_all_activities(), location, budget, "cost")[:5],
        "places": _match_resources(get_all_places(), location, budget, "cost")[:5],
    }


def _parse_event_listing(data: dict) -> dict:
    raw_listing = data.get("event_listing") or {}
    if not isinstance(raw_listing, dict) or not raw_listing.get("for_sale"):
        return {}

    price = raw_listing.get("price_per_ticket")
    if price is None:
        return {}

    try:
        price_per_ticket = float(price)
    except (TypeError, ValueError):
        price_per_ticket = 0.0

    try:
        commission_rate = float(raw_listing.get("commission_rate", 0.05))
    except (TypeError, ValueError):
        commission_rate = 0.05

    seats_available = raw_listing.get("seats_available")
    if seats_available is not None:
        try:
            seats_available = int(seats_available)
        except (TypeError, ValueError):
            seats_available = None

    return {
        "id": raw_listing.get("id"),
        "for_sale": True,
        "price_per_ticket": price_per_ticket,
        "commission_rate": commission_rate,
        "seats_available": seats_available,
        "description": raw_listing.get("description", ""),
    }


def _create_payment_receipt(itinerary: dict, username: str, amount: float, method: str, target_type: str, target_id: str | None = None, commission_rate: float = 0.05, note: str = "") -> dict:
    receipt = {
        "id": str(uuid.uuid4()),
        "username": username,
        "target_type": target_type,
        "target_id": target_id,
        "amount": amount,
        "commission_rate": commission_rate,
        "commission_amount": round(amount * commission_rate, 2),
        "net_amount": round(amount - (amount * commission_rate), 2),
        "method": method,
        "note": note,
        "paid_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    itinerary.setdefault("receipts", []).append(receipt)
    return receipt


@itineraries_bp.route("/itineraries", methods=["POST"])
def create_itinerary():
    """Create a new itinerary for the authenticated user.

    Expected JSON body:
        {
          "title": "Summer in Europe",
          "location": "Europe",
          "hotel": {"name": "Hotel X", "cost_per_night": 150, "paid": false},
          "activities": [
              {"name": "Wine tour", "cost": 80, "paid": false},
          ],
          "places_to_visit": [
              {"name": "Louvre", "cost": 30, "paid": false}
          ],
          "start_date": "2025-06-01",
          "end_date": "2025-06-15",
          "payment_method": "mobile",
          "map_info": {"google_map_url": "https://maps.app...", "latitude": 48.8566, "longitude": 2.3522},
          "notes": "Optional free-text notes"
        }

    Returns 201 with the created itinerary on success.
    Requires: Authorization: ******
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    location = data.get("location", "").strip()
    hotel = data.get("hotel", {})
    activities = data.get("activities", [])
    places_to_visit = data.get("places_to_visit", [])

    if not title:
        return jsonify({"error": "title is required"}), 400
    if not location:
        return jsonify({"error": "location is required"}), 400
    if not isinstance(activities, list):
        return jsonify({"error": "activities must be a list"}), 400
    if not isinstance(places_to_visit, list):
        return jsonify({"error": "places_to_visit must be a list"}), 400

    cost_breakdown = _calculate_cost_breakdown(data)
    event_listing = _parse_event_listing(data)
    itinerary = {
        "id": str(uuid.uuid4()),
        "username": username,
        "title": title,
        "location": location,
        "hotel": hotel,
        "activities": activities,
        "places_to_visit": places_to_visit,
        "start_date": data.get("start_date", ""),
        "end_date": data.get("end_date", ""),
        "notes": data.get("notes", ""),
        "payment_method": data.get("payment_method", ""),
        "payment_status": data.get("payment_status", "pending"),
        "map_info": data.get("map_info", {}),
        "participants": [username],
        "cost_breakdown": cost_breakdown,
        "event_listing": event_listing,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    itinerary["shared_with"] = []
    save_itinerary(itinerary)
    itinerary["suggestions"] = _find_trip_suggestions(location, _parse_budget(data, cost_breakdown["total_budget"]))
    return jsonify(itinerary), 201


@itineraries_bp.route("/itineraries/<itinerary_id>", methods=["PUT"])
def update_itinerary_route(itinerary_id: str):
    """Update an existing itinerary owned by the authenticated user."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if itinerary.get("username") != username:
        return jsonify({"error": "only the trip owner can modify this itinerary"}), 403

    data = request.get_json(silent=True) or {}
    if "title" in data:
        itinerary["title"] = data.get("title", itinerary.get("title", "")).strip()
    if "location" in data:
        itinerary["location"] = data.get("location", itinerary.get("location", "")).strip()
    if "hotel" in data:
        itinerary["hotel"] = data.get("hotel", itinerary.get("hotel", {}))
    if "activities" in data:
        itinerary["activities"] = data.get("activities", itinerary.get("activities", []))
    if "places_to_visit" in data:
        itinerary["places_to_visit"] = data.get("places_to_visit", itinerary.get("places_to_visit", []))
    if "start_date" in data:
        itinerary["start_date"] = data.get("start_date", itinerary.get("start_date", ""))
    if "end_date" in data:
        itinerary["end_date"] = data.get("end_date", itinerary.get("end_date", ""))
    if "notes" in data:
        itinerary["notes"] = data.get("notes", itinerary.get("notes", ""))
    if "payment_method" in data:
        itinerary["payment_method"] = data.get("payment_method", itinerary.get("payment_method", ""))
    if "map_info" in data:
        itinerary["map_info"] = data.get("map_info", itinerary.get("map_info", {}))
    if "event_listing" in data:
        itinerary["event_listing"] = _parse_event_listing(data)

    itinerary["cost_breakdown"] = _calculate_cost_breakdown(itinerary)
    itinerary["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    update_itinerary(itinerary)
    return jsonify(itinerary), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/share", methods=["POST"])
def share_itinerary(itinerary_id: str):
    """Share an itinerary with another user."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if itinerary.get("username") != username:
        return jsonify({"error": "only the trip owner can share this itinerary"}), 403

    data = request.get_json(silent=True) or {}
    share_username = data.get("username", "").strip()
    if not share_username:
        return jsonify({"error": "username is required to share"}), 400

    user = get_user_by_username(share_username)
    if not user:
        return jsonify({"error": "shared user not found"}), 404

    shared_with = itinerary.setdefault("shared_with", [])
    if share_username in shared_with:
        return jsonify({"message": "already shared", "itinerary": itinerary}), 200

    shared_with.append(share_username)
    update_itinerary(itinerary)
    return jsonify({"message": "itinerary shared", "shared_with": shared_with, "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/suggestions", methods=["GET"])
def get_trip_suggestions():
    """Return suggested hotels, activities, and places for a budget and location."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    location = request.args.get("location", "").strip()
    budget = _parse_budget({"budget": request.args.get("budget")}, 0)

    if not location:
        return jsonify({"error": "location is required"}), 400

    suggestions = _find_trip_suggestions(location, budget)
    return jsonify({"location": location, "budget": budget, "suggestions": suggestions}), 200


@itineraries_bp.route("/itineraries", methods=["GET"])
def list_itineraries():
    """List all itineraries for the authenticated user.

    Returns 200 with a JSON array of itinerary objects.
    Requires: Authorization: ******
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itineraries = get_itineraries_for_user(username)
    return jsonify(itineraries), 200


@itineraries_bp.route("/groups", methods=["GET"])
def list_groups():
    """List all community groups."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    return jsonify(get_all_groups()), 200


@itineraries_bp.route("/groups", methods=["POST"])
def create_group():
    """Create a new community group."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "group name is required"}), 400

    group = {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": data.get("description", ""),
        "topics": data.get("topics", []),
        "created_by": username,
        "members": [username],
        "discussions": [],
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    save_group(group)
    return jsonify(group), 201


@itineraries_bp.route("/groups/<group_id>", methods=["GET"])
def get_group(group_id: str):
    """Return details for a specific group."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group = get_group_by_id(group_id)
    if not group:
        return jsonify({"error": "group not found"}), 404

    return jsonify(group), 200


@itineraries_bp.route("/groups/<group_id>/join", methods=["POST"])
def join_group(group_id: str):
    """Join an existing community group."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group = get_group_by_id(group_id)
    if not group:
        return jsonify({"error": "group not found"}), 404

    members = group.setdefault("members", [])
    if username in members:
        return jsonify({"message": "already a member", "group": group}), 200

    members.append(username)
    update_group(group)
    return jsonify({"message": "joined group", "group": group}), 200


@itineraries_bp.route("/groups/<group_id>/discussions", methods=["GET"])
def list_group_discussions(group_id: str):
    """List discussions for a community group."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group = get_group_by_id(group_id)
    if not group:
        return jsonify({"error": "group not found"}), 404

    return jsonify(group.get("discussions", [])), 200


@itineraries_bp.route("/groups/<group_id>/discussions", methods=["POST"])
def create_group_discussion(group_id: str):
    """Create a new discussion thread inside a community group."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group = get_group_by_id(group_id)
    if not group:
        return jsonify({"error": "group not found"}), 404

    if username not in group.get("members", []):
        return jsonify({"error": "must join the group before starting a discussion"}), 403

    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    message = data.get("message", "").strip()
    if not title:
        return jsonify({"error": "discussion title is required"}), 400
    if not message:
        return jsonify({"error": "discussion message is required"}), 400

    discussion = {
        "id": str(uuid.uuid4()),
        "title": title,
        "created_by": username,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "posts": [
            {
                "id": str(uuid.uuid4()),
                "username": username,
                "message": message,
                "posted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
        ],
    }
    discussions = group.setdefault("discussions", [])
    discussions.append(discussion)
    update_group(group)
    return jsonify({"message": "discussion created", "discussion": discussion, "group": group}), 201


@itineraries_bp.route("/groups/<group_id>/discussions/<discussion_id>/reply", methods=["POST"])
def reply_group_discussion(group_id: str, discussion_id: str):
    """Reply to a discussion thread inside a community group."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group = get_group_by_id(group_id)
    if not group:
        return jsonify({"error": "group not found"}), 404

    if username not in group.get("members", []):
        return jsonify({"error": "must join the group before replying"}), 403

    data = request.get_json(silent=True) or {}
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "reply message is required"}), 400

    discussion = None
    for item in group.get("discussions", []):
        if item.get("id") == discussion_id:
            discussion = item
            break
    if not discussion:
        return jsonify({"error": "discussion not found"}), 404

    post = {
        "id": str(uuid.uuid4()),
        "username": username,
        "message": message,
        "posted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    discussion.setdefault("posts", []).append(post)
    update_group(group)
    return jsonify({"message": "reply posted", "post": post, "discussion": discussion}), 200


@itineraries_bp.route("/media", methods=["GET"])
def list_media():
    """List shared media posts."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group_id = request.args.get("group_id")
    media_items = get_all_media()
    if group_id:
        media_items = [item for item in media_items if item.get("group_id") == group_id]
    return jsonify(media_items), 200


@itineraries_bp.route("/media", methods=["POST"])
def create_media():
    """Create a new media post for the community."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    data = request.get_json(silent=True) or {}
    media_type = data.get("type", "photo").strip()
    url = data.get("url", "").strip()
    caption = data.get("caption", "")
    group_id = data.get("group_id")

    if not url:
        return jsonify({"error": "media URL is required"}), 400

    if group_id:
        group = get_group_by_id(group_id)
        if not group:
            return jsonify({"error": "group not found"}), 404
        if username not in group.get("members", []):
            return jsonify({"error": "must join the group before posting"}), 403

    media_item = {
        "id": str(uuid.uuid4()),
        "username": username,
        "type": media_type,
        "url": url,
        "caption": caption,
        "group_id": group_id,
        "itinerary_id": data.get("itinerary_id"),
        "tags": data.get("tags", []),
        "likes": [],
        "comments": [],
        "shared_with": data.get("shared_with", []),
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    save_media(media_item)
    return jsonify(media_item), 201


@itineraries_bp.route("/media/<media_id>", methods=["GET"])
def get_media(media_id: str):
    """Return a single media post."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    media_item = get_media_by_id(media_id)
    if not media_item:
        return jsonify({"error": "media not found"}), 404

    return jsonify(media_item), 200


@itineraries_bp.route("/media/<media_id>/comment", methods=["POST"])
def comment_media(media_id: str):
    """Add a comment to a media post."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    media_item = get_media_by_id(media_id)
    if not media_item:
        return jsonify({"error": "media not found"}), 404

    data = request.get_json(silent=True) or {}
    comment_text = data.get("comment", "").strip()
    if not comment_text:
        return jsonify({"error": "comment text is required"}), 400

    comment = {
        "id": str(uuid.uuid4()),
        "username": username,
        "text": comment_text,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    media_item.setdefault("comments", []).append(comment)
    update_media(media_item)
    return jsonify({"message": "comment added", "comment": comment, "media": media_item}), 200


@itineraries_bp.route("/media/<media_id>/like", methods=["POST"])
def like_media(media_id: str):
    """Add a like to a media post."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    media_item = get_media_by_id(media_id)
    if not media_item:
        return jsonify({"error": "media not found"}), 404

    likes = media_item.setdefault("likes", [])
    if username in likes:
        return jsonify({"message": "already liked", "media": media_item}), 200

    likes.append(username)
    update_media(media_item)
    return jsonify({"message": "media liked", "media": media_item}), 200


@itineraries_bp.route("/media/<media_id>/share", methods=["POST"])
def share_media(media_id: str):
    """Share a media post with another user."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    media_item = get_media_by_id(media_id)
    if not media_item:
        return jsonify({"error": "media not found"}), 404

    data = request.get_json(silent=True) or {}
    share_username = data.get("username", "").strip()
    if not share_username:
        return jsonify({"error": "username is required to share"}), 400

    if not get_user_by_username(share_username):
        return jsonify({"error": "shared user not found"}), 404

    shared_with = media_item.setdefault("shared_with", [])
    if share_username in shared_with:
        return jsonify({"message": "already shared", "media": media_item}), 200

    shared_with.append(share_username)
    update_media(media_item)
    return jsonify({"message": "media shared", "shared_with": shared_with, "media": media_item}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/join", methods=["POST"])
def join_itinerary(itinerary_id: str):
    """Join an existing itinerary and optionally pay a share of the trip."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if username in itinerary.get("participants", []):
        return jsonify({"message": "already joined", "itinerary": itinerary}), 200

    data = request.get_json(silent=True) or {}
    payment_amount = data.get("payment_amount")
    payment_method = data.get("payment_method", "mobile")

    receipt = None
    if payment_amount is not None:
        event_listing = itinerary.get("event_listing", {}) or {}
        target_type = "event_ticket" if event_listing.get("for_sale") else "share"
        target_id = event_listing.get("id") if event_listing.get("for_sale") else None
        note = "Event ticket purchase" if event_listing.get("for_sale") else "Trip share payment"

        if event_listing.get("for_sale"):
            if event_listing.get("seats_available") is not None:
                if event_listing["seats_available"] <= 0:
                    return jsonify({"error": "no tickets available for this event"}), 400
                event_listing["seats_available"] -= 1
            receipt = _create_payment_receipt(
                itinerary,
                username,
                float(payment_amount),
                payment_method,
                target_type,
                target_id,
                event_listing.get("commission_rate", 0.05),
                note=note,
            )
        else:
            receipt = _create_payment_receipt(
                itinerary,
                username,
                float(payment_amount),
                payment_method,
                target_type,
                target_id,
                0.0,
                note=note,
            )

        payment = {
            "username": username,
            "amount": float(payment_amount),
            "method": payment_method,
            "target_type": target_type,
            "target_id": target_id,
            "receipt_id": receipt["id"],
            "paid_at": receipt["paid_at"],
        }
        itinerary.setdefault("payments", []).append(payment)
        itinerary["payment_status"] = "paid"

    itinerary.setdefault("participants", []).append(username)
    update_itinerary(itinerary)
    return jsonify({"message": "joined itinerary", "itinerary": itinerary, "receipt": receipt}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/pay", methods=["POST"])
def pay_itinerary(itinerary_id: str):
    """Process a mobile payment for a trip, event ticket, or itinerary share."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    data = request.get_json(silent=True) or {}
    target_type = data.get("target_type", "total")
    target_id = data.get("target_id")
    amount = data.get("amount")
    payment_method = data.get("payment_method", "mobile")
    commission_rate = float(data.get("commission_rate", itinerary.get("event_listing", {}).get("commission_rate", 0.05)))
    note = data.get("note", "")

    if amount is None:
        return jsonify({"error": "amount is required"}), 400

    event_listing = itinerary.get("event_listing", {}) or {}
    if target_type == "event_ticket" and event_listing.get("for_sale"):
        if event_listing.get("seats_available") is not None:
            if event_listing["seats_available"] <= 0:
                return jsonify({"error": "no tickets available for this event"}), 400
            event_listing["seats_available"] -= 1
        target_id = target_id or event_listing.get("id")
        note = note or "Event ticket purchase"

    receipt = _create_payment_receipt(
        itinerary,
        username,
        float(amount),
        payment_method,
        target_type,
        target_id,
        commission_rate,
        note,
    )
    payment = {
        "username": username,
        "target_type": target_type,
        "target_id": target_id,
        "amount": float(amount),
        "method": payment_method,
        "receipt_id": receipt["id"],
        "paid_at": receipt["paid_at"],
    }
    itinerary.setdefault("payments", []).append(payment)
    itinerary["payment_status"] = "paid"
    update_itinerary(itinerary)

    return jsonify({"message": "payment recorded", "payment": payment, "receipt": receipt, "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/map", methods=["GET"])
def itinerary_map(itinerary_id: str):
    """Return map metadata for the requested itinerary."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    return jsonify({
        "itinerary_id": itinerary_id,
        "map_info": itinerary.get("map_info", {}),
        "title": itinerary.get("title"),
        "location": itinerary.get("location"),
    }), 200
