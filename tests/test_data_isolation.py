"""The test suite must not write into the developer's data directory.

It used to. Nothing redirected ``MEDIA_FILE``, so every test that uploaded
media appended a record to the real ``data/media.json`` — forty-six of them
accumulated, owned by the test user "alice" and pointing at files in temporary
directories that no longer existed, which left the Media gallery full of
images that could never load.

These tests fail if that regresses.
"""
import json
import os

import pytest

import app.models as models
from tests.conftest import PROJECT_ROOT, RUNTIME_COLLECTIONS

REAL_DATA_DIR = os.path.join(PROJECT_ROOT, "data")


@pytest.mark.parametrize("name", RUNTIME_COLLECTIONS)
def test_runtime_collections_are_redirected_away_from_the_real_directory(name):
    path = os.path.abspath(getattr(models, name))
    assert not path.startswith(os.path.abspath(REAL_DATA_DIR)), (
        f"{name} points at {path}, inside the repository's data directory. "
        f"A test writing to it would leave records behind."
    )


def test_uploads_are_redirected_away_from_the_real_directory():
    path = os.path.abspath(models.UPLOADS_DIR)
    assert not path.startswith(os.path.abspath(REAL_DATA_DIR))


def test_every_runtime_collection_in_models_is_covered():
    """A collection added to models.py must be added to the isolation list.

    Without this the list silently rots: someone adds a data file, no fixture
    redirects it, and tests start writing to the real one again — which is
    exactly how the media leak happened.
    """
    catalogue = {"DESTINATIONS_FILE", "PLACES_FILE", "HOTELS_FILE", "ACTIVITIES_FILE"}
    declared = {
        name for name in dir(models)
        if name.endswith("_FILE") and not name.startswith("_")
    }
    uncovered = declared - set(RUNTIME_COLLECTIONS) - catalogue
    assert not uncovered, (
        f"{sorted(uncovered)} is neither isolated nor a known catalogue seed. "
        f"Add it to RUNTIME_COLLECTIONS in tests/conftest.py."
    )


def test_writing_media_does_not_touch_the_real_media_file():
    """The exact leak that produced the forty-six phantom records."""
    real_media = os.path.join(REAL_DATA_DIR, "media.json")
    before = None
    if os.path.exists(real_media):
        with open(real_media, encoding="utf-8") as handle:
            before = json.load(handle)

    models.save_media({"id": "isolation-probe", "url": "/api/uploads/probe.jpg",
                       "username": "probe"})

    assert any(item["id"] == "isolation-probe" for item in models.get_all_media())

    if before is None:
        assert not os.path.exists(real_media), "the real media.json was created by a test"
    else:
        with open(real_media, encoding="utf-8") as handle:
            assert json.load(handle) == before, "the real media.json was modified by a test"


def test_catalogue_seeds_are_still_readable():
    """Isolation must not blind the tests that validate the shipped catalogue."""
    places = models.get_all_places()
    assert len(places) > 500, "the real catalogue should still be visible to tests"


def test_a_sandbox_path_still_resolves_to_its_own_collection():
    """The round trip that the first version of this fixture broke.

    A read goes path -> collection_name_for -> _path_for_collection -> path.
    If the sandbox file is not named after its collection, the middle step
    falls back to DATA_DIR and every read and write lands in the real data
    directory under a new filename — isolation that looks right and is not.
    """
    from app.store import collection_name_for

    for constant, collection in (
        ("GROUPS_FILE", "groups"),
        ("CHAT_FILE", "chat_messages"),
        ("AUDIT_LOG_FILE", "audit_log"),
        ("PLACE_REQUESTS_FILE", "place_requests"),
    ):
        path = getattr(models, constant)
        assert collection_name_for(path) == collection, (
            f"{constant} points at {path}, whose collection name is "
            f"{collection_name_for(path)!r} rather than {collection!r}"
        )
        # And the resolver must send that name straight back to the sandbox.
        assert os.path.abspath(models._path_for_collection(collection)) == os.path.abspath(path)


def test_no_stray_collection_files_are_left_in_the_real_data_directory():
    """The leak this bug produced: data/groups_file.json and friends."""
    strays = [
        name for name in os.listdir(REAL_DATA_DIR)
        if name.endswith("_file.json")
    ]
    assert not strays, (
        f"{strays} are in data/ — a test wrote there through a mis-resolved "
        f"collection name."
    )
