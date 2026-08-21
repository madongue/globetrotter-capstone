"""Tests for the pluggable storage backends in :mod:`app.store`.

The rest of the suite exercises the default JSON-file backend. These tests
cover the SQL backend that production uses, and assert the two behave
identically, since every route in the app is written against one shared API.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

import app.models as models
from app.store import (
    JsonFileStore,
    SqlDocumentStore,
    build_store,
    collection_name_for,
    key_field_for,
)

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def sql_store(tmp_path):
    return SqlDocumentStore(f"sqlite:///{tmp_path / 'store.db'}")


@pytest.fixture
def json_store(tmp_path):
    return JsonFileStore(lambda collection: str(tmp_path / f"{collection}.json"))


@pytest.fixture(params=["json", "sql"])
def any_store(request, tmp_path):
    """Each test using this runs once per backend, asserting parity."""
    if request.param == "json":
        return JsonFileStore(lambda collection: str(tmp_path / f"{collection}.json"))
    return SqlDocumentStore(f"sqlite:///{tmp_path / 'store.db'}")


# ---------------------------------------------------------------------------
# Collection naming
# ---------------------------------------------------------------------------

def test_collection_name_is_derived_from_file_basename():
    """models.py addresses collections by path; both backends key off the stem."""
    assert collection_name_for("/srv/data/users.json") == "users"
    assert collection_name_for(r"C:\app\data\audit_log.json") == "audit_log"


def test_key_field_defaults_to_id_with_documented_exceptions():
    assert key_field_for("users") == "username"
    assert key_field_for("invites") == "token"
    assert key_field_for("itineraries") == "id"
    assert key_field_for("anything-else") == "id"


# ---------------------------------------------------------------------------
# Behaviour shared by both backends
# ---------------------------------------------------------------------------

def test_missing_collection_reads_as_empty(any_store):
    assert any_store.read("users") == []


def test_write_then_read_round_trips(any_store):
    documents = [{"username": "alice", "role": "admin"}, {"username": "bob"}]
    any_store.write("users", documents)
    assert any_store.read("users") == documents


def test_insertion_order_is_preserved(any_store):
    """The audit log and notifications are append-only and read chronologically."""
    entries = [{"id": f"entry-{n}", "n": n} for n in range(25)]
    any_store.write("audit_log", entries)
    assert [entry["n"] for entry in any_store.read("audit_log")] == list(range(25))


def test_write_replaces_entire_collection(any_store):
    any_store.write("places", [{"id": "a"}, {"id": "b"}])
    any_store.write("places", [{"id": "c"}])
    assert any_store.read("places") == [{"id": "c"}]


def test_writing_empty_list_clears_collection(any_store):
    any_store.write("places", [{"id": "a"}])
    any_store.write("places", [])
    assert any_store.read("places") == []


def test_collections_are_isolated_from_each_other(any_store):
    any_store.write("users", [{"username": "alice"}])
    any_store.write("places", [{"id": "place-1"}])
    assert any_store.read("users") == [{"username": "alice"}]
    assert any_store.read("places") == [{"id": "place-1"}]


def test_nested_documents_survive_round_trip(any_store):
    """Itineraries carry deeply nested stages, expenses and documents."""
    itinerary = {
        "id": "trip-1",
        "stages": [{"id": "s1", "checklist": [{"done": True, "label": "Pack"}]}],
        "budget": {"total": 125000, "currency": "XAF", "splits": {"alice": 62500}},
        "notes": "Café ☕ — Kribi",
        "participants": [],
        "archived": False,
        "rating": None,
    }
    any_store.write("itineraries", [itinerary])
    assert any_store.read("itineraries") == [itinerary]


def test_locked_allows_read_modify_write(any_store):
    """The pattern every save_*/update_* helper in models.py uses."""
    any_store.write("users", [{"username": "alice", "visits": 1}])
    with any_store.locked("users"):
        users = any_store.read("users")
        users[0]["visits"] += 1
        any_store.write("users", users)
    assert any_store.read("users")[0]["visits"] == 2


def test_backends_produce_identical_results(json_store, sql_store):
    documents = [
        {"id": "1", "name": "Kribi", "tags": ["beach"], "cost": 5000},
        {"id": "2", "name": "Buea", "tags": [], "cost": None},
    ]
    json_store.write("places", documents)
    sql_store.write("places", documents)
    assert json_store.read("places") == sql_store.read("places") == documents


# ---------------------------------------------------------------------------
# SQL-specific behaviour
# ---------------------------------------------------------------------------

def test_documents_without_a_natural_key_are_still_stored(sql_store):
    """Older audit entries predate the `id` field and must not be dropped."""
    entries = [{"action": "created"}, {"action": "updated"}]
    sql_store.write("audit_log", entries)
    assert sql_store.read("audit_log") == entries


def test_duplicate_natural_keys_are_all_retained(sql_store):
    """The file backend tolerated duplicates; the DB must not lose one to its PK."""
    users = [{"username": "alice", "n": 1}, {"username": "alice", "n": 2}]
    sql_store.write("users", users)
    assert sql_store.read("users") == users


def test_updating_one_document_leaves_the_others_intact(sql_store):
    users = [{"username": name} for name in ("alice", "bob", "carol")]
    sql_store.write("users", users)
    users[1]["role"] = "admin"
    sql_store.write("users", users)
    assert sql_store.read("users") == users


@pytest.mark.parametrize(
    "url,expected_driver",
    [
        ("postgres://u:p@host/db", "postgresql+psycopg"),
        ("postgresql://u:p@host/db", "postgresql+psycopg"),
    ],
)
def test_legacy_postgres_urls_are_normalised(url, expected_driver, monkeypatch):
    """Render hands out `postgres://`, which SQLAlchemy 2 rejects outright."""
    captured = {}

    def fake_create_engine(target_url, **kwargs):
        captured["url"] = target_url
        raise _StopBuilding()

    import sqlalchemy

    monkeypatch.setattr(sqlalchemy, "create_engine", fake_create_engine)
    with pytest.raises(_StopBuilding):
        SqlDocumentStore(url)
    assert captured["url"].startswith(expected_driver)


class _StopBuilding(Exception):
    """Sentinel so the URL check doesn't need a reachable database."""


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------

