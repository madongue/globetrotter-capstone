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
| GET    | `/recommendations/cities` | Yes (JWT) | Get personalised Cameroon city recommendations |
| GET/POST | `/browsing-events` | Yes (JWT) | List or record place browsing signals |
| GET/POST | `/wishlist` | Yes (JWT) | List or save Cameroon places to the user's waitlist |
| DELETE | `/wishlist/{place_id}` | Yes (JWT) | Remove a saved place from the waitlist |
| POST   | `/itineraries`      | Yes (JWT)     | Create a new itinerary                   |
| GET    | `/itineraries/suggestions` | Yes (JWT) | Get location/budget-based suggestions   |
| PUT    | `/itineraries/{itinerary_id}` | Yes (JWT) | Update an existing itinerary        |
| POST   | `/itineraries/{itinerary_id}/share` | Yes (JWT) | Share an itinerary with another user |
| POST   | `/itineraries/{itinerary_id}/join`  | Yes (JWT) | Join an existing itinerary, pay a share, and receive a receipt |
| POST   | `/itineraries/{itinerary_id}/pay`   | Yes (JWT) | Record a mobile payment, issue a receipt, and track commissions |
| GET    | `/itineraries/{itinerary_id}/map`   | Yes (JWT) | Get map metadata for an itinerary     |
| GET/POST | `/itineraries/{itinerary_id}/reservations` | Yes (JWT) | List or confirm trip bookings with receipts |
| PATCH/DELETE | `/itineraries/{itinerary_id}/reservations/{reservation_id}` | Yes (JWT) | Modify or cancel a booking |
| GET/PATCH/POST | `/itineraries/{itinerary_id}/tracking` | Yes (JWT) | Read or update live map tracking coordinates |
| GET/PATCH/POST | `/itineraries/{itinerary_id}/progress` | Yes (JWT) | Read or update stage progress and current location |
| GET/PATCH/POST | `/itineraries/{itinerary_id}/day-plans` | Yes (JWT) | Read or update day-by-day stage plans |
| GET/POST | `/itineraries/{itinerary_id}/route` | Yes (JWT) | Build a Cameroon-focused Google Maps route from trip stages |
| GET/POST/PATCH | `/itineraries/{itinerary_id}/packing-list` | Yes (JWT) | Manage packing checklist items |
| GET/POST/PATCH | `/itineraries/{itinerary_id}/expenses` | Yes (JWT) | Track shared expenses and split balances in FCFA |
| GET/POST | `/itineraries/{itinerary_id}/documents` | Yes (JWT) | Attach receipts, tickets, confirmations, or document links |
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
| GET    | `/media`           | Yes (JWT)     | List shared media posts, with optional group/place/city filters |
| POST   | `/media`           | Yes (JWT)     | Share a photo or video with the community, optionally linked to a place |
| POST   | `/media/upload`    | Yes (JWT)     | Upload a media file and create a place-linked post |
| GET    | `/uploads/{filename}` | No          | Serve uploaded media files |
| GET    | `/places/{place_id}/photos` | Yes (JWT) | List traveller-uploaded photos for a Cameroon place |
| POST   | `/media/{media_id}/comment` | Yes (JWT) | Comment on a media post   |
| POST   | `/media/{media_id}/like` | Yes (JWT) | Like a shared media post           |
| POST   | `/media/{media_id}/share` | Yes (JWT) | Share a media post with another user |
| GET    | `/groups/{group_id}/discussions` | Yes (JWT) | List discussions in a community group |
| POST   | `/groups/{group_id}/discussions` | Yes (JWT) | Create a discussion thread in a community group |
| POST   | `/groups/{group_id}/discussions/{discussion_id}/reply` | Yes (JWT) | Reply to a group discussion thread |
| GET    | `/itineraries`      | Yes (JWT)     | List all itineraries available to the user |
| POST   | `/resources/hotels` | Yes (JWT / admin) | Add a hotel resource                 |
| GET    | `/resources/hotels/compare` | No | Compare hotel prices by Cameroon location, city, and budget |
| DELETE | `/resources/hotels/{hotel_id}` | Yes (JWT / admin) | Remove a hotel resource |
| GET/POST | `/resources/hotels/{hotel_id}/reviews` | Optional/Yes | List or create hotel reviews |
| POST   | `/resources/activities` | Yes (JWT / admin) | Add an activity resource         |
| DELETE | `/resources/activities/{activity_id}` | Yes (JWT / admin) | Remove an activity resource |
| GET/POST | `/resources/activities/{activity_id}/reviews` | Optional/Yes | List or create activity reviews |
| POST   | `/resources/places` | Yes (JWT / admin) | Add a place resource                 |
| GET    | `/resources/places/{place_id}` | No | View a full Cameroon place guide with nearby hotels, activities, photos, and planning notes |
| GET    | `/resources/places/{place_id}/guide` | No | Download an offline-ready JSON guide for a Cameroon place |
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

# Personalised city recommendations
curl http://localhost:5000/recommendations/cities \
  -H "Authorization: Bearer $TOKEN"

# Save a Cameroon place to the trip waitlist
curl -X POST http://localhost:5000/wishlist \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"place_id": "place-kribi-lobe-falls"}'

# Record a browsing signal for personalisation
curl -X POST http://localhost:5000/browsing-events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"event_type": "view", "place_id": "place-kribi-lobe-falls"}'

# Share a traveller photo linked to a Cameroon place
curl -X POST http://localhost:5000/media \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"type": "photo", "url": "https://example.com/lobe.jpg", "caption": "Lobe Falls", "place_id": "place-kribi-lobe-falls"}'

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

