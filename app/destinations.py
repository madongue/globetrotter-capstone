"""
app/destinations.py

Destination search endpoint.

Routes
------
GET /destinations?q=paris&tag=food&continent=Europe
    Returns destinations that match any of the provided query parameters.
    All parameters are optional; omitting them returns the full catalogue.
"""
from flask import Blueprint, request, jsonify

from app.models import get_all_activities, get_all_destinations, get_all_hotels, get_all_places

destinations_bp = Blueprint("destinations", __name__)


@destinations_bp.route("/destinations", methods=["GET"])
def search_destinations():
    """Search destinations by name keyword, tag, and/or continent.

    Query parameters (all optional):
        q          – free-text search against name, country, and description
        tag        – filter by a single interest tag (e.g. "beach")
        continent  – filter by continent name (e.g. "Europe")
        max_cost   – filter by maximum average daily cost (integer)

    Returns a JSON list of matching destination objects.
    """
    q = request.args.get("q", "").strip().lower()
    tag = request.args.get("tag", "").strip().lower()
    continent = request.args.get("continent", "").strip().lower()
    max_cost_str = request.args.get("max_cost", "").strip()

    max_cost = None
    if max_cost_str:
        try:
            max_cost = int(max_cost_str)
        except ValueError:
            return jsonify({"error": "max_cost must be an integer"}), 400

    destinations = get_all_destinations()
    results = []

    for dest in destinations:
        # Free-text filter
        if q:
            searchable = " ".join([
                dest.get("name", ""),
                dest.get("country", ""),
                dest.get("description", ""),
            ]).lower()
            if q not in searchable:
                continue

        # Tag filter
        if tag and tag not in [t.lower() for t in dest.get("tags", [])]:
            continue

        # Continent filter
        if continent and continent != dest.get("continent", "").lower():
            continue

        # Cost filter – skip destinations that have no cost information or exceed the limit
        if max_cost is not None:
            cost = dest.get("avg_cost_per_day")
            if cost is None or cost > max_cost:
                continue

        results.append(dest)

    return jsonify(results), 200


@destinations_bp.route("/autocomplete", methods=["GET"])
def autocomplete():
    """Return local catalogue suggestions for destinations and reusable resources."""
    q = request.args.get("q", "").strip().lower()
    limit_str = request.args.get("limit", "8")
    try:
        limit = int(limit_str)
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400
    limit = max(1, min(limit, 25))

    if not q:
        return jsonify([]), 200

    candidates = []
    sources = [
        ("destination", get_all_destinations(), "avg_cost_per_day"),
        ("hotel", get_all_hotels(), "cost_per_night"),
        ("activity", get_all_activities(), "cost"),
        ("place", get_all_places(), "cost"),
    ]
    for source_type, items, cost_field in sources:
        for item in items:
            searchable = " ".join([
                item.get("name", ""),
                item.get("country", ""),
                item.get("continent", ""),
                item.get("location", ""),
                item.get("description", ""),
                " ".join(item.get("tags", [])),
            ]).lower()
            if q not in searchable:
                continue
            candidates.append({
                "type": source_type,
                "id": item.get("id") or item.get("name"),
                "name": item.get("name"),
                "location": item.get("location") or item.get("country") or item.get("continent"),
                "description": item.get("description", ""),
                "tags": item.get("tags", []),
                "cost": item.get(cost_field),
            })

    candidates.sort(key=lambda item: (item["type"], item.get("name") or ""))
    return jsonify(candidates[:limit]), 200
