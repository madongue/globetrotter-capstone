import json
from io import BytesIO
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
    hotels_file = tmp_path / "hotels.json"
    activities_file = tmp_path / "activities.json"
    places_file = tmp_path / "places.json"
    hotels_file.write_text(
        json.dumps([{"id": "hotel-1", "name": "Bali Stay", "location": "Bali", "cost_per_night": 90}]),
        encoding="utf-8",
    )
    activities_file.write_text(
        json.dumps([{"id": "activity-1", "name": "Surf Lesson", "location": "Bali", "cost": 40, "duration_hours": 2}]),
        encoding="utf-8",
    )
    places_file.write_text(
        json.dumps([{"id": "place-1", "name": "Uluwatu", "location": "Bali", "cost": 10, "duration_hours": 1.5}]),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.models.HOTELS_FILE", str(hotels_file))
    monkeypatch.setattr("app.models.ACTIVITIES_FILE", str(activities_file))
    monkeypatch.setattr("app.models.PLACES_FILE", str(places_file))
    notifications_file = tmp_path / "notifications.json"
    notifications_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr("app.models.NOTIFICATIONS_FILE", str(notifications_file))
    invites_file = tmp_path / "invites.json"
    audit_file = tmp_path / "audit_log.json"
    uploads_dir = tmp_path / "uploads"
    invites_file.write_text("[]", encoding="utf-8")
    audit_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr("app.models.INVITES_FILE", str(invites_file))
    monkeypatch.setattr("app.models.AUDIT_LOG_FILE", str(audit_file))
    monkeypatch.setattr("app.models.UPLOADS_DIR", str(uploads_dir))
    monkeypatch.setattr("app.itineraries.UPLOADS_DIR", str(uploads_dir))
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
    assert itinerary["duration_hours"] > 0
    assert itinerary["stage_summary"]["stage_count"] == 3

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


def test_itinerary_pay_requires_access_and_positive_amount(client):
    owner_token = register_and_login(client, "alice")
    other_token = register_and_login(client, "bob")

    create_resp = client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {owner_token}"},
        data=json.dumps({"title": "Trip", "location": "Paris"}),
        content_type="application/json",
    )
    itinerary_id = create_resp.get_json()["id"]

    denied_resp = client.post(
        f"/api/itineraries/{itinerary_id}/pay",
        headers={"Authorization": f"Bearer {other_token}"},
        data=json.dumps({"amount": 150, "payment_method": "mobile"}),
        content_type="application/json",
    )
    assert denied_resp.status_code == 403

    invalid_resp = client.post(
        f"/api/itineraries/{itinerary_id}/pay",
        headers={"Authorization": f"Bearer {owner_token}"},
        data=json.dumps({"amount": 0, "payment_method": "mobile"}),
        content_type="application/json",
    )
    assert invalid_resp.status_code == 400

    share_resp = client.post(
        f"/api/itineraries/{itinerary_id}/share",
        headers={"Authorization": f"Bearer {owner_token}"},
        data=json.dumps({"username": "bob"}),
        content_type="application/json",
    )
    assert share_resp.status_code == 200

    allowed_resp = client.post(
        f"/api/itineraries/{itinerary_id}/pay",
        headers={"Authorization": f"Bearer {other_token}"},
        data=json.dumps({"amount": 50, "payment_method": "mobile"}),
        content_type="application/json",
    )
    assert allowed_resp.status_code == 200


def test_trips_alias_generate_progress_and_feedback(client):
    token = register_and_login(client)
    generate_resp = client.post(
        "/api/trips/generate",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"location": "Bali", "budget": 200, "duration_days": 3, "start_date": "2026-08-01"}),
        content_type="application/json",
    )
    assert generate_resp.status_code == 200
    generated = generate_resp.get_json()["generated_itinerary"]
    assert generated["hotel"]["name"] == "Bali Stay"
    assert generated["stage_summary"]["stage_count"] == 3

    create_resp = client.post(
        "/api/trips",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps(generated),
        content_type="application/json",
    )
    assert create_resp.status_code == 201
    itinerary = create_resp.get_json()

    progress_resp = client.patch(
        f"/api/trips/{itinerary['id']}/progress",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({
            "status": "in_progress",
            "current_stage_id": "activity-1",
            "completed_stage_ids": ["hotel"],
            "current_location": "Bali beach",
            "progress_percent": 50,
        }),
        content_type="application/json",
    )
    assert progress_resp.status_code == 200
    progress = progress_resp.get_json()["itinerary"]["progress"]
    assert progress["current_stage_id"] == "activity-1"
    assert progress["completed_stage_ids"] == ["hotel"]

    feedback_resp = client.post(
        f"/api/trips/{itinerary['id']}/feedback",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"rating": 5, "comment": "Loved the beach", "tags": ["beach"]}),
        content_type="application/json",
    )
    assert feedback_resp.status_code == 201
    assert feedback_resp.get_json()["feedback"]["rating"] == 5


