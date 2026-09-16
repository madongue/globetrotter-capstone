"""Who may open a community group, and who may see one before it is reviewed.

A group is a space other travellers get invited into, so opening one is a
moderation question. An administrator's group is live at once; anyone else's
waits. The state lives on the group rather than in a parallel "requests"
collection -- a pending group already holds what a reviewer needs, so approving
it is a status change and not a second object being promoted into a first.

Two boundaries are pinned here. A group under review must be invisible to
everyone but its creator and an administrator, and it must answer 404 rather
than 403 so an id cannot be probed to learn that it exists -- the same rule
trip sharing uses. And groups created before any of this existed carry no
status at all; they are treated as approved, because refusing them
retroactively would empty the community of everything already in it.
"""
import hashlib

import pytest

from app import create_app
from app.models import get_group_by_id, save_group, update_group


def _phone_for(username: str) -> str:
    digest = hashlib.md5(username.encode()).hexdigest()
    return "+237" + str(int(digest[:8], 16) % 900000000 + 100000000)


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
def admin(client):
    return _account(client, "boss")


@pytest.fixture
def amina(client):
    return _account(client, "amina")


@pytest.fixture
def eric(client):
    return _account(client, "eric")


def _make(client, token, name="Kribi crew"):
    response = client.post("/api/groups", headers=_auth(token),
                           json={"name": name, "description": "weekend trips"})
    assert response.status_code == 201, response.get_json()
    return response.get_json()


# ------------------------------------------------------------------ creating

def test_an_admin_group_is_live_immediately(client, admin):
    group = _make(client, admin, "Admin crew")
    assert group["status"] == "approved"
    assert group["reviewed_by"] == "boss"


def test_a_travellers_group_waits_for_review(client, amina):
    group = _make(client, amina)
    assert group["status"] == "pending"
    assert group["reviewed_by"] is None
    # The creator is inside it from the start, so it is theirs while it waits.
    assert group["members"] == ["amina"]


def test_the_creator_is_told_it_was_sent_for_review(client, amina):
    _make(client, amina)
    notes = client.get("/api/notifications", headers=_auth(amina)).get_json()
    assert any(n["type"] == "group_submitted" for n in notes), notes


def test_a_group_still_needs_a_name(client, amina):
    assert client.post("/api/groups", headers=_auth(amina), json={}).status_code == 400


# ------------------------------------------------------------- who sees it

def test_a_pending_group_is_hidden_from_other_travellers(client, amina, eric):
    group = _make(client, amina)

    listed = client.get("/api/groups", headers=_auth(eric)).get_json()
    assert all(g["id"] != group["id"] for g in listed)

    # 404, not 403: the id must not confirm that something is there.
    assert client.get(f"/api/groups/{group['id']}", headers=_auth(eric)).status_code == 404


def test_the_creator_can_see_their_own_group_while_it_waits(client, amina):
    group = _make(client, amina)

    listed = client.get("/api/groups", headers=_auth(amina)).get_json()
    mine = next((g for g in listed if g["id"] == group["id"]), None)
    assert mine is not None and mine["status"] == "pending"

    assert client.get(f"/api/groups/{group['id']}", headers=_auth(amina)).status_code == 200


def test_an_admin_sees_every_group(client, admin, amina):
    group = _make(client, amina)
    listed = client.get("/api/groups", headers=_auth(admin)).get_json()
    assert any(g["id"] == group["id"] for g in listed)


def test_an_admin_can_ask_for_only_what_is_waiting(client, admin, amina):
    pending = _make(client, amina, "Waiting crew")
    _make(client, admin, "Live crew")

    queue = client.get("/api/groups?status=pending", headers=_auth(admin)).get_json()
    assert [g["id"] for g in queue] == [pending["id"]]


def test_a_traveller_cannot_ask_for_the_queue(client, amina):
    response = client.get("/api/groups?status=pending", headers=_auth(amina))
    assert response.status_code == 403


def test_an_unknown_status_filter_is_refused(client, admin):
    assert client.get("/api/groups?status=banana", headers=_auth(admin)).status_code == 400


# --------------------------------------------------------------- joining

