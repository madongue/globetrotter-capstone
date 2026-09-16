"""Call signalling: who may ring, who may answer, and who may listen in.

The media in a WebRTC call never reaches this server — the two browsers send it
to each other directly. What the server carries is the introduction: the SDP
offer and answer, and the ICE candidates. That is a small amount of data and a
large amount of trust, because whoever can post ICE candidates into a call can
try to become one of its ends.

So these tests are mostly about the boundary. Group membership is the access
rule, the same one chat uses, and a member who is not *in* a given call must
not be able to signal into it or read what the two participants are saying to
each other.
"""
import datetime
import hashlib

import pytest

from app import create_app
from app.models import get_call_by_id, update_call


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
def room(client):
    """A group with two members, and a third traveller outside it."""
    alice = _account(client, "alice")
    bob = _account(client, "bob")
    outsider = _account(client, "mallory")

    created = client.post("/api/groups", headers=_auth(alice),
                          json={"name": "Kribi crew", "description": "weekend"})
    group = created.get_json()
    group = group.get("group", group)
    _set_live(group)
    client.post(f"/api/groups/{group['id']}/join", headers=_auth(bob))

    return {
        "alice": alice, "bob": bob, "outsider": outsider,
        "room_id": f"group:{group['id']}", "group_id": group["id"],
    }


def _start(client, token, room_id, mode="video"):
    return client.post("/api/calls", headers=_auth(token),
                       json={"room_id": room_id, "mode": mode})


# ------------------------------------------------------------------ ringing

def test_a_member_can_start_a_call(client, room):
    response = _start(client, room["alice"], room["room_id"])
    assert response.status_code == 201, response.get_json()
    call = response.get_json()["call"]
    assert call["status"] == "ringing"
    assert call["caller"] == "alice"
    assert call["callee"] is None
    assert call["mode"] == "video"


def test_an_outsider_cannot_start_a_call_in_a_group_they_are_not_in(client, room):
    response = _start(client, room["outsider"], room["room_id"])
    assert response.status_code == 403


def test_the_mode_must_be_audio_or_video(client, room):
    response = _start(client, room["alice"], room["room_id"], mode="hologram")
    assert response.status_code == 400


def test_another_member_sees_the_ringing_call(client, room):
    _start(client, room["alice"], room["room_id"])
    response = client.get(f"/api/calls/active?room_id={room['room_id']}",
                          headers=_auth(room["bob"]))
    assert response.status_code == 200
    assert response.get_json()["call"]["caller"] == "alice"


def test_an_outsider_cannot_poll_for_calls(client, room):
    _start(client, room["alice"], room["room_id"])
    response = client.get(f"/api/calls/active?room_id={room['room_id']}",
                          headers=_auth(room["outsider"]))
    assert response.status_code == 403


def test_pressing_call_twice_joins_the_same_call(client, room):
    """Two people calling at once must not create two half-calls."""
    first = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    second = _start(client, room["bob"], room["room_id"])
    assert second.status_code == 200
    assert second.get_json()["call"]["id"] == first["id"]


def test_a_ringing_call_nobody_answers_stops_being_offered(client, room):
    """Otherwise a caller who closed their tab leaves a phone ringing forever."""
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]

    stale = get_call_by_id(call["id"])
    stale["created_at"] = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)
    ).isoformat()
    update_call(stale)

    response = client.get(f"/api/calls/active?room_id={room['room_id']}",
                          headers=_auth(room["bob"]))
    assert response.get_json()["call"] is None


# ----------------------------------------------------------------- answering

def test_answering_makes_the_call_active(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    response = client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))
    assert response.status_code == 200
    answered = response.get_json()["call"]
    assert answered["status"] == "active"
    assert answered["callee"] == "bob"


def test_the_caller_cannot_answer_their_own_call(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    response = client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["alice"]))
    assert response.status_code == 400


def test_a_second_person_answering_is_told_someone_else_did(client, room):
    """A call is between two browsers; the third needs a real reason, not a 500."""
    charlie = _account(client, "charlie")
    client.post(f"/api/groups/{room['group_id']}/join", headers=_auth(charlie))

    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))
    response = client.post(f"/api/calls/{call['id']}/answer", headers=_auth(charlie))

    assert response.status_code == 409
    assert "someone else" in response.get_json()["error"]


# ---------------------------------------------------------------- signalling

def test_the_two_peers_exchange_offer_and_answer(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]

    posted = client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                         json={"kind": "offer", "payload": {"sdp": "v=0...", "type": "offer"}})
    assert posted.status_code == 201

    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))
    seen = client.get(f"/api/calls/{call['id']}/signals", headers=_auth(room["bob"])).get_json()

    assert [s["kind"] for s in seen["signals"]] == ["offer"]
    assert seen["signals"][0]["payload"]["type"] == "offer"


def test_a_peer_does_not_receive_its_own_signals(client, room):
    """Handing back your own offer would make every client filter every poll."""
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                json={"kind": "offer", "payload": {"sdp": "x"}})

    seen = client.get(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"])).get_json()
    assert seen["signals"] == []


def test_the_cursor_only_returns_what_is_new(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))

    client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                json={"kind": "ice", "payload": {"candidate": "one"}})
    first = client.get(f"/api/calls/{call['id']}/signals", headers=_auth(room["bob"])).get_json()
    assert len(first["signals"]) == 1

    again = client.get(f"/api/calls/{call['id']}/signals?since={first['cursor']}",
                       headers=_auth(room["bob"])).get_json()
    assert again["signals"] == []

    client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                json={"kind": "ice", "payload": {"candidate": "two"}})
    third = client.get(f"/api/calls/{call['id']}/signals?since={first['cursor']}",
                       headers=_auth(room["bob"])).get_json()
    assert [s["payload"]["candidate"] for s in third["signals"]] == ["two"]