def test_shared_edit_permission_and_notifications(client):
    owner_token = register_and_login(client, "alice")
    editor_token = register_and_login(client, "bob")

    create_resp = client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {owner_token}"},
        data=json.dumps({"title": "Original", "location": "Bali"}),
        content_type="application/json",
    )
    itinerary_id = create_resp.get_json()["id"]

    share_resp = client.post(
        f"/api/itineraries/{itinerary_id}/share",
        headers={"Authorization": f"Bearer {owner_token}"},
        data=json.dumps({"username": "bob", "permission": "edit"}),
        content_type="application/json",
    )
    assert share_resp.status_code == 200
    assert share_resp.get_json()["itinerary"]["shared_permissions"]["bob"] == "edit"

    update_resp = client.put(
        f"/api/trips/{itinerary_id}",
        headers={"Authorization": f"Bearer {editor_token}"},
        data=json.dumps({"title": "Edited by Bob"}),
        content_type="application/json",
    )
    assert update_resp.status_code == 200
    assert update_resp.get_json()["title"] == "Edited by Bob"

    notifications_resp = client.get(
        "/api/notifications",
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    assert notifications_resp.status_code == 200
    notifications = notifications_resp.get_json()
    assert notifications[0]["type"] == "itinerary_shared"

    read_resp = client.post(
        f"/api/notifications/{notifications[0]['id']}/read",
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    assert read_resp.status_code == 200
    assert read_resp.get_json()["notification"]["read"] is True


def test_invite_budget_exports_audit_and_checklist(client):
    owner_token = register_and_login(client, "alice")
    guest_token = register_and_login(client, "bob")
    create_resp = client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {owner_token}"},
        data=json.dumps({
            "title": "Bali Plan",
            "location": "Bali",
            "hotel": {"name": "Bali Stay", "cost_per_night": 90},
            "activities": [{"id": "surf", "name": "Surf", "cost": 40}],
            "start_date": "2026-08-01",
            "end_date": "2026-08-03",
        }),
        content_type="application/json",
    )
    itinerary = create_resp.get_json()
    itinerary_id = itinerary["id"]
    assert itinerary["map_info"]["google_map_url"].startswith("https://www.google.com/maps/search")
    assert itinerary["currency"] == "XAF"
    assert itinerary["cost_breakdown"]["currency_label"] == "FCFA"

    invite_resp = client.post(
        f"/api/itineraries/{itinerary_id}/invite",
        headers={"Authorization": f"Bearer {owner_token}"},
        data=json.dumps({"permission": "edit", "max_uses": 1}),
        content_type="application/json",
    )
    assert invite_resp.status_code == 201
    token = invite_resp.get_json()["invite"]["token"]
    join_resp = client.post(f"/api/invites/{token}/join", headers={"Authorization": f"Bearer {guest_token}"})
    assert join_resp.status_code == 200
    assert join_resp.get_json()["itinerary"]["shared_permissions"]["bob"] == "edit"

    checklist_resp = client.post(
        f"/api/itineraries/{itinerary_id}/stages/surf/checklist",
        headers={"Authorization": f"Bearer {guest_token}"},
        data=json.dumps({"text": "Book instructor"}),
        content_type="application/json",
    )
    assert checklist_resp.status_code == 200
    assert checklist_resp.get_json()["stage"]["checklist"][0]["text"] == "Book instructor"

    pay_resp = client.post(
        f"/api/itineraries/{itinerary_id}/pay",
        headers={"Authorization": f"Bearer {guest_token}"},
        data=json.dumps({"amount": 50}),
        content_type="application/json",
    )
    assert pay_resp.status_code == 200

    budget_resp = client.get(f"/api/itineraries/{itinerary_id}/budget", headers={"Authorization": f"Bearer {guest_token}"})
    assert budget_resp.status_code == 200
    budget = budget_resp.get_json()
    assert budget["currency"] == "XAF"
    assert budget["currency_label"] == "FCFA"
    assert budget["paid_total"] == 50.0

    calendar_resp = client.get(f"/api/itineraries/{itinerary_id}/calendar.ics", headers={"Authorization": f"Bearer {guest_token}"})
    assert calendar_resp.status_code == 200
    assert b"BEGIN:VCALENDAR" in calendar_resp.data

    pdf_resp = client.get(f"/api/itineraries/{itinerary_id}/export.pdf", headers={"Authorization": f"Bearer {guest_token}"})
    assert pdf_resp.status_code == 200
    assert pdf_resp.data.startswith(b"%PDF")

    audit_resp = client.get(f"/api/itineraries/{itinerary_id}/audit", headers={"Authorization": f"Bearer {owner_token}"})
    assert audit_resp.status_code == 200
    assert {entry["action"] for entry in audit_resp.get_json()} >= {"created", "invite_created", "payment_recorded"}


def test_media_file_upload(client):
    token = register_and_login(client)
    response = client.post(
        "/api/media/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "caption": "Boarding pass",
            "type": "photo",
            "file": (BytesIO(b"fake-image"), "photo.jpg"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 201
    media = response.get_json()
    assert media["url"].startswith("/api/uploads/")
    file_resp = client.get(media["url"])
    assert file_resp.status_code == 200
    assert file_resp.data == b"fake-image"


def test_missing_uploaded_media_returns_placeholder(client):
    response = client.get("/api/uploads/missing-photo.jpg")
    assert response.status_code == 200
    assert response.mimetype == "image/svg+xml"
    assert b"Media unavailable" in response.data


def test_cameroon_map_metadata_uses_google_maps_links(client):
    token = register_and_login(client)
    create_resp = client.post(
        "/api/itineraries",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({
            "title": "Douala Weekend",
            "location": "Douala",
            "hotel": {"name": "Akwa hotel", "cost_per_night": 65000},
            "activities": [{"id": "food", "name": "Food tour", "cost": 18000}],
        }),
        content_type="application/json",
    )
    itinerary_id = create_resp.get_json()["id"]

    response = client.get(f"/api/itineraries/{itinerary_id}/map", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["provider"] == "google_maps"
    assert payload["country_focus"] == "Cameroon"
    assert payload["map_info"]["cameroon_focus"] is True
    assert "Cameroon" in payload["map_info"]["query"]
    assert payload["map_info"]["google_maps_directions_url"].startswith("https://www.google.com/maps/dir/")
    assert "restaurants" in payload["map_info"]["cameroon_searches"]
