"""
app/auth.py

User registration, login, and JWT handling.

Routes
------
POST /register  – create a new user account
POST /login     – authenticate and return a JWT token
"""
import os
import re
import uuid
import datetime
import json
import urllib.error
import urllib.parse
import urllib.request

import jwt
import requests
from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from app import limiter
from app.interests import PREDEFINED_INTERESTS, normalize_interests
from app.models import (
    get_all_users,
    get_user_by_email,
    get_user_by_google_id,
    get_user_by_phone,
    get_user_by_reset_token,
    get_user_by_username,
    normalize_phone,
    save_user,
    update_user,
    get_all_itineraries,
    get_all_places,
    get_all_hotels,
    get_all_activities,
    get_all_groups,
    get_all_media,
    get_all_place_requests,
)

auth_bp = Blueprint("auth", __name__)

#: Usernames key the user record in storage, so they are bounded here rather
#: than left to fail deeper down against the database's column width.
MAX_USERNAME_LENGTH = 64


# ---------------------------------------------------------------------------
# Helper – JWT utilities
# ---------------------------------------------------------------------------

def create_token(username: str, secret: str) -> str:
    """Return a signed JWT for *username* valid for 24 hours."""
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + datetime.timedelta(hours=24),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_token(token: str, secret: str) -> dict:
    """Decode and verify *token*. Raises jwt.PyJWTError on failure."""
    return jwt.decode(token, secret, algorithms=["HS256"])


def get_current_user(request_obj) -> str | None:
    """Extract and validate the JWT from the Authorization header.

    Returns the username (subject claim) or None if the token is missing /
    invalid. Also refreshes the caller's last-seen timestamp, which is what
    the "active today" figure on the platform counters is derived from.
    """
    auth_header = request_obj.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = decode_token(token, current_app.config["SECRET_KEY"])
    except jwt.PyJWTError:
        return None

    username = payload.get("sub")
    if username:
        touch_user_activity(username)
    return username


#: How stale a last-seen stamp may get before it is rewritten. Every
#: authenticated request passes through here, so writing each time would mean a
#: storage write per request; a few minutes' granularity is far more than
#: "active today" needs.
ACTIVITY_REFRESH_SECONDS = 300


def touch_user_activity(username: str) -> None:
    """Record that *username* was seen just now, at most every few minutes.

    Never raises: a failure to record presence must not break the request the
    user actually made.
    """
    try:
        user = get_user_by_username(username)
        if not user:
            return

        now = datetime.datetime.now(datetime.timezone.utc)
        previous = _parse_timestamp(user.get("last_seen_at"))
        if previous and (now - previous).total_seconds() < ACTIVITY_REFRESH_SECONDS:
            return

        user["last_seen_at"] = now.isoformat()
        update_user(user)
    except Exception:  # noqa: BLE001 - presence tracking is best-effort
        current_app.logger.debug("could not record activity for %s", username)


def _parse_timestamp(value) -> datetime.datetime | None:
    """Parse an ISO timestamp, tolerating older records without a timezone."""
    if not value:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


def _generate_password_reset_token() -> str:
    return str(uuid.uuid4())


def _password_reset_expiry() -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).isoformat()


def _verify_google_id_token(id_token: str) -> dict | None:
    """Verify a Google ID token through Google's tokeninfo endpoint.

    This keeps the capstone runnable without extra dependencies. Production
    deployments should prefer Google's Python auth library or JWKS verification.
    """
    query = urllib.parse.urlencode({"id_token": id_token})
    url = f"https://oauth2.googleapis.com/tokeninfo?{query}"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None

    expected_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if expected_client_id and payload.get("aud") != expected_client_id:
        return None
    if payload.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        return None
    if not payload.get("sub"):
        return None
    return payload


def _bootstrap_role_for(username: str) -> str:
    """Return the initial role for a newly registered account.

    Every self-registered account is a regular "user" by default. To grant
    admin on registration (e.g. to bootstrap your own super-admin account),
    set ADMIN_USERNAMES to a comma-separated list of usernames on Render.
    From then on, admins can promote other accounts via the Admin dashboard
    (PATCH /admin/users/<username>/role) -- there is no automatic
    "first user becomes admin" behaviour, since that is unsafe on hosts
    with non-persistent storage where the user list can reset to empty.
    """
    configured_admins = {
        item.strip().lower()
        for item in os.environ.get("ADMIN_USERNAMES", "").split(",")
        if item.strip()
    }
    if username.lower() in configured_admins:
        return "admin"
    return "user"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@auth_bp.route("/interests", methods=["GET"])
