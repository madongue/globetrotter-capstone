"""
app/calls.py

Audio and video calls between two members of a group.

What this is
------------
Peer-to-peer WebRTC. The audio and video never touch this server: once the two
browsers have found each other they send media directly to one another. What
the server does is introduce them — it carries the handful of messages
("signalling") the two peers need to exchange before a direct connection can
exist, and nothing after that.

That division is why this is affordable. Relaying media for even a handful of
concurrent calls needs bandwidth a free instance does not have; carrying a few
kilobytes of signalling per call costs nothing.

Why signalling rides on polling, again
--------------------------------------
For the reason app/chat.py gives at length: two gunicorn workers, no shared
broker, so a WebSocket broadcast would reach only the worker holding the
socket. Signalling uses the same cursor as chat — ask for everything newer
than the last thing you saw, then ask again — which is correct under any
number of workers and works unchanged through the API gateway.

Polling costs latency, and here that is visible: a call takes a couple of
seconds to connect rather than being instantaneous. The client polls faster
while a call is being set up than the chat does, because those few seconds are
the whole of the wait.

Honest limits
-------------
* **Two people per call.** WebRTC peer-to-peer is a connection between two
  browsers. Three or more needs either a full mesh (every peer encoding a
  separate stream for every other — it collapses past about four) or a media
  server to mix them. Neither belongs in Phase 2.

* **STUN only, no TURN.** The browsers discover their public addresses through
  Google's public STUN servers. When both peers sit behind a NAT that refuses
  to cooperate — symmetric NAT, which some mobile networks use — no direct path
  exists and the call cannot connect. The fix is a TURN relay, which is a paid
  service and is why this is stated rather than hidden: on the same Wi-Fi, or
  on most home connections, calls connect; on some mobile networks they will
  not, and the interface says so instead of spinning forever.

* **A call is offered to the group, and the first member to answer takes it.**
  There is no per-person dialling, because a room is a group here and
  membership is what governs access.

Routes
------
POST /calls                         – start a call in a room
GET  /calls/active?room_id=<id>     – the live call in a room, if any
POST /calls/<call_id>/answer        – accept a ringing call
POST /calls/<call_id>/signals       – send one signalling message
GET  /calls/<call_id>/signals       – signals from the other peer, since a cursor
POST /calls/<call_id>/end           – hang up
"""
import datetime
import uuid

from flask import Blueprint, jsonify, request

from app.auth import get_current_user
from app.models import (
    delete_call_signals,
    get_call_by_id,
    get_call_signals,
    get_calls,
    get_group_by_id,
    save_call,
    save_call_signal,
    update_call,
)

calls_bp = Blueprint("calls", __name__)

#: An SDP offer runs to a few kilobytes; an ICE candidate is a short line.
#: Generous enough for either, small enough that a bad client cannot fill the
#: store with one request.
MAX_PAYLOAD_LENGTH = 16000

#: A ringing call nobody answers stops being offered after this. Without it a
#: caller who closed their tab would leave a phone ringing forever.
RING_TIMEOUT_SECONDS = 60

#: An answered call is considered dead when neither peer has polled for this
#: long. Both browsers crashing (or being closed by a task manager) leaves no
#: "end" request behind, and without this the room keeps an active call for
#: ever: nobody can start a new one, because starting returns the stale one.
#: Comfortably longer than the client's poll interval, so an ordinary network
#: hiccup does not kill a live call.
ACTIVE_TIMEOUT_SECONDS = 45

#: A live call rewrites its heartbeat at most this often. Each peer polls about
#: once a second; writing on every poll would mean two database writes a second
#: per call, to record something only needed at 45-second resolution.
HEARTBEAT_INTERVAL_SECONDS = 10

#: The signalling messages a peer may send. Anything else is refused rather
#: than stored and forwarded blindly.
SIGNAL_KINDS = ("offer", "answer", "ice")

CALL_MODES = ("audio", "video")


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _iso(moment):
    return moment.isoformat()


def _group_id_for(room_id: str):
    """Rooms are groups, addressed ``group:<group_id>`` — the same rule as chat."""
    if not room_id or not room_id.startswith("group:"):
        return None
    return room_id.split("group:", 1)[1] or None


def _membership(room_id: str, username: str):
    """Return (group, error_response). Membership of the group is the access rule."""
    group_id = _group_id_for(room_id)
    group = get_group_by_id(group_id) if group_id else None
    if not group:
        return None, (jsonify({"error": "call room not found"}), 404)
    if username not in group.get("members", []):
        return None, (jsonify({"error": "join the group to call in it"}), 403)
    return group, None


def _parse(moment: str):
    try:
        parsed = datetime.datetime.fromisoformat(moment or "")
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


