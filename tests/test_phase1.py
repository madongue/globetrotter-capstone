import json

import pytest

from app import create_app
import app.models as models


@pytest.fixture
def client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    destinations = [
        {
            "id": 1,
            "name": "Bali",
            "country": "Indonesia",
            "continent": "Asia",
            "description": "Tropical island with beaches and surf.",
            "avg_cost_per_day": 90,
            "tags": ["beach", "surf", "food"],
        },
        {
            "id": 2,
            "name": "Paris",
            "country": "France",
            "continent": "Europe",
            "description": "Historic city with museums and cafes.",
            "avg_cost_per_day": 140,
            "tags": ["culture", "food", "city"],
        },
        {
            "id": 3,
            "name": "Kribi",
            "country": "Cameroon",
            "continent": "Africa",
            "description": "Beach destination known for sunsets and seafood.",
            "avg_cost_per_day": 60,
            "tags": ["beach", "nature", "food"],
        },
    ]

    (data_dir / "destinations.json").write_text(json.dumps(destinations), encoding="utf-8")
    (data_dir / "users.json").write_text("[]", encoding="utf-8")
    (data_dir / "itineraries.json").write_text("[]", encoding="utf-8")

    monkeypatch.setattr(models, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(models, "USERS_FILE", str(data_dir / "users.json"))
    monkeypatch.setattr(models, "ITINERARIES_FILE", str(data_dir / "itineraries.json"))
    monkeypatch.setattr(models, "DESTINATIONS_FILE", str(data_dir / "destinations.json"))

    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def test_google_signup_creates_user_and_returns_token(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")

    def fake_get(url, params=None, timeout=5):
        class FakeResponse:
            def __init__(self, payload):
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

        assert url == "https://oauth2.googleapis.com/tokeninfo"
        assert params["id_token"] == "fake-google-id-token"
        return FakeResponse(
            {
                "sub": "google-user-123",
                "email": "google.user@example.com",
                "email_verified": True,
                "name": "Google User",
                "aud": "test-client-id",
            }
        )

    monkeypatch.setattr("app.auth.requests.get", fake_get)

    response = client.post(
        "/auth/google",
        json={"id_token": "fake-google-id-token"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["token"]
    assert payload["is_new_user"] is True
    assert payload["user"]["email"] == "google.user@example.com"


def test_google_signup_accepts_credential_payload(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")

    def fake_get(url, params=None, timeout=5):
        class FakeResponse:
            def __init__(self, payload):
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

        assert url == "https://oauth2.googleapis.com/tokeninfo"
        assert params["id_token"] == "fake-google-id-token"
        return FakeResponse(
            {
                "sub": "google-user-456",
                "email": "credential.user@example.com",
                "email_verified": True,
                "name": "Credential User",
                "aud": "test-client-id",
            }
        )

    monkeypatch.setattr("app.auth.requests.get", fake_get)

    response = client.post(
        "/auth/google",
        json={"credential": "fake-google-id-token"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["token"]
    assert payload["user"]["email"] == "credential.user@example.com"


def test_register_login_recommend_and_itinerary_flow(client):
    register_resp = client.post(
        "/register",
        json={
            "username": "alice",
            "password": "secret123",
            "preferences": ["beach", "food"],
        },
    )
    assert register_resp.status_code == 201
    assert register_resp.get_json()["username"] == "alice"

    login_resp = client.post(
        "/login",
        json={"username": "alice", "password": "secret123"},
    )
    assert login_resp.status_code == 200
    token = login_resp.get_json()["token"]
    assert token

    destinations_resp = client.get("/destinations?tag=beach&max_cost=100")
    assert destinations_resp.status_code == 200
    data = destinations_resp.get_json()
    assert len(data) >= 1
    assert any(dest["name"] == "Kribi" for dest in data)

    recommendations_resp = client.get(
        "/recommendations?limit=3",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert recommendations_resp.status_code == 200
    recs = recommendations_resp.get_json()
    assert len(recs) >= 1
    assert all("match_score" in rec for rec in recs)

    itinerary_resp = client.post(
        "/itineraries",
        json={
            "title": "Beach Break",
            "destinations": ["Kribi"],
            "start_date": "2026-08-01",
            "end_date": "2026-08-10",
            "notes": "Relax and eat seafood",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert itinerary_resp.status_code == 201
    itinerary = itinerary_resp.get_json()
    assert itinerary["title"] == "Beach Break"

    list_resp = client.get(
        "/itineraries",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_resp.status_code == 200
    itineraries = list_resp.get_json()
    assert len(itineraries) == 1
    assert itineraries[0]["title"] == "Beach Break"
