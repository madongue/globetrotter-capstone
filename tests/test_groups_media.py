import json
import pytest
from app import create_app


@pytest.fixture(autouse=True)
def temp_data_files(monkeypatch, tmp_path):
    users_file = tmp_path / "users.json"
    itineraries_file = tmp_path / "itineraries.json"
    groups_file = tmp_path / "groups.json"
    media_file = tmp_path / "media.json"
    users_file.write_text("[]", encoding="utf-8")
    itineraries_file.write_text("[]", encoding="utf-8")
    groups_file.write_text("[]", encoding="utf-8")
    media_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr("app.models.USERS_FILE", str(users_file))
    monkeypatch.setattr("app.models.ITINERARIES_FILE", str(itineraries_file))
    monkeypatch.setattr("app.models.GROUPS_FILE", str(groups_file))
    monkeypatch.setattr("app.models.MEDIA_FILE", str(media_file))
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


def test_create_group_and_join(client):
    token = register_and_login(client)
    response = client.post(
        "/api/groups",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"name": "Bali Travelers", "description": "Meet other Bali explorers."}),
        content_type="application/json",
    )
    assert response.status_code == 201
    group = response.get_json()
    assert group["name"] == "Bali Travelers"
    assert group["members"] == ["alice"]

    group_id = group["id"]
    response = client.post(
        f"/api/groups/{group_id}/join",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.get_json()["message"] == "already a member"


def test_group_discussions_and_replies(client):
    token = register_and_login(client)
    create_resp = client.post(
        "/api/groups",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"name": "Bali Travelers", "description": "Meet other Bali explorers."}),
        content_type="application/json",
    )
    group_id = create_resp.get_json()["id"]

    discussion_resp = client.post(
        f"/api/groups/{group_id}/discussions",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"title": "Best beaches", "message": "Which beach should we visit?"}),
        content_type="application/json",
    )
    assert discussion_resp.status_code == 201
    discussion = discussion_resp.get_json()["discussion"]
    assert discussion["title"] == "Best beaches"
    assert discussion["posts"][0]["message"] == "Which beach should we visit?"

    discussion_id = discussion["id"]
    reply_resp = client.post(
        f"/api/groups/{group_id}/discussions/{discussion_id}/reply",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"message": "I recommend Seminyak."}),
        content_type="application/json",
    )
    assert reply_resp.status_code == 200
    assert reply_resp.get_json()["post"]["message"] == "I recommend Seminyak."


def test_media_comment_like_share(client):
    token = register_and_login(client)
    media_resp = client.post(
        "/api/media",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"type": "photo", "url": "https://example.com/pic.jpg", "caption": "Sunset", "shared_with": []}),
        content_type="application/json",
    )
    assert media_resp.status_code == 201
    media_id = media_resp.get_json()["id"]

    comment_resp = client.post(
        f"/api/media/{media_id}/comment",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"comment": "Looks amazing!"}),
        content_type="application/json",
    )
    assert comment_resp.status_code == 200
    assert comment_resp.get_json()["comment"]["text"] == "Looks amazing!"

    like_resp = client.post(
        f"/api/media/{media_id}/like",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert like_resp.status_code == 200
    assert token not in like_resp.get_json()["media"]["likes"]
    assert like_resp.get_json()["media"]["likes"] == ["alice"]

    share_resp = client.post(
        f"/api/media/{media_id}/share",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"username": "bob"}),
        content_type="application/json",
    )
    assert share_resp.status_code == 404
