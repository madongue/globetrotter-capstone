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
from app.models import (
    get_all_hotels,
    save_hotel,
    get_all_activities,
    save_activity,
    get_all_places,
    save_place,
    remove_hotel_by_id,
    remove_activity_by_id,
    remove_place_by_id,
    get_user_by_username,
)

resources_bp = Blueprint("resources", __name__)


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


@resources_bp.route("/resources/hotels", methods=["POST"])
def add_hotel():
    username, error = _require_admin(request)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    location = data.get("location", "").strip()
    cost_per_night = data.get("cost_per_night")

    if not name or not location or cost_per_night is None:
        return jsonify({"error": "name, location, and cost_per_night are required"}), 400

    hotel = {
        "id": str(uuid.uuid4()),
        "name": name,
        "location": location,
        "rating": data.get("rating", 0),
        "cost_per_night": cost_per_night,
        "tags": data.get("tags", []),
        "description": data.get("description", ""),
        "map_info": data.get("map_info", {}),
    }
    save_hotel(hotel)
    return jsonify(hotel), 201


@resources_bp.route("/resources/activities", methods=["POST"])
def add_activity():
    username, error = _require_admin(request)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    location = data.get("location", "").strip()
    cost = data.get("cost")

    if not name or not location or cost is None:
        return jsonify({"error": "name, location, and cost are required"}), 400

    activity = {
        "id": str(uuid.uuid4()),
        "name": name,
        "location": location,
        "duration_hours": data.get("duration_hours", 0),
        "cost": cost,
        "tags": data.get("tags", []),
        "description": data.get("description", ""),
        "map_info": data.get("map_info", {}),
    }
    save_activity(activity)
    return jsonify(activity), 201


@resources_bp.route("/resources/places", methods=["POST"])
def add_place():
    username, error = _require_admin(request)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    location = data.get("location", "").strip()
    cost = data.get("cost")

    if not name or not location or cost is None:
        return jsonify({"error": "name, location, and cost are required"}), 400

    place = {
        "id": str(uuid.uuid4()),
        "name": name,
        "location": location,
        "description": data.get("description", ""),
        "tags": data.get("tags", []),
        "cost": cost,
        "map_info": data.get("map_info", {}),
    }
    save_place(place)
    return jsonify(place), 201


@resources_bp.route("/resources/hotels", methods=["GET"])
def list_hotels():
    return jsonify(get_all_hotels()), 200


@resources_bp.route("/resources/activities", methods=["GET"])
def list_activities():
    return jsonify(get_all_activities()), 200


@resources_bp.route("/resources/places", methods=["GET"])
def list_places():
    return jsonify(get_all_places()), 200


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
