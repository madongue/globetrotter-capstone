import hashlib
import json
from io import BytesIO

import pytest

from app import create_app
from app.models import _read_json, _write_json


def _phone_for(username: str) -> str:
    """Deterministic, distinct phone number per username for test registrations."""
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


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
    uploads_dir = tmp_path / "uploads"
    monkeypatch.setattr("app.models.USERS_FILE", str(users_file))
    monkeypatch.setattr("app.models.HOTELS_FILE", str(hotels_file))
    monkeypatch.setattr("app.models.ACTIVITIES_FILE", str(activities_file))
    monkeypatch.setattr("app.models.PLACES_FILE", str(places_file))
    monkeypatch.setattr("app.models.UPLOADS_DIR", str(uploads_dir))
    monkeypatch.setattr("app.resources.UPLOADS_DIR", str(uploads_dir))
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
        data=json.dumps(
            {"username": username, "password": "password123", "phone": _phone_for(username)}
        ),
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
    hotels_file.write_text(json.dumps([{"id": "hotel-1", "name": "Kribi Beach Stay", "location": "Kribi", "cost_per_night": 55000}]), encoding="utf-8")
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


def test_compare_hotels_orders_by_price_and_filters_budget(client, monkeypatch, tmp_path):
    hotels_file = tmp_path / "hotels.json"
    hotels_file.write_text(json.dumps([
        {"id": "hotel-1", "name": "Premium Kribi", "location": "Kribi", "city": "Kribi", "cost_per_night": 85000, "rating": 4.7},
        {"id": "hotel-2", "name": "Budget Kribi", "location": "Kribi", "city": "Kribi", "cost_per_night": 35000, "rating": 4.1},
        {"id": "hotel-3", "name": "Douala Stay", "location": "Douala", "city": "Douala", "cost_per_night": 30000, "rating": 4.3},
    ]), encoding="utf-8")
    monkeypatch.setattr("app.models.HOTELS_FILE", str(hotels_file))

    response = client.get("/api/resources/hotels/compare?city=Kribi&max_price=60000")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["currency_label"] == "FCFA"
    assert payload["count"] == 1
    assert payload["cheapest"]["name"] == "Budget Kribi"
    assert payload["hotels"][0]["price_rank"] == 1


def test_place_detail_includes_nearby_services_and_offline_guide(client, monkeypatch, tmp_path):
    hotels_file = tmp_path / "hotels.json"
    activities_file = tmp_path / "activities.json"
    places_file = tmp_path / "places.json"
    media_file = tmp_path / "media.json"
    hotels_file.write_text(json.dumps([
        {"id": "hotel-1", "name": "Kribi Beach Stay", "location": "Kribi", "region": "South", "city": "Kribi", "cost_per_night": 35000},
        {"id": "hotel-2", "name": "Douala Stay", "location": "Douala", "region": "Littoral", "city": "Douala", "cost_per_night": 30000},
    ]), encoding="utf-8")
    activities_file.write_text(json.dumps([
        {"id": "activity-1", "name": "Lobe canoe tour", "location": "Kribi", "region": "South", "city": "Kribi", "cost": 10000},
    ]), encoding="utf-8")
    places_file.write_text(json.dumps([
        {"id": "place-1", "name": "Lobe Falls", "location": "Kribi", "region": "South", "city": "Kribi", "cost": 10000, "tags": ["waterfall"]},
        {"id": "place-2", "name": "Grand Batanga Beach", "location": "Kribi", "region": "South", "city": "Kribi", "cost": 0},
    ]), encoding="utf-8")
    media_file.write_text(json.dumps([
        {"id": "media-1", "type": "photo", "url": "/api/uploads/lobe.jpg", "place_id": "place-1"},
    ]), encoding="utf-8")
    monkeypatch.setattr("app.models.HOTELS_FILE", str(hotels_file))
    monkeypatch.setattr("app.models.ACTIVITIES_FILE", str(activities_file))
    monkeypatch.setattr("app.models.PLACES_FILE", str(places_file))
    monkeypatch.setattr("app.models.MEDIA_FILE", str(media_file))

    response = client.get("/api/resources/places/place-1")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["place"]["name"] == "Lobe Falls"
    assert payload["nearby"]["hotels"][0]["name"] == "Kribi Beach Stay"
    assert payload["nearby"]["activities"][0]["name"] == "Lobe canoe tour"
    assert payload["photos"][0]["id"] == "media-1"
    assert payload["guide"]["offline_ready"] is True

    guide_resp = client.get("/api/resources/places/place-1/guide")
    assert guide_resp.status_code == 200
    assert guide_resp.get_json()["title"] == "Lobe Falls travel guide"


def test_admin_can_create_place_with_uploaded_media_and_map_coordinates(client):
    token = register_and_login(client, "admin")
    users = _read_json(__import__("app.models").models.USERS_FILE)
    users[0]["role"] = "admin"
    _write_json(__import__("app.models").models.USERS_FILE, users)

    response = client.post(
        "/api/resources/places",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "name": "Test Waterfall",
            "location": "Kribi",
            "region": "South",
            "city": "Kribi",
            "description": "A beautiful admin-created place.",
            "cost": "5000",
            "latitude": "2.9406",
            "longitude": "9.9102",
            "image_urls": "https://example.com/place.jpg",
            "video_urls": "https://example.com/place.mp4",
            "media_files": (BytesIO(b"fake-image"), "place.jpg"),
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 201
    place = response.get_json()
    assert place["name"] == "Test Waterfall"
    assert place["map_info"]["latitude"] == 2.9406
    assert place["image_url"].startswith("/api/uploads/")
    assert len(place["images"]) == 2
    assert len(place["videos"]) == 1
