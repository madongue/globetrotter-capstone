"""
app/recommendations.py

Personalised destination recommendations.

Routes
------
GET /recommendations
    Returns destinations that best match the authenticated user's preferences.
    Requires a valid JWT in the Authorization header.
"""
from flask import Blueprint, request, jsonify

from app.auth import get_current_user
from app.cameroon_geo import enrich_cameroon_item, matches_cameroon_filters
from app.models import get_all_destinations, get_itineraries_for_user, get_user_by_username

recommendations_bp = Blueprint("recommendations", __name__)


@recommendations_bp.route("/recommendations", methods=["GET"])
def get_recommendations():
    """Return personalised destination recommendations for the logged-in user.

    Recommendations are derived by scoring each destination against the
    user's preference tags.  Destinations are returned in descending score
    order.  An optional *limit* query parameter caps the number of results
    (default 5).

    Requires: Authorization: ******
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404

    preferences = [p.lower() for p in user.get("preferences", [])]
    browsing_history = user.get("browsing_history", [])
    saved_places = user.get("saved_places", [])
    browsing_tags = [
        tag.lower()
        for event in browsing_history
        for tag in event.get("tags", [])
    ]
    browsing_locations = [
        value.lower()
        for event in browsing_history
        for value in [event.get("city", ""), event.get("region", ""), event.get("place_name", "")]
        if value
    ]
    saved_tags = [
        tag.lower()
        for place in saved_places
        for tag in place.get("tags", [])
    ]
    saved_locations = [
        value.lower()
        for place in saved_places
        for value in [place.get("city", ""), place.get("region", ""), place.get("name", "")]
        if value
    ]

    # Parse optional limit parameter
    try:
        limit = int(request.args.get("limit", 5))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    max_budget = request.args.get("budget") or request.args.get("max_cost")
    if max_budget:
        try:
            max_budget = float(max_budget)
        except ValueError:
            return jsonify({"error": "budget must be a number"}), 400
    else:
        max_budget = None

    geo_filters = {
        "location": request.args.get("location", ""),
        "region": request.args.get("region", ""),
        "division": request.args.get("division", ""),
        "subdivision": request.args.get("subdivision", ""),
        "city": request.args.get("city", ""),
        "quarter": request.args.get("quarter", ""),
    }
    past_itineraries = get_itineraries_for_user(username)
    history_locations = [item.get("location", "").lower() for item in past_itineraries]
    feedback_tags = []
    positively_rated_locations = []
    for itinerary in past_itineraries:
        for feedback in itinerary.get("feedback", []):
            if feedback.get("username") != username:
                continue
            if feedback.get("rating", 0) >= 4:
                positively_rated_locations.append(itinerary.get("location", "").lower())
                feedback_tags.extend(tag.lower() for tag in feedback.get("tags", []))

    destinations = [enrich_cameroon_item(dest) for dest in get_all_destinations()]

    # Score each destination from preference tags, trip history, positive
    # feedback, and optional budget/location intent.
    scored = []
    for dest in destinations:
        dest_tags = [t.lower() for t in dest.get("tags", [])]
        dest_text = " ".join([
            dest.get("name", ""),
            dest.get("country", ""),
            dest.get("region", ""),
            dest.get("division", ""),
            dest.get("subdivision", ""),
            dest.get("city", ""),
            dest.get("quarter", ""),
            dest.get("description", ""),
        ]).lower()
        if max_budget is not None and (dest.get("avg_cost_per_day") is None or dest.get("avg_cost_per_day") > max_budget):
            continue
        if not matches_cameroon_filters(dest, geo_filters):
            continue

        preference_score = sum(2 for pref in preferences if pref in dest_tags)
        feedback_score = sum(2 for tag in feedback_tags if tag in dest_tags)
        browsing_score = sum(2 for tag in browsing_tags if tag in dest_tags)
        saved_score = sum(3 for tag in saved_tags if tag in dest_tags)
        history_score = 1 if any(history_location and history_location in dest_text for history_location in history_locations) else 0
        browsing_location_score = 2 if any(place and place in dest_text for place in browsing_locations) else 0
        saved_location_score = 3 if any(place and place in dest_text for place in saved_locations) else 0
        positive_location_score = 2 if any(place and place in dest_text for place in positively_rated_locations) else 0
        budget_score = 1 if max_budget is not None else 0
        score = (
            preference_score + feedback_score + browsing_score + saved_score
            + history_score + browsing_location_score + saved_location_score
            + positive_location_score + budget_score
        )
        scored.append((score, dest))

    # Sort by score descending, then by name for stable ordering
    scored.sort(key=lambda x: (-x[0], x[1].get("name", "")))

    # Build result list, including the match score for transparency
    results = []
    for score, dest in scored[:limit]:
        entry = dict(dest)
        entry["match_score"] = score
        entry["signals"] = {
            "preference_matches": [pref for pref in preferences if pref in [tag.lower() for tag in dest.get("tags", [])]],
            "feedback_matches": [tag for tag in feedback_tags if tag in [dest_tag.lower() for dest_tag in dest.get("tags", [])]],
            "browsing_matches": [tag for tag in browsing_tags if tag in [dest_tag.lower() for dest_tag in dest.get("tags", [])]],
            "saved_matches": [tag for tag in saved_tags if tag in [dest_tag.lower() for dest_tag in dest.get("tags", [])]],
            "within_budget": max_budget is None or dest.get("avg_cost_per_day", 0) <= max_budget,
        }
        results.append(entry)

    return jsonify(results), 200
