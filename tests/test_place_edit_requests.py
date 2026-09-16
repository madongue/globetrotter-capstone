"""Travellers can ask for an existing entry to be corrected, not only added.

The submission queue already handled "here is a place you are missing". It had
no way to say "the price on this one is wrong" — a visitor who spotted a bad
cost or a renamed hotel could only submit a duplicate.

``mode: "edit"`` sends a correction through the same queue and the same
approve/reject endpoints. The difference is what approval does: an *add*
creates a new catalogue record, an *edit* applies the proposed fields to the
record that already exists.

Only the changed fields are stored, which matters for two reasons — an
approval then cannot overwrite a field the submitter never touched, and the
reviewer sees three changes instead of a wall of identical values.
"""
import hashlib

import pytest

from app import create_app


def _phone_for(username: str) -> str:
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


@pytest.fixture(autouse=True)
def temp_catalogue(monkeypatch, tmp_path):
    """The catalogue is not isolated by conftest, so redirect it here.

    conftest covers the runtime collections (users, place_requests, ...); the
    four catalogue seeds stay pointing at the real files for the tests that
    validate the shipped data. This module writes to the catalogue, so it needs
    its own copy.
    """
    for constant, name in (
        ("PLACES_FILE", "places.json"),
        ("HOTELS_FILE", "hotels.json"),
        ("ACTIVITIES_FILE", "activities.json"),
    ):
        path = tmp_path / name
        path.write_text("[]", encoding="utf-8")
        monkeypatch.setattr(f"app.models.{constant}", str(path))
    yield


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _token(client, username, admin=False, monkeypatch=None):
    client.post("/api/register", json={
        "username": username,
        "password": "pw123456",
        "phone": _phone_for(username),
    })
    response = client.post("/api/login", json={"username": username, "password": "pw123456"})
    return response.get_json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_token(client, monkeypatch):
    monkeypatch.setenv("ADMIN_USERNAMES", "boss")
    return _token(client, "boss")


@pytest.fixture
def place(client, admin_token):
    """One catalogue place to correct, created through the admin API."""
    response = client.post("/api/resources/places", headers=_auth(admin_token), json={
        "name": "Lobe Falls",
        "location": "Kribi, South",
        "cost": 3000,
        "description": "Waterfall meeting the sea.",
    })
    assert response.status_code in (200, 201), response.get_json()
    return response.get_json().get("place") or response.get_json()


# ---------------------------------------------------------------- submitting

def test_a_traveller_can_propose_a_correction(client, place, monkeypatch):
    traveller = _token(client, "amina")

    response = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit",
        "type": "places",
        "target_id": place["id"],
        "cost": 5000,
        "reason": "The entry fee went up this season.",
    })

    assert response.status_code == 201, response.get_json()
    submission = response.get_json()
    assert submission["mode"] == "edit"
    assert submission["target_id"] == place["id"]
    assert submission["status"] == "pending"
    assert submission["reason"] == "The entry fee went up this season."
    # Only what actually changed is recorded.
    assert submission["changes"] == {"cost": 5000}


def test_only_changed_fields_are_recorded(client, place):
    traveller = _token(client, "amina")

    response = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit",
        "type": "places",
        "target_id": place["id"],
        "name": "Lobe Falls",          # unchanged
        "cost": 4500,                  # changed
        "description": "Waterfall meeting the sea.",  # unchanged
    })

    assert response.get_json()["changes"] == {"cost": 4500}


def test_a_correction_that_changes_nothing_is_refused(client, place):
    traveller = _token(client, "amina")

    response = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit",
        "type": "places",
        "target_id": place["id"],
        "name": "Lobe Falls",
        "cost": 3000,
    })

    assert response.status_code == 400
    assert "nothing would change" in response.get_json()["error"]


def test_a_correction_needs_a_target(client, place):
    traveller = _token(client, "amina")
    response = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit", "type": "places", "cost": 1000,
    })
    assert response.status_code == 400
    assert "target_id" in response.get_json()["error"]


