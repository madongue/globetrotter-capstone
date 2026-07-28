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
from app.cameroon_geo import (
    CAMEROON_COUNTRY,
    enrich_cameroon_item,
    ensure_cameroon_location,
    infer_cameroon_geo,
    matches_cameroon_filters,
)
from app.models import (
    get_all_destinations,
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
    update_user,
    UPLOADS_DIR,
)

itineraries_bp = Blueprint("itineraries", __name__)

DEFAULT_CURRENCY = "XAF"
DEFAULT_CURRENCY_LABEL = "FCFA"
GOOGLE_MAPS_DATA_CATEGORIES = [
    "place details",
    "photos",
    "reviews",
    "directions",
    "street view",
    "nearby hotels",
    "nearby restaurants",
    "nearby attractions",
    "public transport",
    "traffic",
]


def _map_link(query: str) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote_plus(query)}"


def _directions_link(query: str) -> str:
    encoded_query = urllib.parse.quote_plus(query)
    return f"https://www.google.com/maps/dir/?api=1&destination={encoded_query}"


def _embed_link(query: str) -> str:
    return f"https://www.google.com/maps?q={urllib.parse.quote_plus(query)}&output=embed"


def _is_cameroon_context(query: str) -> bool:
    return True


def _map_query(item: dict, fallback_location: str = "") -> str:
    name = item.get("name", "")
    location = item.get("location") or fallback_location
    query = ", ".join(part for part in [name, location] if part).strip()
    if not query:
        return CAMEROON_COUNTRY
    return ensure_cameroon_location(query)


def _cameroon_map_searches(query: str) -> dict:
    query = ensure_cameroon_location(query)
    return {
        "hotels": _map_link(f"hotels near {query}"),
        "restaurants": _map_link(f"restaurants near {query}"),
        "attractions": _map_link(f"tourist attractions near {query}"),
        "transport": _map_link(f"transport near {query}"),
        "hospitals": _map_link(f"hospitals near {query}"),
        "pharmacies": _map_link(f"pharmacies near {query}"),
        "banks": _map_link(f"banks near {query}"),
    }


def _google_maps_metadata(query: str) -> dict:
    query = ensure_cameroon_location(query)
    geo = infer_cameroon_geo(query)
    metadata = {
        "provider": "google_maps",
        "query": query,
        "google_map_url": _map_link(query),
        "google_maps_search_url": _map_link(query),
        "google_maps_directions_url": _directions_link(query),
        "google_maps_embed_url": _embed_link(query),
        "available_google_maps_data": GOOGLE_MAPS_DATA_CATEGORIES,
        "cameroon_focus": True,
        "country_focus": CAMEROON_COUNTRY,
        "country": CAMEROON_COUNTRY,
        "country_code": "CM",
        "region": geo.get("region", ""),
        "division": geo.get("division", ""),
        "subdivision": geo.get("subdivision", ""),
        "city": geo.get("city", ""),
        "quarter": geo.get("quarter", ""),
        "cameroon_searches": _cameroon_map_searches(query),
    }
    return metadata


def _ensure_map_info(item: dict, fallback_location: str = "") -> None:
    item.update(enrich_cameroon_item(item))
    query = _map_query(item, fallback_location)
    if not query:
        return
    map_info = item.setdefault("map_info", {})
    for key, value in _google_maps_metadata(query).items():
        map_info.setdefault(key, value)


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
        "currency": data.get("currency", DEFAULT_CURRENCY),
        "currency_label": DEFAULT_CURRENCY_LABEL,
    }


def _money_label(amount: float | int | None, currency_label: str = DEFAULT_CURRENCY_LABEL) -> str:
    amount = amount or 0
    if currency_label == DEFAULT_CURRENCY_LABEL:
        return f"{round(amount):,} {currency_label}".replace(",", " ")
    return f"{amount:.2f} {currency_label}"


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
    itinerary.setdefault("day_plans", _default_day_plans(itinerary, stages))
    itinerary.setdefault("packing_list", _default_packing_list(itinerary))
    itinerary.setdefault("expenses", [])
    itinerary.setdefault("documents", [])


def _default_day_plans(itinerary: dict, stages: list | None = None) -> list:
    stages = stages or itinerary.get("stages", [])
    duration_days = _calculate_duration_days(itinerary.get("start_date", ""), itinerary.get("end_date", "")) or 1
    duration_days = max(1, min(duration_days, 21))
    day_plans = []
    for day_index in range(duration_days):
        stage_slice = [
            stage for index, stage in enumerate(stages)
            if duration_days == 1 or index % duration_days == day_index
        ]
        day_plans.append({
            "id": f"day-{day_index + 1}",
            "day": day_index + 1,
            "title": f"Day {day_index + 1}",
            "date": _day_plan_date(itinerary.get("start_date", ""), day_index),
            "notes": "",
            "stage_ids": [stage.get("id") for stage in stage_slice if stage.get("id")],
        })
    return day_plans


def _day_plan_date(start_date: str, offset_days: int) -> str:
    parsed_start = _parse_date(start_date)
    if not parsed_start:
        return ""
    return (parsed_start + datetime.timedelta(days=offset_days)).isoformat()