def interests():
    """Return the controlled interest list used during onboarding."""
    return jsonify({"interests": PREDEFINED_INTERESTS}), 200


def _make_unique_username(base_username: str) -> str:
    """Return a username that is not already taken."""
    candidate = base_username
    index = 2
    while get_user_by_username(candidate):
        candidate = f"{base_username}{index}"
        index += 1
    return candidate


def _normalize_username(name: str, email: str | None = None) -> str:
    """Convert a Google display name/email to a safe username."""
    base = (name or email or "google-user").strip().lower()
    if "@" in base:
        base = base.split("@", 1)[0]
    base = re.sub(r"[^a-z0-9._-]+", "-", base).strip("-._")
    return base or "google-user"


@auth_bp.route("/register", methods=["POST"])
@limiter.limit("10 per minute")
def register():
    """Register a new user.

    Expected JSON body:
        { "username": "alice", "password": "s3cr3t", "preferences": ["beach", "food"] }

    Returns 201 on success, 400 on validation errors, 409 if the username is
    already taken.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    phone = normalize_phone(data.get("phone", ""))
    preferences = normalize_interests(data.get("preferences", []))  # optional controlled interest tags

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    if len(username) > MAX_USERNAME_LENGTH:
        return jsonify({
            "error": f"username must be at most {MAX_USERNAME_LENGTH} characters"
        }), 400

    if not phone:
        return jsonify({"error": "phone number is required"}), 400

    if get_user_by_username(username):
        return jsonify({"error": "username already exists"}), 409

    if get_user_by_phone(phone):
        return jsonify({"error": "phone already registered"}), 409

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    user = {
        "id": str(uuid.uuid4()),
        "username": username,
        # Store a Werkzeug password hash – never store plain-text passwords.
        "password_hash": generate_password_hash(password),
        "preferences": preferences,
        "role": _bootstrap_role_for(username),
        "created_at": now,
        "last_seen_at": now,
    }
    if phone:
        user["phone"] = phone
    save_user(user)
    return jsonify({"message": "user registered successfully", "username": username}), 201


@auth_bp.route("/auth/google", methods=["POST"])
@auth_bp.route("/google-auth", methods=["POST"])
@limiter.limit("10 per minute")
def google_auth():
    """Authenticate or create a user from a Google ID token."""
    data = request.get_json(silent=True) or {}
    id_token = (
        data.get("id_token")
        or data.get("token")
        or data.get("credential")
        or ""
    ).strip()
    if not id_token:
        return jsonify({"error": "id_token is required"}), 400

    try:
        response = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=5,
        )
    except requests.RequestException:
        # Google itself was unreachable: a genuine upstream failure, and worth
        # retrying.
        return jsonify({"error": "google authentication is unavailable"}), 502

    if response.status_code >= 400:
        # Google rejected the token. That is the caller's problem, not an
        # upstream outage, so it must not be reported as 502 -- the client
        # cannot tell "sign in again" from "try again later" otherwise.
        return jsonify({"error": "invalid google token"}), 401

    try:
        profile = response.json()
    except ValueError:
        return jsonify({"error": "google authentication is unavailable"}), 502

    email = (profile.get("email") or "").strip().lower()
    google_id = str(profile.get("sub") or "").strip()
    if not email or not google_id:
        return jsonify({"error": "google token is missing profile information"}), 401

    if not profile.get("email_verified"):
        return jsonify({"error": "google email is not verified"}), 401

    expected_client_id = current_app.config.get("GOOGLE_CLIENT_ID") or os.environ.get(
        "GOOGLE_CLIENT_ID"
    )
    if expected_client_id and profile.get("aud") != expected_client_id:
        return jsonify({"error": "invalid google client id"}), 401

    existing_user = get_user_by_google_id(google_id) or get_user_by_email(email)
    if existing_user:
        username = existing_user.get("username")
        token = create_token(username, current_app.config["SECRET_KEY"])
        return jsonify(
            {
                "token": token,
                "user": {
                    "username": username,
                    "email": existing_user.get("email"),
                    "auth_provider": existing_user.get("auth_provider", "google"),
                },
                "is_new_user": False,
            }
        ), 200

    requested_username = (data.get("username") or "").strip()
    preferred_username = _normalize_username(profile.get("name") or email, email)
    username = requested_username or preferred_username
    if get_user_by_username(username):
        username = _make_unique_username(username)
    else:
        username = _make_unique_username(username)

    user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "email": email,
        "auth_provider": "google",
        "google_id": google_id,
        "password_hash": None,
        "preferences": data.get("preferences", []),
        "name": (profile.get("name") or "").strip(),
    }
    save_user(user)

    token = create_token(username, current_app.config["SECRET_KEY"])
    return jsonify(
        {
            "token": token,
            "user": {
                "username": username,
                "email": email,
                "auth_provider": "google",
            },
            "is_new_user": True,
        }
    ), 200


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    """Authenticate a user and return a JWT.

    Expected JSON body:
        { "username": "alice", "password": "s3cr3t" }

    Returns 200 with a token on success, 400/401 on failure.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    phone = normalize_phone(data.get("phone", ""))
    password = data.get("password", "")

    if not password or (not username and not phone):
        return jsonify({"error": "username or phone and password are required"}), 400

    user = None
    if phone:
        user = get_user_by_phone(phone)
    if user is None and username:
        user = get_user_by_username(username)

    if (
        not user
        or user.get("auth_provider") == "google"
        or not user.get("password_hash")
        or not check_password_hash(user["password_hash"], password)
    ):
        return jsonify({"error": "invalid credentials"}), 401

    username = user.get("username")
    token = create_token(username, current_app.config["SECRET_KEY"])
    return jsonify({"token": token}), 200


