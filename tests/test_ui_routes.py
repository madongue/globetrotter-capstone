import json
from app import create_app


def test_home_ui_loads():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        response = client.get("/")
        assert response.status_code == 200
        assert b"GlobeTrotter" in response.data


def test_login_ui_loads():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        response = client.get("/login-ui")
        assert response.status_code == 200
        assert b"Sign in" in response.data


def test_register_ui_loads():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        response = client.get("/register-ui")
        assert response.status_code == 200
        assert b"Create account" in response.data


def test_dashboard_ui_loads():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        response = client.get("/dashboard")
        assert response.status_code == 200
        assert b"Welcome back" in response.data