def _default_packing_list(itinerary: dict) -> list:
    region = itinerary.get("region", "")
    tags = " ".join(
        tag
        for item in itinerary.get("activities", []) + itinerary.get("places_to_visit", [])
        for tag in item.get("tags", [])
    ).lower()
    base_items = [
        ("Documents", "National ID or passport"),
        ("Documents", "Booking receipts and confirmation codes"),
        ("Money", "FCFA cash for local transport and entry fees"),
        ("Health", "Personal medication and first-aid basics"),
        ("Power", "Phone charger and power bank"),
    ]
    if any(term in tags for term in ["hiking", "mountain", "nature", "waterfall"]) or region in {"North", "Far North", "South West", "West"}:
        base_items.extend([
            ("Outdoor", "Comfortable walking shoes"),
            ("Outdoor", "Rain jacket or light waterproof layer"),
            ("Outdoor", "Reusable water bottle"),
        ])
    if any(term in tags for term in ["beach", "waterfall"]) or "Kribi" in itinerary.get("location", ""):
        base_items.extend([
            ("Beach", "Swimwear and towel"),
            ("Beach", "Sun protection"),
        ])
    return [
        {"id": str(uuid.uuid4()), "category": category, "text": text, "packed": False, "assigned_to": ""}
        for category, text in base_items
    ]


def _stage_lookup(itinerary: dict) -> dict:
    return {stage.get("id"): stage for stage in itinerary.get("stages", []) if stage.get("id")}


def _route_plan_for_itinerary(itinerary: dict, ordered_stage_ids: list | None = None) -> dict:
    stages_by_id = _stage_lookup(itinerary)
    stage_ids = ordered_stage_ids or [stage.get("id") for stage in itinerary.get("stages", []) if stage.get("id")]
    ordered_stages = [stages_by_id[stage_id] for stage_id in stage_ids if stage_id in stages_by_id]
    waypoints = [
        {
            "stage_id": stage.get("id"),
            "name": stage.get("name"),
            "type": stage.get("type"),
            "location": ensure_cameroon_location(stage.get("location") or itinerary.get("location", "")),
            "map_url": stage.get("map_info", {}).get("google_map_url") or _map_link(stage.get("location") or stage.get("name") or itinerary.get("location", "")),
        }
        for stage in ordered_stages
    ]
    locations = [point["location"] for point in waypoints]
    if len(locations) >= 2:
        directions_url = "https://www.google.com/maps/dir/?api=1&" + urllib.parse.urlencode({
            "origin": locations[0],
            "destination": locations[-1],
            "waypoints": "|".join(locations[1:-1]),
            "travelmode": "driving",
        })
    elif locations:
        directions_url = _map_link(locations[0])
    else:
        directions_url = _map_link(itinerary.get("location", CAMEROON_COUNTRY))
    return {
        "strategy": "catalogue_order",
        "country_focus": CAMEROON_COUNTRY,
        "waypoints": waypoints,
        "google_maps_directions_url": directions_url,
        "estimated_stop_count": len(waypoints),
        "note": "Route order follows the itinerary day/stage order and exports to Google Maps for live directions.",
    }


def _expense_summary(itinerary: dict) -> dict:
    expenses = itinerary.get("expenses", [])
    participants = itinerary.get("participants", []) or [itinerary.get("username")]
    participants = [participant for participant in participants if participant]
    paid_by = {}
    owed_by = {participant: 0 for participant in participants}
    total = 0.0
    for expense in expenses:
        amount = float(expense.get("amount", 0) or 0)
        total += amount
        payer = expense.get("paid_by") or itinerary.get("username")
        paid_by[payer] = paid_by.get(payer, 0) + amount
        split_with = expense.get("split_with") or participants
        if not split_with:
            split_with = participants
        share = amount / len(split_with) if split_with else amount
        for username in split_with:
            owed_by[username] = owed_by.get(username, 0) + share
    balances = [
        {
            "username": username,
            "paid": round(paid_by.get(username, 0), 2),
            "owes": round(owed_by.get(username, 0), 2),
            "balance": round(paid_by.get(username, 0) - owed_by.get(username, 0), 2),
        }
        for username in sorted(set(participants + list(paid_by)))
    ]
    return {
        "currency": DEFAULT_CURRENCY,
        "currency_label": DEFAULT_CURRENCY_LABEL,
        "expense_total": round(total, 2),
        "participants": participants,
        "balances": balances,
    }


def _parse_budget(data: dict, default: float) -> float:
    budget = data.get("budget")
    if budget is None:
        return default
    try:
        return float(budget)
    except (TypeError, ValueError):
        return default


def _match_resources(resources: list, location: str, budget: float | None, cost_field: str, geo_filters: dict | None = None):
    location_lower = location.lower()
    location_terms = [
        term.strip()
        for term in location_lower.replace(",", " ").split()
        if term.strip() and term.strip() not in {"cameroon", "cameroun"}
    ]
    matches = []
    for resource in resources:
        resource = enrich_cameroon_item(resource)
        _ensure_map_info(resource, location)
        if not resource.get("location"):
            continue
        searchable_location = " ".join([
            resource.get("location", ""),
            resource.get("region", ""),
            resource.get("division", ""),
            resource.get("subdivision", ""),
            resource.get("city", ""),
            resource.get("quarter", ""),
        ]).lower()
        if location_terms and not any(term in searchable_location for term in location_terms):
            continue
        if geo_filters and not matches_cameroon_filters(resource, geo_filters):
            continue
        cost = resource.get(cost_field, 0) or 0
        if budget is not None and cost > budget:
            continue
        matches.append(resource)
    return matches


def _find_trip_suggestions(location: str, budget: float | None, geo_filters: dict | None = None) -> dict:
    return {
        "hotels": _match_resources(get_all_hotels(), location, budget, "cost_per_night", geo_filters)[:3],
        "activities": _match_resources(get_all_activities(), location, budget, "cost", geo_filters)[:5],
        "places": _match_resources(get_all_places(), location, budget, "cost", geo_filters)[:5],
    }


