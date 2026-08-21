"""
app/resources.py

Administrative resource management for hotels, activities, and places.

Routes
------
POST   /resources/hotels
POST   /resources/activities
POST   /resources/places
GET    /resources/hotels
GET    /resources/activities
GET    /resources/places
"""
import uuid
import os
import datetime
from flask import Blueprint, request, jsonify

from app.auth import get_current_user
from app.cameroon_geo import enrich_cameroon_item, ensure_cameroon_location, infer_cameroon_geo
from app.media_storage import get_upload_store
from app.models import (
    get_all_hotels,
    save_hotel,
    update_hotel,
    get_all_activities,
    save_activity,
    update_activity,
    get_all_places,
    get_all_media,
    save_place,
    update_place,
    remove_hotel_by_id,
    remove_activity_by_id,
    remove_place_by_id,
    get_user_by_username,
    get_all_place_requests,
    get_place_request_by_id,
    get_place_requests_for_user,
    save_place_request,
    update_place_request,
)

resources_bp = Blueprint("resources", __name__)


RESOURCE_CONFIG = {
    "hotels": (get_all_hotels, update_hotel),
    "activities": (get_all_activities, update_activity),
    "places": (get_all_places, update_place),
}


def _require_admin(request_obj):
    username = get_current_user(request_obj)
    if not username:
        return None, (jsonify({"error": "authentication required"}), 401)

    user = get_user_by_username(username)
    if not user:
        return None, (jsonify({"error": "user not found"}), 404)

    if user.get("role") != "admin":
        return None, (jsonify({"error": "admin access required"}), 403)

    return username, None


def _map_link(query: str) -> str:
    from urllib.parse import quote_plus
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(ensure_cameroon_location(query))}"


def _resource_map_info(name: str, location: str) -> dict:
    query = ensure_cameroon_location(", ".join(part for part in [name, location] if part))
    geo = infer_cameroon_geo(query)
    return {
        "provider": "google_maps",
        "query": query,
        "google_map_url": _map_link(query),
        "google_maps_search_url": _map_link(query),
        "google_maps_embed_url": f"https://www.google.com/maps?q={query.replace(' ', '+')}&output=embed",
        "cameroon_focus": True,
        "country_focus": "Cameroon",
        "region": geo.get("region", ""),
        "division": geo.get("division", ""),
        "subdivision": geo.get("subdivision", ""),
        "city": geo.get("city", ""),
        "quarter": geo.get("quarter", ""),
    }


def _request_data() -> dict:
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        return request.form.to_dict(flat=True)
    return request.get_json(silent=True) or {}


def _list_value(data: dict, key: str) -> list:
    value = data.get(key)
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if item]
    if isinstance(value, str):
        normalized = value.replace(",", "\n")
        return [item.strip() for item in normalized.splitlines() if item.strip()]
    return []


def _number_value(value, field_name: str):
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")


def _save_uploaded_place_media(place_id: str) -> list:
    media_items = []
    if not request.files:
        return media_items
    files = request.files.getlist("media_files") + request.files.getlist("images") + request.files.getlist("videos")
    store = get_upload_store()
    for uploaded_file in files:
        if not uploaded_file or not uploaded_file.filename:
            continue
        stored = store.save(uploaded_file, folder="places")
        media_items.append({
            "id": str(uuid.uuid4()),
            "type": stored["type"],
            "url": stored["url"],
            "filename": stored["filename"],
            "place_id": place_id,
            "caption": "",
            "source": "admin_upload",
        })
    return media_items


def _place_media_from_request(place_id: str, data: dict) -> list:
    media_items = _save_uploaded_place_media(place_id)
    for url in _list_value(data, "image_urls"):
        media_items.append({
            "id": str(uuid.uuid4()),
            "type": "photo",
            "url": url,
            "place_id": place_id,
            "source": "admin_url",
        })
    for url in _list_value(data, "video_urls"):
        media_items.append({
            "id": str(uuid.uuid4()),
            "type": "video",
            "url": url,
            "place_id": place_id,
            "source": "admin_url",
        })
    return media_items


