import json
import pytest
from app import create_app


@pytest.fixture(autouse=True)
def temp_data_files(monkeypatch, tmp_path):
    users_file = tmp_path / "users.json"
    itineraries_file = tmp_path / "itineraries.json"
    groups_file = tmp_path / "groups.json"
    media_file = tmp_path / "media.json"
    places_file = tmp_path / "places.json"
    destinations_file = tmp_path / "destinations.json"
    users_file.write_text("[]", encoding="utf-8")
    itineraries_file.write_text("[]", encoding="utf-8")
    groups_file.write_text("[]", encoding="utf-8")
    media_file.write_text("[]", encoding="utf-8")
    places_file.write_text(json.dumps([
        {
            "id": "place-kribi-lobe",
            "name": "Lobe Falls",
            "location": "Kribi, Ocean, South, Cameroon",
            "region": "South",
            "division": "Ocean",
            "subdivision": "Kribi I",
            "city": "Kribi",
            "quarter": "Lobe",
            "description": "Waterfalls flowing into the Atlantic Ocean.",
            "tags": ["nature", "beach", "waterfall"],
            "cost": 10000,
            "image_url": "https://example.com/lobe.jpg"
        },
        {
            "id": "place-douala-maritime",
            "name": "Maritime Museum",
            "location": "Bonanjo, Douala, Wouri, Littoral, Cameroon",
            "region": "Littoral",
            "division": "Wouri",
            "subdivision": "Douala I",
            "city": "Douala",
            "quarter": "Bonanjo",
            "description": "Museum about Cameroon's maritime history.",
            "tags": ["culture", "museum"],
            "cost": 5000,
            "image_url": "https://example.com/museum.jpg"
        }
    ]), encoding="utf-8")
    destinations_file.write_text(json.dumps([
        {
            "name": "Kribi",
            "country": "Cameroon",
            "region": "South",
            "division": "Ocean",
            "city": "Kribi",
            "description": "Beach and nature weekend base.",
            "tags": ["nature", "beach", "waterfall"],
            "avg_cost_per_day": 60000,
            "image_url": "https://example.com/kribi.jpg"
        },
        {
            "name": "Douala",
            "country": "Cameroon",
            "region": "Littoral",
            "division": "Wouri",
            "city": "Douala",
            "description": "Culture and city food.",
            "tags": ["culture", "food"],
            "avg_cost_per_day": 80000
        }
    ]), encoding="utf-8")
    monkeypatch.setattr("app.models.USERS_FILE", str(users_file))
    monkeypatch.setattr("app.models.ITINERARIES_FILE", str(itineraries_file))
    monkeypatch.setattr("app.models.GROUPS_FILE", str(groups_file))
    monkeypatch.setattr("app.models.MEDIA_FILE", str(media_file))
    monkeypatch.setattr("app.models.PLACES_FILE", str(places_file))
    monkeypatch.setattr("app.models.DESTINATIONS_FILE", str(destinations_file))
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
        data=json.dumps({"name": "Cameroon Travelers", "description": "Meet other Cameroon explorers."}),
        content_type="application/json",
    )
    assert response.status_code == 201
    group = response.get_json()
    assert group["name"] == "Cameroon Travelers"
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
        data=json.dumps({"name": "Cameroon Travelers", "description": "Meet other Cameroon explorers."}),
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


def test_media_can_be_linked_to_place_and_filtered(client):
    token = register_and_login(client)
    media_resp = client.post(
        "/api/media",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({
            "type": "photo",
            "url": "https://example.com/lobe-user.jpg",
            "caption": "Traveller view of Lobe Falls",
            "place_id": "place-kribi-lobe",
        }),
        content_type="application/json",
    )
    assert media_resp.status_code == 201
    media = media_resp.get_json()
    assert media["place_id"] == "place-kribi-lobe"
    assert media["place_name"] == "Lobe Falls"
    assert media["city"] == "Kribi"
    assert "waterfall" in media["tags"]

    filtered_resp = client.get(
        "/api/media?place_id=place-kribi-lobe",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert filtered_resp.status_code == 200
    assert [item["id"] for item in filtered_resp.get_json()] == [media["id"]]

    photos_resp = client.get(
        "/api/places/place-kribi-lobe/photos",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert photos_resp.status_code == 200
    assert photos_resp.get_json()["photos"][0]["place_name"] == "Lobe Falls"


def test_wishlist_saves_and_removes_places(client):
    token = register_and_login(client)
    save_resp = client.post(
        "/api/wishlist",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"place_id": "place-kribi-lobe", "notes": "Weekend idea"}),
        content_type="application/json",
    )
    assert save_resp.status_code == 201
    saved_place = save_resp.get_json()["saved_place"]
    assert saved_place["place_id"] == "place-kribi-lobe"
    assert saved_place["name"] == "Lobe Falls"
    assert saved_place["notes"] == "Weekend idea"

    duplicate_resp = client.post(
        "/api/wishlist",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"place_id": "place-kribi-lobe", "notes": "Updated"}),
        content_type="application/json",
    )
    assert duplicate_resp.status_code == 200
    assert len(duplicate_resp.get_json()["saved_places"]) == 1
    assert duplicate_resp.get_json()["saved_place"]["notes"] == "Updated"

    list_resp = client.get("/api/wishlist", headers={"Authorization": f"Bearer {token}"})
    assert list_resp.status_code == 200
    assert len(list_resp.get_json()) == 1

    remove_resp = client.delete(
        "/api/wishlist/place-kribi-lobe",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert remove_resp.status_code == 200
    assert remove_resp.get_json()["saved_places"] == []


def test_city_recommendations_use_browsing_and_saved_places(client):
    token = register_and_login(client)
    client.patch(
        "/api/profile",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"preferences": ["nature"]}),
        content_type="application/json",
    )
    browse_resp = client.post(
        "/api/browsing-events",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"event_type": "view", "place_id": "place-kribi-lobe"}),
        content_type="application/json",
    )
    assert browse_resp.status_code == 201
    client.post(
        "/api/wishlist",
        headers={"Authorization": f"Bearer {token}"},
        data=json.dumps({"place_id": "place-kribi-lobe"}),
        content_type="application/json",
    )

    reco_resp = client.get(
        "/api/recommendations/cities?limit=2",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert reco_resp.status_code == 200
    recommendations = reco_resp.get_json()
    assert recommendations[0]["city"] == "Kribi"
    assert recommendations[0]["match_score"] > recommendations[1]["match_score"]
    assert recommendations[0]["top_places"][0]["name"] == "Lobe Falls"
