"""Profile pictures: uploading one, removing it, and where it shows.

Two things are pinned. The upload boundary -- a profile picture must be an
image, decided from the file's own MIME type rather than its extension or
anything the form claims, and it must be small enough that a free instance's
disk survives it.

And the resolution rule: a picture is attached to a post when the post is
*read*, not stored on it when it was written. Changing your picture therefore
updates every post you have ever made, which is what people expect, rather than
leaving a trail of old faces behind.
"""
import hashlib
from io import BytesIO

import pytest

from app import create_app

#: The shortest valid PNG: a 1x1 pixel. Enough for the server to classify.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6360000002000100ffff03000006000557bfabd4000000"
    "0049454e44ae426082"
)


def _phone_for(username: str) -> str:
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


@pytest.fixture(autouse=True)
def temp_uploads(monkeypatch, tmp_path):
    monkeypatch.setattr("app.models.UPLOADS_DIR", str(tmp_path / "uploads"))
    yield


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ADMIN_USERNAMES", "boss")
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _account(client, username):
    client.post("/api/register", json={
        "username": username, "password": "pw123456", "phone": _phone_for(username),
    })
    return client.post("/api/login",
                       json={"username": username, "password": "pw123456"}).get_json()["token"]


@pytest.fixture
def amina(client):
    return _account(client, "amina")


@pytest.fixture
def admin(client):
    return _account(client, "boss")


def _upload(client, token, data=PNG, filename="face.png", content_type="image/png"):
    return client.post(
        "/api/profile/avatar",
        headers=_auth(token),
        data={"file": (BytesIO(data), filename, content_type)},
        content_type="multipart/form-data",
    )


# ----------------------------------------------------------------- setting

def test_a_traveller_can_upload_a_picture(client, amina):
    response = _upload(client, amina)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["profile"]["avatar_url"]

    shown = client.get("/api/profile", headers=_auth(amina)).get_json()
    assert shown["avatar_url"] == response.get_json()["profile"]["avatar_url"]


def test_an_admin_can_upload_a_picture_too(client, admin):
    assert _upload(client, admin).status_code == 201


def test_a_profile_starts_with_no_picture(client, amina):
    assert client.get("/api/profile", headers=_auth(amina)).get_json()["avatar_url"] == ""


def test_uploading_again_replaces_it(client, amina):
    first = _upload(client, amina).get_json()["profile"]["avatar_url"]
    second = _upload(client, amina).get_json()["profile"]["avatar_url"]
    assert first and second and first != second


def test_a_picture_can_be_removed(client, amina):
    _upload(client, amina)
    removed = client.delete("/api/profile/avatar", headers=_auth(amina))
    assert removed.status_code == 200
    assert removed.get_json()["profile"]["avatar_url"] == ""


def test_a_web_address_can_be_used_instead(client, amina):
    response = client.patch("/api/profile", headers=_auth(amina),
                            json={"avatar_url": "https://example.com/face.jpg"})
    assert response.status_code == 200
    assert response.get_json()["profile"]["avatar_url"] == "https://example.com/face.jpg"


def test_an_empty_address_clears_the_picture(client, amina):
    _upload(client, amina)
    client.patch("/api/profile", headers=_auth(amina), json={"avatar_url": ""})
    assert client.get("/api/profile", headers=_auth(amina)).get_json()["avatar_url"] == ""


# ---------------------------------------------------------------- refusing

def test_a_picture_must_actually_be_an_image(client, amina):
    """Decided from the file's MIME type, not its name."""
    response = _upload(client, amina, data=b"MZ\\x90\\x00not an image",
                       filename="face.png", content_type="application/octet-stream")
    assert response.status_code == 400
    assert "image" in response.get_json()["error"]


def test_a_video_is_not_a_profile_picture(client, amina):
    response = _upload(client, amina, data=b"\\x00" * 64,
                       filename="clip.mp4", content_type="video/mp4")
    assert response.status_code == 400


def test_an_oversized_picture_is_refused(client, amina):
    """Measured from the stream, because Content-Length is whatever was claimed."""
    response = _upload(client, amina, data=b"\\x89PNG" + b"\\x00" * (6 * 1024 * 1024))
    assert response.status_code == 400
    assert "MB" in response.get_json()["error"]


def test_a_picture_needs_a_file(client, amina):
    response = client.post("/api/profile/avatar", headers=_auth(amina),
                           data={}, content_type="multipart/form-data")
    assert response.status_code == 400


def test_an_address_must_be_a_web_address(client, amina):
    response = client.patch("/api/profile", headers=_auth(amina),
                            json={"avatar_url": "javascript:alert(1)"})
    assert response.status_code == 400


def test_a_picture_needs_a_signed_in_account(client):
    assert client.post("/api/profile/avatar").status_code == 401
    assert client.delete("/api/profile/avatar").status_code == 401


# ------------------------------------------------------------ where it shows

def test_a_picture_reaches_the_media_feed(client, amina):
    _upload(client, amina)
    client.post("/api/media", headers=_auth(amina),
                json={"url": "/images/destinations/kribi.jpg", "caption": "hello"})

    feed = client.get("/api/media", headers=_auth(amina)).get_json()
    assert feed and feed[0]["avatar_url"], feed


def test_changing_a_picture_updates_posts_already_made(client, amina):
    """Resolved when the post is read, not stamped on it when it was written."""
    client.post("/api/media", headers=_auth(amina),
                json={"url": "/images/destinations/kribi.jpg", "caption": "before"})
    assert client.get("/api/media", headers=_auth(amina)).get_json()[0]["avatar_url"] == ""

    _upload(client, amina)
    assert client.get("/api/media", headers=_auth(amina)).get_json()[0]["avatar_url"] != ""


def test_a_picture_reaches_the_admin_account_list(client, admin, amina):
    _upload(client, amina)
    users = client.get("/api/admin/users", headers=_auth(admin)).get_json()
    row = next(u for u in users if u["username"] == "amina")
    assert row["avatar_url"]


def test_the_account_list_never_leaks_the_password_hash(client, admin, amina):
    """The profile shape is defined once now; this is what that is for."""
    users = client.get("/api/admin/users", headers=_auth(admin)).get_json()
    for row in users:
        assert "password_hash" not in row
        assert "reset_token" not in row