def _with_resource_metadata(resource: dict) -> dict:
    enriched = enrich_cameroon_item(resource)
    if not enriched.get("map_info"):
        enriched["map_info"] = _resource_map_info(enriched.get("name", ""), enriched.get("location", ""))
    return enriched


def _matches_area(item: dict, place: dict) -> bool:
    item = enrich_cameroon_item(item)
    for field in ("city", "subdivision", "division", "region"):
        if place.get(field) and item.get(field) == place.get(field):
            return True
    return False


def _nearby_for_place(place: dict) -> dict:
    hotels = [_with_resource_metadata(item) for item in get_all_hotels() if _matches_area(item, place)]
    activities = [_with_resource_metadata(item) for item in get_all_activities() if _matches_area(item, place)]
    sibling_places = [
        _with_resource_metadata(item)
        for item in get_all_places()
        if item.get("id") != place.get("id") and _matches_area(item, place)
    ]
    hotels.sort(key=lambda item: (float(item.get("cost_per_night", 0) or 0), -float(item.get("rating", 0) or 0)))
    activities.sort(key=lambda item: (float(item.get("cost", 0) or 0), item.get("name", "")))
    sibling_places.sort(key=lambda item: (float(item.get("cost", 0) or 0), item.get("name", "")))
    return {
        "hotels": hotels[:5],
        "activities": activities[:5],
        "places": sibling_places[:5],
    }


def _place_photos(place_id: str) -> list:
    return [
        item for item in get_all_media()
        if item.get("place_id") == place_id and item.get("type", "photo") == "photo"
    ]


def _place_videos(place_id: str) -> list:
    return [
        item for item in get_all_media()
        if item.get("place_id") == place_id and item.get("type") == "video"
    ]


def _offline_guide(place: dict, nearby: dict) -> dict:
    return {
        "title": f"{place.get('name')} travel guide",
        "country_focus": "Cameroon",
        "place": place,
        "nearby": nearby,
        "planning_notes": [
            place.get("cost_note") or "Confirm current local entry and guide fees before travel.",
            place.get("transport_note") or "Confirm local transport before departure.",
            place.get("best_season") or "Check current local weather and road access.",
        ],
        "safety_notes": place.get("safety_notes", []),
        "offline_ready": True,
    }


@resources_bp.route("/resources/hotels", methods=["POST"])
def add_hotel():
    username, error = _require_admin(request)
    if error:
        return error

    data = _request_data()
    name = data.get("name", "").strip()
    location = ensure_cameroon_location(data.get("location", "").strip())
    cost_per_night = data.get("cost_per_night")

    if not name or not location or cost_per_night is None:
        return jsonify({"error": "name, location, and cost_per_night are required"}), 400
    try:
        cost_per_night = _number_value(cost_per_night, "cost_per_night")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    hotel = enrich_cameroon_item({
        "id": str(uuid.uuid4()),
        "name": name,
        "location": location,
        **infer_cameroon_geo(location),
        "rating": data.get("rating", 0),
        "cost_per_night": cost_per_night,
        "tags": data.get("tags", []),
        "description": data.get("description", ""),
        "map_info": data.get("map_info") or _resource_map_info(name, location),
    })
    save_hotel(hotel)
    return jsonify(hotel), 201


@resources_bp.route("/resources/activities", methods=["POST"])
def add_activity():
    username, error = _require_admin(request)
    if error:
        return error

    data = _request_data()
    name = data.get("name", "").strip()
    location = ensure_cameroon_location(data.get("location", "").strip())
    cost = data.get("cost")

    if not name or not location or cost is None:
        return jsonify({"error": "name, location, and cost are required"}), 400
    try:
        cost = _number_value(cost, "cost")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    activity = enrich_cameroon_item({
        "id": str(uuid.uuid4()),
        "name": name,
        "location": location,
        **infer_cameroon_geo(location),
        "duration_hours": data.get("duration_hours", 0),
        "cost": cost,
        "tags": data.get("tags", []),
        "description": data.get("description", ""),
        "map_info": data.get("map_info") or _resource_map_info(name, location),
    })
    save_activity(activity)
    return jsonify(activity), 201