def test_build_store_defaults_to_json_files(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    store = build_store(lambda c: str(tmp_path / f"{c}.json"))
    assert isinstance(store, JsonFileStore)


def test_build_store_uses_sql_when_database_url_is_set(tmp_path):
    store = build_store(
        lambda c: str(tmp_path / f"{c}.json"),
        database_url=f"sqlite:///{tmp_path / 'x.db'}",
    )
    assert isinstance(store, SqlDocumentStore)


# ---------------------------------------------------------------------------
# The application running on a database
# ---------------------------------------------------------------------------

@pytest.fixture
def db_client(tmp_path, monkeypatch):
    """A test client whose every read and write goes through SQLite, not files."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'app.db'}")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    models.reset_store()

    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

    models.reset_store()


def test_full_signup_and_itinerary_flow_against_a_database(db_client):
    """End-to-end proof that the app works with no JSON files involved."""
    register = db_client.post(
        "/api/register",
        data=json.dumps(
            {"username": "alice", "password": "password123", "phone": "+237650000777"}
        ),
        content_type="application/json",
    )
    assert register.status_code == 201

    login = db_client.post(
        "/api/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    assert login.status_code == 200
    token = login.get_json()["token"]

    created = db_client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"title": "Kribi trip", "location": "Kribi"}),
        content_type="application/json",
    )
    assert created.status_code == 201

    listed = db_client.get(
        "/api/itineraries", headers={"Authorization": f"Bearer {token}"}
    )
    assert listed.status_code == 200
    assert [trip["title"] for trip in listed.get_json()] == ["Kribi trip"]

    # The user really landed in the database, not on disk.
    assert [user["username"] for user in models.get_all_users()] == ["alice"]


def test_data_survives_an_application_restart(db_client, tmp_path, monkeypatch):
    """The whole point of the migration: state outlives the process."""
    db_client.post(
        "/api/register",
        data=json.dumps(
            {"username": "bob", "password": "password123", "phone": "+237650000888"}
        ),
        content_type="application/json",
    )

    # Simulate a redeploy: drop the cached engine and build the app again.
    models.reset_store()
    from app import create_app

    restarted = create_app()
    restarted.config["TESTING"] = True
    with restarted.test_client() as client:
        login = client.post(
            "/api/login",
            data=json.dumps({"username": "bob", "password": "password123"}),
            content_type="application/json",
        )
    assert login.status_code == 200, "user did not survive the restart"


# ---------------------------------------------------------------------------
# Migration script
# ---------------------------------------------------------------------------

def _run_migration(*args):
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "migrate_json_to_db.py"), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


@pytest.fixture
def seeded_data_dir(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "users.json").write_text(
        json.dumps([{"username": "alice"}, {"username": "bob"}]), encoding="utf-8"
    )
    (data_dir / "itineraries.json").write_text(
        json.dumps([{"id": "trip-1", "title": "Kribi"}]), encoding="utf-8"
    )
    (data_dir / "places.json").write_text("[]", encoding="utf-8")
    return data_dir


def test_migration_dry_run_writes_nothing(seeded_data_dir, tmp_path):
    db_url = f"sqlite:///{tmp_path / 'migrate.db'}"
    result = _run_migration(
        "--data-dir", str(seeded_data_dir), "--database-url", db_url, "--dry-run"
    )
    assert result.returncode == 0, result.stderr
    assert "would import 2 document(s)" in result.stdout
    assert SqlDocumentStore(db_url).read("users") == []


def test_migration_imports_documents_in_order(seeded_data_dir, tmp_path):
    db_url = f"sqlite:///{tmp_path / 'migrate.db'}"
    result = _run_migration(
        "--data-dir", str(seeded_data_dir), "--database-url", db_url
    )
    assert result.returncode == 0, result.stderr

    store = SqlDocumentStore(db_url)
    assert [u["username"] for u in store.read("users")] == ["alice", "bob"]
    assert [t["id"] for t in store.read("itineraries")] == ["trip-1"]


def test_migration_refuses_to_clobber_existing_data(seeded_data_dir, tmp_path):
    """Re-running the import must not double-import or overwrite live rows."""
    db_url = f"sqlite:///{tmp_path / 'migrate.db'}"
    _run_migration("--data-dir", str(seeded_data_dir), "--database-url", db_url)

    result = _run_migration(
        "--data-dir", str(seeded_data_dir), "--database-url", db_url
    )
    assert result.returncode == 0, result.stderr
    assert "SKIPPED" in result.stdout
    assert len(SqlDocumentStore(db_url).read("users")) == 2


def test_migration_replace_flag_overwrites(seeded_data_dir, tmp_path):
    db_url = f"sqlite:///{tmp_path / 'migrate.db'}"
    _run_migration("--data-dir", str(seeded_data_dir), "--database-url", db_url)

    (seeded_data_dir / "users.json").write_text(
        json.dumps([{"username": "carol"}]), encoding="utf-8"
    )
    result = _run_migration(
        "--data-dir", str(seeded_data_dir), "--database-url", db_url, "--replace"
    )
    assert result.returncode == 0, result.stderr
    assert [u["username"] for u in SqlDocumentStore(db_url).read("users")] == ["carol"]


def test_migration_warns_about_duplicate_keys(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "users.json").write_text(
        json.dumps([{"username": "alice"}, {"username": "alice"}]), encoding="utf-8"
    )
    result = _run_migration(
        "--data-dir",
        str(data_dir),
        "--database-url",
        f"sqlite:///{tmp_path / 'dup.db'}",
        "--dry-run",
    )
    assert "duplicates username='alice'" in result.stdout
