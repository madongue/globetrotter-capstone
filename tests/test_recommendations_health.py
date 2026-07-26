import json

import pytest

from app import create_app


@pytest.fixture(autouse=True)
def temp_data_files(monkeypatch, tmp_path):
    users_file = tmp_path / "users.json"
    itineraries_file = tmp_path / "itineraries.json"
    destinations_file = tmp_path / "destinations.json"
    users_file.write_text("[]", encoding="utf-8")
    itineraries_file.write_text("[]", encoding="utf-8")
    destinations_file.write_text(
        json.dumps([
            {
                "name": "Bali",
                "country": "Indonesia",
                "continent": "Asia",
                "description": "Beaches and food markets",
                "tags": ["beach", "food"],
                "avg_cost_per_day": 80,
            },
            {
                "name": "Paris",
                "country": "France",
                "continent": "Europe",
                "description": "Museums and fine dining",
                "tags": ["culture", "food"],
                "avg_cost_per_day": 220,
            },
        ]),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.models.USERS_FILE", str(users_file))
    monkeypatch.setattr("app.models.ITINERARIES_FILE", str(itineraries_file))
    monkeypatch.setattr("app.models.DESTINATIONS_FILE", str(destinations_file))
    yield


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def register_and_login(client):
    client.post(
        "/api/register",
        data=json.dumps({"username": "alice", "password": "password123", "preferences": ["culture"]}),
        content_type="application/json",
    )
    response = client.post(
        "/api/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    return response.get_json()["token"]


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"
    assert "X-Response-Time-ms" in response.headers


def test_favicon_does_not_create_browser_404(client):
    response = client.get("/favicon.ico")
    assert response.status_code == 204


def test_metrics_endpoint_records_requests(client):
    client.get("/api/health")
    response = client.get("/api/metrics")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["request_count"] >= 1
    assert "GET /api/health" in payload["routes"]


def test_recommendations_use_budget_and_feedback_signals(client):
    token = register_and_login(client)
    create_resp = client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"title": "Bali Trip", "location": "Bali"}),
        content_type="application/json",
    )
    itinerary_id = create_resp.get_json()["id"]
    client.post(
        f"/api/itineraries/{itinerary_id}/feedback",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"rating": 5, "tags": ["beach"]}),
        content_type="application/json",
    )

    response = client.get(
        "/api/recommendations?budget=100&limit=2",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    recommendations = response.get_json()
    assert [item["name"] for item in recommendations] == ["Bali"]
    assert recommendations[0]["signals"]["feedback_matches"] == ["beach"]
