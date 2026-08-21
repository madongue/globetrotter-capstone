import hashlib
import json
import os
import tempfile
from io import BytesIO

import pytest
import app.models as models
from app import create_app
from app.models import _read_json, _write_json


def _phone_for(username: str) -> str:
    """Deterministic, distinct phone number per username for test registrations."""
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


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
            {
                "username": "alice",
                "password": "password123",
                "preferences": ["beach"],
                "phone": _phone_for("alice"),
            }
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


def test_first_registered_user_is_not_admin_by_default(client):
    response = client.post(
        "/api/register",
        data=json.dumps(
            {"username": "owner", "password": "password123", "phone": "+237600000001"}
        ),
        content_type="application/json",
    )

    assert response.status_code == 201
    assert _read_json(models.USERS_FILE)[0]["role"] == "user"


def test_configured_admin_username_becomes_admin(client, monkeypatch):
    client.post(
        "/api/register",
        data=json.dumps(
            {"username": "alice", "password": "password123", "phone": _phone_for("alice")}
        ),
        content_type="application/json",
    )
    monkeypatch.setenv("ADMIN_USERNAMES", "operator, adminuser")

    response = client.post(
        "/api/register",
        data=json.dumps(
            {
                "username": "adminuser",
                "password": "password123",
                "phone": _phone_for("adminuser"),
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 201
    users = {user["username"]: user for user in _read_json(models.USERS_FILE)}
    assert users["adminuser"]["role"] == "admin"


def test_register_recovers_from_null_user_store(client):
    with open(models.USERS_FILE, "w", encoding="utf-8") as users_file:
        users_file.write("null")

    response = client.post(
        "/api/register",
        data=json.dumps(
            {"username": "alice", "password": "password123", "phone": _phone_for("alice")}
        ),
        content_type="application/json",
    )

    assert response.status_code == 201
    assert _read_json(models.USERS_FILE)[0]["username"] == "alice"


def test_register_duplicate_username(client):
    client.post(
        "/api/register",
        data=json.dumps(
            {"username": "alice", "password": "password123", "phone": _phone_for("alice")}
        ),
        content_type="application/json",
    )
    response = client.post(
        "/api/register",
        data=json.dumps(
            {"username": "alice", "password": "otherpass", "phone": _phone_for("alice2")}
        ),
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
        data=json.dumps(
            {
                "username": "alice",
                "password": "password123",
                "preferences": ["beach"],
                "phone": _phone_for("alice"),
            }
        ),
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


def test_interests_are_predefined_and_unknown_values_are_ignored(client):
    response = client.get("/api/interests")
    assert response.status_code == 200
    assert "beach" in response.get_json()["interests"]

    client.post(
        "/api/register",
        data=json.dumps(
            {
                "username": "alice",
                "password": "password123",
                "preferences": ["beach", "made-up"],
                "phone": _phone_for("alice"),
            }
        ),
        content_type="application/json",
    )
    login_response = client.post(
        "/api/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    )
    token = login_response.get_json()["token"]

    response = client.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
    assert response.get_json()["preferences"] == ["beach"]


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

    def fake_get(url, params=None, timeout=5):
        class FakeResponse:
            def __init__(self, payload):
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

        assert url == "https://oauth2.googleapis.com/tokeninfo"
        assert params["id_token"] == "valid-token"
        return FakeResponse(
            {
                "sub": "google-123",
                "email": "alice@example.com",
                "aud": "client-123",
                "email_verified": True,
            }
        )

    monkeypatch.setattr("app.auth.requests.get", fake_get)

    response = client.post(
        "/api/auth/google",
        data=json.dumps({"id_token": "valid-token", "preferences": ["culture"]}),
        content_type="application/json",
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["user"]["email"] == "alice@example.com"
    assert "token" in payload


def test_admin_can_manage_user_roles(client):
    client.post(
        "/api/register",
        data=json.dumps(
            {"username": "admin", "password": "password123", "phone": _phone_for("admin")}
        ),
        content_type="application/json",
    )
    client.post(
        "/api/register",
        data=json.dumps(
            {"username": "bob", "password": "password123", "phone": _phone_for("bob")}
        ),
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


def _register(client, username="victim"):
    return client.post(
        "/api/register",
        data=json.dumps(
            {
                "username": username,
                "password": "password123",
                "phone": _phone_for(username),
            }
        ),
        content_type="application/json",
    )


def test_forgot_password_does_not_leak_reset_token_outside_debug(client):
    """The reset token must never travel back in the HTTP response.

    Returning it would let anyone who knows a username take over that
    account by replaying it against /reset-password.
    """
    _register(client)

    response = client.post(
        "/api/forgot-password",
        data=json.dumps({"username": "victim"}),
        content_type="application/json",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert "reset_token" not in payload
    assert "expires_at" in payload


def test_forgot_password_exposes_token_only_in_debug(client):
    """Debug mode keeps local testing usable while no mailer is configured."""
    _register(client)
    client.application.debug = True

    response = client.post(
        "/api/forgot-password",
        data=json.dumps({"username": "victim"}),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.get_json()["reset_token"]


def test_reset_password_flow_completes_with_issued_token(client):
    """The debug-issued token still drives a real password change."""
    _register(client)
    client.application.debug = True
    reset_token = client.post(
        "/api/forgot-password",
        data=json.dumps({"username": "victim"}),
        content_type="application/json",
    ).get_json()["reset_token"]
    client.application.debug = False

    response = client.post(
        "/api/reset-password",
        data=json.dumps({"token": reset_token, "new_password": "brand-new-pass"}),
        content_type="application/json",
    )
    assert response.status_code == 200

    login = client.post(
        "/api/login",
        data=json.dumps({"username": "victim", "password": "brand-new-pass"}),
        content_type="application/json",
    )
    assert login.status_code == 200
    assert login.get_json()["token"]


def test_secret_key_is_required_outside_debug_and_tests(monkeypatch):
    """A missing SECRET_KEY must fail loudly instead of signing JWTs with a known default."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("FLASK_DEBUG", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app()


def test_secret_key_falls_back_in_debug_mode(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("FLASK_DEBUG", "1")

    assert create_app().config["SECRET_KEY"]