@auth_bp.route("/forgot-password", methods=["POST"])
@limiter.limit("5 per minute")
def forgot_password():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()

    if not username:
        return jsonify({"error": "username is required"}), 400

    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404

    reset_token = _generate_password_reset_token()
    expires_at = _password_reset_expiry()
    user["password_reset_token"] = reset_token
    user["password_reset_expires_at"] = expires_at
    update_user(user)

    response = {
        "message": "password reset requested",
        "expires_at": expires_at,
    }
    if current_app.debug:
        # No email service is configured for this capstone, so expose the
        # token directly in debug mode to keep local dev/grading usable.
        # It must never be returned outside debug mode.
        response["reset_token"] = reset_token
        response["note"] = "Debug mode only: token included since no email service is configured."
    else:
        current_app.logger.info(
            "Password reset requested for %s; token=%s", username, reset_token
        )

    return jsonify(response), 200


@auth_bp.route("/reset-password", methods=["POST"])
@limiter.limit("5 per minute")
def reset_password():
    data = request.get_json(silent=True) or {}
    reset_token = data.get("token", "").strip()
    new_password = data.get("new_password", "")

    if not reset_token or not new_password:
        return jsonify({"error": "token and new_password are required"}), 400

    user = get_user_by_reset_token(reset_token)
    if not user:
        return jsonify({"error": "invalid reset token"}), 400

    expires_at = user.get("password_reset_expires_at")
    if not expires_at:
        return jsonify({"error": "reset token expired or invalid"}), 400

    try:
        expires = datetime.datetime.fromisoformat(expires_at)
    except ValueError:
        return jsonify({"error": "invalid reset token metadata"}), 400

    if datetime.datetime.now(datetime.timezone.utc) > expires:
        return jsonify({"error": "reset token has expired"}), 400

    user["password_hash"] = generate_password_hash(new_password)
    user.pop("password_reset_token", None)
    user.pop("password_reset_expires_at", None)
    update_user(user)

    return jsonify({"message": "password reset successful"}), 200


@auth_bp.route("/profile", methods=["GET", "PATCH"])
def profile():
    """Read or update the authenticated user's profile/preferences."""
    username = get_current_user(request)
    if not username:
        return jsonify({"error": "authentication required"}), 401

    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404

    if request.method == "GET":
        return jsonify({
            "id": user.get("id"),
            "username": user.get("username"),
            "preferences": user.get("preferences", []),
            "role": user.get("role", "user"),
            "google_linked": bool(user.get("google_id")),
        }), 200

    data = request.get_json(silent=True) or {}
    if "preferences" in data:
        preferences = data.get("preferences")
        if not isinstance(preferences, list):
            return jsonify({"error": "preferences must be a list"}), 400
        user["preferences"] = normalize_interests(preferences)

    update_user(user)
    return jsonify({
        "message": "profile updated",
        "profile": {
            "id": user.get("id"),
            "username": user.get("username"),
            "preferences": user.get("preferences", []),
            "role": user.get("role", "user"),
            "google_linked": bool(user.get("google_id")),
        },
    }), 200