@resources_bp.route("/resources/places", methods=["POST"])
def add_place():
    username, error = _require_admin(request)
    if error:
        return error

    data = _request_data()
    name = data.get("name", "").strip()
    location = ensure_cameroon_location(data.get("location", "").strip())
    cost = data.get("cost")

    if not name or not location or cost is None:
        return jsonify({"error": "name, location, and cost are required"}), 400
    try:
        cost = _number_value(cost, "cost")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    place_id = str(uuid.uuid4())
    map_query = data.get("map_query", "").strip() or ", ".join(part for part in [name, location] if part)
    map_info = data.get("map_info") or _resource_map_info(name, map_query)
    if data.get("latitude") and data.get("longitude"):
        try:
            map_info["latitude"] = float(data.get("latitude"))
            map_info["longitude"] = float(data.get("longitude"))
            map_info["google_map_url"] = _map_link(f"{data.get('latitude')},{data.get('longitude')}")
            map_info["google_maps_embed_url"] = f"https://www.google.com/maps?q={data.get('latitude')},{data.get('longitude')}&output=embed"
        except ValueError:
            return jsonify({"error": "latitude and longitude must be numbers"}), 400
    media_items = _place_media_from_request(place_id, data)
    image_url = data.get("image_url", "").strip() or next((item["url"] for item in media_items if item["type"] == "photo"), "")
    place = enrich_cameroon_item({
        "id": place_id,
        "name": name,
        "location": location,
        **infer_cameroon_geo(location),
        "description": data.get("description", ""),
        "tags": _list_value(data, "tags") or data.get("tags", []),
        "cost": cost,
        "image_url": image_url,
        "media": media_items,
        "images": [item for item in media_items if item["type"] == "photo"],
        "videos": [item for item in media_items if item["type"] == "video"],
        "source_urls": _list_value(data, "source_urls"),
        "related_services": _list_value(data, "related_services"),
        "cost_note": data.get("cost_note", ""),
        "map_query": map_query,
        "map_info": map_info,
    })
    save_place(place)
    return jsonify(place), 201


@resources_bp.route("/resources/hotels", methods=["GET"])
def list_hotels():
    return jsonify([_with_resource_metadata(item) for item in get_all_hotels()]), 200


@resources_bp.route("/resources/hotels/compare", methods=["GET"])
def compare_hotels():
    """Compare hotel prices using Cameroon geography and optional budget filters."""
    location = ensure_cameroon_location(request.args.get("location", "").strip())
    region = request.args.get("region", "").strip().lower()
    city = request.args.get("city", "").strip().lower()
    max_price = request.args.get("max_price") or request.args.get("budget")
    if max_price:
        try:
            max_price = float(max_price)
        except ValueError:
            return jsonify({"error": "max_price must be a number"}), 400
    else:
        max_price = None

    hotels = [_with_resource_metadata(item) for item in get_all_hotels()]
    filtered = []
    for hotel in hotels:
        searchable = " ".join([
            hotel.get("name", ""),
            hotel.get("location", ""),
            hotel.get("region", ""),
            hotel.get("division", ""),
            hotel.get("city", ""),
            hotel.get("quarter", ""),
        ]).lower()
        if location and location.lower() not in searchable:
            continue
        if region and hotel.get("region", "").lower() != region:
            continue
        if city and hotel.get("city", "").lower() != city:
            continue
        price = float(hotel.get("cost_per_night", 0) or 0)
        if max_price is not None and price > max_price:
            continue
        item = dict(hotel)
        item["price_rank"] = 0
        filtered.append(item)

    filtered.sort(key=lambda item: (float(item.get("cost_per_night", 0) or 0), -float(item.get("rating", 0) or 0), item.get("name", "")))
    for index, hotel in enumerate(filtered, start=1):
        hotel["price_rank"] = index
        hotel["comparison_label"] = f"#{index} price: {hotel.get('cost_per_night', 0)} FCFA/night"
    cheapest = filtered[0] if filtered else None
    return jsonify({
        "currency": "XAF",
        "currency_label": "FCFA",
        "count": len(filtered),
        "cheapest": cheapest,
        "hotels": filtered,
    }), 200


