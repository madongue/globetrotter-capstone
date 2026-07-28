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
            "name": "Kribi",
            "country": "Cameroon",
            "continent": "Africa",
            "region": "South",
            "division": "Ocean",
            "subdivision": "Kribi I",
            "city": "Kribi",
            "description": "Beach destination in Cameroon",
            "tags": ["beach"],
            "avg_cost_per_day": 55000,
        }]),
        encoding="utf-8",
    )
    hotels_file.write_text(json.dumps([{"id": "h1", "name": "Kribi Beach Stay", "location": "Kribi", "cost_per_night": 55000}]), encoding="utf-8")
    activities_file.write_text(json.dumps([{"id": "a1", "name": "Lobe Falls Tour", "location": "Kribi", "cost": 30000}]), encoding="utf-8")
    places_file.write_text(json.dumps([{"id": "p1", "name": "Lobe Falls", "location": "Kribi", "cost": 10000}]), encoding="utf-8")
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
    response = client.get("/api/autocomplete?q=kribi")
    assert response.status_code == 200
    payload = response.get_json()
    assert {item["type"] for item in payload} >= {"destination", "hotel", "activity", "place"}


def test_cameroon_location_filters_are_available(client):
    response = client.get("/api/cameroon-locations")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["country"] == "Cameroon"
    assert any(region["region"] == "Littoral" for region in payload["regions"])


def test_destination_search_filters_by_cameroon_region(client):
    response = client.get("/api/destinations?region=South&city=Kribi")
    assert response.status_code == 200
    payload = response.get_json()
    assert len(payload) == 1
    assert payload[0]["country"] == "Cameroon"
    assert payload[0]["region"] == "South"