def test_a_plus_mangled_cursor_does_not_replay_the_whole_call(client, room):
    """"+00:00" decodes to " 00:00" in a query string; chat had this bug too."""
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))
    client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                json={"kind": "ice", "payload": {"candidate": "one"}})

    first = client.get(f"/api/calls/{call['id']}/signals", headers=_auth(room["bob"])).get_json()
    mangled = first["cursor"].replace("+00:00", " 00:00")

    again = client.get(f"/api/calls/{call['id']}/signals?since={mangled}",
                       headers=_auth(room["bob"])).get_json()
    assert again["signals"] == []


def test_a_group_member_not_in_the_call_cannot_signal_into_it(client, room):
    """Whoever can post ICE candidates can try to become one end of the call."""
    charlie = _account(client, "charlie")
    client.post(f"/api/groups/{room['group_id']}/join", headers=_auth(charlie))

    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))

    response = client.post(f"/api/calls/{call['id']}/signals", headers=_auth(charlie),
                           json={"kind": "ice", "payload": {"candidate": "intruder"}})
    assert response.status_code == 403


def test_an_outsider_cannot_read_the_signalling(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    response = client.get(f"/api/calls/{call['id']}/signals", headers=_auth(room["outsider"]))
    assert response.status_code == 403


def test_a_signal_kind_must_be_one_the_server_knows(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    response = client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                           json={"kind": "shell", "payload": {"cmd": "rm"}})
    assert response.status_code == 400


def test_an_oversized_payload_is_refused(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    response = client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                           json={"kind": "offer", "payload": {"sdp": "x" * 20000}})
    assert response.status_code == 400


# ------------------------------------------------------------------ hanging up

def test_either_participant_can_hang_up(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))

    response = client.post(f"/api/calls/{call['id']}/end", headers=_auth(room["bob"]))
    assert response.status_code == 200
    assert response.get_json()["call"]["status"] == "ended"
    assert response.get_json()["call"]["ended_by"] == "bob"


def test_hanging_up_discards_the_signalling(client, room):
    """An SDP offer is kilobytes and is worthless once the peers have connected."""
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))
    client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["alice"]),
                json={"kind": "offer", "payload": {"sdp": "v=0" + "x" * 4000}})

    client.post(f"/api/calls/{call['id']}/end", headers=_auth(room["alice"]))

    from app.models import get_call_signals
    assert get_call_signals(call["id"]) == []


def test_an_ended_call_is_no_longer_offered_to_the_room(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/end", headers=_auth(room["alice"]))

    response = client.get(f"/api/calls/active?room_id={room['room_id']}",
                          headers=_auth(room["bob"]))
    assert response.get_json()["call"] is None


def test_signalling_into_an_ended_call_is_refused(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))
    client.post(f"/api/calls/{call['id']}/end", headers=_auth(room["alice"]))

    response = client.post(f"/api/calls/{call['id']}/signals", headers=_auth(room["bob"]),
                           json={"kind": "ice", "payload": {"candidate": "late"}})
    assert response.status_code == 409


def test_answering_an_ended_call_is_refused(client, room):
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/end", headers=_auth(room["alice"]))
    response = client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))
    assert response.status_code == 409


def test_calls_require_a_signed_in_caller(client, room):
    assert client.post("/api/calls", json={"room_id": room["room_id"]}).status_code == 401
    assert client.get("/api/calls/active?room_id=x").status_code == 401


def test_an_abandoned_active_call_stops_blocking_the_room(client, room):
    """Both browsers closing leaves no "end" request behind.

    Found while testing: a run that crashed mid-call left the room holding an
    active call for ever, and every later attempt to start one was handed that
    dead call back instead.
    """
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))

    stale = get_call_by_id(call["id"])
    stale["last_seen_at"] = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10)
    ).isoformat()
    update_call(stale)

    assert client.get(f"/api/calls/active?room_id={room['room_id']}",
                      headers=_auth(room["bob"])).get_json()["call"] is None

    fresh = _start(client, room["alice"], room["room_id"])
    assert fresh.status_code == 201
    assert fresh.get_json()["call"]["id"] != call["id"]


def test_polling_for_signals_keeps_a_live_call_alive(client, room):
    """The heartbeat is the poll itself; a call in use must not time out."""
    call = _start(client, room["alice"], room["room_id"]).get_json()["call"]
    client.post(f"/api/calls/{call['id']}/answer", headers=_auth(room["bob"]))

    aged = get_call_by_id(call["id"])
    aged["last_seen_at"] = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10)
    ).isoformat()
    update_call(aged)

    # A participant polling is what says "still here".
    client.get(f"/api/calls/{call['id']}/signals", headers=_auth(room["bob"]))

    live = client.get(f"/api/calls/active?room_id={room['room_id']}",
                      headers=_auth(room["alice"])).get_json()["call"]
    assert live is not None and live["id"] == call["id"]