@resources_bp.route("/resources/activities", methods=["GET"])
def list_activities():
    return jsonify([_with_resource_metadata(item) for item in get_all_activities()]), 200


def _discovery_rank(place: dict) -> tuple:
    """Order places by how worth visiting they are, best first.

    The catalogue is mostly a bulk OpenStreetMap import -- shops, offices and
    private residences -- with a much smaller hand-written set of genuine
    attractions. Listing them in file order buries the attractions, so curated
    entries with a photograph come first, then anything else with a photograph,
    then the rest.
    """
    curated = bool(place.get("curated"))
    has_own_photo = str(place.get("image_url") or "").startswith("/images/places/")
    has_any_photo = bool(str(place.get("image_url") or "").strip())
    rating = float(place.get("rating") or 0)
    return (
        not curated,
        not has_own_photo,
        not has_any_photo,
        -rating,
        str(place.get("name") or ""),
    )


@resources_bp.route("/resources/places", methods=["GET"])
def list_places():
    """List places, most interesting first.

    ``featured=1`` narrows this to the curated attractions, which is what the
    discovery screens show before a visitor has searched for anything.
    """
    places = sorted(get_all_places(), key=_discovery_rank)

    if request.args.get("featured") in ("1", "true", "yes"):
        places = [item for item in places if item.get("curated")]

    limit = request.args.get("limit")
    if limit:
        try:
            places = places[: max(0, int(limit))]
        except ValueError:
            pass

    return jsonify([_with_resource_metadata(item) for item in places]), 200


@resources_bp.route("/resources/places/<place_id>", methods=["GET"])
def get_place_detail(place_id: str):
    """Return a full Cameroon place guide with nearby services and traveller photos."""
    place = next((item for item in get_all_places() if item.get("id") == place_id), None)
    if not place:
        return jsonify({"error": "place not found"}), 404
    enriched_place = _with_resource_metadata(place)
    nearby = _nearby_for_place(enriched_place)
    return jsonify({
        "place": enriched_place,
        "nearby": nearby,
        "photos": _place_photos(place_id),
        "videos": _place_videos(place_id),
        "guide": _offline_guide(enriched_place, nearby),
    }), 200


@resources_bp.route("/resources/places/<place_id>", methods=["PATCH"])
def update_place_detail(place_id: str):
    """Admin: edit a place's info and location."""
    username, error = _require_admin(request)
    if error:
        return error

    place = next((item for item in get_all_places() if item.get("id") == place_id), None)
    if not place:
        return jsonify({"error": "place not found"}), 404

    data = _request_data()
    for field in ("name", "description", "cost_note", "map_query"):
        if data.get(field) is not None:
            place[field] = data.get(field)
    if data.get("cost") is not None:
        try:
            place["cost"] = _number_value(data.get("cost"), "cost")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if data.get("tags") is not None:
        place["tags"] = _list_value(data, "tags")
    if data.get("location"):
        place["location"] = ensure_cameroon_location(data.get("location"))
        place.update(infer_cameroon_geo(place["location"]))
    for field in ("region", "division", "subdivision", "city", "quarter"):
        if data.get(field) is not None:
            place[field] = data.get(field)
    if data.get("latitude") is not None and data.get("longitude") is not None:
        try:
            place["latitude"] = float(data.get("latitude"))
            place["longitude"] = float(data.get("longitude"))
        except (TypeError, ValueError):
            return jsonify({"error": "latitude and longitude must be numbers"}), 400
        place["map_info"] = _resource_map_info(place.get("name", ""), place.get("map_query") or place.get("location", ""))
    update_place(place)
    return jsonify({"message": "place updated", "place": place}), 200


