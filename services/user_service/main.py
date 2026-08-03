import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from flask import Flask, jsonify, request

from app.auth import auth_bp, get_current_user
from app.models import get_all_users, get_user_by_username
import app.models as models


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "globetrotter-secret-change-in-prod")
    app.register_blueprint(auth_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "user-service"}), 200

    @app.route("/me", methods=["GET"])
    def me():
        username = get_current_user(request)
        if not username:
            return jsonify({"error": "authentication required"}), 401

        user = get_user_by_username(username)
        if not user:
            return jsonify({"error": "user not found"}), 404

        return jsonify({
            "id": user.get("id"),
            "username": user.get("username"),
            "preferences": user.get("preferences", []),
        }), 200

    @app.route("/users/<user_id>", methods=["GET"])
    def get_user(user_id):
        user = next((u for u in get_all_users() if u.get("id") == user_id), None)
        if not user:
            return jsonify({"error": "user not found"}), 404

        return jsonify({
            "id": user.get("id"),
            "username": user.get("username"),
            "preferences": user.get("preferences", []),
        }), 200

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    app.run(host="0.0.0.0", port=port, debug=False)
