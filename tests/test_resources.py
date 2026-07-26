import json

import pytest

from app import create_app
from app.models import _read_json, _write_json


@pytest.fixture(autouse=True)
def temp_data_files(monkeypatch, tmp_path):
    users_file = tmp_path / "users.json"
    hotels_file = tmp_path / "hotels.json"
    activities_file = tmp_path / "activities.json"
    places_file = tmp_path / "places.json"
    users_file.write_text("[]", encoding="utf-8")
    hotels_file.write_text("[]", encoding="utf-8")
    activities_file.write_text("[]", encoding="utf-8")
    places_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr("app.models.USERS_FILE", str(users_file))
    monkeypatch.setattr("app.models.HOTELS_FILE", str(hotels_file))
    monkeypatch.setattr("app.models.ACTIVITIES_FILE", str(activities_file))
    monkeypatch.setattr("app.models.PLACES_FILE", str(places_file))
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


def test_resource_reviews_update_average_rating(client, monkeypatch, tmp_path):
    token = register_and_login(client)
    hotels_file = tmp_path / "hotels.json"
    hotels_file.write_text(json.dumps([{"id": "hotel-1", "name": "Bali Stay", "location": "Bali", "cost_per_night": 90}]), encoding="utf-8")
    monkeypatch.setattr("app.models.HOTELS_FILE", str(hotels_file))

    response = client.post(
        "/api/resources/hotels/hotel-1/reviews",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"rating": 5, "comment": "Excellent"}),
        content_type="application/json",
    )
    assert response.status_code == 201
    payload = response.get_json()
    assert payload["resource"]["rating"] == 5.0
    assert payload["review"]["comment"] == "Excellent"

    response = client.get("/api/resources/hotels/hotel-1/reviews")
    assert response.status_code == 200
    assert response.get_json()[0]["rating"] == 5
