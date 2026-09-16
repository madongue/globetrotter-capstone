import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from flask import Flask, jsonify

from app.destinations import destinations_bp
# The catalogue of places, hotels and activities belongs with destinations:
# they are the same data, and /resources carries the suggestion and correction
# queue that Explore and the admin screen both depend on. Without it mounted
# here, every /resources call 404s the moment the app is split.
from app.resources import resources_bp
from app.models import seed_catalogue_if_empty


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "globetrotter-secret-change-in-prod")
    app.register_blueprint(destinations_bp)
    app.register_blueprint(resources_bp)

    # This service owns the catalogue, so it is the one that seeds it. With a
    # shared database the other services start against an empty `documents`
    # table and would otherwise serve a catalogue of nothing; seeding from any
    # of them would race. It is a no-op once the rows exist.
    seed_catalogue_if_empty(app.logger)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "destination-service"}), 200

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8004))
    app.run(host="0.0.0.0", port=port, debug=False)
