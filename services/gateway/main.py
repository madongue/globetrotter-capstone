import os
import sys

import requests
from flask import Flask, jsonify, request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://user-service:8001")
DESTINATION_SERVICE_URL = os.environ.get("DESTINATION_SERVICE_URL", "http://destination-service:8004")
RECOMMENDATION_SERVICE_URL = os.environ.get("RECOMMENDATION_SERVICE_URL", "http://recommendation-service:8003")
ITINERARY_SERVICE_URL = os.environ.get("ITINERARY_SERVICE_URL", "http://itinerary-service:8002")
CHAT_SERVICE_URL = os.environ.get("CHAT_SERVICE_URL", "http://chat-service:8005")

# Generating an itinerary scans the whole catalogue — 845 places and 373 hotels
# — and measures around 6 seconds against the JSON backend. In the monolith
# that is a function call and nobody notices; behind the gateway it was a
# 5-second timeout returning "upstream service unavailable" on a request that
# had in fact succeeded. This is the clearest cost of splitting the app: work
# that used to be in-process now has to fit inside a network budget.
UPSTREAM_TIMEOUT_SECONDS = float(os.environ.get("UPSTREAM_TIMEOUT_SECONDS", "30"))


def create_app():
    app = Flask(__name__)

    def proxy_request(target_url, path, method="GET"):
        headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
        try:
            response = requests.request(
                method=method,
                url=target_url.rstrip("/") + path,
                params=request.args,
                headers=headers,
                data=request.get_data(),
                json=request.get_json(silent=True),
                timeout=UPSTREAM_TIMEOUT_SECONDS,
            )
        except requests.RequestException:
            return jsonify({"error": "upstream service unavailable"}), 502

        try:
            payload = response.json()
        except ValueError:
            payload = response.text

        return jsonify(payload), response.status_code

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "gateway"}), 200

    @app.route("/register", methods=["POST"])
    def register():
        return proxy_request(USER_SERVICE_URL, "/register", method="POST")

    @app.route("/login", methods=["POST"])
    def login():
        return proxy_request(USER_SERVICE_URL, "/login", method="POST")

    @app.route("/me", methods=["GET"])
    def me():
        return proxy_request(USER_SERVICE_URL, "/me", method="GET")

    @app.route("/users/<user_id>", methods=["GET"])
    def get_user(user_id):
        return proxy_request(USER_SERVICE_URL, f"/users/{user_id}", method="GET")

    @app.route("/destinations", methods=["GET"])
    def destinations():
        return proxy_request(DESTINATION_SERVICE_URL, "/destinations", method="GET")

    @app.route("/destinations/<destination_id>", methods=["GET"])
    def destination_detail(destination_id):
        return proxy_request(DESTINATION_SERVICE_URL, f"/destinations/{destination_id}", method="GET")

    @app.route("/recommendations", methods=["GET"])
    def recommendations():
        return proxy_request(RECOMMENDATION_SERVICE_URL, "/recommendations", method="GET")

    @app.route("/itineraries", methods=["GET", "POST"])
    def itineraries():
        return proxy_request(ITINERARY_SERVICE_URL, "/itineraries", method=request.method)

    # Declared before the <itinerary_id> rule below, which is a single-segment
    # match and would otherwise capture "quick" and reject the POST as 405.
    @app.route("/itineraries/quick", methods=["POST"])
    @app.route("/trips/quick", methods=["POST"])
    def quick_itinerary():
        return proxy_request(ITINERARY_SERVICE_URL, request.path, method="POST")

    @app.route("/itineraries/<itinerary_id>", methods=["GET", "PUT", "DELETE"])
    def itinerary_detail(itinerary_id):
        return proxy_request(ITINERARY_SERVICE_URL, f"/itineraries/{itinerary_id}", method=request.method)

    @app.route("/itineraries/<itinerary_id>/share", methods=["POST"])
    def share_itinerary(itinerary_id):
        return proxy_request(ITINERARY_SERVICE_URL, f"/itineraries/{itinerary_id}/share", method="POST")

    # The itinerary service carries far more than the handful of routes named
    # above — quick planning, checkpoint reordering, payments, packing lists,
    # groups. Listing each one here would mean editing the gateway every time
    # the service gains a route, and forgetting to do so is a silent 404 that
    # only appears once the app is split. Everything under /itineraries and
    # /trips is forwarded instead, so the two stay in step.
    @app.route("/itineraries/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def itinerary_subpath(subpath):
        return proxy_request(ITINERARY_SERVICE_URL, f"/itineraries/{subpath}", method=request.method)

    # Chat. A catch-all rather than one rule per route, for the reason the
    # itinerary block below explains: a service that gains a route must not
    # need the gateway edited before anyone can reach it.
    @app.route("/chat/rooms", methods=["GET"])
    def chat_rooms():
        return proxy_request(CHAT_SERVICE_URL, "/chat/rooms", method="GET")

    @app.route("/chat/<path:subpath>", methods=["GET", "POST", "PATCH", "DELETE"])
    def chat_subpath(subpath):
        return proxy_request(CHAT_SERVICE_URL, f"/chat/{subpath}", method=request.method)

    @app.route("/trips", methods=["GET", "POST"])
    def trips():
        return proxy_request(ITINERARY_SERVICE_URL, "/trips", method=request.method)

    @app.route("/trips/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def trips_subpath(subpath):
        return proxy_request(ITINERARY_SERVICE_URL, f"/trips/{subpath}", method=request.method)

    # ---------------------------------------------------------------- the rest
    #
    # The gateway forwarded eleven of the application's thirty resources. The
    # other nineteen — groups, media, saved places, the catalogue, the whole of
    # account management — simply 404'd once the app was split, which is the
    # failure mode described on the itinerary catch-all above, at scale.
    #
    # Each prefix is forwarded to the service that actually serves it, checked
    # against each service's own route table rather than assumed. Four
    # resources have no service at all yet — assistant, resources, config and
    # metrics — and are named at the bottom so the gap is visible rather than
    # silent.

    ANY = ["GET", "POST", "PUT", "PATCH", "DELETE"]

    def forward(target, prefix):
        """Register a prefix and everything beneath it against one service."""
        def bare():
            return proxy_request(target, request.path, method=request.method)

        def nested(subpath):
            return proxy_request(target, request.path, method=request.method)

        app.add_url_rule(f"/{prefix}", f"fwd_{prefix}", bare, methods=ANY)
        app.add_url_rule(f"/{prefix}/<path:subpath>", f"fwd_{prefix}_sub", nested, methods=ANY)

    for prefix in ("auth", "profile", "interests", "admin", "stats",
                   "forgot-password", "reset-password", "google-auth"):
        forward(USER_SERVICE_URL, prefix)

    for prefix in ("groups", "media", "wishlist", "uploads",
                   "notifications", "invites", "browsing-events", "places"):
        forward(ITINERARY_SERVICE_URL, prefix)

    # The catalogue of places, hotels and activities, and the suggestion and
    # correction queue that rides on it, belong with destinations: it is the
    # same data. Unrouted, every /resources call 404'd once the app was split,
    # which took out place detail, /suggest and the admin review queue.
    for prefix in ("autocomplete", "cameroon-locations", "resources"):
        forward(DESTINATION_SERVICE_URL, prefix)

    # The assistant answers from the catalogue and the asking user's trips —
    # the same work the recommender does — so it is hosted there.
    forward(RECOMMENDATION_SERVICE_URL, "assistant")

    # Call signalling lives with chat: the same rooms, the same membership
    # rule and the same cursor, so it belongs to the same service.
    forward(CHAT_SERVICE_URL, "calls")

    @app.route("/config", methods=["GET"])
    def config():
        """Client configuration.

        Served here rather than forwarded. These are values the *browser*
        needs, read from this process's environment; asking a downstream
        service for them would only return that service's copy of the same
        environment, one network hop later.
        """
        return jsonify({
            "googleClientId": os.environ.get("GOOGLE_CLIENT_ID", "") or "",
            "googleMapsApiKey": os.environ.get("GOOGLE_MAPS_API_KEY", "") or "",
        }), 200

    # Still not owned by any service. `/metrics` counts requests per process,
    # so there is no single answer to forward to: each service has its own, and
    # a split deployment wanting one number needs a collector (Prometheus or
    # similar) rather than a proxy rule. Named here so the gap stays visible
    # instead of looking like an oversight.
    UNSPLIT_RESOURCES = ("metrics",)

    @app.route("/__gateway/coverage", methods=["GET"])
    def coverage():
        """What this gateway can and cannot reach — for the architecture talk."""
        return jsonify({
            "forwarded": sorted({str(r).split("/")[1] for r in app.url_map.iter_rules()
                                 if str(r) not in ("/", "/static/<path:filename>")}),
            "not_yet_split": list(UNSPLIT_RESOURCES),
        }), 200

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
