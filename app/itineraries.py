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
import os
import re
import urllib.parse

from flask import Blueprint, Response, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

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
    get_invite_by_token,
    get_audit_entries_for_itinerary,
    get_notifications_for_user,
    save_audit_entry,
    save_invite,
    save_notification,
    update_invite,
    update_notification,
    save_media,
    update_media,
    save_itinerary,
    update_itinerary,
    UPLOADS_DIR,
)

itineraries_bp = Blueprint("itineraries", __name__)


def _map_link(query: str) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(query)}"


def _ensure_map_info(item: dict, fallback_location: str = "") -> None:
    location = item.get("location") or item.get("name") or fallback_location
    if not location:
        return
    map_info = item.setdefault("map_info", {})
    map_info.setdefault("google_map_url", _map_link(location))


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


def _parse_date(value: str):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _calculate_duration_days(start_date: str, end_date: str) -> int:
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if not start or not end or end < start:
        return 0
    return (end - start).days + 1


def _stage_duration_hours(stage: dict, default_hours: float) -> float:
    raw_duration = stage.get("duration_hours")
    if raw_duration is None:
        return default_hours
    try:
        return float(raw_duration)
    except (TypeError, ValueError):
        return default_hours


def _build_stage_plan(data: dict) -> list:
    stages = []
    hotel = data.get("hotel") or {}
    if hotel.get("name"):
        _ensure_map_info(hotel, data.get("location", ""))
        nights = max(_calculate_duration_days(data.get("start_date", ""), data.get("end_date", "")) - 1, 1)
        stages.append({
            "id": "hotel",
            "type": "hotel",
            "name": hotel.get("name"),
            "location": hotel.get("location") or data.get("location", ""),
            "cost": hotel.get("cost_per_night", 0) or 0,
            "duration_hours": nights * 24,
            "status": hotel.get("status", "pending"),
            "checklist": hotel.get("checklist", []),
            "map_info": hotel.get("map_info", {}),
        })

    for index, activity in enumerate(data.get("activities", []), start=1):
        _ensure_map_info(activity, data.get("location", ""))
        stages.append({
            "id": activity.get("id") or f"activity-{index}",
            "type": "activity",
            "name": activity.get("name", f"Activity {index}"),
            "location": activity.get("location") or data.get("location", ""),
            "cost": activity.get("cost", 0) or 0,
            "duration_hours": _stage_duration_hours(activity, 2),
            "status": activity.get("status", "pending"),
            "checklist": activity.get("checklist", []),
            "map_info": activity.get("map_info", {}),
        })

    for index, place in enumerate(data.get("places_to_visit", []), start=1):
        _ensure_map_info(place, data.get("location", ""))
        stages.append({
            "id": place.get("id") or f"place-{index}",
            "type": "place",
            "name": place.get("name", f"Place {index}"),
            "location": place.get("location") or data.get("location", ""),
            "cost": place.get("cost", 0) or 0,
            "duration_hours": _stage_duration_hours(place, 1.5),
            "status": place.get("status", "pending"),
            "checklist": place.get("checklist", []),
            "map_info": place.get("map_info", {}),
        })

    return stages


def _calculate_stage_summary(stages: list) -> dict:
    total_duration = round(sum(stage.get("duration_hours", 0) or 0 for stage in stages), 2)
    completed = [stage for stage in stages if stage.get("status") == "completed"]
    active = [stage for stage in stages if stage.get("status") == "active"]
    total = len(stages)
    progress_percent = round((len(completed) / total) * 100, 2) if total else 0
    if active:
        current_stage = active[0]
    else:
        current_stage = next((stage for stage in stages if stage.get("status") != "completed"), None)
    return {
        "stage_count": total,
        "completed_stage_count": len(completed),
        "duration_hours": total_duration,
        "progress_percent": progress_percent,
        "current_stage": current_stage,
    }


