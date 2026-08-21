"""
app/__init__.py

Flask application factory.
"""
import os
import time
from flask import Flask, Response, g, jsonify, request, send_from_directory
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Module-level so app/auth.py can import it to decorate routes with
# @limiter.limit(...). Bound to a concrete Flask app via init_app() below.
limiter = Limiter(key_func=get_remote_address)


def create_app():
    """Create and configure the Flask application."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    react_dist = os.path.join(base_dir, "client", "dist")
    local_static = os.path.join(os.path.dirname(__file__), "static")
    react_build = os.path.exists(react_dist)
    if react_build:
        static_folder = react_dist
        static_url_path = "/"
    else:
        static_folder = local_static
        static_url_path = "/static"

    app = Flask(__name__, static_folder=static_folder, static_url_path=static_url_path)

    # Secret key used for JWT signing. Must be set via the SECRET_KEY
    # environment variable in any real deployment -- the weak fallback is
    # only ever used for local development or under pytest, so a forgotten
    # SECRET_KEY in production fails loudly at startup instead of silently
    # accepting forgeable tokens.
    is_dev_or_test = os.environ.get("FLASK_DEBUG") == "1" or bool(
        os.environ.get("PYTEST_CURRENT_TEST")
    )
    secret_key = os.environ.get("SECRET_KEY")
    if not secret_key:
        if is_dev_or_test:
            secret_key = "globetrotter-secret-change-in-prod"
        else:
            raise RuntimeError(
                "SECRET_KEY environment variable must be set. Set FLASK_DEBUG=1 "
                "to run locally without it."
            )
    app.config["SECRET_KEY"] = secret_key

    # Rate limiting uses in-memory storage, so limits are per gunicorn worker
    # rather than global -- adequate at this deployment's scale, but revisit
    # with a shared backend (e.g. Redis) if it ever runs multi-instance.
    app.config["RATELIMIT_ENABLED"] = not os.environ.get("PYTEST_CURRENT_TEST")
    limiter.init_app(app)

    app.config["METRICS"] = {
        "request_count": 0,
        "error_count": 0,
        "total_latency_ms": 0.0,
        "routes": {},
    }
    app.config["GOOGLE_CLIENT_ID"] = os.environ.get("GOOGLE_CLIENT_ID", "")
    app.config["GOOGLE_MAPS_API_KEY"] = os.environ.get(
        "GOOGLE_MAPS_API_KEY",
        os.environ.get("VITE_GOOGLE_MAPS_API_KEY", ""),
    )

    @app.before_request
    def start_request_timer():
        g.request_started_at = time.perf_counter()

    @app.after_request
    def record_request_metrics(response):
        started_at = getattr(g, "request_started_at", None)
        latency_ms = 0.0
        if started_at is not None:
            latency_ms = round((time.perf_counter() - started_at) * 1000, 2)

        metrics = app.config["METRICS"]
        metrics["request_count"] += 1
        metrics["total_latency_ms"] = round(metrics["total_latency_ms"] + latency_ms, 2)
        if response.status_code >= 400:
            metrics["error_count"] += 1

        route_key = f"{request.method} {request.path}"
        route_metrics = metrics["routes"].setdefault(route_key, {
            "count": 0,
            "error_count": 0,
            "total_latency_ms": 0.0,
        })
        route_metrics["count"] += 1
        route_metrics["total_latency_ms"] = round(route_metrics["total_latency_ms"] + latency_ms, 2)
        if response.status_code >= 400:
            route_metrics["error_count"] += 1
        response.headers["X-Response-Time-ms"] = str(latency_ms)
        return response

    # Register all route blueprints under the API prefix so both development
    # proxy and production builds can use a unified /api contract.
    api_prefix = "/api"
    from app.auth import auth_bp
    from app.destinations import destinations_bp
    from app.recommendations import recommendations_bp
    from app.itineraries import itineraries_bp
    from app.resources import resources_bp
    from app.ui import ui_bp

    app.register_blueprint(auth_bp, url_prefix=api_prefix)
    app.register_blueprint(destinations_bp, url_prefix=api_prefix)
    app.register_blueprint(recommendations_bp, url_prefix=api_prefix)
    app.register_blueprint(itineraries_bp, url_prefix=api_prefix)
    app.register_blueprint(resources_bp, url_prefix=api_prefix)

    app.add_url_rule("/register", view_func=app.view_functions["auth.register"], methods=["POST"])
    app.add_url_rule("/login", view_func=app.view_functions["auth.login"], methods=["POST"])
    app.add_url_rule("/auth/google", view_func=app.view_functions["auth.google_auth"], methods=["POST"])
    app.add_url_rule("/google-auth", view_func=app.view_functions["auth.google_auth"], methods=["POST"])

    @app.route(f"{api_prefix}/config", methods=["GET"])
    def api_config():
        return jsonify({
            "googleClientId": app.config.get("GOOGLE_CLIENT_ID", "") or "",
            "googleMapsApiKey": app.config.get("GOOGLE_MAPS_API_KEY", "") or "",
        }), 200

    # Keep the server-rendered teaching UI available during local development,
    # but let a production React build own non-API routes when client/dist exists.
    if not react_build or os.environ.get("PYTEST_CURRENT_TEST"):
        app.register_blueprint(ui_bp)

    app.add_url_rule(
        "/destinations",
        view_func=app.view_functions["destinations.search_destinations"],
        methods=["GET"],
    )
    app.add_url_rule(
        "/cameroon-locations",
        view_func=app.view_functions["destinations.cameroon_locations"],
        methods=["GET"],
    )
    app.add_url_rule(
        "/autocomplete",
        view_func=app.view_functions["destinations.autocomplete"],
        methods=["GET"],
    )
    app.add_url_rule(
        "/recommendations",
        view_func=app.view_functions["recommendations.get_recommendations"],
        methods=["GET"],
    )
    app.add_url_rule(
        "/itineraries",
        view_func=app.view_functions["itineraries.list_itineraries"],
        methods=["GET"],
    )
    app.add_url_rule(
        "/itineraries",
        view_func=app.view_functions["itineraries.create_itinerary"],
        methods=["POST"],
    )

    @app.route(f"{api_prefix}/health", methods=["GET"])
    @app.route("/health", methods=["GET"])
    def health_check():
        """Basic liveness/readiness response for local and container probes."""
        return jsonify({
            "status": "ok",
            "service": "globetrotter",
            "mode": "monolith",
        }), 200

    @app.route("/favicon.ico", methods=["GET"])
    def favicon():
        """Avoid noisy browser 404s when no packaged favicon is present."""
        return Response(status=204)

    @app.route(f"{api_prefix}/metrics", methods=["GET"])
    @app.route("/metrics", methods=["GET"])
    def metrics():
        """Return lightweight in-process request metrics."""
        current_metrics = app.config["METRICS"]
        request_count = current_metrics["request_count"] or 1
        return jsonify({
            "request_count": current_metrics["request_count"],
            "error_count": current_metrics["error_count"],
            "average_latency_ms": round(current_metrics["total_latency_ms"] / request_count, 2),
            "routes": current_metrics["routes"],
        }), 200

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
