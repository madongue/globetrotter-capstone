"""
app/chat.py

Live chat between travellers.

What this is
------------
A chat room per community group. Members of a group can talk in real time
rather than waiting on a discussion thread — a discussion is for a question
that deserves an answer later, a chat is for "we are at the beach, where are
you".

Rooms are not a new entity. A room *is* a group, addressed as
``group:<group_id>``, so membership, permissions and the group's own lifecycle
already govern who may read and write. Inventing a parallel room registry would
have meant two sources of truth about who is allowed in.

Why polling and not WebSockets
------------------------------
The obvious implementation is Flask-SocketIO. It is the wrong one here, and
deliberately so.

The application runs under gunicorn with two workers. A WebSocket broadcast
reaches only the worker holding that connection, so two travellers served by
different workers would not see each other's messages. Making that correct
needs a shared message broker — Redis — which the current deployment does not
have and which Phase 4 of the course is where it belongs.

So delivery is a cursor instead: a client asks for everything newer than the
last message it saw, and asks again. At a two-second interval a conversation
feels immediate, it is correct under any number of workers, it survives a
dropped connection with no reconnection logic, and it works through the API
gateway unchanged. ``/chat/rooms/<id>/messages?since=<cursor>`` is the whole
protocol.

The upgrade path is open: swap the poll for a socket once there is a broker to
back it, without changing the storage or the routes.

Routes
------
GET  /chat/rooms                       – rooms this traveller can see
GET  /chat/rooms/<room_id>/messages    – messages, optionally since a cursor
POST /chat/rooms/<room_id>/messages    – say something
"""
import datetime
import uuid

from flask import Blueprint, jsonify, request

from app.auth import avatars_for, get_current_user
from app.models import (
    get_all_groups,
    get_chat_messages,
    get_group_by_id,
    save_chat_message,
)

chat_bp = Blueprint("chat", __name__)

#: Longest single message. Long enough for a paragraph, short enough that one
#: person cannot fill a room's history in a single call.
MAX_MESSAGE_LENGTH = 1000

#: Most messages returned in one response. A client asking for the whole
#: history of a busy room gets the most recent page, not all of it.
MAX_MESSAGES = 200

ROOM_PREFIX = "group:"


def _group_id_for(room_id: str) -> str | None:
    """The group a room belongs to, or None if the id is not a room."""
    if not room_id or not room_id.startswith(ROOM_PREFIX):
        return None
    return room_id[len(ROOM_PREFIX):] or None


def _normalise_cursor(since: str) -> str:
    """Undo the one way a query string mangles an ISO timestamp.

    ``sent_at`` ends in ``+00:00``, and a bare ``+`` in a query string decodes
    to a space. A client that forgets to percent-encode the cursor therefore
    sends "…591909 00:00", which sorts below every stored value and returns the
    whole history on every poll — a chat that repeats itself forever.

    Encoding it is the client's job, but the failure is silent and the fix here
    is unambiguous: a space in that position can only have been a plus.
    """
    return since.replace(" ", "+")


def _room_for(group: dict) -> dict:
    messages = get_chat_messages(f"{ROOM_PREFIX}{group['id']}")
    last = messages[-1] if messages else None
    return {
        "room_id": f"{ROOM_PREFIX}{group['id']}",
        "group_id": group["id"],
        "name": group.get("name", "Group chat"),
        "members": len(group.get("members", [])),
        "message_count": len(messages),
        "last_message": {
            "username": last.get("username"),
            "text": last.get("text"),
            "sent_at": last.get("sent_at"),
        } if last else None,
    }


@chat_bp.route("/chat/rooms", methods=["GET"])
def list_rooms():
    """The chat rooms this traveller belongs to.

    Only groups they are a member of: a chat is a conversation among people who
    joined, not a public broadcast, and showing a room they cannot post in
    would be an invitation to a locked door.
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    rooms = [
        _room_for(group)
        for group in get_all_groups()
        if username in group.get("members", [])
    ]
    # Busiest conversations first, then rooms nobody has used yet.
    rooms.sort(key=lambda room: (room["last_message"] or {}).get("sent_at") or "", reverse=True)
    return jsonify({"rooms": rooms}), 200


@chat_bp.route("/chat/rooms/<room_id>/messages", methods=["GET"])
def read_messages(room_id: str):
    """Messages in a room, optionally only those newer than a cursor.

    ``?since=<cursor>`` is how the conversation stays live: the client passes
    the ``cursor`` from its previous response and receives only what has
    arrived since. Without it, the most recent page.
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group_id = _group_id_for(room_id)
    group = get_group_by_id(group_id) if group_id else None
    if not group:
        return jsonify({"error": "chat room not found"}), 404
    if username not in group.get("members", []):
        return jsonify({"error": "join the group to read its chat"}), 403

    messages = get_chat_messages(room_id)

    since = _normalise_cursor(request.args.get("since", "").strip())
    if since:
        # Sent times are ISO-8601 in UTC, so comparing them as strings orders
        # them correctly and needs no parsing.
        messages = [m for m in messages if str(m.get("sent_at", "")) > since]

    messages = messages[-MAX_MESSAGES:]

    pictures = avatars_for(m.get("username") for m in messages)
    return jsonify({
        "room_id": room_id,
        "messages": [
            {**m, "avatar_url": pictures.get(m.get("username"), "")} for m in messages
        ],
        # What to pass back as `since` next time. Unchanged when nothing new
        # arrived, so an idle client keeps asking the same question.
        "cursor": messages[-1]["sent_at"] if messages else since,
    }), 200


@chat_bp.route("/chat/rooms/<room_id>/messages", methods=["POST"])
def send_message(room_id: str):
    """Say something in a room.

    Expected JSON body: ``{"text": "we are at Down Beach"}``
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    group_id = _group_id_for(room_id)
    group = get_group_by_id(group_id) if group_id else None
    if not group:
        return jsonify({"error": "chat room not found"}), 404
    if username not in group.get("members", []):
        return jsonify({"error": "join the group to post in its chat"}), 403

    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"error": "message text is required"}), 400
    if len(text) > MAX_MESSAGE_LENGTH:
        return jsonify({
            "error": f"message must be {MAX_MESSAGE_LENGTH} characters or fewer",
        }), 400

    message = {
        "id": str(uuid.uuid4()),
        "room_id": room_id,
        "group_id": group_id,
        "username": username,
        "text": text,
        "sent_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    save_chat_message(message)

    return jsonify({"message": "sent", "chat_message": message}), 201