def _find_place(place_id: str | None) -> dict | None:
    if not place_id:
        return None
    for place in get_all_places():
        if place.get("id") == place_id:
            enriched = enrich_cameroon_item(dict(place))
            _ensure_map_info(enriched, enriched.get("location", ""))
            return enriched
    return None


def _place_summary(place: dict) -> dict:
    return {
        "id": place.get("id"),
        "name": place.get("name", ""),
        "location": place.get("location", ""),
        "region": place.get("region", ""),
        "division": place.get("division", ""),
        "subdivision": place.get("subdivision", ""),
        "city": place.get("city", ""),
        "quarter": place.get("quarter", ""),
        "tags": place.get("tags", []),
        "cost": place.get("cost", 0),
        "cost_notes": place.get("cost_notes", ""),
        "image_url": place.get("image_url", ""),
        "map_info": place.get("map_info", {}),
    }


def _attach_place_context(payload: dict, place_id: str | None) -> tuple[dict, dict | None, tuple | None]:
    if not place_id:
        return payload, None, None
    place = _find_place(place_id)
    if not place:
        return payload, None, (jsonify({"error": "place not found"}), 404)
    payload.update({
        "place_id": place.get("id"),
        "place_name": place.get("name", ""),
        "location": place.get("location", ""),
        "region": place.get("region", ""),
        "division": place.get("division", ""),
        "subdivision": place.get("subdivision", ""),
        "city": place.get("city", ""),
        "quarter": place.get("quarter", ""),
        "place": _place_summary(place),
    })
    payload["tags"] = sorted(set((payload.get("tags") or []) + (place.get("tags") or [])))
    return payload, place, None