@resources_bp.route("/resources/places/<place_id>/guide", methods=["GET"])
def get_place_guide(place_id: str):
    """Return an offline-ready guide payload for a Cameroon place."""
    place = next((item for item in get_all_places() if item.get("id") == place_id), None)
    if not place:
        return jsonify({"error": "place not found"}), 404
    enriched_place = _with_resource_metadata(place)
    nearby = _nearby_for_place(enriched_place)
    return jsonify(_offline_guide(enriched_place, nearby)), 200


@resources_bp.route("/resources/places/<place_id>/comment", methods=["GET", "POST"])
def place_comments(place_id: str):
    """Add a comment to a place, or list its comments."""
    place = next((item for item in get_all_places() if item.get("id") == place_id), None)
    if not place:
        return jsonify({"error": "place not found"}), 404

    if request.method == "GET":
        return jsonify(place.get("comments", [])), 200

    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

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
    place.setdefault("comments", []).append(comment)
    update_place(place)
    return jsonify({"message": "comment added", "comment": comment, "place": place}), 201


@resources_bp.route("/resources/hotels/<hotel_id>", methods=["DELETE"])
def delete_hotel(hotel_id: str):
    username, error = _require_admin(request)
    if error:
        return error

    if not remove_hotel_by_id(hotel_id):
        return jsonify({"error": "hotel not found"}), 404
    return jsonify({"message": "hotel removed"}), 200


@resources_bp.route("/resources/activities/<activity_id>", methods=["DELETE"])
def delete_activity(activity_id: str):
    username, error = _require_admin(request)
    if error:
        return error

    if not remove_activity_by_id(activity_id):
        return jsonify({"error": "activity not found"}), 404
    return jsonify({"message": "activity removed"}), 200


@resources_bp.route("/resources/places/<place_id>", methods=["DELETE"])
def delete_place(place_id: str):
    username, error = _require_admin(request)
    if error:
        return error

    if not remove_place_by_id(place_id):
        return jsonify({"error": "place not found"}), 404
    return jsonify({"message": "place removed"}), 200


def _find_resource(resource_type: str, resource_id: str):
    config = RESOURCE_CONFIG.get(resource_type)
    if not config:
        return None, None
    get_all, update = config
    for resource in get_all():
        if resource.get("id") == resource_id:
            return resource, update
    return None, update


@resources_bp.route("/resources/<resource_type>/<resource_id>/reviews", methods=["GET", "POST"])
def resource_reviews(resource_type: str, resource_id: str):
    """List or create reviews for hotels, activities, and places."""
    resource, update_resource = _find_resource(resource_type, resource_id)
    if update_resource is None:
        return jsonify({"error": "resource_type must be hotels, activities, or places"}), 400
    if not resource:
        return jsonify({"error": "resource not found"}), 404

    if request.method == "GET":
        return jsonify(resource.get("reviews", [])), 200

    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    data = request.get_json(silent=True) or {}
    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"error": "rating must be an integer from 1 to 5"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "rating must be an integer from 1 to 5"}), 400

    review = {
        "id": str(uuid.uuid4()),
        "username": username,
        "rating": rating,
        "comment": data.get("comment", "").strip(),
    }
    reviews = resource.setdefault("reviews", [])
    reviews.append(review)
    resource["rating"] = round(sum(item.get("rating", 0) for item in reviews) / len(reviews), 2)
    update_resource(resource)
    return jsonify({"message": "review added", "review": review, "resource": resource}), 201


