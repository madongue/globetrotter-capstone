import json
import os
import tempfile

import pytest
from app import create_app
from app.models import USERS_FILE, _write_json


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
        "/register",
        data=json.dumps(
            {"username": "alice", "password": "password123", "preferences": ["beach"]}
        ),
        content_type="application/json",
    )
    assert response.status_code == 201
    assert response.get_json()["message"] == "user registered successfully"

    response = client.post(
        "/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert "token" in response.get_json()


def test_register_duplicate_username(client):
    client.post(
        "/register",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    response = client.post(
        "/register",
        data=json.dumps({"username": "alice", "password": "otherpass"}),
        content_type="application/json",
    )
    assert response.status_code == 409
    assert response.get_json()["error"] == "username already exists"


def test_login_invalid_credentials(client):
    response = client.post(
        "/login",
        data=json.dumps({"username": "bob", "password": "wrong"}),
        content_type="application/json",
    )
    assert response.status_code == 401
    assert response.get_json()["error"] == "invalid credentials"
