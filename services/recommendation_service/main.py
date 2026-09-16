import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from flask import Flask, jsonify

from app.recommendations import recommendations_bp
# The assistant answers from the catalogue and the asking user's own trips,
# which is the same work the recommender does, so it lives here rather than
# gaining a container of its own.
from app.assistant import assistant_bp


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "globetrotter-secret-change-in-prod")
    app.register_blueprint(recommendations_bp)
    app.register_blueprint(assistant_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "recommendation-service"}), 200

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8003))
    app.run(host="0.0.0.0", port=port, debug=False)
