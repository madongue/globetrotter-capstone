import json

import pytest

from app import create_app


@pytest.fixture(autouse=True)
def temp_catalogue_files(monkeypatch, tmp_path):
    destinations_file = tmp_path / "destinations.json"
    hotels_file = tmp_path / "hotels.json"
    activities_file = tmp_path / "activities.json"
    places_file = tmp_path / "places.json"
    destinations_file.write_text(
        json.dumps([{
            "name": "Bali",
            "country": "Indonesia",
            "continent": "Asia",
            "description": "Beach destination",
            "tags": ["beach"],
            "avg_cost_per_day": 80,
        }]),
        encoding="utf-8",
    )
    hotels_file.write_text(json.dumps([{"id": "h1", "name": "Bali Stay", "location": "Bali", "cost_per_night": 90}]), encoding="utf-8")
    activities_file.write_text(json.dumps([{"id": "a1", "name": "Surf Lesson", "location": "Bali", "cost": 40}]), encoding="utf-8")
    places_file.write_text(json.dumps([{"id": "p1", "name": "Uluwatu", "location": "Bali", "cost": 10}]), encoding="utf-8")
    monkeypatch.setattr("app.models.DESTINATIONS_FILE", str(destinations_file))
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


def test_autocomplete_returns_local_catalogue_matches(client):
    response = client.get("/api/autocomplete?q=bali")
    assert response.status_code == 200
    payload = response.get_json()
    assert {item["type"] for item in payload} >= {"destination", "hotel", "activity", "place"}
