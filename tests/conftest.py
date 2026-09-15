import os
import sys

import pytest


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


#: Collections the application creates at runtime. None are committed — the
#: repository ships only the four catalogue seeds — so no test has any reason to
#: read the developer's copy, and every reason not to write to it.
#:
#: The catalogue seeds (destinations, places, hotels, activities) are left
#: pointing at the real files on purpose: several tests validate the shipped
#: catalogue itself, and copying 2 MB of JSON for each of two hundred tests to
#: protect files that are read far more often than written is a poor trade. The
#: modules that mutate the catalogue redirect it in their own fixtures.
RUNTIME_COLLECTIONS = (
    "USERS_FILE",
    "ITINERARIES_FILE",
    "GROUPS_FILE",
    "MEDIA_FILE",
    "NOTIFICATIONS_FILE",
    "INVITES_FILE",
    "AUDIT_LOG_FILE",
    "PLACE_REQUESTS_FILE",
)


@pytest.fixture(autouse=True)
def isolate_runtime_data(monkeypatch, tmp_path_factory):
    """Keep every test's writes out of the developer's data directory.

    Test modules already redirect the collections they assert on, but each one
    has to remember the full list and they did not: nothing redirected
    ``MEDIA_FILE``. Media uploaded by a test was therefore written into the real
    ``data/media.json`` and left behind. Forty-six such records accumulated, all
    owned by the test user "alice", each pointing at a file in a temporary
    uploads directory that had long since been removed — so the Media gallery
    filled up with images that could never load.

    Applying the isolation here, automatically and before any per-module
    fixture, means a module can only narrow it, never forget it, and a
    collection added to models.py later cannot quietly escape.
    """
    # Created through the factory rather than under the test's own ``tmp_path``:
    # some tests assert that their tmp_path stays empty to prove that nothing
    # was written to local disk, and a sandbox sitting inside it would break
    # that claim without saying anything true about the code under test.
    sandbox = tmp_path_factory.mktemp("gt-runtime")

    import app.models as models

    for name in RUNTIME_COLLECTIONS:
        if not hasattr(models, name):
            continue
        target = sandbox / f"{name.lower()}.json"
        # Written empty so a read before the first write behaves the way it does
        # on a fresh install rather than raising.
        target.write_text("[]", encoding="utf-8")
        monkeypatch.setattr(models, name, str(target))

    uploads = sandbox / "uploads"
    uploads.mkdir(exist_ok=True)
    monkeypatch.setattr(models, "UPLOADS_DIR", str(uploads))
    if "app.itineraries" in sys.modules:
        monkeypatch.setattr("app.itineraries.UPLOADS_DIR", str(uploads), raising=False)

    yield sandbox
