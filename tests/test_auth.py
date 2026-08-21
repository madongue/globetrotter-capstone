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
            # google_auth branches on status_code to tell a rejected token
            # (401) from Google being unreachable (502).
            status_code = 200

            def __init__(self, payload):
                self._payload = payload

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


def test_google_auth_rejects_a_bad_token_as_unauthorised(client, monkeypatch):
    """Google rejecting a token is the caller's problem, not an upstream outage.

    Returning 502 here would tell the client to retry a token that will never
    work, instead of prompting the user to sign in again.
    """
    class RejectedResponse:
        status_code = 400

        def json(self):
            return {"error_description": "Invalid Value"}

    monkeypatch.setattr("app.auth.requests.get", lambda *a, **k: RejectedResponse())

    response = client.post(
        "/api/google-auth",
        data=json.dumps({"id_token": "expired-or-forged"}),
        content_type="application/json",
    )
    assert response.status_code == 401
    assert "google" in response.get_json()["error"].lower()


def test_google_auth_reports_unreachable_google_as_bad_gateway(client, monkeypatch):
    """A network failure is genuinely upstream, and is worth retrying."""
    import requests

    def explode(*args, **kwargs):
        raise requests.ConnectionError("dns failure")

    monkeypatch.setattr("app.auth.requests.get", explode)

    response = client.post(
        "/api/google-auth",
        data=json.dumps({"id_token": "whatever"}),
        content_type="application/json",
    )
    assert response.status_code == 502


def test_registration_rejects_an_over_long_username(client):
    """Usernames key the stored record, so an unbounded one fails at the database."""
    response = client.post(
        "/api/register",
        data=json.dumps(
            {
                "username": "u" * 500,
                "password": "password123",
                "phone": _phone_for("longname"),
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 400
    assert "64" in response.get_json()["error"]


def test_registration_accepts_a_username_at_the_limit(client):
    response = client.post(
        "/api/register",
        data=json.dumps(
            {
                "username": "u" * 64,
                "password": "password123",
                "phone": _phone_for("atlimit"),
            }
        ),
        content_type="application/json",
    )
    assert response.status_code == 201


def _register_user(client, username):
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


def test_platform_stats_are_public(client):
    """The landing page shows these to signed-out visitors."""
    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.get_json()["total_travellers"] == 0


def test_platform_stats_count_travellers_and_activity(client):
    for name in ("alice", "bob", "carine"):
        _register_user(client, name)

    stats = client.get("/api/stats").get_json()
    assert stats["total_travellers"] == 3
    # Registering is itself activity, so all three count as active today.
    assert stats["active_today"] == 3
    assert stats["joined_this_week"] == 3


def test_platform_stats_never_expose_personal_data(client):
    """These counters are shown to anyone, so they must stay aggregate-only."""
    _register_user(client, "alice")

    body = client.get("/api/stats").get_data(as_text=True).lower()
    for leak in ("alice", "password", "phone", "email", "token"):
        assert leak not in body, f"stats leaked {leak}"


def test_authenticated_requests_record_activity(client):
    """"Active today" is derived from this stamp, so a request must refresh it."""
    _register_user(client, "alice")
    token = client.post(
        "/api/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    ).get_json()["token"]

    user = _read_json(models.USERS_FILE)[0]
    user.pop("last_seen_at", None)
    _write_json(models.USERS_FILE, [user])
    assert client.get("/api/stats").get_json()["active_today"] == 0

    client.get("/api/itineraries", headers={"Authorization": f"Bearer {token}"})

    assert client.get("/api/stats").get_json()["active_today"] == 1


def test_activity_write_is_throttled(client):
    """Every authenticated request passes through here; writing each time would
    mean a storage write per request."""
    _register_user(client, "alice")
    token = client.post(
        "/api/login",
        data=json.dumps({"username": "alice", "password": "password123"}),
        content_type="application/json",
    ).get_json()["token"]

    first = _read_json(models.USERS_FILE)[0]["last_seen_at"]
    for _ in range(5):
        client.get("/api/itineraries", headers={"Authorization": f"Bearer {token}"})

    assert _read_json(models.USERS_FILE)[0]["last_seen_at"] == first


def test_stats_survive_users_with_no_activity_stamp(client):
    """Accounts created before activity tracking existed have no stamp."""
    _register_user(client, "alice")
    legacy = _read_json(models.USERS_FILE)[0]
    legacy.pop("last_seen_at", None)
    legacy.pop("created_at", None)
    _write_json(models.USERS_FILE, [legacy])

    stats = client.get("/api/stats").get_json()
    assert stats["total_travellers"] == 1
    assert stats["active_today"] == 0
    assert stats["joined_this_week"] == 0