def test_a_pending_group_cannot_be_joined(client, amina, eric, admin):
    group = _make(client, amina)
    # Even an administrator, who can see it, does not join before it is live.
    assert client.post(f"/api/groups/{group['id']}/join",
                       headers=_auth(admin)).status_code == 409
    # And someone who cannot see it gets the same 404 as everywhere else.
    assert client.post(f"/api/groups/{group['id']}/join",
                       headers=_auth(eric)).status_code == 404


def test_an_approved_group_can_be_joined(client, amina, eric, admin):
    group = _make(client, amina)
    client.post(f"/api/groups/{group['id']}/approve", headers=_auth(admin))

    joined = client.post(f"/api/groups/{group['id']}/join", headers=_auth(eric))
    assert joined.status_code == 200
    assert "eric" in joined.get_json()["group"]["members"]


# -------------------------------------------------------------- reviewing

def test_approving_puts_the_group_live_and_tells_its_creator(client, amina, eric, admin):
    group = _make(client, amina)

    response = client.post(f"/api/groups/{group['id']}/approve", headers=_auth(admin))
    assert response.status_code == 200
    assert response.get_json()["group"]["status"] == "approved"
    assert response.get_json()["group"]["reviewed_by"] == "boss"

    # Now everyone can see it.
    listed = client.get("/api/groups", headers=_auth(eric)).get_json()
    assert any(g["id"] == group["id"] for g in listed)

    notes = client.get("/api/notifications", headers=_auth(amina)).get_json()
    assert any(n["type"] == "group_approved" for n in notes)


def test_rejecting_keeps_the_group_with_its_reason(client, amina, eric, admin):
    group = _make(client, amina)

    response = client.post(f"/api/groups/{group['id']}/reject", headers=_auth(admin),
                           json={"note": "Duplicate of an existing group."})
    assert response.status_code == 200
    body = response.get_json()["group"]
    assert body["status"] == "rejected"
    assert body["review_note"] == "Duplicate of an existing group."

    # Kept, and still visible to the person who asked, so they learn the outcome.
    assert client.get(f"/api/groups/{group['id']}", headers=_auth(amina)).status_code == 200
    assert client.get(f"/api/groups/{group['id']}", headers=_auth(eric)).status_code == 404

    notes = client.get("/api/notifications", headers=_auth(amina)).get_json()
    assert any(n["type"] == "group_rejected" for n in notes)


def test_a_traveller_cannot_approve_their_own_group(client, amina):
    group = _make(client, amina)
    response = client.post(f"/api/groups/{group['id']}/approve", headers=_auth(amina))
    assert response.status_code == 403
    assert get_group_by_id(group["id"]).get("status") == "pending"


def test_a_live_group_cannot_be_rejected(client, amina, admin):
    group = _make(client, amina)
    client.post(f"/api/groups/{group['id']}/approve", headers=_auth(admin))
    assert client.post(f"/api/groups/{group['id']}/reject",
                       headers=_auth(admin)).status_code == 409


def test_approving_twice_is_harmless(client, amina, admin):
    group = _make(client, amina)
    first = client.post(f"/api/groups/{group['id']}/approve", headers=_auth(admin))
    second = client.post(f"/api/groups/{group['id']}/approve", headers=_auth(admin))
    assert first.status_code == 200 and second.status_code == 200


def test_reviewing_a_group_that_does_not_exist(client, admin):
    assert client.post("/api/groups/nope/approve", headers=_auth(admin)).status_code == 404


# ------------------------------------------------------- existing groups

def test_a_group_created_before_any_of_this_is_treated_as_live(client, amina, eric):
    """The 13 groups already in the data carry no status at all."""
    save_group({
        "id": "legacy-group",
        "name": "Kribi Travelers",
        "description": "",
        "created_by": "someone-else",
        "members": ["someone-else"],
        "discussions": [],
        "created_at": "2026-01-01T00:00:00+00:00",
    })

    listed = client.get("/api/groups", headers=_auth(eric)).get_json()
    legacy = next((g for g in listed if g["id"] == "legacy-group"), None)
    assert legacy is not None, "an existing group vanished from the community"
    assert legacy["status"] == "approved"

    assert client.post("/api/groups/legacy-group/join",
                       headers=_auth(eric)).status_code == 200