The root `Dockerfile` builds the deployed application (the Flask monolith in
`app/`, serving the compiled React frontend):

```bash
docker build -t globetrotter-app .
docker run -p 5000:5000 -e SECRET_KEY=dev-secret -v "$(pwd)/data:/globetrotter/data" globetrotter-app
```

`docker-compose.yml` is separate: it starts the **Phase 2 microservices**
stack (gateway plus the four services under `services/`), not the monolith.

```bash
# Build and start the microservices stack
docker-compose up --build

# Stop
docker-compose down
```

> **Data does not persist unless you mount a volume.** Neither the Dockerfile
> nor `docker-compose.yml` declares one, so JSON files written inside a
> container are lost when it is removed or rebuilt. Pass `-v` as shown above
> to keep data between runs.

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

Curated catalogue files (`destinations`, `places`, `hotels`, and `activities`) are versioned seed data. Runtime/user files remain local-only.

> ### ⚠️ Runtime data is not durable on ephemeral hosts
>
> Runtime files (`users.json`, `itineraries.json`, `groups.json`, `media.json`,
> `uploads/`, …) are written to the container's local filesystem and are **not**
> committed to git. On platforms with an ephemeral disk — including Render web
> services without a paid persistent disk — every deploy, restart, or instance
> replacement wipes them, so all registered users, trips, and uploads are lost.
>
> To run this with real users, either attach a persistent disk mounted at
> `data/`, or migrate the storage layer in [`app/models.py`](app/models.py) to a
> managed database. Concurrent writes are already guarded with per-file locks
> and atomic replaces, but that protects against corruption, not against the
> disk disappearing.

Catalogue photos are cached under `client/public/images/` and referenced by local `/images/...` paths in the JSON records. Each cached record keeps `image_source_url`, `original_image_url`, and `image_license_note` metadata for attribution review. To refresh the local assets from the curated source URLs, run:

```bash
python tools/download_catalog_images.py places destinations
```

The importer only uses curated source URLs, mainly Wikimedia Commons/compatible sources; it does not scrape or rehost protected social-media images.

### Import Cameroon tourism catalogue data

The project includes an OpenStreetMap importer for hotels, restaurants, natural sites, man-made attractions, monuments, museums, and parks in Cameroon:

```bash
python tools/import_cameroon_places.py --max-items 600 --no-media
```

To make best-effort Wikimedia Commons photo/video lookups for existing catalogue records:

```bash
python tools/import_cameroon_places.py --media-only 25
```

The importer stores OpenStreetMap source URLs, coordinates, categories, estimated costs, and reusable-media attribution metadata when media is found. It does not scrape TikTok, Instagram, Tripadvisor, or other protected sites; add those only through official APIs, embeds, or creator-approved uploads.

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
| `SECRET_KEY`         | _(none – required)_                  | JWT signing key. **Required**: the app refuses to start without it unless `FLASK_DEBUG=1` or running under pytest. |
| `FLASK_DEBUG`        | `0`                                  | Set to `1` to enable Flask debug mode (development only) |
| `PORT`               | `5000`                               | Port the app listens on |
| `GOOGLE_CLIENT_ID`   | unset                                | Optional audience check for Google ID-token login |
| `ADMIN_USERNAMES`    | unset                                | Comma-separated usernames that become admins when they register. There is no automatic "first user becomes admin" promotion; admins promote others from the Admin dashboard |
| `VITE_GOOGLE_MAPS_API_KEY` | unset                         | Enables the interactive Google Maps picker in the admin dashboard. Without it, the app falls back to Google Maps embeds and external links. |

> **Important:** Always set `SECRET_KEY` to a long, random value in production (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`).

## Benchmarking and Feature Inspiration
GlobeTrotter is shaped by travel planning workflows found in modern trip planner apps: search-driven destination discovery, collaborative trip boards, and intent-based recommendations.

Key platform features inspired by research:
- Google-based registration and login for easier onboarding.
- Destination discovery with tags, cost filters, continent search, and autocomplete.
- Personalised recommendations based on user preferences, feedback, budget, and travel history.
- Money defaults to FCFA/XAF across budgets, payments, receipts, and exports. The React UI includes a currency selector and converts selected-currency input back to FCFA for consistent API storage.
- In-app maps are rendered with Leaflet and OpenStreetMap-compatible tiles. External Google Maps links may still be shown for search or directions metadata returned by the API.
- Discovery partitions Cameroon visit places by region, shows only a short featured preview by default, and expands focused places when a region/local filter is selected.
- Place guides include nearby hotels, nearby activities, traveller photos, practical notes, safety information, map links, and an offline JSON export.
- Admin users have a dedicated dashboard for adding Cameroon places to visit with descriptions, uploaded pictures/videos, external media URLs, Google Maps search/preview, optional coordinates, and regional metadata. When `VITE_GOOGLE_MAPS_API_KEY` is set, admins can search Cameroon locations, click the map, and drag the marker to capture coordinates.
- Trip creation with dates, Cameroon area selectors, regional hotel/activity/place proposals, day-by-day plans, route export, notes, stage progress, and receipts.
- Trip operations include packing lists, expense splitting in FCFA, and attached booking documents.
- The React frontend is installable as a lightweight PWA with an app manifest and service-worker shell cache.
- Shared trips with participant collaboration and view/edit permissions.
- Local AI-style itinerary draft generation from catalogue and resource data.

