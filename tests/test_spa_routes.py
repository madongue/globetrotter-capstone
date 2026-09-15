"""The single-page application's routes must survive a direct visit.

Every screen now has a URL. That only works if the server answers an unknown
path with the application shell rather than a 404, because the browser asks the
server first on a refresh, a pasted link or a bookmark.

This was broken before the client had URLs, and silently: with a React build
present the app mounts at ``static_url_path="/"``, which makes Flask register
its own static handler at the root. That handler matches every path and answers
404 the moment no file of that name exists on disk, before the catch-all view
is ever consulted. Only ``/`` worked.

The existing suite could not catch it, because with no ``client/dist`` built the
app falls back to ``/static`` and the root handler never shadows anything. These
tests therefore run against the real build with the test-mode flag cleared, so
the application is in the shape it actually ships in.
"""
import json
import os

import pytest

from app import create_app


@pytest.fixture
def built_client(monkeypatch):
    """A client for the app as it is actually mounted in production.

    Two things have to hold for the arrangement under test to exist, and
    neither holds by default in the suite:

    * ``client/dist`` must be present — that is what makes Flask mount its
      static handler at the root and shadow every path. Faking it is not an
      option: reassigning ``static_folder`` after construction does not
      re-register the route, so the fake would prove nothing. The real build
      is used, and the test skips without one.

    * ``PYTEST_CURRENT_TEST`` must be unset. ``create_app`` registers the
      legacy server-rendered blueprint whenever that variable is present
      (app/__init__.py), so under pytest ``/`` and ``/dashboard`` are Jinja
      templates rather than the React shell. Clearing it for the duration puts
      the application in the shape it actually ships in.
    """
    dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "client", "dist")
    if not os.path.exists(os.path.join(dist, "index.html")):
        pytest.skip("client/dist not built — run `npm run build` in client/")

    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    # Required once the app no longer believes it is under test.
    monkeypatch.setenv("SECRET_KEY", "spa-route-tests")

    app = create_app()
    app.config["TESTING"] = True
    # Rate limiting switches on with the production branch; these tests make
    # enough requests to trip it and are not what is being measured.
    app.config["RATELIMIT_ENABLED"] = False

    assert os.path.abspath(app.static_folder) == os.path.abspath(dist), (
        "expected the app to mount the React build; got " + str(app.static_folder)
    )
    with app.test_client() as client:
        yield client


# Every client route from client/src/routes.js. A path missing here is a path
# that will 404 for anyone who refreshes on it.
SPA_PATHS = [
    "/",
    "/login",
    "/register",
    "/dashboard",
    "/explore",
    "/trips",
    "/community",
    "/media",
    "/saved",
    "/suggest",
    "/profile",
    "/settings",
    "/admin",
    "/trips/some-itinerary-id",
    "/community/some-group-id",
]


@pytest.mark.parametrize("path", SPA_PATHS)
def test_client_routes_serve_the_application(built_client, path):
    response = built_client.get(path)
    assert response.status_code == 200, f"{path} must serve the app shell, not {response.status_code}"
    # The built shell, identified by the mount point React renders into.
    assert b'id="root"' in response.data


def test_an_unknown_path_still_serves_the_application(built_client):
    """The client decides what an unrecognised route means, not the server."""
    response = built_client.get("/no/such/screen")
    assert response.status_code == 200
    assert b'id="root"' in response.data


def test_a_real_asset_is_served_as_itself(built_client):
    """The fallback must not shadow genuine files."""
    response = built_client.get("/index.html")
    assert response.status_code == 200
    assert b'id="root"' in response.data


def test_unknown_api_routes_still_return_json_404(built_client):
    """An API 404 must stay an API 404.

    Handing the HTML shell to a fetch() that asked for a missing record would
    turn a clean "not found" into a JSON parse error at the call site.
    """
    response = built_client.get("/api/definitely-not-a-route")
    assert response.status_code == 404
    assert response.headers["Content-Type"].startswith("application/json")
    assert json.loads(response.data)["error"]


def test_api_404s_are_unaffected_without_a_build():
    """The same holds in the arrangement the rest of the suite runs under."""
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        response = client.get("/api/definitely-not-a-route")
        assert response.status_code == 404
        assert response.headers["Content-Type"].startswith("application/json")
