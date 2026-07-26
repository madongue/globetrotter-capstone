import json
import pytest
from app import create_app
from app.models import ITINERARIES_FILE, USERS_FILE


@pytest.fixture(autouse=True)
def temp_data_files(monkeypatch, tmp_path):
    users_file = tmp_path / "users.json"
    itineraries_file = tmp_path / "itineraries.json"
    users_file.write_text("[]", encoding="utf-8")
    itineraries_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr("app.models.USERS_FILE", str(users_file))
    monkeypatch.setattr("app.models.ITINERARIES_FILE", str(itineraries_file))
    yield


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def register_and_login(client, username="alice"):
    client.post(
        "/api/register",
        data=json.dumps({"username": username, "password": "password123"}),
        content_type="application/json",
    )
    response = client.post(
        "/api/login",
        data=json.dumps({"username": username, "password": "password123"}),
        content_type="application/json",
    )
    return response.get_json()["token"]


def test_create_itinerary_requires_auth(client):
    response = client.post(
        "/api/itineraries",
        data=json.dumps({"title": "Trip", "location": "Bali"}),
        content_type="application/json",
    )
    assert response.status_code == 401


def test_create_itinerary_and_join(client):
    token = register_and_login(client)
    response = client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps(
            {
                "title": "Beach Escape",
                "location": "Bali",
                "hotel": {"name": "Seaside Hotel", "cost_per_night": 120},
                "activities": [{"name": "Surf Lesson", "cost": 50}],
                "places_to_visit": [{"name": "Uluwatu", "cost": 0}],
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    itinerary = response.get_json()
    assert itinerary["title"] == "Beach Escape"
    assert itinerary["location"] == "Bali"
    assert itinerary["payment_status"] == "pending"
    assert itinerary["participants"] == ["alice"]

    itinerary_id = itinerary["id"]
    response = client.post(
        f"/api/itineraries/{itinerary_id}/join",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"payment_amount": 75, "payment_method": "mobile"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["message"] == "already joined" or payload["message"] == "joined itinerary"


def test_pay_itinerary_generates_receipt(client):
    token = register_and_login(client)
    create_resp = client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"title": "Trip", "location": "Paris"}),
        content_type="application/json",
    )
    itinerary_id = create_resp.get_json()["id"]

    response = client.post(
        f"/api/itineraries/{itinerary_id}/pay",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"amount": 150, "payment_method": "mobile", "target_type": "total"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    payment = response.get_json()["payment"]
    receipt = response.get_json()["receipt"]
    assert payment["amount"] == 150.0
    assert receipt["amount"] == 150.0
    assert receipt["commission_amount"] == 7.5
    assert receipt["net_amount"] == 142.5
