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
from flask import Blueprint, request, jsonify

from app.auth import get_current_user
from app.cameroon_geo import enrich_cameroon_item, ensure_cameroon_location, infer_cameroon_geo
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

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    location = ensure_cameroon_location(data.get("location", "").strip())
    cost_per_night = data.get("cost_per_night")

    if not name or not location or cost_per_night is None:
        return jsonify({"error": "name, location, and cost_per_night are required"}), 400

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

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    location = ensure_cameroon_location(data.get("location", "").strip())
    cost = data.get("cost")

    if not name or not location or cost is None:
        return jsonify({"error": "name, location, and cost are required"}), 400

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

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    location = ensure_cameroon_location(data.get("location", "").strip())
    cost = data.get("cost")

    if not name or not location or cost is None:
        return jsonify({"error": "name, location, and cost are required"}), 400

    place = enrich_cameroon_item({
        "id": str(uuid.uuid4()),
        "name": name,
        "location": location,
        **infer_cameroon_geo(location),
        "description": data.get("description", ""),
        "tags": data.get("tags", []),
        "cost": cost,
        "map_info": data.get("map_info") or _resource_map_info(name, location),
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


@resources_bp.route("/resources/places", methods=["GET"])
def list_places():
    return jsonify([_with_resource_metadata(item) for item in get_all_places()]), 200


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
        "guide": _offline_guide(enriched_place, nearby),
    }), 200


@resources_bp.route("/resources/places/<place_id>/guide", methods=["GET"])
def get_place_guide(place_id: str):
    """Return an offline-ready guide payload for a Cameroon place."""
    place = next((item for item in get_all_places() if item.get("id") == place_id), None)
    if not place:
        return jsonify({"error": "place not found"}), 404
    enriched_place = _with_resource_metadata(place)
    nearby = _nearby_for_place(enriched_place)
    return jsonify(_offline_guide(enriched_place, nearby)), 200


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
