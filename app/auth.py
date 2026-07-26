"""
app/auth.py

User registration, login, and JWT handling.

Routes
------
POST /register  – create a new user account
POST /login     – authenticate and return a JWT token
"""
import uuid
import datetime

import jwt
from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from app.models import (
    get_user_by_username,
    save_user,
    update_user,
    get_user_by_reset_token,
    get_user_by_google_id,
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


def _generate_password_reset_token() -> str:
    return str(uuid.uuid4())


def _password_reset_expiry() -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).isoformat()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

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
        "role": "user",
    }
    save_user(user)
    return jsonify({"message": "user registered successfully", "username": username}), 201


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
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    token = create_token(username, current_app.config["SECRET_KEY"])
    return jsonify({"token": token}), 200


@auth_bp.route("/auth/google", methods=["POST"])
def google_auth():
    """Authenticate or register a user via Google ID.

    Expected JSON body:
        { "google_id": "12345", "username": "alice", "preferences": ["beach"] }

    If the Google account already exists, returns a token for that user.
    Otherwise, creates a new user with `role: user`.
    """
    data = request.get_json(silent=True) or {}
    google_id = data.get("google_id", "").strip()
    username = data.get("username", "").strip()
    preferences = data.get("preferences", [])

    if not google_id or not username:
        return jsonify({"error": "google_id and username are required"}), 400

    user = get_user_by_google_id(google_id)
    if not user:
        if get_user_by_username(username):
            return jsonify({"error": "username already exists"}), 409

        user = {
            "id": str(uuid.uuid4()),
            "username": username,
            "password_hash": generate_password_hash(str(uuid.uuid4())),
            "preferences": preferences,
            "role": "user",
            "google_id": google_id,
        }
        save_user(user)

    token = create_token(user["username"], current_app.config["SECRET_KEY"])
    return jsonify({"token": token, "username": user["username"]}), 200


@auth_bp.route("/forgot-password", methods=["POST"])
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

    return jsonify({
        "message": "password reset requested",
        "reset_token": reset_token,
        "expires_at": expires_at,
        "note": "In production, send this token by email."
    }), 200


@auth_bp.route("/reset-password", methods=["POST"])
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