def _require_admin_user(request_obj):
    username = get_current_user(request_obj)
    if not username:
        return None, (jsonify({"error": "authentication required"}), 401)
    user = get_user_by_username(username)
    if not user:
        return None, (jsonify({"error": "user not found"}), 404)
    if user.get("role") != "admin":
        return None, (jsonify({"error": "admin access required"}), 403)
    return user, None


@auth_bp.route("/admin/users", methods=["GET"])
def list_users_admin():
    """List users for administrators."""
    admin_user, error = _require_admin_user(request)
    if error:
        return error

    users = []
    for user in get_all_users():
        users.append({
            "id": user.get("id"),
            "username": user.get("username"),
            "preferences": user.get("preferences", []),
            "role": user.get("role", "user"),
            "google_linked": bool(user.get("google_id")),
        })
    return jsonify(users), 200


@auth_bp.route("/admin/users/<username>/role", methods=["PATCH"])
def update_user_role_admin(username: str):
    """Promote or demote a user role."""
    admin_user, error = _require_admin_user(request)
    if error:
        return error

    data = request.get_json(silent=True) or {}
    role = data.get("role", "").strip().lower()
    if role not in {"user", "admin"}:
        return jsonify({"error": "role must be user or admin"}), 400

    user = get_user_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    if user.get("username") == admin_user.get("username") and role != "admin":
        return jsonify({"error": "administrators cannot demote themselves"}), 400

    user["role"] = role
    update_user(user)
    return jsonify({
        "message": "user role updated",
        "user": {
            "id": user.get("id"),
            "username": user.get("username"),
            "role": user.get("role", "user"),
        },
    }), 200


@auth_bp.route("/stats", methods=["GET"])
def platform_stats():
    """Public counters for the landing page: community size and today's activity.

    Deliberately aggregate-only -- no usernames, no per-user detail -- so it is
    safe to show to signed-out visitors.
    """
    users = get_all_users()
    itineraries = get_all_itineraries()

    now = datetime.datetime.now(datetime.timezone.utc)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    last_7_days = now - datetime.timedelta(days=7)

    active_today = 0
    joined_this_week = 0
    for user in users:
        seen = _parse_timestamp(user.get("last_seen_at"))
        if seen and seen >= start_of_today:
            active_today += 1
        created = _parse_timestamp(user.get("created_at"))
        if created and created >= last_7_days:
            joined_this_week += 1

    return jsonify({
        "total_travellers": len(users),
        "active_today": active_today,
        "joined_this_week": joined_this_week,
        "total_trips": len(itineraries),
        "public_trips": sum(
            1 for item in itineraries if item.get("visibility") == "public"
        ),
        "total_places": len(get_all_places()),
        "total_hotels": len(get_all_hotels()),
        "total_activities": len(get_all_activities()),
        "generated_at": now.isoformat(),
    }), 200


@auth_bp.route("/admin/stats", methods=["GET"])
def admin_stats():
    """Platform-wide counts for the admin overview dashboard."""
    admin_user, error = _require_admin_user(request)
    if error:
        return error

    users = get_all_users()
    itineraries = get_all_itineraries()
    place_requests = get_all_place_requests()
    public_itineraries = [item for item in itineraries if item.get("visibility") == "public"]
    pending_requests = [item for item in place_requests if item.get("status") == "pending"]

    now = datetime.datetime.now(datetime.timezone.utc)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    active_today = sum(
        1
        for user in users
        if (seen := _parse_timestamp(user.get("last_seen_at"))) and seen >= start_of_today
    )

    return jsonify({
        "total_users": len(users),
        "active_today": active_today,
        "total_admins": sum(1 for user in users if user.get("role") == "admin"),
        "total_itineraries": len(itineraries),
        "public_itineraries": len(public_itineraries),
        "total_places": len(get_all_places()),
        "total_hotels": len(get_all_hotels()),
        "total_activities": len(get_all_activities()),
        "total_groups": len(get_all_groups()),
        "total_media": len(get_all_media()),
        "pending_place_requests": len(pending_requests),
        "total_place_requests": len(place_requests),
    }), 200
