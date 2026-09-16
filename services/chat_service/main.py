"""The chat service.

The newest of the Phase 2 services, and the clearest example of why the split
is drawn where it is: chat is a bounded context of its own. It has one
collection, one access rule, and a traffic shape unlike anything else in the
application — many small polls rather than a few large reads — so it is the
service that would be scaled first and independently.

It shares the group membership rule with the itinerary service, because a
chat room *is* a community group. In the monolith that is one function call.
Split apart it becomes the boundary worth talking about: either both services
read the same group store, or the chat service asks the itinerary service who
is a member and has to survive that call failing. The current code takes the
first route, which is honest about where Phase 2 actually stands — the
services are separate processes, not yet separate databases.
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from flask import Flask, jsonify

from app.chat import chat_bp


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "globetrotter-secret-change-in-prod")
    app.register_blueprint(chat_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "chat-service"}), 200

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8005))
    app.run(host="0.0.0.0", port=port, debug=False)
