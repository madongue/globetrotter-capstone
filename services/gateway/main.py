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
                timeout=5,
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

    @app.route("/itineraries/<itinerary_id>", methods=["GET", "PUT", "DELETE"])
    def itinerary_detail(itinerary_id):
        return proxy_request(ITINERARY_SERVICE_URL, f"/itineraries/{itinerary_id}", method=request.method)

    @app.route("/itineraries/<itinerary_id>/share", methods=["POST"])
    def share_itinerary(itinerary_id):
        return proxy_request(ITINERARY_SERVICE_URL, f"/itineraries/{itinerary_id}/share", method="POST")

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
