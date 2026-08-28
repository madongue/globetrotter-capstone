"""Tests for the Phase 2 API gateway.

The gateway forwards requests to the four backing services. It is a hand-written
proxy, so the failure it is prone to is a routing gap: the itinerary service
gains a route, nobody adds it to the gateway, and the endpoint 404s or 405s only
once the application is split. These tests pin the forwarding rules rather than
the network behaviour, so they need no running services.
"""
import pytest

from services.gateway.main import create_app


@pytest.fixture
def gateway():
    app = create_app()
    app.config["TESTING"] = True
    return app


def _methods_for(app, path):
    """Return the HTTP methods the gateway accepts for a concrete URL.

    Matches the path once per method rather than reading the rule map, so the
    result reflects the precedence Werkzeug actually applies between an
    overlapping static rule and a converter rule.
    """
    adapter = app.url_map.bind("localhost")
    accepted = set()
    for method in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        try:
            adapter.match(path, method=method)
        except Exception:
            continue
        accepted.add(method)
    return accepted


def test_quick_plan_is_reachable_through_the_gateway(gateway):
    """/itineraries/quick must not be swallowed by the /<itinerary_id> rule.

    Both patterns match the same URL, and the single-segment one was winning,
    so a POST came back 405 even though the service behind it accepts one.
    """
    assert "POST" in _methods_for(gateway, "/itineraries/quick")


def test_checkpoint_routes_are_reachable_through_the_gateway(gateway):
    reorder = _methods_for(gateway, "/itineraries/abc123/stages")
    single = _methods_for(gateway, "/itineraries/abc123/stages/place-1")
    assert "PATCH" in reorder
    assert {"PATCH", "DELETE"} <= single


@pytest.mark.parametrize(
    "path",
    [
        "/itineraries/abc123/packing-list",
        "/itineraries/abc123/expenses",
        "/itineraries/abc123/route",
        "/trips/abc123/stages",
    ],
)
def test_itinerary_subpaths_are_forwarded_rather_than_enumerated(gateway, path):
    """A catch-all keeps the gateway in step as the service gains routes."""
    assert _methods_for(gateway, path)


def test_upstream_timeout_allows_for_itinerary_generation():
    """Generating a plan scans the catalogue and takes several seconds.

    The original five-second budget turned a successful generation into
    "upstream service unavailable", so the timeout must stay well above it.
    """
    from services.gateway.main import UPSTREAM_TIMEOUT_SECONDS

    assert UPSTREAM_TIMEOUT_SECONDS >= 15