def _record_user_browsing_event(username: str, event_data: dict) -> dict | None:
    user = get_user_by_username(username)
    if not user:
        return None
    event = {
        "id": str(uuid.uuid4()),
        "event_type": event_data.get("event_type", "view"),
        "place_id": event_data.get("place_id"),
        "place_name": event_data.get("place_name", ""),
        "resource_type": event_data.get("resource_type", "place"),
        "city": event_data.get("city", ""),
        "region": event_data.get("region", ""),
        "division": event_data.get("division", ""),
        "subdivision": event_data.get("subdivision", ""),
        "quarter": event_data.get("quarter", ""),
        "tags": event_data.get("tags", []),
        "viewed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    place = _find_place(event["place_id"])
    if place:
        event.update({
            "place_name": place.get("name", ""),
            "city": place.get("city", ""),
            "region": place.get("region", ""),
            "division": place.get("division", ""),
            "subdivision": place.get("subdivision", ""),
            "quarter": place.get("quarter", ""),
            "tags": sorted(set((event.get("tags") or []) + (place.get("tags") or []))),
        })
    history = user.setdefault("browsing_history", [])
    history.append(event)
    del history[:-75]
    update_user(user)
    return event


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
        "currency": itinerary.get("currency", DEFAULT_CURRENCY),
        "currency_label": itinerary.get("currency_label", DEFAULT_CURRENCY_LABEL),
        "commission_rate": commission_rate,
        "commission_amount": round(amount * commission_rate, 2),
        "net_amount": round(amount - (amount * commission_rate), 2),
        "method": method,
        "note": note,
        "paid_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    itinerary.setdefault("receipts", []).append(receipt)
    return receipt


def _find_stage(itinerary: dict, stage_id: str | None) -> dict | None:
    if not stage_id:
        return None
    return next((stage for stage in itinerary.get("stages", []) if stage.get("id") == stage_id), None)


def _find_reservation(itinerary: dict, reservation_id: str) -> dict | None:
    return next((item for item in itinerary.get("reservations", []) if item.get("id") == reservation_id), None)


def _reservation_amount(data: dict, stage: dict | None) -> float | None:
    amount = data.get("amount")
    if amount is None and stage:
        amount = stage.get("cost", 0)
    return _parse_positive_amount(amount)


def _booking_receipt(itinerary: dict, username: str, amount: float, reservation_id: str, method: str, note: str) -> dict:
    return _create_payment_receipt(
        itinerary,
        username,
        amount,
        method,
        "reservation",
        reservation_id,
        0.0,
        note=note,
    )


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
          "title": "Kribi weekend",
          "location": "Kribi",
          "hotel": {"name": "Beach hotel", "cost_per_night": 55000, "paid": false},
          "activities": [
              {"name": "Lobe Falls tour", "cost": 30000, "paid": false},
          ],
          "places_to_visit": [
              {"name": "Lobe Falls", "cost": 10000, "paid": false}
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
    location = ensure_cameroon_location(data.get("location", "").strip())
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
        **infer_cameroon_geo(location),
        "hotel": hotel,
        "activities": activities,
        "places_to_visit": places_to_visit,
        "start_date": data.get("start_date", ""),
        "end_date": data.get("end_date", ""),
        "notes": data.get("notes", ""),
        "currency": data.get("currency", DEFAULT_CURRENCY),
        "currency_label": data.get("currency_label", DEFAULT_CURRENCY_LABEL),
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
        itinerary["location"] = ensure_cameroon_location(data.get("location", itinerary.get("location", "")).strip())
        itinerary.update(infer_cameroon_geo(itinerary["location"]))
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
    if "currency" in data:
        itinerary["currency"] = data.get("currency") or DEFAULT_CURRENCY
        itinerary["currency_label"] = data.get("currency_label") or DEFAULT_CURRENCY_LABEL
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


@itineraries_bp.route("/itineraries/<itinerary_id>/places", methods=["POST"])
@itineraries_bp.route("/trips/<itinerary_id>/places", methods=["POST"])
def add_place_to_itinerary(itinerary_id: str):
    """Add a Cameroon catalogue place to an existing itinerary."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to add places"}), 403

    data = request.get_json(silent=True) or {}
    place_id = data.get("place_id", "").strip()
    place = _find_place(place_id)
    if not place:
        return jsonify({"error": "place not found"}), 404

    places_to_visit = itinerary.setdefault("places_to_visit", [])
    if any(item.get("id") == place_id for item in places_to_visit):
        return jsonify({"message": "place already in itinerary", "itinerary": itinerary, "place": place}), 200

    places_to_visit.append(place)
    _sync_itinerary_calculations(itinerary)
    update_itinerary(itinerary)
    _audit(username, "place_added", itinerary_id, {"place_id": place_id})
    return jsonify({"message": "place added", "itinerary": itinerary, "place": place}), 201


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

    location = ensure_cameroon_location(request.args.get("location", "").strip())
    budget = _parse_budget({"budget": request.args.get("budget")}, 0) if request.args.get("budget") is not None else None
    geo_filters = {
        "region": request.args.get("region", ""),
        "division": request.args.get("division", ""),
        "subdivision": request.args.get("subdivision", ""),
        "city": request.args.get("city", ""),
        "quarter": request.args.get("quarter", ""),
    }

    if not location:
        return jsonify({"error": "location is required"}), 400

    suggestions = _find_trip_suggestions(location, budget, geo_filters)
    return jsonify({
        "location": location,
        "budget": budget,
        "budget_filter_active": budget is not None,
        "country_focus": CAMEROON_COUNTRY,
        "geography": infer_cameroon_geo(location, *geo_filters.values()),
        "suggestions": suggestions,
    }), 200


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
    place_id = request.args.get("place_id")
    city = request.args.get("city", "").strip().lower()
    media_items = get_all_media()
    if group_id:
        media_items = [item for item in media_items if item.get("group_id") == group_id]
    if place_id:
        media_items = [item for item in media_items if item.get("place_id") == place_id]
    if city:
        media_items = [item for item in media_items if item.get("city", "").lower() == city]
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
    place_id = data.get("place_id") or data.get("resource_id")

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
    media_item, place, error = _attach_place_context(media_item, place_id)
    if error:
        return error
    save_media(media_item)
    if place:
        _record_user_browsing_event(username, {
            "event_type": "photo_upload",
            "place_id": place.get("id"),
            "resource_type": "place",
        })
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
    place_id = request.form.get("place_id") or request.form.get("resource_id") or None
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
    media_item, place, error = _attach_place_context(media_item, place_id)
    if error:
        return error
    save_media(media_item)
    if place:
        _record_user_browsing_event(username, {
            "event_type": "photo_upload",
            "place_id": place.get("id"),
            "resource_type": "place",
        })
    return jsonify(media_item), 201


@itineraries_bp.route("/places/<place_id>/photos", methods=["GET"])
def list_place_photos(place_id: str):
    """Return traveller-uploaded photos for a place."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    place = _find_place(place_id)
    if not place:
        return jsonify({"error": "place not found"}), 404
    photos = [
        item for item in get_all_media()
        if item.get("place_id") == place_id and item.get("type", "photo") == "photo"
    ]
    _record_user_browsing_event(username, {
        "event_type": "view_photos",
        "place_id": place_id,
        "resource_type": "place",
    })
    return jsonify({"place": _place_summary(place), "photos": photos}), 200


@itineraries_bp.route("/wishlist", methods=["GET"])
def list_wishlist():
    """List the authenticated user's saved places."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    return jsonify(user.get("saved_places", [])), 200


@itineraries_bp.route("/wishlist", methods=["POST"])
def save_place_to_wishlist():
    """Save a Cameroon place to the user's trip waitlist."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    data = request.get_json(silent=True) or {}
    place_id = data.get("place_id")
    place = _find_place(place_id)
    if not place:
        return jsonify({"error": "place not found"}), 404

    saved_places = user.setdefault("saved_places", [])
    existing = next((item for item in saved_places if item.get("place_id") == place_id), None)
    if existing:
        existing["notes"] = data.get("notes", existing.get("notes", ""))
        existing["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        update_user(user)
        return jsonify({"message": "place already saved", "saved_place": existing, "saved_places": saved_places}), 200

    saved_place = {
        "id": str(uuid.uuid4()),
        "place_id": place_id,
        "notes": data.get("notes", ""),
        "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        **_place_summary(place),
    }
    saved_places.append(saved_place)
    update_user(user)
    _record_user_browsing_event(username, {
        "event_type": "save",
        "place_id": place_id,
        "resource_type": "place",
    })
    return jsonify({"message": "place saved", "saved_place": saved_place, "saved_places": saved_places}), 201


@itineraries_bp.route("/wishlist/<place_id>", methods=["DELETE"])
def remove_place_from_wishlist(place_id: str):
    """Remove a saved place from the user's waitlist."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    saved_places = user.setdefault("saved_places", [])
    updated_places = [item for item in saved_places if item.get("place_id") != place_id]
    if len(updated_places) == len(saved_places):
        return jsonify({"error": "saved place not found"}), 404
    user["saved_places"] = updated_places
    update_user(user)
    return jsonify({"message": "place removed", "saved_places": updated_places}), 200


@itineraries_bp.route("/browsing-events", methods=["GET", "POST"])
def browsing_events():
    """Record or list place browsing signals for personalised suggestions."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    if request.method == "GET":
        return jsonify(user.get("browsing_history", [])), 200

    data = request.get_json(silent=True) or {}
    event = _record_user_browsing_event(username, data)
    if not event:
        return jsonify({"error": "user not found"}), 404
    return jsonify({"message": "browsing event recorded", "event": event}), 201


@itineraries_bp.route("/recommendations/cities", methods=["GET"])
def get_city_recommendations():
    """Return personalised Cameroon city recommendations."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    try:
        limit = int(request.args.get("limit", 6))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    preferences = {item.lower() for item in user.get("preferences", [])}
    browsing_history = user.get("browsing_history", [])
    saved_places = user.get("saved_places", [])
    browsed_cities = {item.get("city", "").lower() for item in browsing_history if item.get("city")}
    browsed_tags = {
        tag.lower()
        for item in browsing_history
        for tag in item.get("tags", [])
    }
    saved_cities = {item.get("city", "").lower() for item in saved_places if item.get("city")}
    saved_tags = {
        tag.lower()
        for item in saved_places
        for tag in item.get("tags", [])
    }

    city_index: dict[str, dict] = {}
    for item_type, catalogue in [("destination", get_all_destinations()), ("place", get_all_places())]:
        for raw_item in catalogue:
            item = enrich_cameroon_item(dict(raw_item))
            city = item.get("city") or item.get("location") or item.get("name")
            if not city:
                continue
            key = city.lower()
            entry = city_index.setdefault(key, {
                "city": city,
                "region": item.get("region", ""),
                "division": item.get("division", ""),
                "subdivision": item.get("subdivision", ""),
                "country": CAMEROON_COUNTRY,
                "match_score": 0,
                "places_count": 0,
                "top_places": [],
                "image_url": item.get("image_url", ""),
                "signals": {
                    "preference_matches": [],
                    "browsing_matches": [],
                    "saved_matches": [],
                },
            })
            tags = {tag.lower() for tag in item.get("tags", [])}
            text = " ".join([
                item.get("name", ""),
                item.get("description", ""),
                item.get("location", ""),
                item.get("city", ""),
            ]).lower()
            preference_matches = sorted(tag for tag in preferences if tag in tags or tag in text)
            browsing_matches = sorted(tag for tag in browsed_tags if tag in tags or tag in text)
            saved_matches = sorted(tag for tag in saved_tags if tag in tags or tag in text)
            score = 1
            score += len(preference_matches) * 2
            score += len(browsing_matches) * 2
            score += len(saved_matches) * 3
            if key in browsed_cities:
                score += 4
                entry["signals"]["browsing_matches"].append(city)
            if key in saved_cities:
                score += 5
                entry["signals"]["saved_matches"].append(city)
            entry["match_score"] += score
            if item_type == "place":
                entry["places_count"] += 1
                if len(entry["top_places"]) < 3:
                    _ensure_map_info(item, item.get("location", ""))
                    entry["top_places"].append(_place_summary(item))
            for target, matches in [
                ("preference_matches", preference_matches),
                ("browsing_matches", browsing_matches),
                ("saved_matches", saved_matches),
            ]:
                entry["signals"][target] = sorted(set(entry["signals"][target] + matches))
            if not entry.get("image_url") and item.get("image_url"):
                entry["image_url"] = item.get("image_url")

    recommendations = sorted(city_index.values(), key=lambda item: (-item["match_score"], item["city"]))[:limit]
    return jsonify(recommendations), 200


@itineraries_bp.route("/uploads/<filename>", methods=["GET"])
def uploaded_media_file(filename: str):
    filepath = os.path.join(UPLOADS_DIR, filename)
    if not os.path.exists(filepath):
        placeholder_svg = """<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="Media unavailable"><rect width="640" height="360" fill="#eef2f7"/><rect x="40" y="40" width="560" height="280" rx="20" fill="#d8e0ea"/><path d="M130 260l100-120 78 90 52-62 150 92H130z" fill="#9aa8ba"/><circle cx="456" cy="116" r="34" fill="#f8fafc"/><text x="320" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#475569">Media unavailable</text></svg>"""
        return Response(placeholder_svg, mimetype="image/svg+xml")
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
        "location": ensure_cameroon_location(itinerary.get("location")),
        "provider": "google_maps",
        "country_focus": CAMEROON_COUNTRY,
        "available_google_maps_data": GOOGLE_MAPS_DATA_CATEGORIES,
        "stages": [
            {
                "id": stage.get("id"),
                "type": stage.get("type"),
                "name": stage.get("name"),
                "location": stage.get("location"),
                "map_info": stage.get("map_info", {}),
            }
            for stage in itinerary.get("stages", [])
        ],
    }), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/reservations", methods=["GET", "POST"])
@itineraries_bp.route("/trips/<itinerary_id>/reservations", methods=["GET", "POST"])
def itinerary_reservations(itinerary_id: str):
    """List reservations or confirm a new hotel/activity/place booking."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    if request.method == "GET":
        return jsonify(itinerary.get("reservations", [])), 200

    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to reserve trip items"}), 403

    data = request.get_json(silent=True) or {}
    reservation_type = data.get("type", "place").strip().lower()
    if reservation_type not in {"hotel", "activity", "place", "transport", "other"}:
        return jsonify({"error": "type must be hotel, activity, place, transport, or other"}), 400
    stage = _find_stage(itinerary, data.get("stage_id"))
    amount = _reservation_amount(data, stage)
    if amount is None:
        return jsonify({"error": "amount must be a positive number"}), 400
    item_name = data.get("item_name", "").strip() or (stage.get("name") if stage else "")
    if not item_name:
        return jsonify({"error": "item_name is required"}), 400

    reservation_id = str(uuid.uuid4())
    receipt = _booking_receipt(
        itinerary,
        username,
        amount,
        reservation_id,
        data.get("payment_method", "mobile"),
        data.get("note", "") or f"{reservation_type.title()} booking confirmation",
    )
    reservation = {
        "id": reservation_id,
        "type": reservation_type,
        "status": "confirmed",
        "stage_id": data.get("stage_id"),
        "resource_id": data.get("resource_id"),
        "item_name": item_name,
        "provider": data.get("provider", ""),
        "quantity": int(data.get("quantity", 1) or 1),
        "amount": amount,
        "currency": itinerary.get("currency", DEFAULT_CURRENCY),
        "currency_label": itinerary.get("currency_label", DEFAULT_CURRENCY_LABEL),
        "payment_method": data.get("payment_method", "mobile"),
        "confirmation_code": f"GT-{reservation_id[:8].upper()}",
        "receipt_id": receipt["id"],
        "notes": data.get("notes", ""),
        "history": [
            {
                "action": "confirmed",
                "username": username,
                "created_at": receipt["paid_at"],
                "amount": amount,
            }
        ],
        "created_at": receipt["paid_at"],
        "updated_at": receipt["paid_at"],
    }
    itinerary.setdefault("reservations", []).append(reservation)
    itinerary.setdefault("payments", []).append({
        "username": username,
        "target_type": "reservation",
        "target_id": reservation_id,
        "amount": amount,
        "method": reservation["payment_method"],
        "receipt_id": receipt["id"],
        "paid_at": receipt["paid_at"],
    })
    update_itinerary(itinerary)
    _audit(username, "reservation_confirmed", itinerary_id, {"reservation_id": reservation_id, "amount": amount})
    return jsonify({"message": "booking confirmed", "reservation": reservation, "receipt": receipt, "itinerary": itinerary}), 201


@itineraries_bp.route("/itineraries/<itinerary_id>/reservations/<reservation_id>", methods=["PATCH", "DELETE"])
@itineraries_bp.route("/trips/<itinerary_id>/reservations/<reservation_id>", methods=["PATCH", "DELETE"])
def itinerary_reservation_detail(itinerary_id: str, reservation_id: str):
    """Modify or cancel a confirmed reservation on a trip."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to modify reservations"}), 403
    reservation = _find_reservation(itinerary, reservation_id)
    if not reservation:
        return jsonify({"error": "reservation not found"}), 404

    data = request.get_json(silent=True) or {}
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if request.method == "DELETE":
        reservation["status"] = "cancelled"
        reservation["cancelled_at"] = now
        reservation["cancellation_reason"] = data.get("reason", "")
        reservation["updated_at"] = now
        reservation.setdefault("history", []).append({
            "action": "cancelled",
            "username": username,
            "created_at": now,
            "reason": data.get("reason", ""),
        })
        update_itinerary(itinerary)
        _audit(username, "reservation_cancelled", itinerary_id, {"reservation_id": reservation_id})
        return jsonify({"message": "reservation cancelled", "reservation": reservation, "itinerary": itinerary}), 200

    editable_fields = ["item_name", "provider", "quantity", "notes", "stage_id", "resource_id"]
    for field in editable_fields:
        if field in data:
            reservation[field] = data[field]
    if "amount" in data:
        amount = _parse_positive_amount(data.get("amount"))
        if amount is None:
            return jsonify({"error": "amount must be a positive number"}), 400
        reservation["amount"] = amount
    if "status" in data:
        if data["status"] not in {"confirmed", "pending", "cancelled"}:
            return jsonify({"error": "status must be confirmed, pending, or cancelled"}), 400
        reservation["status"] = data["status"]
    reservation["updated_at"] = now
    reservation.setdefault("history", []).append({
        "action": "modified",
        "username": username,
        "created_at": now,
        "changes": list(data.keys()),
    })
    update_itinerary(itinerary)
    _audit(username, "reservation_modified", itinerary_id, {"reservation_id": reservation_id, "fields": list(data.keys())})
    return jsonify({"message": "reservation modified", "reservation": reservation, "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/tracking", methods=["GET", "PATCH", "POST"])
@itineraries_bp.route("/trips/<itinerary_id>/tracking", methods=["GET", "PATCH", "POST"])
def itinerary_tracking(itinerary_id: str):
    """Read or update live trip tracking coordinates for the itinerary map."""
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
            "tracking": itinerary.get("live_tracking", {}),
            "map_info": itinerary.get("map_info", {}),
            "progress": itinerary.get("progress", {}),
        }), 200
    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to update tracking"}), 403

    data = request.get_json(silent=True) or {}
    try:
        latitude = float(data.get("latitude"))
        longitude = float(data.get("longitude"))
    except (TypeError, ValueError):
        return jsonify({"error": "latitude and longitude must be numbers"}), 400
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return jsonify({"error": "latitude or longitude is outside valid bounds"}), 400

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    query = ensure_cameroon_location(data.get("current_location", itinerary.get("location", "")))
    tracking = itinerary.setdefault("live_tracking", {})
    point = {
        "latitude": latitude,
        "longitude": longitude,
        "current_location": query,
        "current_stage_id": data.get("current_stage_id", itinerary.get("progress", {}).get("current_stage_id")),
        "accuracy_meters": data.get("accuracy_meters"),
        "updated_by": username,
        "updated_at": now,
        "google_map_url": _map_link(f"{latitude},{longitude}"),
        "google_maps_directions_url": _directions_link(f"{latitude},{longitude}"),
        "google_maps_embed_url": _embed_link(f"{latitude},{longitude}"),
    }
    tracking.update(point)
    trail = tracking.setdefault("trail", [])
    trail.append(point)
    del trail[:-100]
    itinerary.setdefault("progress", {})["current_location"] = query
    itinerary["progress"]["updated_at"] = now
    update_itinerary(itinerary)
    _audit(username, "tracking_updated", itinerary_id, {"latitude": latitude, "longitude": longitude})
    return jsonify({"message": "tracking updated", "tracking": tracking, "itinerary": itinerary}), 200


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
        "currency": itinerary.get("currency", DEFAULT_CURRENCY),
        "currency_label": itinerary.get("currency_label", DEFAULT_CURRENCY_LABEL),
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
    currency_label = itinerary.get("currency_label", DEFAULT_CURRENCY_LABEL)
    lines = [
        f"Location: {itinerary.get('location', '')}",
        f"Dates: {itinerary.get('start_date', '')} to {itinerary.get('end_date', '')}",
        f"Budget: {_money_label(itinerary.get('cost_breakdown', {}).get('total_budget', 0), currency_label)}",
        f"Participants: {', '.join(itinerary.get('participants', []))}",
        f"Notes: {itinerary.get('notes', '')}",
    ]
    for stage in itinerary.get("stages", []):
        lines.append(f"{stage.get('type')}: {stage.get('name')} - {stage.get('duration_hours')}h - {_money_label(stage.get('cost'), currency_label)}")
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


