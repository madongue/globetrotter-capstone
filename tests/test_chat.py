"""Live chat between travellers.

A room is a community group, so the group's membership already decides who may
read and write. Delivery is a cursor rather than a socket: a client asks for
everything newer than the last message it saw. These tests cover that contract
— who is let in, what a cursor returns, and that the room cannot be used to
reach a group someone has not joined.
"""
import hashlib
import json
from urllib.parse import quote

import pytest

from app import create_app


def _set_live(group):
    """Put a group live, as an administrator would.

    Creating a group now queues it for review unless an administrator made it
    (see tests/test_group_moderation.py). These tests are about what happens
    *inside* a group, so being live is their precondition rather than the thing
    under test -- set directly, so they do not need an administrator account
    each just to get started.
    """
    from app.models import get_group_by_id, update_group
    stored = get_group_by_id(group["id"] if isinstance(group, dict) else group)
    stored["status"] = "approved"
    update_group(stored)
    return stored



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
    return client.post(
        "/api/login",
        data=json.dumps({"username": username, "password": "password123"}),
        content_type="application/json",
    ).get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_group(client, token, name="Kribi Travelers"):
    payload = client.post(
        "/api/groups",
        data=json.dumps({"name": name, "description": "Beach trips"}),
        content_type="application/json",
        headers=auth(token),
    ).get_json()
    group_id = (payload.get("group") or payload)["id"]
    _set_live(group_id)
    return group_id


def say(client, token, room, text):
    return client.post(
        f"/api/chat/rooms/{room}/messages",
        data=json.dumps({"text": text}),
        content_type="application/json",
        headers=auth(token),
    )


def read(client, token, room, since=None, encode=True):
    url = f"/api/chat/rooms/{room}/messages"
    if since:
        # Encoded, as a real client must: the cursor ends in "+00:00" and a
        # bare plus in a query string decodes to a space.
        url += f"?since={quote(since) if encode else since}"
    return client.get(url, headers=auth(token))


# ------------------------------------------------------------ sending, reading

def test_a_member_can_send_and_read(client):
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"

    sent = say(client, token, room, "We are at Down Beach")
    assert sent.status_code == 201
    assert sent.get_json()["chat_message"]["text"] == "We are at Down Beach"

    body = read(client, token, room).get_json()
    assert [m["text"] for m in body["messages"]] == ["We are at Down Beach"]


def test_messages_come_back_oldest_first(client):
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"
    for text in ("first", "second", "third"):
        say(client, token, room, text)

    body = read(client, token, room).get_json()
    assert [m["text"] for m in body["messages"]] == ["first", "second", "third"]


def test_two_travellers_see_each_other(client):
    owner = register_and_login(client, "alice")
    gid = make_group(client, owner)
    room = f"group:{gid}"

    other = register_and_login(client, "bob")
    client.post(f"/api/groups/{gid}/join", headers=auth(other))

    say(client, owner, room, "Where are you?")
    say(client, other, room, "Ten minutes away")

    body = read(client, owner, room).get_json()
    assert [(m["username"], m["text"]) for m in body["messages"]] == [
        ("alice", "Where are you?"),
        ("bob", "Ten minutes away"),
    ]


# -------------------------------------------------------------- the cursor

def test_the_cursor_returns_only_what_is_new(client):
    """This is what makes the conversation feel live without a socket."""
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"

    say(client, token, room, "first")
    first = read(client, token, room).get_json()
    cursor = first["cursor"]
    assert cursor

    say(client, token, room, "second")
    second = read(client, token, room, since=cursor).get_json()
    assert [m["text"] for m in second["messages"]] == ["second"]


def test_an_idle_room_returns_nothing_and_keeps_the_cursor(client):
    """A client polling a quiet room must not re-receive the history."""
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"
    say(client, token, room, "hello")

    cursor = read(client, token, room).get_json()["cursor"]
    again = read(client, token, room, since=cursor).get_json()

    assert again["messages"] == []
    assert again["cursor"] == cursor


# ------------------------------------------------------------------- access

def test_rooms_lists_only_groups_you_joined(client):
    owner = register_and_login(client, "alice")
    make_group(client, owner, "Alice's group")

    outsider = register_and_login(client, "mallory")
    body = client.get("/api/chat/rooms", headers=auth(outsider)).get_json()
    assert body["rooms"] == []


def test_a_member_sees_their_room_listed(client):
    token = register_and_login(client)
    make_group(client, token, "Kribi Travelers")
    body = client.get("/api/chat/rooms", headers=auth(token)).get_json()
    assert [room["name"] for room in body["rooms"]] == ["Kribi Travelers"]


def test_a_non_member_cannot_read(client):
    owner = register_and_login(client, "alice")
    room = f"group:{make_group(client, owner)}"
    say(client, owner, room, "members only")

    outsider = register_and_login(client, "mallory")
    assert read(client, outsider, room).status_code == 403


def test_a_non_member_cannot_send(client):
    owner = register_and_login(client, "alice")
    room = f"group:{make_group(client, owner)}"
    outsider = register_and_login(client, "mallory")
    assert say(client, outsider, room, "let me in").status_code == 403


def test_leaving_the_group_closes_the_room(client):
    """Membership governs the chat, so leaving withdraws access to it."""
    owner = register_and_login(client, "alice")
    gid = make_group(client, owner)
    room = f"group:{gid}"

    other = register_and_login(client, "bob")
    client.post(f"/api/groups/{gid}/join", headers=auth(other))
    assert read(client, other, room).status_code == 200

    client.post(f"/api/groups/{gid}/leave", headers=auth(other))
    assert read(client, other, room).status_code == 403


def test_chat_requires_signing_in(client):
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"
    assert client.get("/api/chat/rooms").status_code == 401
    assert client.get(f"/api/chat/rooms/{room}/messages").status_code == 401
    assert client.post(f"/api/chat/rooms/{room}/messages").status_code == 401


# ------------------------------------------------------------------ validity

def test_an_unknown_room_is_a_404(client):
    token = register_and_login(client)
    assert read(client, token, "group:nope").status_code == 404
    assert say(client, token, "group:nope", "hi").status_code == 404


def test_a_malformed_room_id_is_a_404_not_a_crash(client):
    token = register_and_login(client)
    assert read(client, token, "not-a-room").status_code == 404


def test_an_empty_message_is_rejected(client):
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"
    assert say(client, token, room, "   ").status_code == 400


def test_an_overlong_message_is_rejected(client):
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"
    assert say(client, token, room, "x" * 1001).status_code == 400


def test_the_room_summary_reports_the_last_message(client):
    token = register_and_login(client)
    make_group(client, token, "Kribi Travelers")
    room = client.get("/api/chat/rooms", headers=auth(token)).get_json()["rooms"][0]
    say(client, token, room["room_id"], "see you at the falls")

    after = client.get("/api/chat/rooms", headers=auth(token)).get_json()["rooms"][0]
    assert after["last_message"]["text"] == "see you at the falls"
    assert after["message_count"] == 1


def test_an_unencoded_cursor_still_works(client):
    """A client that forgets to encode the plus must not be sent the whole
    history on every poll — which is what happened before the server undid
    the query string's mangling."""
    token = register_and_login(client)
    room = f"group:{make_group(client, token)}"
    say(client, token, room, "first")
    cursor = read(client, token, room).get_json()["cursor"]
    say(client, token, room, "second")

    body = read(client, token, room, since=cursor, encode=False).get_json()
    assert [m["text"] for m in body["messages"]] == ["second"]
