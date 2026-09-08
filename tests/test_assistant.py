"""Tests for the travel assistant.

The property that matters most here is not that the assistant answers, but that
it only answers from data the application actually holds. A travel assistant
that invents a hotel is worse than one that stays quiet, because the traveller
cannot tell the difference until they arrive.
"""
import hashlib
import json

import pytest

from app import create_app


def _phone_for(username: str) -> str:
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


@pytest.fixture(autouse=True)
def temp_data_files(monkeypatch, tmp_path):
    users_file = tmp_path / "users.json"
    itineraries_file = tmp_path / "itineraries.json"
    users_file.write_text("[]", encoding="utf-8")
    itineraries_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr("app.models.USERS_FILE", str(users_file))
    monkeypatch.setattr("app.models.ITINERARIES_FILE", str(itineraries_file))

    hotels_file = tmp_path / "hotels.json"
    hotels_file.write_text(
        json.dumps([
            {
                "id": "hotel-1",
                "name": "Kribi Beach Stay",
                "location": "Kribi",
                "region": "South",
                "city": "Kribi",
                "cost_per_night": 55000,
            },
            {
                "id": "hotel-2",
                "name": "Hotel",  # a generic import, deliberately included
                "location": "Kribi",
                "city": "Kribi",
                "cost_per_night": 20000,
            },
        ]),
        encoding="utf-8",
    )
    activities_file = tmp_path / "activities.json"
    activities_file.write_text(
        json.dumps([
            {"id": "activity-1", "name": "Lobe Falls Tour", "location": "Kribi",
             "city": "Kribi", "cost": 30000},
        ]),
        encoding="utf-8",
    )
    places_file = tmp_path / "places.json"
    places_file.write_text(
        json.dumps([
            {"id": "place-1", "name": "Lobe Falls", "location": "Kribi", "city": "Kribi",
             "category": "waterfall", "cost": 10000},
            {"id": "place-2", "name": "Kribi Beach", "location": "Kribi", "city": "Kribi",
             "category": "beach", "cost": 0},
            {"id": "place-3", "name": "Chez Paul", "location": "Kribi", "city": "Kribi",
             "category": "restaurant", "cost": 5000},
        ]),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.models.HOTELS_FILE", str(hotels_file))
    monkeypatch.setattr("app.models.ACTIVITIES_FILE", str(activities_file))
    monkeypatch.setattr("app.models.PLACES_FILE", str(places_file))

    for name in ("NOTIFICATIONS_FILE", "INVITES_FILE", "AUDIT_LOG_FILE"):
        path = tmp_path / f"{name.lower()}.json"
        path.write_text("[]", encoding="utf-8")
        monkeypatch.setattr(f"app.models.{name}", str(path))

    # No key, so the grounded answer is returned verbatim and can be asserted on.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    yield


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def ask(client, message, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post(
        "/api/assistant/chat",
        data=json.dumps({"message": message}),
        content_type="application/json",
        headers=headers,
    )


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


# --------------------------------------------------------------- basic shape

def test_assistant_answers_without_signing_in(client):
    response = ask(client, "What can I see in Kribi?")
    assert response.status_code == 200
    body = response.get_json()
    assert body["reply"]
    assert body["grounded"] is True


def test_empty_message_is_rejected(client):
    assert ask(client, "   ").status_code == 400


def test_overlong_message_is_rejected(client):
    assert ask(client, "a" * 501).status_code == 400


def test_starters_are_offered(client):
    response = client.get("/api/assistant/starters")
    assert response.status_code == 200
    body = response.get_json()
    assert body["greeting"]
    assert len(body["starters"]) >= 3


# ------------------------------------------------------- grounded in the data

def test_places_answer_names_real_catalogue_entries(client):
    body = ask(client, "What can I see in Kribi?").get_json()
    assert "Lobe Falls" in body["reply"]
    assert [source["name"] for source in body["sources"]]
    # Sightseeing is preferred over eateries, as in the itinerary generator.
    assert "Chez Paul" not in body["reply"]


def test_answers_cite_the_records_they_used(client):
    body = ask(client, "What can I see in Kribi?").get_json()
    names = {source["name"] for source in body["sources"]}
    assert "Lobe Falls" in names
    assert all(source["id"] for source in body["sources"])


def test_assistant_refuses_to_invent_a_place_it_has_no_data_for(client):
    """The important one: silence beats a plausible fabrication."""
    body = ask(client, "What can I see in Garoua?").get_json()
    assert "do not have anything catalogued" in body["reply"]
    assert body["sources"] == []


def test_hotel_answer_uses_real_prices_and_skips_generic_names(client):
    body = ask(client, "Hotels in Kribi").get_json()
    assert "Kribi Beach Stay" in body["reply"]
    assert "55,000 FCFA" in body["reply"]


def test_budget_answer_adds_up_catalogue_prices(client):
    body = ask(client, "How much for 3 days in Kribi?").get_json()
    assert "Estimated total" in body["reply"]
    # 2 nights at 55,000 = 110,000, plus places and one activity.
    assert "110,000 FCFA" in body["reply"]


def test_budget_answer_states_what_it_excludes(client):
    body = ask(client, "How much for 2 days in Kribi?").get_json()
    assert "transport" in body["reply"].lower()


def test_budget_without_a_town_asks_for_one(client):
    body = ask(client, "How much will it cost?").get_json()
    assert "town" in body["reply"].lower()


# ----------------------------------------------------------- app how-to help

@pytest.mark.parametrize(
    "question,expected",
    [
        ("How do I create an itinerary?", "Plan a trip in one step"),
        ("How do I swap checkpoints?", "Trip stages"),
        ("How do I share a trip?", "Share panel"),
        ("How do I upload a photo?", "Media page"),
    ],
)
def test_how_to_questions_are_answered_from_written_help(client, question, expected):
    assert expected in ask(client, question).get_json()["reply"]


def test_safety_question_points_at_an_authority_instead_of_asserting(client):
    body = ask(client, "Is it safe?").get_json()
    assert "travel advice" in body["reply"].lower()


def test_visa_question_refuses_to_state_requirements(client):
    body = ask(client, "Do I need a visa?").get_json()
    assert "embassy" in body["reply"].lower()


# ------------------------------------------------------------- personal data

def test_signed_out_user_is_invited_to_sign_in_for_their_trips(client):
    body = ask(client, "What are my trips?").get_json()
    assert "sign in" in body["reply"].lower()


def test_signed_in_user_with_no_trips_is_told_so(client):
    token = register_and_login(client)
    body = ask(client, "Show me my trips", token).get_json()
    assert "no trips saved" in body["reply"].lower()


def test_signed_in_user_sees_their_own_trips(client):
    token = register_and_login(client)
    client.post(
        "/api/itineraries",
        data=json.dumps({"title": "Kribi weekend", "location": "Kribi"}),
        content_type="application/json",
        headers={"Authorization": f"Bearer {token}"},
    )
    body = ask(client, "What are my trips?", token).get_json()
    assert "Kribi weekend" in body["reply"]


def test_one_user_cannot_see_another_users_trips(client):
    owner = register_and_login(client, "alice")
    client.post(
        "/api/itineraries",
        data=json.dumps({"title": "Alice private trip", "location": "Kribi"}),
        content_type="application/json",
        headers={"Authorization": f"Bearer {owner}"},
    )
    other = register_and_login(client, "bob")
    body = ask(client, "What are my trips?", other).get_json()
    assert "Alice private trip" not in body["reply"]


# ------------------------------------------------------------------ fallback

def test_unrecognised_question_offers_suggestions_rather_than_guessing(client):
    body = ask(client, "quantum mechanics of banana futures").get_json()
    assert len(body["suggestions"]) >= 3
    assert "I can help with" in body["reply"]


def test_greeting_is_answered_as_a_greeting(client):
    body = ask(client, "hello").get_json()
    assert "assistant" in body["reply"].lower()
    assert body["suggestions"]


def test_a_bare_town_name_still_gets_a_useful_answer(client):
    body = ask(client, "Kribi").get_json()
    assert "Lobe Falls" in body["reply"]
