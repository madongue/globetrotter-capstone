"""Community discussions: post kind, location, and likes.

The discussion record grew three optional things so the community screen could
show what a post is for, where it is about, and how many travellers found it
useful. All three are additive: a client that sends none of them gets exactly
the record it always did.
"""
import hashlib
import json

import pytest

from app import create_app


def _phone_for(username: str) -> str:
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def register_and_login(client, username="alice"):
    client.post(
        "/api/register",
        data=json.dumps({"username": username, "password": "password123",
                         "phone": _phone_for(username)}),
        content_type="application/json",
    )
    response = client.post(
        "/api/login",
        data=json.dumps({"username": username, "password": "password123"}),
        content_type="application/json",
    )
    return response.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_group(client, token, name="Kribi Travelers"):
    response = client.post(
        "/api/groups",
        data=json.dumps({"name": name, "description": "Beach trips"}),
        content_type="application/json",
        headers=auth(token),
    )
    payload = response.get_json()
    return (payload.get("group") or payload)["id"]


def make_discussion(client, token, group_id, **extra):
    body = {"title": "First time in Kribi", "message": "What should I not miss?"}
    body.update(extra)
    response = client.post(
        f"/api/groups/{group_id}/discussions",
        data=json.dumps(body),
        content_type="application/json",
        headers=auth(token),
    )
    return response


# ---------------------------------------------------------------- post kind

def test_a_discussion_defaults_to_a_question(client):
    """Most community posts are questions, so that is the default."""
    token = register_and_login(client)
    gid = make_group(client, token)
    discussion = make_discussion(client, token, gid).get_json()["discussion"]
    assert discussion["type"] == "question"


@pytest.mark.parametrize("kind", ["question", "recommendation", "experience"])
def test_a_discussion_records_its_kind(client, kind):
    token = register_and_login(client)
    gid = make_group(client, token)
    discussion = make_discussion(client, token, gid, type=kind).get_json()["discussion"]
    assert discussion["type"] == kind


def test_an_unknown_kind_falls_back_rather_than_failing(client):
    """A bad value should not cost someone their post."""
    token = register_and_login(client)
    gid = make_group(client, token)
    response = make_discussion(client, token, gid, type="rant")
    assert response.status_code == 201
    assert response.get_json()["discussion"]["type"] == "question"


# ----------------------------------------------------------------- location

def test_a_discussion_can_name_where_it_is_about(client):
    token = register_and_login(client)
    gid = make_group(client, token)
    discussion = make_discussion(client, token, gid, location="Kribi").get_json()["discussion"]
    # Normalised the same way every other location in the app is.
    assert discussion["location"] == "Kribi, Cameroon"


def test_location_is_optional(client):
    token = register_and_login(client)
    gid = make_group(client, token)
    discussion = make_discussion(client, token, gid).get_json()["discussion"]
    assert discussion["location"] == ""


# -------------------------------------------------------------------- likes

def test_liking_a_discussion_toggles(client):
    token = register_and_login(client)
    gid = make_group(client, token)
    did = make_discussion(client, token, gid).get_json()["discussion"]["id"]

    first = client.post(f"/api/groups/{gid}/discussions/{did}/like", headers=auth(token))
    assert first.status_code == 200
    assert first.get_json()["liked"] is True
    assert first.get_json()["likes"] == 1

    second = client.post(f"/api/groups/{gid}/discussions/{did}/like", headers=auth(token))
    assert second.get_json()["liked"] is False
    assert second.get_json()["likes"] == 0


def test_likes_count_distinct_travellers(client):
    owner = register_and_login(client, "alice")
    gid = make_group(client, owner)
    did = make_discussion(client, owner, gid).get_json()["discussion"]["id"]

    other = register_and_login(client, "bob")
    client.post(f"/api/groups/{gid}/discussions/{did}/like", headers=auth(owner))
    response = client.post(f"/api/groups/{gid}/discussions/{did}/like", headers=auth(other))
    assert response.get_json()["likes"] == 2


def test_liking_does_not_require_membership(client):
    """Finding a thread useful is not the same as joining its group."""
    owner = register_and_login(client, "alice")
    gid = make_group(client, owner)
    did = make_discussion(client, owner, gid).get_json()["discussion"]["id"]

    passer_by = register_and_login(client, "carol")
    response = client.post(f"/api/groups/{gid}/discussions/{did}/like", headers=auth(passer_by))
    assert response.status_code == 200


def test_liking_requires_signing_in(client):
    token = register_and_login(client)
    gid = make_group(client, token)
    did = make_discussion(client, token, gid).get_json()["discussion"]["id"]
    assert client.post(f"/api/groups/{gid}/discussions/{did}/like").status_code == 401


def test_liking_an_unknown_discussion_is_a_404(client):
    token = register_and_login(client)
    gid = make_group(client, token)
    assert client.post(f"/api/groups/{gid}/discussions/nope/like", headers=auth(token)).status_code == 404


# --------------------------------------------------------- nothing regressed

def test_posting_still_requires_membership(client):
    """The rule that predates these fields is unchanged."""
    owner = register_and_login(client, "alice")
    gid = make_group(client, owner)
    outsider = register_and_login(client, "mallory")
    assert make_discussion(client, outsider, gid).status_code == 403


def test_a_discussion_created_without_the_new_fields_still_works(client):
    token = register_and_login(client)
    gid = make_group(client, token)
    response = make_discussion(client, token, gid)
    assert response.status_code == 201
    discussion = response.get_json()["discussion"]
    assert discussion["title"] == "First time in Kribi"
    assert discussion["posts"][0]["message"] == "What should I not miss?"
    assert discussion["liked_by"] == []


def test_replying_still_works_and_counts(client):
    token = register_and_login(client)
    gid = make_group(client, token)
    did = make_discussion(client, token, gid).get_json()["discussion"]["id"]

    response = client.post(
        f"/api/groups/{gid}/discussions/{did}/reply",
        data=json.dumps({"message": "Go to Lobe Falls early."}),
        content_type="application/json",
        headers=auth(token),
    )
    assert response.status_code in (200, 201)

    listing = client.get(f"/api/groups/{gid}/discussions", headers=auth(token)).get_json()
    discussions = listing if isinstance(listing, list) else listing.get("discussions", [])
    assert len(discussions[0]["posts"]) == 2
