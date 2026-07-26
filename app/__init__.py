"""
app/__init__.py

Flask application factory.
"""
import os
from flask import Flask, send_from_directory


def create_app():
    """Create and configure the Flask application."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    react_dist = os.path.join(base_dir, "client", "dist")
    static_folder = react_dist if os.path.exists(react_dist) else None

    app = Flask(__name__, static_folder=static_folder, static_url_path="/")

    # Secret key used for JWT signing.  Set the SECRET_KEY environment variable
    # in production.  The fallback is intentionally weak and must never be used
    # outside of local development.
    app.config["SECRET_KEY"] = os.environ.get(
        "SECRET_KEY", "globetrotter-secret-change-in-prod"
    )

    # Register all route blueprints
    from app.auth import auth_bp
    from app.destinations import destinations_bp
    from app.recommendations import recommendations_bp
    from app.itineraries import itineraries_bp
    from app.resources import resources_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(destinations_bp)
    app.register_blueprint(recommendations_bp)
    app.register_blueprint(itineraries_bp)
    app.register_blueprint(resources_bp)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react_app(path: str):
        """Serve the React production bundle for all non-API routes."""
        if app.static_folder is None:
            return "React build not found", 404

        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)

        return send_from_directory(app.static_folder, "index.html")

    return app