def _sync_itinerary_calculations(itinerary: dict) -> None:
    stages = _build_stage_plan(itinerary)
    existing_progress = itinerary.get("progress", {})
    if existing_progress.get("current_stage_id"):
        for stage in stages:
            if stage["id"] == existing_progress["current_stage_id"]:
                stage["status"] = "active"
            elif existing_progress.get("completed_stage_ids") and stage["id"] in existing_progress["completed_stage_ids"]:
                stage["status"] = "completed"

    stage_summary = _calculate_stage_summary(stages)
    itinerary["stages"] = stages
    itinerary["duration_days"] = _calculate_duration_days(itinerary.get("start_date", ""), itinerary.get("end_date", ""))
    itinerary["duration_hours"] = stage_summary["duration_hours"]
    itinerary["stage_summary"] = stage_summary
    itinerary.setdefault("progress", {
        "status": "not_started",
        "current_stage_id": stage_summary["current_stage"]["id"] if stage_summary["current_stage"] else None,
        "current_location": itinerary.get("location", ""),
        "progress_percent": stage_summary["progress_percent"],
        "completed_stage_ids": [],
        "updated_at": None,
    })


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


def _can_access_itinerary(itinerary: dict, username: str) -> bool:
    return (
        itinerary.get("username") == username
        or username in itinerary.get("participants", [])
        or username in itinerary.get("shared_with", [])
    )


def _share_permission(itinerary: dict, username: str) -> str | None:
    permissions = itinerary.get("shared_permissions", {})
    permission = permissions.get(username)
    if permission:
        return permission
    if username in itinerary.get("shared_with", []):
        return "view"
    return None


def _can_edit_itinerary(itinerary: dict, username: str) -> bool:
    return itinerary.get("username") == username or _share_permission(itinerary, username) == "edit"


def _parse_positive_amount(value):
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    return amount


def _notify(username: str, notification_type: str, message: str, data: dict | None = None) -> None:
    save_notification({
        "id": str(uuid.uuid4()),
        "username": username,
        "type": notification_type,
        "message": message,
        "data": data or {},
        "read": False,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })


def _audit(username: str, action: str, entity_id: str, details: dict | None = None) -> None:
    save_audit_entry({
        "id": str(uuid.uuid4()),
        "username": username,
        "action": action,
        "entity_type": "itinerary",
        "entity_id": entity_id,
        "details": details or {},
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })


def _pdf_escape(text: str) -> str:
    return str(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _simple_pdf(title: str, lines: list[str]) -> bytes:
    content_lines = ["BT", "/F1 16 Tf", "72 760 Td", f"({_pdf_escape(title)}) Tj", "/F1 10 Tf"]
    for line in lines:
        content_lines.append("0 -18 Td")
        content_lines.append(f"({_pdf_escape(line[:95])}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        b"5 0 obj << /Length " + str(len(stream)).encode("ascii") + b" >> stream\n" + stream + b"\nendstream endobj\n",
    ]
    pdf = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj
    xref_offset = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    return pdf


@itineraries_bp.route("/itineraries", methods=["POST"])
@itineraries_bp.route("/trips", methods=["POST"])
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
        "owner_username": username,
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
    _ensure_map_info(itinerary, location)
    itinerary["shared_with"] = []
    itinerary["shared_permissions"] = {}
    _sync_itinerary_calculations(itinerary)
    save_itinerary(itinerary)
    _audit(username, "created", itinerary["id"], {"title": title})
    itinerary["suggestions"] = _find_trip_suggestions(location, _parse_budget(data, cost_breakdown["total_budget"]))
    return jsonify(itinerary), 201


@itineraries_bp.route("/itineraries/<itinerary_id>", methods=["PUT"])
@itineraries_bp.route("/trips/<itinerary_id>", methods=["PUT"])
def update_itinerary_route(itinerary_id: str):
    """Update an existing itinerary owned by the authenticated user."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to modify this itinerary"}), 403

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
    _ensure_map_info(itinerary, itinerary.get("location", ""))
    _sync_itinerary_calculations(itinerary)
    itinerary["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    update_itinerary(itinerary)
    _audit(username, "updated", itinerary_id, {"fields": list(data.keys())})
    return jsonify(itinerary), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/share", methods=["POST"])
@itineraries_bp.route("/trips/<itinerary_id>/share", methods=["POST"])
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
    permission = data.get("permission", "view").strip().lower()
    if not share_username:
        return jsonify({"error": "username is required to share"}), 400
    if permission not in {"view", "edit"}:
        return jsonify({"error": "permission must be view or edit"}), 400

    user = get_user_by_username(share_username)
    if not user:
        return jsonify({"error": "shared user not found"}), 404

    shared_with = itinerary.setdefault("shared_with", [])
    shared_permissions = itinerary.setdefault("shared_permissions", {})
    if share_username in shared_with:
        shared_permissions[share_username] = permission
        update_itinerary(itinerary)
        _audit(username, "share_permission_updated", itinerary_id, {"shared_with": share_username, "permission": permission})
        return jsonify({"message": "already shared", "itinerary": itinerary}), 200

    shared_with.append(share_username)
    shared_permissions[share_username] = permission
    update_itinerary(itinerary)
    _audit(username, "shared", itinerary_id, {"shared_with": share_username, "permission": permission})
    _notify(
        share_username,
        "itinerary_shared",
        f"{username} shared {itinerary.get('title')} with you.",
        {"itinerary_id": itinerary_id, "permission": permission},
    )
    return jsonify({"message": "itinerary shared", "shared_with": shared_with, "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/suggestions", methods=["GET"])
@itineraries_bp.route("/trips/suggestions", methods=["GET"])
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
@itineraries_bp.route("/trips", methods=["GET"])
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


@itineraries_bp.route("/media/upload", methods=["POST"])
def upload_media():
    """Upload an image/video file and create a media post."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "file is required"}), 400

    media_type = request.form.get("type", "photo").strip()
    caption = request.form.get("caption", "")
    group_id = request.form.get("group_id") or None
    if group_id:
        group = get_group_by_id(group_id)
        if not group:
            return jsonify({"error": "group not found"}), 404
        if username not in group.get("members", []):
            return jsonify({"error": "must join the group before posting"}), 403

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}-{secure_filename(uploaded_file.filename)}"
    filepath = os.path.join(UPLOADS_DIR, filename)
    uploaded_file.save(filepath)
    url = f"/api/uploads/{filename}"
    media_item = {
        "id": str(uuid.uuid4()),
        "username": username,
        "type": media_type,
        "url": url,
        "caption": caption,
        "group_id": group_id,
        "itinerary_id": request.form.get("itinerary_id"),
        "tags": [tag.strip() for tag in request.form.get("tags", "").split(",") if tag.strip()],
        "likes": [],
        "comments": [],
        "shared_with": [],
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    save_media(media_item)
    return jsonify(media_item), 201


@itineraries_bp.route("/uploads/<filename>", methods=["GET"])
def uploaded_media_file(filename: str):
    return send_from_directory(UPLOADS_DIR, filename)


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
@itineraries_bp.route("/trips/<itinerary_id>/join", methods=["POST"])
def join_itinerary(itinerary_id: str):
    """Join an existing itinerary and optionally pay a share of the trip."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    if username in itinerary.get("participants", []):
        return jsonify({"message": "already joined", "itinerary": itinerary}), 200

    data = request.get_json(silent=True) or {}
    payment_amount = data.get("payment_amount")
    payment_method = data.get("payment_method", "mobile")

    receipt = None
    if payment_amount is not None:
        parsed_amount = _parse_positive_amount(payment_amount)
        if parsed_amount is None:
            return jsonify({"error": "payment_amount must be a positive number"}), 400

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
                parsed_amount,
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
                parsed_amount,
                payment_method,
                target_type,
                target_id,
                0.0,
                note=note,
            )

        payment = {
            "username": username,
            "amount": parsed_amount,
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
    _audit(username, "joined", itinerary_id)
    if itinerary.get("username") != username:
        _notify(
            itinerary.get("username"),
            "itinerary_joined",
            f"{username} joined {itinerary.get('title')}.",
            {"itinerary_id": itinerary_id},
        )
    return jsonify({"message": "joined itinerary", "itinerary": itinerary, "receipt": receipt}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/pay", methods=["POST"])
@itineraries_bp.route("/trips/<itinerary_id>/pay", methods=["POST"])
def pay_itinerary(itinerary_id: str):
    """Process a mobile payment for a trip, event ticket, or itinerary share."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    data = request.get_json(silent=True) or {}
    target_type = data.get("target_type", "total")
    target_id = data.get("target_id")
    amount = data.get("amount")
    payment_method = data.get("payment_method", "mobile")
    try:
        commission_rate = float(data.get("commission_rate", itinerary.get("event_listing", {}).get("commission_rate", 0.05)))
    except (TypeError, ValueError):
        return jsonify({"error": "commission_rate must be a number"}), 400
    note = data.get("note", "")

    parsed_amount = _parse_positive_amount(amount)
    if parsed_amount is None:
        return jsonify({"error": "amount must be a positive number"}), 400

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
        parsed_amount,
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
        "amount": parsed_amount,
        "method": payment_method,
        "receipt_id": receipt["id"],
        "paid_at": receipt["paid_at"],
    }
    itinerary.setdefault("payments", []).append(payment)
    itinerary["payment_status"] = "paid"
    update_itinerary(itinerary)
    _audit(username, "payment_recorded", itinerary_id, {"amount": parsed_amount, "target_type": target_type})
    if itinerary.get("username") != username:
        _notify(
            itinerary.get("username"),
            "payment_recorded",
            f"{username} recorded a payment for {itinerary.get('title')}.",
            {"itinerary_id": itinerary_id, "receipt_id": receipt["id"], "amount": parsed_amount},
        )

    return jsonify({"message": "payment recorded", "payment": payment, "receipt": receipt, "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/map", methods=["GET"])
@itineraries_bp.route("/trips/<itinerary_id>/map", methods=["GET"])
def itinerary_map(itinerary_id: str):
    """Return map metadata for the requested itinerary."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    return jsonify({
        "itinerary_id": itinerary_id,
        "map_info": itinerary.get("map_info", {}),
        "title": itinerary.get("title"),
        "location": itinerary.get("location"),
    }), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/budget", methods=["GET"])
@itineraries_bp.route("/trips/<itinerary_id>/budget", methods=["GET"])
def itinerary_budget(itinerary_id: str):
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    planned = itinerary.get("cost_breakdown", {}).get("total_budget", 0) or 0
    paid = round(sum(payment.get("amount", 0) or 0 for payment in itinerary.get("payments", [])), 2)
    commissions = round(sum(receipt.get("commission_amount", 0) or 0 for receipt in itinerary.get("receipts", [])), 2)
    return jsonify({
        "itinerary_id": itinerary_id,
        "planned_total": planned,
        "paid_total": paid,
        "remaining_total": round(planned - paid, 2),
        "commission_total": commissions,
        "net_paid_total": round(paid - commissions, 2),
        "cost_breakdown": itinerary.get("cost_breakdown", {}),
        "payments": itinerary.get("payments", []),
        "receipts": itinerary.get("receipts", []),
    }), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/audit", methods=["GET"])
@itineraries_bp.route("/trips/<itinerary_id>/audit", methods=["GET"])
def itinerary_audit(itinerary_id: str):
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403
    entries = get_audit_entries_for_itinerary(itinerary_id)
    entries.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return jsonify(entries), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/invite", methods=["POST"])
@itineraries_bp.route("/trips/<itinerary_id>/invite", methods=["POST"])
def create_itinerary_invite(itinerary_id: str):
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if itinerary.get("username") != username:
        return jsonify({"error": "only the trip owner can create invite links"}), 403

    data = request.get_json(silent=True) or {}
    permission = data.get("permission", "view").strip().lower()
    if permission not in {"view", "edit"}:
        return jsonify({"error": "permission must be view or edit"}), 400
    try:
        max_uses = int(data.get("max_uses", 1))
    except (TypeError, ValueError):
        return jsonify({"error": "max_uses must be an integer"}), 400
    max_uses = max(1, min(max_uses, 100))
    expires_in_days = int(data.get("expires_in_days", 7) or 7)
    expires_at = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=max(1, expires_in_days))).isoformat()
    token = uuid.uuid4().hex
    invite = {
        "token": token,
        "itinerary_id": itinerary_id,
        "created_by": username,
        "permission": permission,
        "max_uses": max_uses,
        "uses": [],
        "expires_at": expires_at,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    save_invite(invite)
    _audit(username, "invite_created", itinerary_id, {"permission": permission, "max_uses": max_uses})
    return jsonify({"invite": invite, "invite_url": f"/join-invite/{token}"}), 201


@itineraries_bp.route("/invites/<token>/join", methods=["POST"])
def join_itinerary_invite(token: str):
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    invite = get_invite_by_token(token)
    if not invite:
        return jsonify({"error": "invite not found"}), 404
    try:
        expires_at = datetime.datetime.fromisoformat(invite.get("expires_at"))
    except (TypeError, ValueError):
        return jsonify({"error": "invite metadata is invalid"}), 400
    if datetime.datetime.now(datetime.timezone.utc) > expires_at:
        return jsonify({"error": "invite has expired"}), 400
    if len(invite.get("uses", [])) >= invite.get("max_uses", 1):
        return jsonify({"error": "invite has no uses remaining"}), 400

    itinerary = get_itinerary_by_id(invite.get("itinerary_id"))
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if username not in itinerary.get("participants", []):
        itinerary.setdefault("participants", []).append(username)
    if username not in itinerary.get("shared_with", []):
        itinerary.setdefault("shared_with", []).append(username)
    itinerary.setdefault("shared_permissions", {})[username] = invite.get("permission", "view")
    invite.setdefault("uses", []).append({"username": username, "used_at": datetime.datetime.now(datetime.timezone.utc).isoformat()})
    update_itinerary(itinerary)
    update_invite(invite)
    _audit(username, "joined_by_invite", itinerary["id"], {"permission": invite.get("permission")})
    _notify(itinerary.get("username"), "itinerary_joined", f"{username} joined {itinerary.get('title')} by invite.", {"itinerary_id": itinerary["id"]})
    return jsonify({"message": "joined itinerary by invite", "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/calendar.ics", methods=["GET"])
@itineraries_bp.route("/trips/<itinerary_id>/calendar.ics", methods=["GET"])
def itinerary_calendar(itinerary_id: str):
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403
    start = itinerary.get("start_date") or datetime.date.today().isoformat()
    end_date = _parse_date(itinerary.get("end_date")) or _parse_date(start) or datetime.date.today()
    end = (end_date + datetime.timedelta(days=1)).isoformat()
    body = "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GlobeTrotter//Itinerary//EN",
        "BEGIN:VEVENT",
        f"UID:{itinerary_id}@globetrotter",
        f"DTSTAMP:{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART;VALUE=DATE:{start.replace('-', '')}",
        f"DTEND;VALUE=DATE:{end.replace('-', '')}",
        f"SUMMARY:{itinerary.get('title', 'GlobeTrotter Trip')}",
        f"LOCATION:{itinerary.get('location', '')}",
        f"DESCRIPTION:{itinerary.get('notes', '')}",
        "END:VEVENT",
        "END:VCALENDAR",
    ])
    return Response(body, mimetype="text/calendar", headers={"Content-Disposition": f"attachment; filename=itinerary-{itinerary_id}.ics"})


@itineraries_bp.route("/itineraries/<itinerary_id>/export.pdf", methods=["GET"])
@itineraries_bp.route("/trips/<itinerary_id>/export.pdf", methods=["GET"])
def itinerary_pdf(itinerary_id: str):
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403
    lines = [
        f"Location: {itinerary.get('location', '')}",
        f"Dates: {itinerary.get('start_date', '')} to {itinerary.get('end_date', '')}",
        f"Budget: {itinerary.get('cost_breakdown', {}).get('total_budget', 0)}",
        f"Participants: {', '.join(itinerary.get('participants', []))}",
        f"Notes: {itinerary.get('notes', '')}",
    ]
    for stage in itinerary.get("stages", []):
        lines.append(f"{stage.get('type')}: {stage.get('name')} - {stage.get('duration_hours')}h - ${stage.get('cost')}")
    pdf_bytes = _simple_pdf(itinerary.get("title", "GlobeTrotter Itinerary"), lines)
    return Response(pdf_bytes, mimetype="application/pdf", headers={"Content-Disposition": f"attachment; filename=itinerary-{itinerary_id}.pdf"})


@itineraries_bp.route("/itineraries/<itinerary_id>/stages/<stage_id>/checklist", methods=["POST", "PATCH"])
@itineraries_bp.route("/trips/<itinerary_id>/stages/<stage_id>/checklist", methods=["POST", "PATCH"])
def itinerary_stage_checklist(itinerary_id: str, stage_id: str):
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to update checklists"}), 403
    stage = next((item for item in itinerary.get("stages", []) if item.get("id") == stage_id), None)
    if not stage:
        return jsonify({"error": "stage not found"}), 404

    data = request.get_json(silent=True) or {}
    checklist = stage.setdefault("checklist", [])
    if request.method == "POST":
        text = data.get("text", "").strip()
        if not text:
            return jsonify({"error": "text is required"}), 400
        item = {"id": str(uuid.uuid4()), "text": text, "done": False}
        checklist.append(item)
    else:
        item_id = data.get("id", "").strip()
        item = next((entry for entry in checklist if entry.get("id") == item_id), None)
        if not item:
            return jsonify({"error": "checklist item not found"}), 404
        if "text" in data:
            item["text"] = data.get("text", item.get("text", "")).strip()
        if "done" in data:
            item["done"] = bool(data.get("done"))

    update_itinerary(itinerary)
    _audit(username, "checklist_updated", itinerary_id, {"stage_id": stage_id})
    return jsonify({"message": "checklist updated", "stage": stage}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/progress", methods=["GET", "PATCH", "POST"])
@itineraries_bp.route("/trips/<itinerary_id>/progress", methods=["GET", "PATCH", "POST"])
def itinerary_progress(itinerary_id: str):
    """Read or update itinerary progress and current stage metadata."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    if request.method == "GET":
        return jsonify({
            "itinerary_id": itinerary_id,
            "progress": itinerary.get("progress", {}),
            "stages": itinerary.get("stages", []),
            "stage_summary": itinerary.get("stage_summary", {}),
        }), 200

    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to update progress"}), 403

    data = request.get_json(silent=True) or {}
    status = data.get("status", itinerary.get("progress", {}).get("status", "in_progress"))
    current_stage_id = data.get("current_stage_id")
    completed_stage_ids = data.get("completed_stage_ids")
    current_location = data.get("current_location", itinerary.get("location", ""))
    expected_completion = data.get("expected_completion", "")

    valid_stage_ids = [stage.get("id") for stage in itinerary.get("stages", [])]
    if current_stage_id and current_stage_id not in valid_stage_ids:
        return jsonify({"error": "current_stage_id does not match an itinerary stage"}), 400

    if completed_stage_ids is None:
        completed_stage_ids = itinerary.get("progress", {}).get("completed_stage_ids", [])
    if not isinstance(completed_stage_ids, list):
        return jsonify({"error": "completed_stage_ids must be a list"}), 400

    invalid_completed = [stage_id for stage_id in completed_stage_ids if stage_id not in valid_stage_ids]
    if invalid_completed:
        return jsonify({"error": "completed_stage_ids contains unknown stages"}), 400

    for stage in itinerary.get("stages", []):
        if stage["id"] in completed_stage_ids:
            stage["status"] = "completed"
        elif current_stage_id and stage["id"] == current_stage_id:
            stage["status"] = "active"
        else:
            stage["status"] = "pending"

    summary = _calculate_stage_summary(itinerary.get("stages", []))
    progress_percent = data.get("progress_percent", summary["progress_percent"])
    try:
        progress_percent = float(progress_percent)
    except (TypeError, ValueError):
        return jsonify({"error": "progress_percent must be a number"}), 400
    progress_percent = max(0, min(progress_percent, 100))

    itinerary["progress"] = {
        "status": status,
        "current_stage_id": current_stage_id or (summary["current_stage"]["id"] if summary["current_stage"] else None),
        "current_location": current_location,
        "expected_completion": expected_completion,
        "progress_percent": progress_percent,
        "completed_stage_ids": completed_stage_ids,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    itinerary["stage_summary"] = _calculate_stage_summary(itinerary.get("stages", []))
    update_itinerary(itinerary)
    _audit(username, "progress_updated", itinerary_id, {"progress_percent": progress_percent})
    notify_users = set(itinerary.get("participants", []) + itinerary.get("shared_with", []))
    notify_users.discard(username)
    for notify_username in notify_users:
        _notify(
            notify_username,
            "progress_updated",
            f"{username} updated progress for {itinerary.get('title')}.",
            {"itinerary_id": itinerary_id, "progress_percent": progress_percent},
        )
    return jsonify({"message": "progress updated", "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/feedback", methods=["POST"])
@itineraries_bp.route("/trips/<itinerary_id>/feedback", methods=["POST"])
def itinerary_feedback(itinerary_id: str):
    """Store trip feedback used by recommendation ranking."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404

    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    data = request.get_json(silent=True) or {}
    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"error": "rating must be an integer from 1 to 5"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "rating must be an integer from 1 to 5"}), 400

    feedback = {
        "id": str(uuid.uuid4()),
        "username": username,
        "rating": rating,
        "comment": data.get("comment", "").strip(),
        "tags": data.get("tags", []),
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    itinerary.setdefault("feedback", []).append(feedback)
    update_itinerary(itinerary)
    _audit(username, "feedback_recorded", itinerary_id, {"rating": rating})
    if itinerary.get("username") != username:
        _notify(
            itinerary.get("username"),
            "feedback_recorded",
            f"{username} left feedback on {itinerary.get('title')}.",
            {"itinerary_id": itinerary_id, "rating": rating},
        )
    return jsonify({"message": "feedback recorded", "feedback": feedback, "itinerary": itinerary}), 201


@itineraries_bp.route("/itineraries/generate", methods=["POST"])
@itineraries_bp.route("/trips/generate", methods=["POST"])
def generate_itinerary():
    """Generate a draft itinerary from local catalogue/resource data."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    data = request.get_json(silent=True) or {}
    location = data.get("location", "").strip()
    if not location:
        return jsonify({"error": "location is required"}), 400

    budget = _parse_budget(data, 500)
    duration_days = int(data.get("duration_days", 3) or 3)
    duration_days = max(1, min(duration_days, 21))
    suggestions = _find_trip_suggestions(location, budget)

    selected_hotel = suggestions["hotels"][0] if suggestions["hotels"] else {"name": f"{location} central stay", "location": location, "cost_per_night": 0}
    selected_activities = suggestions["activities"][: min(3, duration_days)]
    selected_places = suggestions["places"][: min(3, duration_days)]
    start_date = data.get("start_date", "")
    end_date = data.get("end_date", "")
    if start_date and not end_date:
        start = _parse_date(start_date)
        if start:
            end_date = (start + datetime.timedelta(days=duration_days - 1)).isoformat()

    draft = {
        "title": data.get("title") or f"{duration_days}-day {location} trip",
        "location": location,
        "hotel": selected_hotel,
        "activities": selected_activities,
        "places_to_visit": selected_places,
        "start_date": start_date,
        "end_date": end_date,
        "notes": "Generated from local GlobeTrotter catalogue and resource matches.",
        "budget": budget,
    }
    draft["cost_breakdown"] = _calculate_cost_breakdown(draft)
    draft["stages"] = _build_stage_plan(draft)
    draft["stage_summary"] = _calculate_stage_summary(draft["stages"])
    draft["duration_days"] = _calculate_duration_days(start_date, end_date) or duration_days
    draft["duration_hours"] = draft["stage_summary"]["duration_hours"]

    return jsonify({"generated_itinerary": draft, "suggestions": suggestions}), 200


@itineraries_bp.route("/notifications", methods=["GET"])
def list_notifications():
    """List notifications for the authenticated user."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    unread_only = request.args.get("unread_only", "").lower() in {"1", "true", "yes"}
    notifications = get_notifications_for_user(username, unread_only=unread_only)
    notifications.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return jsonify(notifications), 200


@itineraries_bp.route("/notifications/<notification_id>/read", methods=["POST"])
def mark_notification_read(notification_id: str):
    """Mark one notification as read."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    notification = None
    for item in get_notifications_for_user(username):
        if item.get("id") == notification_id:
            notification = item
            break
    if not notification:
        return jsonify({"error": "notification not found"}), 404

    notification["read"] = True
    notification["read_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    update_notification(notification)
    return jsonify({"message": "notification marked read", "notification": notification}), 200
