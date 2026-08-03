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

import jwt
import requests
from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from app.models import (
    get_user_by_email,
    get_user_by_google_id,
    get_user_by_username,
    save_user,
)

auth_bp = Blueprint("auth", __name__)


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
    invalid.
    """
    auth_header = request_obj.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = decode_token(token, current_app.config["SECRET_KEY"])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

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
    preferences = data.get("preferences", [])  # optional list of interest tags

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    if get_user_by_username(username):
        return jsonify({"error": "username already exists"}), 409

    user = {
        "id": str(uuid.uuid4()),
        "username": username,
        # Store a Werkzeug password hash – never store plain-text passwords.
        "password_hash": generate_password_hash(password),
        "preferences": preferences,
    }
    save_user(user)
    return jsonify({"message": "user registered successfully", "username": username}), 201


@auth_bp.route("/auth/google", methods=["POST"])
@auth_bp.route("/google-auth", methods=["POST"])
def google_auth():
    """Authenticate or create a user from a Google ID token."""
    data = request.get_json(silent=True) or {}
    id_token = (data.get("id_token") or data.get("token") or "").strip()
    if not id_token:
        return jsonify({"error": "id_token is required"}), 400

    try:
        response = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=5,
        )
        response.raise_for_status()
        profile = response.json()
    except requests.RequestException:
        return jsonify({"error": "google authentication failed"}), 502

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
def login():
    """Authenticate a user and return a JWT.

    Expected JSON body:
        { "username": "alice", "password": "s3cr3t" }

    Returns 200 with a token on success, 400/401 on failure.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    user = get_user_by_username(username)
    if (
        not user
        or user.get("auth_provider") == "google"
        or not user.get("password_hash")
        or not check_password_hash(user["password_hash"], password)
    ):
        return jsonify({"error": "invalid credentials"}), 401

    token = create_token(username, current_app.config["SECRET_KEY"])
    return jsonify({"token": token}), 200