def _is_stale(call: dict) -> bool:
    """A call both ends have walked away from.

    Ringing: nobody answered, and the caller may well have closed the tab.
    Active: neither peer has polled for signals in a while, which is what
    happens when both browsers are closed without hanging up.
    """
    status = call.get("status")

    if status == "ringing":
        started = _parse(call.get("created_at", ""))
        if started is None:
            return True
        return (_now() - started).total_seconds() > RING_TIMEOUT_SECONDS

    if status == "active":
        # Falls back to when it was answered, for calls recorded before the
        # heartbeat existed.
        seen = _parse(call.get("last_seen_at") or call.get("answered_at") or "")
        if seen is None:
            return True
        return (_now() - seen).total_seconds() > ACTIVE_TIMEOUT_SECONDS

    return False


def _beat(call: dict) -> None:
    """Record that a participant is still here, at most once every few seconds."""
    last = _parse(call.get("last_seen_at", ""))
    now = _now()
    if last is not None and (now - last).total_seconds() < HEARTBEAT_INTERVAL_SECONDS:
        return
    call["last_seen_at"] = _iso(now)
    update_call(call)


def _live_call_in_room(room_id: str):
    """The ringing or active call in a room, if there is one.

    Newest first, so a room that somehow holds two only ever offers the
    current one.
    """
    for call in sorted(get_calls(), key=lambda c: c.get("created_at", ""), reverse=True):
        if call.get("room_id") != room_id:
            continue
        if call.get("status") in ("ringing", "active") and not _is_stale(call):
            return call
    return None


def _public(call: dict) -> dict:
    """The call as a caller or callee needs to see it."""
    return {
        "id": call.get("id"),
        "room_id": call.get("room_id"),
        "mode": call.get("mode"),
        "status": call.get("status"),
        "caller": call.get("caller"),
        "callee": call.get("callee"),
        "created_at": call.get("created_at"),
        "answered_at": call.get("answered_at"),
        "last_seen_at": call.get("last_seen_at"),
        "ended_at": call.get("ended_at"),
        "ended_by": call.get("ended_by"),
        "end_reason": call.get("end_reason"),
    }


def _participant(call: dict, username: str) -> bool:
    return username in (call.get("caller"), call.get("callee"))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@calls_bp.route("/calls", methods=["POST"])
def start_call():
    """Start ringing a room.

    Expected JSON body: ``{"room_id": "group:<id>", "mode": "video"}``
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    data = request.get_json(silent=True) or {}
    room_id = str(data.get("room_id", "")).strip()
    mode = str(data.get("mode", "video")).strip().lower()

    if mode not in CALL_MODES:
        return jsonify({"error": "mode must be audio or video"}), 400

    group, error = _membership(room_id, username)
    if error:
        return error

    # One call at a time per room. Returning the existing one rather than an
    # error means two people pressing "call" at the same moment end up in the
    # same call instead of two half-calls that can never meet.
    existing = _live_call_in_room(room_id)
    if existing:
        return jsonify({"message": "call already in progress", "call": _public(existing)}), 200

    call = {
        "id": str(uuid.uuid4()),
        "room_id": room_id,
        "group_id": group.get("id"),
        "mode": mode,
        "status": "ringing",
        "caller": username,
        "callee": None,
        "created_at": _iso(_now()),
        "answered_at": None,
        "ended_at": None,
        "ended_by": None,
        "end_reason": None,
    }
    save_call(call)
    return jsonify({"message": "ringing", "call": _public(call)}), 201


@calls_bp.route("/calls/active", methods=["GET"])
def active_call():
    """The live call in a room, if any.

    This is what an idle client polls to find out it is being called.
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    room_id = request.args.get("room_id", "").strip()
    _, error = _membership(room_id, username)
    if error:
        return error

    call = _live_call_in_room(room_id)
    return jsonify({"call": _public(call) if call else None}), 200


