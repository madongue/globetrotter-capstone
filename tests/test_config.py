from app import create_app


def test_config_exposes_google_maps_api_key(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "maps-test-key")

    app = create_app()
    app.config["TESTING"] = True

    with app.test_client() as client:
        response = client.get("/api/config")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["googleMapsApiKey"] == "maps-test-key"