@resources_bp.route("/resources/requests", methods=["GET", "POST"])
def resource_requests():
    """Submit a place/hotel/activity suggestion, or list submissions."""
    if request.method == "POST":
        username = get_current_user(request)
        if not username:
            return jsonify({"error": "authentication required"}), 401

        data = _request_data()
        resource_type = data.get("type", "places").strip().lower()
        if resource_type not in RESOURCE_CONFIG:
            return jsonify({"error": "type must be hotels, activities, or places"}), 400

        name = data.get("name", "").strip()
        location = ensure_cameroon_location(data.get("location", "").strip())
        cost_field = "cost_per_night" if resource_type == "hotels" else "cost"
        cost = data.get(cost_field)
        if cost is None:
            cost = data.get("cost")

        if not name or not location or cost is None:
            return jsonify({"error": "name, location, and cost are required"}), 400
        try:
            cost = _number_value(cost, cost_field)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        request_id = str(uuid.uuid4())
        map_query = data.get("map_query", "").strip() or ", ".join(part for part in [name, location] if part)
        media_items = _place_media_from_request(request_id, data) if resource_type == "places" else []

        submission = {
            "id": request_id,
            "type": resource_type,
            "name": name,
            "location": location,
            **infer_cameroon_geo(location),
            "description": data.get("description", ""),
            "tags": _list_value(data, "tags") or data.get("tags", []),
            cost_field: cost,
            "cost_note": data.get("cost_note", ""),
            "map_query": map_query,
            "media": media_items,
            "submitted_by": username,
            "status": "pending",
            "submitted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "review_note": "",
        }
        save_place_request(submission)
        return jsonify(submission), 201

    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401
    user = get_user_by_username(username)
    if user and user.get("role") == "admin":
        status_filter = request.args.get("status", "").strip().lower()
        items = get_all_place_requests()
        if status_filter:
            items = [item for item in items if item.get("status") == status_filter]
    else:
        items = get_place_requests_for_user(username)
    items.sort(key=lambda item: item.get("submitted_at", ""), reverse=True)
    return jsonify(items), 200


def _apply_request_decision(request_id, approve, review_note=""):
    submission = get_place_request_by_id(request_id)
    if not submission:
        return None, (jsonify({"error": "request not found"}), 404)
    if submission.get("status") != "pending":
        return None, (jsonify({"error": "request already reviewed"}), 400)

    if approve:
        resource_type = submission.get("type", "places")
        cost_field = "cost_per_night" if resource_type == "hotels" else "cost"
        resource = enrich_cameroon_item({
            "id": str(uuid.uuid4()),
            "name": submission.get("name"),
            "location": submission.get("location"),
            "region": submission.get("region", ""),
            "division": submission.get("division", ""),
            "subdivision": submission.get("subdivision", ""),
            "city": submission.get("city", ""),
            "quarter": submission.get("quarter", ""),
            "description": submission.get("description", ""),
            "tags": submission.get("tags", []),
            cost_field: submission.get(cost_field, 0),
            "cost_note": submission.get("cost_note", ""),
            "map_query": submission.get("map_query", ""),
            "map_info": _resource_map_info(submission.get("name", ""), submission.get("map_query") or submission.get("location", "")),
            "media": submission.get("media", []),
            "images": [item for item in submission.get("media", []) if item.get("type") == "photo"],
            "videos": [item for item in submission.get("media", []) if item.get("type") == "video"],
            "submitted_by": submission.get("submitted_by"),
        })
        if resource_type == "hotels":
            save_hotel(resource)
        elif resource_type == "activities":
            save_activity(resource)
        else:
            save_place(resource)
        submission["resource_id"] = resource.get("id")
        submission["status"] = "approved"
    else:
        submission["status"] = "rejected"

    submission["review_note"] = review_note
    submission["reviewed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    update_place_request(submission)
    return submission, None


@resources_bp.route("/resources/requests/<request_id>/approve", methods=["POST"])
def approve_resource_request(request_id: str):
    username, error = _require_admin(request)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    submission, error = _apply_request_decision(request_id, True, data.get("note", ""))
    if error:
        return error
    return jsonify({"message": "request approved", "request": submission}), 200


@resources_bp.route("/resources/requests/<request_id>/reject", methods=["POST"])
def reject_resource_request(request_id: str):
    username, error = _require_admin(request)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    submission, error = _apply_request_decision(request_id, False, data.get("note", ""))
    if error:
        return error
    return jsonify({"message": "request rejected", "request": submission}), 200
