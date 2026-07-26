import json
import os
import tempfile
from io import BytesIO

import pytest
import app.models as models
from app import create_app
from app.models import _read_json, _write_json


@pytest.fixture(autouse=True)
def temp_users_file(monkeypatch, tmp_path):
    temp_file = tmp_path / "users.json"
    temp_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr("app.models.USERS_FILE", str(temp_file))
    yield


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_register_and_login(client):
    response = client.post(
        "/api/register",
        data=json.dumps(
            {"username": "alice", "password": "password123", "preferences": ["beach"]}
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    assert response.get_json()["message"] == "user registered successfully"

    response = client.post(
        "/api/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert "token" in response.get_json()


def test_register_duplicate_username(client):
    client.post(
        "/api/register",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    response = client.post(
        "/api/register",
        data=json.dumps({"username": "alice", "password": "otherpass"}),
        content_type="application/json",
    )
    assert response.status_code == 409
    assert response.get_json()["error"] == "username already exists"


def test_login_invalid_credentials(client):
    response = client.post(
        "/api/login",
        data=json.dumps({"username": "bob", "password": "wrong"}),
        content_type="application/json",
    )
    assert response.status_code == 401
    assert response.get_json()["error"] == "invalid credentials"


def test_profile_read_and_update_preferences(client):
    client.post(
        "/api/register",
        data=json.dumps({"username": "alice", "password": "password123", "preferences": ["beach"]}),
        content_type="application/json",
    )
    login_response = client.post(
        "/api/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    token = login_response.get_json()["token"]

    response = client.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.get_json()["preferences"] == ["beach"]

    response = client.patch(
        "/api/profile",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"preferences": ["culture", "food"]}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.get_json()["profile"]["preferences"] == ["culture", "food"]


class FakeGoogleResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps({
            "sub": "google-123",
            "email": "alice@example.com",
            "aud": "client-123",
            "iss": "https://accounts.google.com",
        }).encode("utf-8")


def test_google_auth_with_verified_id_token(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client-123")
    monkeypatch.setattr("urllib.request.urlopen", lambda url, timeout=5: FakeGoogleResponse())

    response = client.post(
        "/api/auth/google",
        data=json.dumps({"id_token": "valid-token", "preferences": ["culture"]}),
        content_type="application/json",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["username"] == "alice"
    assert "token" in payload


def test_admin_can_manage_user_roles(client):
    client.post(
        "/api/register",
        data=json.dumps({"username": "admin", "password": "password123"}),
        content_type="application/json",
    )
    client.post(
        "/api/register",
        data=json.dumps({"username": "bob", "password": "password123"}),
        content_type="application/json",
    )
    users = _read_json(models.USERS_FILE)
    users[0]["role"] = "admin"
    _write_json(models.USERS_FILE, users)

    login_response = client.post(
        "/api/login",
        data=json.dumps({"username": "admin", "password": "password123"}),
        content_type="application/json",
    )
    token = login_response.get_json()["token"]

    response = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert {user["username"] for user in response.get_json()} == {"admin", "bob"}

    response = client.patch(
        "/api/admin/users/bob/role",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"role": "admin"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.get_json()["user"]["role"] == "admin"
