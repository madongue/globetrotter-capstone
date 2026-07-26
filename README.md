# GlobeTrotter – Travel Assistant

GlobeTrotter is a **monolithic Flask application** that serves as the starting point for a semester-long capstone project.  
Students build the monolith first, then refactor it into microservices, and finally deploy it to the cloud with resilience patterns using Docker, Kubernetes, and cloud-native tooling.

## Product Vision
GlobeTrotter is designed to help travellers discover destinations, build shared trips, and collaborate on itineraries. It combines destination search, personalised recommendations, trip planning workflows, Google-style authentication, shared trip boards, and local AI-style itinerary draft generation.

### Inspiration and Benchmarking
This project is informed by existing travel planning applications and open-source trip planners such as:
- `mywanderlust` — a shared travel board with multiple trips, trip profiles, and collaborative planning.
- `Full-Stack AI Trip Planner` — a modern web app with Google login, place autocomplete, responsive UI, and AI-generated trips.

These examples reinforce the product direction: destination discovery, Google login, shared trips, preference-based recommendations, and extensible itinerary management.

---

## Project Structure

```
.
├── app/
│   ├── __init__.py         # Flask app factory
│   ├── models.py           # Data models and JSON file I/O
│   ├── auth.py             # Registration, login, JWT handling
│   ├── destinations.py     # Destination search endpoint
│   ├── recommendations.py  # Personalised recommendations endpoint
│   ├── itineraries.py      # Itinerary CRUD, payments, sharing, and map metadata
│   ├── resources.py        # Admin resource management
│   └── main.py             # App entry point
├── data/
│   ├── destinations.json   # Static destination catalogue (seed data)
│   ├── users.json          # Created at runtime
│   └── itineraries.json    # Created at runtime
├── tests/                  # Placeholder for future tests
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

---

## REST API

| Method | Endpoint            | Auth required | Description                              |
|--------|---------------------|---------------|------------------------------------------|
| POST   | `/register`         | No            | Register a new user                      |
| POST   | `/login`            | No            | Authenticate and receive a JWT token     |
| POST   | `/auth/google`      | No            | Authenticate or register using Google ID or verified Google ID token |
| GET/PATCH | `/profile`        | Yes (JWT)     | Read or update user profile preferences  |
| GET    | `/admin/users`      | Yes (JWT / admin) | List users for role management |
| PATCH  | `/admin/users/{username}/role` | Yes (JWT / admin) | Promote or demote a user |
| POST   | `/forgot-password`  | No            | Request a password reset token           |
| POST   | `/reset-password`   | No            | Reset password using a reset token       |
| GET    | `/destinations`     | No            | Search the destination catalogue         |
| GET    | `/autocomplete`     | No            | Search local destination/resource suggestions |
| GET    | `/recommendations`  | Yes (JWT)     | Get personalised recommendations         |
| POST   | `/itineraries`      | Yes (JWT)     | Create a new itinerary                   |
| GET    | `/itineraries/suggestions` | Yes (JWT) | Get location/budget-based suggestions   |
| PUT    | `/itineraries/{itinerary_id}` | Yes (JWT) | Update an existing itinerary        |
| POST   | `/itineraries/{itinerary_id}/share` | Yes (JWT) | Share an itinerary with another user |
| POST   | `/itineraries/{itinerary_id}/join`  | Yes (JWT) | Join an existing itinerary, pay a share, and receive a receipt |
| POST   | `/itineraries/{itinerary_id}/pay`   | Yes (JWT) | Record a mobile payment, issue a receipt, and track commissions |
| GET    | `/itineraries/{itinerary_id}/map`   | Yes (JWT) | Get map metadata for an itinerary     |
| GET/PATCH/POST | `/itineraries/{itinerary_id}/progress` | Yes (JWT) | Read or update stage progress and current location |
| POST   | `/itineraries/{itinerary_id}/feedback` | Yes (JWT) | Record trip feedback for recommendations |
| POST   | `/itineraries/generate` | Yes (JWT) | Generate a draft itinerary from local data |
| GET    | `/itineraries/{itinerary_id}/budget` | Yes (JWT) | Compare planned, paid, remaining, commission, and net totals |
| GET    | `/itineraries/{itinerary_id}/audit` | Yes (JWT) | View itinerary audit history |
| POST   | `/itineraries/{itinerary_id}/invite` | Yes (JWT / owner) | Create a limited-use invite link |
| POST   | `/invites/{token}/join` | Yes (JWT) | Join a trip through an invite token |
| GET    | `/itineraries/{itinerary_id}/calendar.ics` | Yes (JWT) | Export an itinerary calendar file |
| GET    | `/itineraries/{itinerary_id}/export.pdf` | Yes (JWT) | Export an itinerary PDF |
| POST/PATCH | `/itineraries/{itinerary_id}/stages/{stage_id}/checklist` | Yes (JWT / editor) | Add or update checklist items |
| Various | `/trips/*` | Yes (JWT) | Compatibility aliases for itinerary endpoints |
| GET    | `/notifications` | Yes (JWT) | List user notifications |
| POST   | `/notifications/{notification_id}/read` | Yes (JWT) | Mark one notification as read |
| GET    | `/health` / `/api/health` | No | Liveness/readiness check |
| GET    | `/metrics` / `/api/metrics` | No | In-process request metrics |
| POST   | `/groups`          | Yes (JWT)     | Create a community group             |
| GET    | `/groups`          | Yes (JWT)     | List all community groups             |
| POST   | `/groups/{group_id}/join` | Yes (JWT) | Join a community group         |
| GET    | `/media`           | Yes (JWT)     | List shared media posts and group media |
| POST   | `/media`           | Yes (JWT)     | Share a photo or video with the community |
| POST   | `/media/upload`    | Yes (JWT)     | Upload a media file and create a post |
| GET    | `/uploads/{filename}` | No          | Serve uploaded media files |
| POST   | `/media/{media_id}/comment` | Yes (JWT) | Comment on a media post   |
| POST   | `/media/{media_id}/like` | Yes (JWT) | Like a shared media post           |
| POST   | `/media/{media_id}/share` | Yes (JWT) | Share a media post with another user |
| GET    | `/groups/{group_id}/discussions` | Yes (JWT) | List discussions in a community group |
| POST   | `/groups/{group_id}/discussions` | Yes (JWT) | Create a discussion thread in a community group |
| POST   | `/groups/{group_id}/discussions/{discussion_id}/reply` | Yes (JWT) | Reply to a group discussion thread |
| GET    | `/itineraries`      | Yes (JWT)     | List all itineraries available to the user |
| POST   | `/resources/hotels` | Yes (JWT / admin) | Add a hotel resource                 |
| DELETE | `/resources/hotels/{hotel_id}` | Yes (JWT / admin) | Remove a hotel resource |
| GET/POST | `/resources/hotels/{hotel_id}/reviews` | Optional/Yes | List or create hotel reviews |
| POST   | `/resources/activities` | Yes (JWT / admin) | Add an activity resource         |
| DELETE | `/resources/activities/{activity_id}` | Yes (JWT / admin) | Remove an activity resource |
| GET/POST | `/resources/activities/{activity_id}/reviews` | Optional/Yes | List or create activity reviews |
| POST   | `/resources/places` | Yes (JWT / admin) | Add a place resource                 |
| DELETE | `/resources/places/{place_id}` | Yes (JWT / admin) | Remove a place resource |
| GET/POST | `/resources/places/{place_id}/reviews` | Optional/Yes | List or create place reviews |

Protected routes expect the header:  
`Authorization: Bearer <your-token>`

### Example requests

```bash
# Register
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "s3cr3t", "preferences": ["beach", "food"]}'

# Login
curl -X POST http://localhost:5000/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "s3cr3t"}'
# Save the returned token: TOKEN=<value from .token field>

# Search destinations
curl "http://localhost:5000/destinations?tag=beach&max_cost=100"

# Personalised recommendations
curl http://localhost:5000/recommendations \
  -H "Authorization: Bearer $TOKEN"

# Authenticate with Google
curl -X POST http://localhost:5000/auth/google \
  -H "Content-Type: application/json" \
  -d '{"google_id": "google-123", "username": "alice", "preferences": ["beach", "food"]}'

# Request password reset
curl -X POST http://localhost:5000/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"username": "alice"}'

# Reset password
curl -X POST http://localhost:5000/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "<reset-token>", "new_password": "newpass123"}'

# Create an itinerary
curl -X POST http://localhost:5000/itineraries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title": "Beach Escape", "location": "Bali", "hotel": {"name": "Seaside Hotel", "cost_per_night": 120}, "activities": [{"name": "Surf Lesson", "cost": 50}], "places_to_visit": [{"name": "Uluwatu", "cost": 0}], "start_date": "2025-07-01", "end_date": "2025-07-14"}'

# List itineraries
curl http://localhost:5000/itineraries \
  -H "Authorization: Bearer $TOKEN"

# Get itinerary suggestions
curl "http://localhost:5000/itineraries/suggestions?location=Bali&budget=300" \
  -H "Authorization: Bearer $TOKEN"

# Share an itinerary
curl -X POST http://localhost:5000/itineraries/<itinerary_id>/share \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"username": "bob"}'

# Get itinerary map metadata
curl http://localhost:5000/itineraries/<itinerary_id>/map \
  -H "Authorization: Bearer $TOKEN"

# Record a mobile payment
curl -X POST http://localhost:5000/itineraries/<itinerary_id>/pay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 200, "payment_method": "mobile", "target_type": "total"}'

# Create a group discussion
curl -X POST http://localhost:5000/groups/<group_id>/discussions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title": "Best Bali beaches", "message": "Share your favorite beach clubs and sunset spots."}'

# Reply to a group discussion
curl -X POST http://localhost:5000/groups/<group_id>/discussions/<discussion_id>/reply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "I loved Uluwatu and Sanur for a relaxed vibe."}'

# Add a hotel resource as admin
curl -X POST http://localhost:5000/resources/hotels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name": "Ocean View", "location": "Bali", "cost_per_night": 120}'

# Delete a hotel resource as admin
curl -X DELETE http://localhost:5000/resources/hotels/<hotel_id> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Running Locally

### Prerequisites
- Python 3.9+
- pip

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the server
python app/main.py
```

The API will be available at `http://localhost:5000`.

---

## Running with Docker

```bash
# Build and start
docker-compose up --build

# Stop
docker-compose down
```

The `data/` directory is mounted into the container, so JSON files persist between runs.

---

## Data Storage

All data is persisted in plain JSON files inside the `data/` directory:

| File                    | Purpose                              |
|-------------------------|--------------------------------------|
| `data/destinations.json`| Static catalogue of travel destinations (seed data) |
| `data/users.json`       | Registered users (created at runtime) |
| `data/itineraries.json` | User itineraries (created at runtime) |
| `data/hotels.json`      | Hotel resources created by administrators |
| `data/activities.json`  | Activity resources created by administrators |
| `data/places.json`      | Place resources created by administrators |
| `data/groups.json`      | Community groups and membership data |
| `data/media.json`       | Shared media posts, comments, likes, and shares |
| `data/uploads/`         | Uploaded media files |
| `data/invites.json`     | Trip invite tokens and usage counts |
| `data/audit_log.json`   | Itinerary audit trail |
| `data/notifications.json` | User notifications |

---

## Local UI

A lightweight frontend is included using Flask templates and static assets:
- `app/ui.py` serves the UI routes
- `app/templates/` contains the HTML views
- `app/static/css/style.css` contains the visual theme
- `app/static/js/ui.js` contains client-side login/register behavior

The UI is inspired by modern travel landing pages: clean sections, large hero messaging, rounded cards, and simple authentication forms.

## React Frontend

A React frontend is now available in the `client/` directory.

### Run the frontend

1. Install dependencies:

```bash
cd client
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open `http://localhost:5173`

### Build for production

```bash
cd client
npm run build
```

The React app uses `vite` and proxies API requests to `http://localhost:5000` through the `/api` path.

### Production deployment

The Flask backend now serves the React production build from `client/dist` when the app is run in a production container. The Dockerfile performs a multi-stage build that compiles the React frontend and copies the generated static assets into the Python image.

### Run in Docker

```bash
docker build -t globetrotter-app .
docker run -p 5000:5000 globetrotter-app
```

Then open `http://localhost:5000`.

## Configuration

| Environment Variable | Default                              | Description           |
|----------------------|--------------------------------------|-----------------------|
| `SECRET_KEY`         | `globetrotter-secret-change-in-prod` | JWT signing key – **must be overridden in production** |
| `FLASK_DEBUG`        | `0`                                  | Set to `1` to enable Flask debug mode (development only) |
| `PORT`               | `5000`                               | Port the app listens on |
| `GOOGLE_CLIENT_ID`   | unset                                | Optional audience check for Google ID-token login |

> **Important:** Always set `SECRET_KEY` to a long, random value in production (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`).

## Benchmarking and Feature Inspiration
GlobeTrotter is shaped by travel planning workflows found in modern trip planner apps: search-driven destination discovery, collaborative trip boards, and intent-based recommendations.

Key platform features inspired by research:
- Google-based registration and login for easier onboarding.
- Destination discovery with tags, cost filters, continent search, and autocomplete.
- Personalised recommendations based on user preferences, feedback, budget, and travel history.
- Money defaults to FCFA/XAF across budgets, payments, receipts, and exports. The React UI includes a currency selector and converts selected-currency input back to FCFA for consistent API storage.
- Map metadata is backed by Google Maps URLs for worldwide search, directions, and embeds. Cameroon-focused trips get extra Google Maps links for nearby hotels, restaurants, attractions, transport, hospitals, pharmacies, and banks.
- Trip creation with dates, locations, hotels, activities, notes, stage progress, and receipts.
- Shared trips with participant collaboration and view/edit permissions.
- Local AI-style itinerary draft generation from catalogue and resource data.

