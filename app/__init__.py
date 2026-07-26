"""
app/__init__.py

Flask application factory.
"""
import os
import time
from flask import Flask, Response, g, jsonify, request, send_from_directory


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
    app.config["METRICS"] = {
        "request_count": 0,
        "error_count": 0,
        "total_latency_ms": 0.0,
        "routes": {},
    }

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

    # Keep the server-rendered teaching UI available during local development,
    # but let a production React build own non-API routes when client/dist exists.
    if static_folder is None or os.environ.get("PYTEST_CURRENT_TEST"):
        app.register_blueprint(ui_bp)

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
