"""The assistant knows who is asking, and offers only what they can do.

Two things are being pinned here.

The first is that an administrator gets administrator answers: "how many users
do I have" reads the accounts and says so, rather than falling through to the
catalogue and answering about beaches. Those answers come from the same
collections the admin dashboard reads, so the two cannot disagree.

The second is the boundary. A traveller asking exactly the same question must
not learn that a review queue exists, and must never be handed a link to it.
Most actions only navigate, so a wrong one is merely a wrong door -- but a door
shown to the wrong person is still a leak, and one action now *creates a trip*
rather than pointing at the page that would.
"""
import hashlib

import pytest

from app import create_app


def _phone_for(username: str) -> str:
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


@pytest.fixture(autouse=True)
def temp_catalogue(monkeypatch, tmp_path):
    """This module creates catalogue rows, so it needs its own copy."""
    for constant, name in (("PLACES_FILE", "places.json"),
                           ("HOTELS_FILE", "hotels.json"),
                           ("ACTIVITIES_FILE", "activities.json")):
        path = tmp_path / name
        path.write_text("[]", encoding="utf-8")
        monkeypatch.setattr(f"app.models.{constant}", str(path))
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


def _ask(client, message, token=None):
    return client.post("/api/assistant/chat",
                       headers=_auth(token) if token else {},
                       json={"message": message}).get_json()


@pytest.fixture
def admin(client):
    return _account(client, "boss")


@pytest.fixture
def traveller(client):
    return _account(client, "amina")


# ------------------------------------------------------------------- roles

def test_the_assistant_reports_the_role_of_the_asker(client, admin, traveller):
    assert _ask(client, "hello", admin)["role"] == "admin"
    assert _ask(client, "hello", traveller)["role"] == "user"
    assert _ask(client, "hello")["role"] == "guest"


# -------------------------------------------------------- admin knowledge

def test_an_admin_asking_how_many_users_gets_the_number(client, admin, traveller):
    reply = _ask(client, "how many users do I have?", admin)["reply"].lower()
    # Two accounts exist: boss and amina.
    assert "2 registered account" in reply


def test_an_admin_is_told_what_is_waiting_for_review(client, admin, traveller):
    client.post("/api/resources/requests", headers=_auth(traveller), json={
        "type": "places", "name": "Ekom Nkam Falls",
        "location": "Melong, Littoral", "cost": 5000,
    })
    reply = _ask(client, "what is pending review?", admin)["reply"]
    assert "Ekom Nkam Falls" in reply
    assert "amina" in reply


def test_an_empty_queue_says_so_rather_than_inventing_work(client, admin):
    reply = _ask(client, "anything waiting for review?", admin)["reply"].lower()
    assert "empty" in reply or "nothing is waiting" in reply


def test_an_admin_can_ask_who_the_administrators_are(client, admin, traveller):
    reply = _ask(client, "who are the administrators?", admin)["reply"]
    assert "boss" in reply
    assert "amina" not in reply


# ------------------------------------------------------------ the boundary

def test_a_traveller_asking_about_the_queue_is_not_told_it_exists(client, admin, traveller):
    client.post("/api/resources/requests", headers=_auth(traveller), json={
        "type": "places", "name": "Secret Falls",
        "location": "Melong, Littoral", "cost": 5000,
    })
    payload = _ask(client, "what is pending review?", traveller)

    assert "Secret Falls" not in payload["reply"]
    assert all(a["path"] != "/admin" for a in payload["actions"])


def test_a_traveller_is_never_offered_an_admin_action(client, traveller):
    for question in ("how many users are there?",
                     "show me the platform analytics",
                     "I want to approve a request",
                     "who are the administrators?"):
        actions = _ask(client, question, traveller)["actions"]
        assert all(a["path"] != "/admin" for a in actions), question


def test_a_signed_out_visitor_is_only_offered_what_needs_no_account(client):
    actions = _ask(client, "what can I see in Kribi?")["actions"]
    assert actions, "a guest should still be offered somewhere to go"
    assert all(a["path"] in ("/explore", "/trips") for a in actions)


# ---------------------------------------------------------------- actions

def test_actions_follow_what_was_actually_asked(client, traveller):
    photo = {a["id"] for a in _ask(client, "how do I share a photo?", traveller)["actions"]}
    assert "media" in photo

    wrong = {a["id"] for a in _ask(client, "the price on this place is wrong", traveller)["actions"]}
    assert "suggest" in wrong

    talk = {a["id"] for a in _ask(client, "can I video call my friends?", traveller)["actions"]}
    assert "community" in talk


