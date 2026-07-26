from flask import Blueprint, render_template

ui_bp = Blueprint("ui", __name__, template_folder="templates")


@ui_bp.route("/")
def home():
    return render_template("index.html")


@ui_bp.route("/login-ui")
def login_page():
    return render_template("login.html")


@ui_bp.route("/register-ui")
def register_page():
    return render_template("register.html")


@ui_bp.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")