@calls_bp.route("/calls/<call_id>/answer", methods=["POST"])
def answer_call(call_id: str):
    """Accept a ringing call. The first member to answer takes it."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    call = get_call_by_id(call_id)
    if not call:
        return jsonify({"error": "call not found"}), 404

    _, error = _membership(call.get("room_id", ""), username)
    if error:
        return error

    if username == call.get("caller"):
        return jsonify({"error": "you are the caller"}), 400
    if call.get("status") == "ended":
        return jsonify({"error": "that call has ended"}), 409
    if call.get("status") == "active":
        # Someone else got there first. A distinct status code so the
        # interface can say so rather than showing a generic failure.
        if call.get("callee") != username:
            return jsonify({"error": "someone else answered"}), 409
        return jsonify({"message": "already answered", "call": _public(call)}), 200

    call["status"] = "active"
    call["callee"] = username
    call["answered_at"] = _iso(_now())
    call["last_seen_at"] = _iso(_now())
    update_call(call)
    return jsonify({"message": "answered", "call": _public(call)}), 200


@calls_bp.route("/calls/<call_id>/signals", methods=["POST"])
def send_signal(call_id: str):
    """Pass one signalling message to the other peer.

    Expected JSON body: ``{"kind": "offer"|"answer"|"ice", "payload": {...}}``

    The payload is the browser's own SDP or ICE candidate. It is stored and
    handed over untouched — this server does not parse it, and has no reason
    to.
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    call = get_call_by_id(call_id)
    if not call:
        return jsonify({"error": "call not found"}), 404

    _, error = _membership(call.get("room_id", ""), username)
    if error:
        return error

    # Before anyone answers, only the caller may signal; afterwards, the two
    # participants. Otherwise a third member of the group could inject ICE
    # candidates into someone else's call.
    if call.get("status") == "ringing":
        if username != call.get("caller"):
            return jsonify({"error": "answer the call first"}), 403
    elif not _participant(call, username):
        return jsonify({"error": "you are not in this call"}), 403

    if call.get("status") == "ended":
        return jsonify({"error": "that call has ended"}), 409

    data = request.get_json(silent=True) or {}
    kind = str(data.get("kind", "")).strip().lower()
    payload = data.get("payload")

    if kind not in SIGNAL_KINDS:
        return jsonify({"error": f"kind must be one of {', '.join(SIGNAL_KINDS)}"}), 400
    if payload is None:
        return jsonify({"error": "payload is required"}), 400
    if len(str(payload)) > MAX_PAYLOAD_LENGTH:
        return jsonify({"error": "payload is too large"}), 400

    signal = {
        "id": str(uuid.uuid4()),
        "call_id": call_id,
        "sender": username,
        "kind": kind,
        "payload": payload,
        "sent_at": _iso(_now()),
    }
    save_call_signal(signal)
    return jsonify({"message": "sent", "signal": signal}), 201


@calls_bp.route("/calls/<call_id>/signals", methods=["GET"])
def read_signals(call_id: str):
    """Signals from the *other* peer, newer than a cursor.

    Your own are filtered out: a peer has no use for the offer it just sent,
    and handing it back would make the client filter every poll.

    ``?since=<cursor>`` takes the ``cursor`` from the previous reply.
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    call = get_call_by_id(call_id)
    if not call:
        return jsonify({"error": "call not found"}), 404

    _, error = _membership(call.get("room_id", ""), username)
    if error:
        return error

    if call.get("status") == "active" and _participant(call, username):
        _beat(call)

    since = _normalise_cursor(request.args.get("since", ""))
    signals = [
        s for s in get_call_signals(call_id)
        if s.get("sender") != username and (not since or s.get("sent_at", "") > since)
    ]
    signals.sort(key=lambda s: s.get("sent_at", ""))

    cursor = signals[-1]["sent_at"] if signals else since
    return jsonify({
        "signals": signals,
        "cursor": cursor,
        "call": _public(call),
    }), 200


@calls_bp.route("/calls/<call_id>/end", methods=["POST"])
def end_call(call_id: str):
    """Hang up.

    Either participant may end it, and so may the caller of a call nobody
    answered. Ending discards the signalling traffic, which is worthless once
    the peers have connected and is the largest thing this app writes.
    """
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    call = get_call_by_id(call_id)
    if not call:
        return jsonify({"error": "call not found"}), 404

    _, error = _membership(call.get("room_id", ""), username)
    if error:
        return error

    if call.get("status") != "ended" and not _participant(call, username):
        return jsonify({"error": "you are not in this call"}), 403

    if call.get("status") != "ended":
        data = request.get_json(silent=True) or {}
        call["status"] = "ended"
        call["ended_at"] = _iso(_now())
        call["ended_by"] = username
        call["end_reason"] = str(data.get("reason", "hung_up")).strip()[:40] or "hung_up"
        update_call(call)
        delete_call_signals(call_id)

    return jsonify({"message": "ended", "call": _public(call)}), 200


def _normalise_cursor(raw: str) -> str:
    """Undo the query-string mangling of a ``+`` in a timestamp.

    The same fix app/chat.py carries: an ISO timestamp ends "+00:00", and a
    bare plus in a query string decodes to a space. Left alone, every poll
    would compare against a cursor that never matches and replay the whole
    call's signalling forever.
    """
    cursor = (raw or "").strip()
    if cursor.endswith(" 00:00"):
        cursor = cursor[: -len(" 00:00")] + "+00:00"
    return cursor