def test_an_admin_asking_about_the_queue_is_offered_it(client, admin):
    actions = _ask(client, "what is waiting for review?", admin)["actions"]
    assert any(a["id"] == "admin-queue" for a in actions)


def test_a_greeting_falls_back_to_what_that_role_does_most(client, admin, traveller):
    assert {a["id"] for a in _ask(client, "hello", admin)["actions"]} & {"admin-queue", "admin-stats"}
    assert {a["id"] for a in _ask(client, "hello", traveller)["actions"]} & {"plan", "explore"}


def test_no_more_than_three_actions_are_offered(client, admin):
    for question in ("hello", "how many users, requests, roles and accounts?",
                     "I want to plan a trip and see places and photos"):
        assert len(_ask(client, question, admin)["actions"]) <= 3, question


def test_every_offered_action_has_a_label_and_a_path(client, admin):
    for action in _ask(client, "hello", admin)["actions"]:
        assert action["label"] and action["path"].startswith("/")


# ------------------------------------------------- always something to do

@pytest.mark.parametrize("question", [
    "hello",
    "thanks",
    "what is the weather like",
    "asdfghjkl",
    "tell me something",
    "how many users do I have?",
    "what can I see in Kribi?",
])
def test_the_assistant_always_offers_something(client, admin, question):
    """An answer with nothing to do next leaves the person to work out why they asked."""
    actions = _ask(client, question, admin)["actions"]
    assert actions, f"no actions offered for {question!r}"
    assert len(actions) <= 3


def test_a_signed_out_visitor_is_still_offered_something(client):
    assert _ask(client, "asdfghjkl")["actions"]


# ---------------------------------------------- the action that acts

def test_naming_a_destination_offers_to_build_that_trip(client, traveller):
    """The old behaviour opened the planning page and forgot the destination."""
    actions = _ask(client, "plan a 3 day trip to Limbe", traveller)["actions"]
    build = next((a for a in actions if a.get("run")), None)

    assert build is not None, "no runnable action was offered"
    assert build["run"]["kind"] == "create_trip"
    assert build["run"]["location"].lower() == "limbe"
    assert build["run"]["days"] == 3
    assert "Limbe" in build["label"] and "3" in build["label"]


def test_the_build_action_defaults_to_three_days_when_none_is_given(client, traveller):
    actions = _ask(client, "I want to go to Kribi", traveller)["actions"]
    build = next((a for a in actions if a.get("run")), None)
    assert build and build["run"]["days"] == 3


def test_a_signed_out_visitor_is_not_offered_to_build_a_trip(client):
    """A trip needs an account to own it."""
    actions = _ask(client, "plan a 3 day trip to Limbe")["actions"]
    assert all(not a.get("run") for a in actions)


def test_a_question_with_no_destination_offers_no_build(client, traveller):
    actions = _ask(client, "how do I change the language?", traveller)["actions"]
    assert all(not a.get("run") for a in actions)


def test_every_runnable_action_carries_what_it_needs(client, traveller):
    actions = _ask(client, "plan a 2 day trip to Buea", traveller)["actions"]
    for action in actions:
        if action.get("run"):
            assert action["run"]["location"], action
            assert isinstance(action["run"]["days"], int) and action["run"]["days"] >= 1


# ------------------------------------------------- the group review queue

def test_an_admin_is_told_which_groups_are_waiting(client, admin, traveller):
    client.post("/api/groups", headers=_auth(traveller),
                json={"name": "Kribi weekenders", "description": "coast trips"})

    reply = _ask(client, "what is waiting for review?", admin)["reply"]
    assert "Kribi weekenders" in reply
    assert "amina" in reply


def test_a_traveller_is_not_told_about_the_group_queue(client, admin, traveller):
    client.post("/api/groups", headers=_auth(traveller),
                json={"name": "Secret weekenders", "description": ""})

    payload = _ask(client, "what is waiting for review?", traveller)
    assert "Secret weekenders" not in payload["reply"]
    assert all(a["path"] != "/admin" for a in payload["actions"])


def test_the_platform_numbers_count_groups_awaiting_approval(client, admin, traveller):
    client.post("/api/groups", headers=_auth(traveller), json={"name": "Waiting crew"})
    reply = _ask(client, "show me the platform numbers", admin)["reply"]
    assert "1 group waiting for approval" in reply