def test_a_correction_to_a_place_that_does_not_exist_is_refused(client, place):
    traveller = _token(client, "amina")
    response = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit", "type": "places", "target_id": "no-such-place", "cost": 1000,
    })
    assert response.status_code == 404


def test_a_blank_location_is_not_treated_as_a_change(client, place):
    """ensure_cameroon_location("") returns "Cameroon"; that must not become an edit."""
    traveller = _token(client, "amina")

    response = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit",
        "type": "places",
        "target_id": place["id"],
        "location": "",
        "cost": 7000,
    })

    assert response.status_code == 201
    assert "location" not in response.get_json()["changes"]


# ----------------------------------------------------------------- reviewing

def test_approving_a_correction_updates_the_existing_place(client, place, admin_token):
    traveller = _token(client, "amina")
    submission = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit", "type": "places", "target_id": place["id"],
        "name": "Lobé Falls", "cost": 5000,
    }).get_json()

    before = client.get("/api/resources/places").get_json()
    count_before = len(before if isinstance(before, list) else before.get("places", []))

    approved = client.post(
        f"/api/resources/requests/{submission['id']}/approve", headers=_auth(admin_token),
    )
    assert approved.status_code == 200

    detail = client.get(f"/api/resources/places/{place['id']}").get_json()["place"]
    assert detail["name"] == "Lobé Falls"
    assert detail["cost"] == 5000
    # Corrected, not duplicated.
    after = client.get("/api/resources/places").get_json()
    count_after = len(after if isinstance(after, list) else after.get("places", []))
    assert count_after == count_before


def test_rejecting_a_correction_leaves_the_place_alone(client, place, admin_token):
    traveller = _token(client, "amina")
    submission = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit", "type": "places", "target_id": place["id"], "cost": 999999,
    }).get_json()

    client.post(
        f"/api/resources/requests/{submission['id']}/reject",
        headers=_auth(admin_token), json={"note": "Not confirmed."},
    )

    detail = client.get(f"/api/resources/places/{place['id']}").get_json()["place"]
    assert detail["cost"] == 3000


def test_a_correction_cannot_be_approved_twice(client, place, admin_token):
    traveller = _token(client, "amina")
    submission = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit", "type": "places", "target_id": place["id"], "cost": 5000,
    }).get_json()

    first = client.post(f"/api/resources/requests/{submission['id']}/approve", headers=_auth(admin_token))
    second = client.post(f"/api/resources/requests/{submission['id']}/approve", headers=_auth(admin_token))

    assert first.status_code == 200
    assert second.status_code == 400


def test_a_traveller_cannot_approve_their_own_correction(client, place):
    traveller = _token(client, "amina")
    submission = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "mode": "edit", "type": "places", "target_id": place["id"], "cost": 5000,
    }).get_json()

    response = client.post(
        f"/api/resources/requests/{submission['id']}/approve", headers=_auth(traveller),
    )

    assert response.status_code == 403
    detail = client.get(f"/api/resources/places/{place['id']}").get_json()["place"]
    assert detail["cost"] == 3000


def test_adding_a_place_still_works_and_is_marked_as_such(client, admin_token):
    """The add path must not have been disturbed by the edit path."""
    traveller = _token(client, "amina")
    submission = client.post("/api/resources/requests", headers=_auth(traveller), json={
        "type": "places", "name": "Ekom Nkam Falls", "location": "Melong, Littoral", "cost": 5000,
    }).get_json()

    assert submission["mode"] == "add"
    assert submission["status"] == "pending"

    client.post(f"/api/resources/requests/{submission['id']}/approve", headers=_auth(admin_token))
    places = client.get("/api/resources/places").get_json()
    rows = places if isinstance(places, list) else places.get("places", [])
    assert any(row["name"] == "Ekom Nkam Falls" for row in rows)
