"""A public trip can be joined and rated — and nothing more.

``/itineraries/community`` lists every public trip to everyone, but joining one
and rating one both went through ``_can_access_itinerary``, which only knows
about the owner, participants and people the trip was explicitly shared with.
So the community listing advertised trips that answered 403 to both of the
actions it was advertising them for. ``/copy`` had the rule inline and worked,
which is what made the gap easy to miss.

The fix is deliberately narrow. ``_can_access_itinerary`` also guards payment
receipts, uploaded documents, expenses, reservations and the audit log, on
seventeen other endpoints. Publishing a trip is an invitation to come along; it
is not permission to read the owner's receipts. These tests pin both halves:
what publishing opens, and what it must not.
"""
import hashlib

import pytest

from app import create_app


def _phone_for(username: str) -> str:
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _account(client, username):
    client.post("/api/register", json={
        "username": username, "password": "pw123456", "phone": _phone_for(username),
    })
    return client.post(
        "/api/login", json={"username": username, "password": "pw123456"},
    ).get_json()["token"]


@pytest.fixture
def owner(client):
    return _account(client, "amina")


@pytest.fixture
def stranger(client):
    """Someone with an account who has no relationship to the trip at all."""
    return _account(client, "stranger")


def _make_trip(client, token, visibility):
    created = client.post("/api/itineraries", headers=_auth(token), json={
        "title": "Kribi weekend", "location": "Kribi, South",
    })
    assert created.status_code in (200, 201), created.get_json()
    payload = created.get_json()
    trip = payload.get("itinerary", payload)
    if visibility == "public":
        client.put(f"/api/itineraries/{trip['id']}", headers=_auth(token),
                   json={"visibility": "public"})
    return trip["id"]


@pytest.fixture
def public_trip(client, owner):
    return _make_trip(client, owner, "public")


@pytest.fixture
def private_trip(client, owner):
    return _make_trip(client, owner, "private")


# --------------------------------------------------- what publishing opens

def test_a_stranger_can_rate_a_public_trip(client, public_trip, stranger):
    response = client.post(f"/api/itineraries/{public_trip}/feedback",
                           headers=_auth(stranger),
                           json={"rating": 5, "comment": "The falls are worth it."})
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["feedback"]["comment"] == "The falls are worth it."


def test_a_stranger_can_join_a_public_trip(client, public_trip, stranger):
    response = client.post(f"/api/itineraries/{public_trip}/join",
                           headers=_auth(stranger), json={})
    assert response.status_code == 200, response.get_json()
    assert "stranger" in response.get_json()["itinerary"]["participants"]


def test_a_rating_carries_its_comment_back_on_the_trip(client, public_trip, stranger, owner):
    client.post(f"/api/itineraries/{public_trip}/feedback", headers=_auth(stranger),
                json={"rating": 4, "comment": "Go early."})
    trip = client.get(f"/api/itineraries/{public_trip}", headers=_auth(owner)).get_json()
    trip = trip.get("itinerary", trip)
    assert [(f["username"], f["rating"], f["comment"]) for f in trip["feedback"]] == [
        ("stranger", 4, "Go early."),
    ]


# ------------------------------------------------ what publishing must not

@pytest.mark.parametrize("section", [
    "documents", "expenses", "audit", "reservations", "packing-list", "progress",
])
def test_publishing_a_trip_does_not_publish_its_private_sections(
    client, public_trip, stranger, section,
):
    """Receipts, documents and the audit log stay the owner's business."""
    response = client.get(f"/api/itineraries/{public_trip}/{section}", headers=_auth(stranger))
    assert response.status_code == 403, (
        f"/{section} answered {response.status_code} to a stranger on a public trip"
    )


def test_a_private_trip_still_refuses_both_actions(client, private_trip, stranger):
    rated = client.post(f"/api/itineraries/{private_trip}/feedback",
                        headers=_auth(stranger), json={"rating": 1})
    joined = client.post(f"/api/itineraries/{private_trip}/join",
                         headers=_auth(stranger), json={})
    assert rated.status_code == 403
    assert joined.status_code == 403


def test_a_rating_must_be_one_to_five(client, public_trip, stranger):
    for bad in (0, 6, "excellent", None):
        response = client.post(f"/api/itineraries/{public_trip}/feedback",
                               headers=_auth(stranger), json={"rating": bad})
        assert response.status_code == 400, f"rating={bad!r} was accepted"


# ------------------------------------------------------------------ copying

def test_copying_a_public_trip_gives_the_copier_their_own(client, public_trip, stranger):
    response = client.post(f"/api/itineraries/{public_trip}/copy", headers=_auth(stranger))
    assert response.status_code in (200, 201), response.get_json()
    payload = response.get_json()
    copy = payload.get("itinerary", payload)

    assert copy["id"] != public_trip
    assert copy["username"] == "stranger"
    # Dates are cleared, because they were the other traveller's dates.
    assert copy.get("start_date") in ("", None)

    mine = client.get("/api/itineraries", headers=_auth(stranger)).get_json()
    rows = mine if isinstance(mine, list) else mine.get("itineraries", [])
    assert any(row["id"] == copy["id"] for row in rows)