@itineraries_bp.route("/itineraries/<itinerary_id>/day-plans", methods=["GET", "PATCH", "POST"])
@itineraries_bp.route("/trips/<itinerary_id>/day-plans", methods=["GET", "PATCH", "POST"])
def itinerary_day_plans(itinerary_id: str):
    """Read or update day-by-day itinerary plans and stage ordering."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    if not itinerary.get("day_plans"):
        itinerary["day_plans"] = _default_day_plans(itinerary)
        update_itinerary(itinerary)

    if request.method == "GET":
        return jsonify({"day_plans": itinerary.get("day_plans", []), "route_plan": _route_plan_for_itinerary(itinerary)}), 200

    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to update day plans"}), 403

    data = request.get_json(silent=True) or {}
    day_plans = data.get("day_plans")
    if not isinstance(day_plans, list):
        return jsonify({"error": "day_plans must be a list"}), 400

    valid_stage_ids = set(_stage_lookup(itinerary))
    normalized_plans = []
    for index, plan in enumerate(day_plans, start=1):
        stage_ids = plan.get("stage_ids", [])
        if not isinstance(stage_ids, list):
            return jsonify({"error": "stage_ids must be a list"}), 400
        invalid_stage_ids = [stage_id for stage_id in stage_ids if stage_id not in valid_stage_ids]
        if invalid_stage_ids:
            return jsonify({"error": "stage_ids contains unknown stages", "stage_ids": invalid_stage_ids}), 400
        normalized_plans.append({
            "id": plan.get("id") or f"day-{index}",
            "day": int(plan.get("day", index) or index),
            "title": plan.get("title") or f"Day {index}",
            "date": plan.get("date", ""),
            "notes": plan.get("notes", ""),
            "stage_ids": stage_ids,
        })

    itinerary["day_plans"] = normalized_plans
    itinerary["route_plan"] = _route_plan_for_itinerary(
        itinerary,
        [stage_id for plan in normalized_plans for stage_id in plan.get("stage_ids", [])],
    )
    update_itinerary(itinerary)
    _audit(username, "day_plans_updated", itinerary_id, {"day_count": len(normalized_plans)})
    return jsonify({"message": "day plans updated", "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/route", methods=["GET", "POST"])
@itineraries_bp.route("/trips/<itinerary_id>/route", methods=["GET", "POST"])
def itinerary_route(itinerary_id: str):
    """Return route optimization metadata and Google Maps directions export."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    ordered_stage_ids = None
    if request.method == "POST":
        if not _can_edit_itinerary(itinerary, username):
            return jsonify({"error": "edit access is required to optimize routes"}), 403
        data = request.get_json(silent=True) or {}
        ordered_stage_ids = data.get("stage_ids")
        if ordered_stage_ids is not None and not isinstance(ordered_stage_ids, list):
            return jsonify({"error": "stage_ids must be a list"}), 400

    route_plan = _route_plan_for_itinerary(itinerary, ordered_stage_ids)
    itinerary["route_plan"] = route_plan
    update_itinerary(itinerary)
    _audit(username, "route_optimized", itinerary_id, {"stop_count": route_plan["estimated_stop_count"]})
    return jsonify({"route_plan": route_plan, "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/packing-list", methods=["GET", "POST", "PATCH"])
@itineraries_bp.route("/trips/<itinerary_id>/packing-list", methods=["GET", "POST", "PATCH"])
def itinerary_packing_list(itinerary_id: str):
    """Manage trip-level packing checklist items."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    packing_list = itinerary.setdefault("packing_list", _default_packing_list(itinerary))
    if request.method == "GET":
        return jsonify({"packing_list": packing_list}), 200

    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to update packing list"}), 403

    data = request.get_json(silent=True) or {}
    if request.method == "POST":
        text = data.get("text", "").strip()
        if not text:
            return jsonify({"error": "text is required"}), 400
        item = {
            "id": str(uuid.uuid4()),
            "category": data.get("category", "General").strip() or "General",
            "text": text,
            "packed": bool(data.get("packed", False)),
            "assigned_to": data.get("assigned_to", "").strip(),
        }
        packing_list.append(item)
    else:
        item_id = data.get("id", "").strip()
        item = next((entry for entry in packing_list if entry.get("id") == item_id), None)
        if not item:
            return jsonify({"error": "packing item not found"}), 404
        for field in ("category", "text", "assigned_to"):
            if field in data:
                item[field] = data.get(field, item.get(field, "")).strip()
        if "packed" in data:
            item["packed"] = bool(data.get("packed"))

    update_itinerary(itinerary)
    _audit(username, "packing_list_updated", itinerary_id, {"item_count": len(packing_list)})
    return jsonify({"message": "packing list updated", "packing_list": packing_list, "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/expenses", methods=["GET", "POST", "PATCH"])
@itineraries_bp.route("/trips/<itinerary_id>/expenses", methods=["GET", "POST", "PATCH"])
def itinerary_expenses(itinerary_id: str):
    """Manage group expenses and per-person split balances."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    expenses = itinerary.setdefault("expenses", [])
    if request.method == "GET":
        return jsonify({"expenses": expenses, "summary": _expense_summary(itinerary)}), 200

    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to update expenses"}), 403

    data = request.get_json(silent=True) or {}
    if request.method == "POST":
        try:
            amount = float(data.get("amount", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "amount must be a number"}), 400
        if amount <= 0:
            return jsonify({"error": "amount must be greater than zero"}), 400
        split_with = data.get("split_with") or itinerary.get("participants", [])
        if isinstance(split_with, str):
            split_with = [item.strip() for item in split_with.split(",") if item.strip()]
        if not isinstance(split_with, list):
            return jsonify({"error": "split_with must be a list"}), 400
        expense = {
            "id": str(uuid.uuid4()),
            "title": data.get("title", "").strip() or "Trip expense",
            "category": data.get("category", "General").strip() or "General",
            "amount": amount,
            "currency": DEFAULT_CURRENCY,
            "currency_label": DEFAULT_CURRENCY_LABEL,
            "paid_by": data.get("paid_by", username).strip() or username,
            "split_with": split_with,
            "notes": data.get("notes", "").strip(),
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        expenses.append(expense)
    else:
        expense_id = data.get("id", "").strip()
        expense = next((entry for entry in expenses if entry.get("id") == expense_id), None)
        if not expense:
            return jsonify({"error": "expense not found"}), 404
        for field in ("title", "category", "paid_by", "notes"):
            if field in data:
                expense[field] = data.get(field, expense.get(field, "")).strip()
        if "amount" in data:
            try:
                expense["amount"] = float(data.get("amount"))
            except (TypeError, ValueError):
                return jsonify({"error": "amount must be a number"}), 400
        if "split_with" in data:
            split_with = data.get("split_with")
            if isinstance(split_with, str):
                split_with = [item.strip() for item in split_with.split(",") if item.strip()]
            if not isinstance(split_with, list):
                return jsonify({"error": "split_with must be a list"}), 400
            expense["split_with"] = split_with

    update_itinerary(itinerary)
    _audit(username, "expenses_updated", itinerary_id, {"expense_count": len(expenses)})
    return jsonify({"message": "expenses updated", "expenses": expenses, "summary": _expense_summary(itinerary), "itinerary": itinerary}), 200


@itineraries_bp.route("/itineraries/<itinerary_id>/documents", methods=["GET", "POST"])
@itineraries_bp.route("/trips/<itinerary_id>/documents", methods=["GET", "POST"])
def itinerary_documents(itinerary_id: str):
    """List or attach trip documents such as receipts, tickets, and confirmations."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    itinerary = get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return jsonify({"error": "itinerary not found"}), 404
    if not _can_access_itinerary(itinerary, username):
        return jsonify({"error": "you do not have access to this itinerary"}), 403

    documents = itinerary.setdefault("documents", [])
    if request.method == "GET":
        return jsonify({"documents": documents}), 200

    if not _can_edit_itinerary(itinerary, username):
        return jsonify({"error": "edit access is required to attach documents"}), 403

    title = request.form.get("title", "").strip() or (request.get_json(silent=True) or {}).get("title", "").strip()
    doc_type = request.form.get("type", "").strip() or (request.get_json(silent=True) or {}).get("type", "document").strip()
    external_url = request.form.get("url", "").strip() or (request.get_json(silent=True) or {}).get("url", "").strip()
    uploaded_file = request.files.get("file")
    url = external_url
    filename = ""
    if uploaded_file and uploaded_file.filename:
        os.makedirs(UPLOADS_DIR, exist_ok=True)
        filename = f"{uuid.uuid4().hex}-{secure_filename(uploaded_file.filename)}"
        filepath = os.path.join(UPLOADS_DIR, filename)
        uploaded_file.save(filepath)
        url = f"/api/uploads/{filename}"
    if not url:
        return jsonify({"error": "file or url is required"}), 400
    document = {
        "id": str(uuid.uuid4()),
        "title": title or filename or "Trip document",
        "type": doc_type or "document",
        "url": url,
        "filename": filename,
        "uploaded_by": username,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    documents.append(document)
    update_itinerary(itinerary)
    _audit(username, "document_attached", itinerary_id, {"document_id": document["id"]})
    return jsonify({"message": "document attached", "document": document, "documents": documents, "itinerary": itinerary}), 201


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
    location = ensure_cameroon_location(data.get("location", "").strip())
    if not location:
        return jsonify({"error": "location is required"}), 400

    budget = _parse_budget(data, 500)
    duration_days = int(data.get("duration_days", 3) or 3)
    duration_days = max(1, min(duration_days, 21))
    geo_filters = {
        "region": data.get("region", ""),
        "division": data.get("division", ""),
        "subdivision": data.get("subdivision", ""),
        "city": data.get("city", ""),
        "quarter": data.get("quarter", ""),
    }
    suggestions = _find_trip_suggestions(location, budget, geo_filters)

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
        **infer_cameroon_geo(location, *geo_filters.values()),
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
