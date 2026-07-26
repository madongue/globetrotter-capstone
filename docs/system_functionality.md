# GlobeTrotter System Functionality

## System Overview
GlobeTrotter is a travel assistant built as a semester-long capstone project that starts as a monolithic REST API and evolves through microservices, cloud deployment, and resilience patterns.

The current implementation is the Phase 1 monolith. Future phases include:
- Phase 2: microservices decomposition with an API Gateway and service-to-service communication.
- Phase 3: cloud deployment with container orchestration, load balancing, and auto-scaling.
- Phase 4: resilience features such as caching, message queues, circuit breakers, retries, health checks, and distributed tracing.

## Architecture
### Current Monolith
- API Layer: REST endpoints for registration, login, destination search, itinerary management, and recommendations.
- Business Logic: recommendation scoring, itinerary handling, and user preference management.
- Data Access: JSON file storage in `data/`.
- Authentication: JWT-based auth using `SECRET_KEY`.

### Future Architecture Goals
- Microservices: User Service, Itinerary Service, Recommendation Service, and an API Gateway.
- Data Stores: separated service databases for users, itineraries, and destinations.
- Inter-service communication: synchronous REST APIs and asynchronous message queues.
- Resilience: caching with Redis, message queues with RabbitMQ/SQS, circuit breakers, retries/backoff, and health probes.
- Observability: metrics, logging, tracing, and distributed monitoring.

## Data Model
### User
- `id`: UUID
- `username`: string
- `password_hash`: string
- `preferences`: list of strings
- `google_id`: string (optional)
- `role`: string (e.g. user, owner, admin)

### Destination
- `id`: UUID
- `name`: string
- `country`: string
- `continent`: string
- `description`: string
- `tags`: list of strings
- `avg_cost_per_day`: number

### Hotel
- `id`: UUID
- `name`: string
- `location`: string
- `rating`: number
- `cost_per_night`: number
- `tags`: list of strings

### Activity
- `id`: UUID
- `name`: string
- `location`: string
- `duration_hours`: number
- `cost`: number
- `tags`: list of strings

### Place
- `id`: UUID
- `name`: string
- `location`: string
- `description`: string
- `tags`: list of strings
- `cost`: number

### Trip / Itinerary
- `id`: UUID
- `owner_username`: string
- `title`: string
- `location`: string
- `hotel_id`: UUID
- `activity_ids`: list of UUIDs
- `place_ids`: list of UUIDs
- `start_date`: string
- `end_date`: string
- `notes`: string
- `participants`: list of usernames
- `stage`: string
- `cost_breakdown`: object
- `currency`: string, defaults to `XAF`
- `currency_label`: string, defaults to `FCFA`
- `duration_hours`: number
- `created_at`: ISO 8601 timestamp

## Request Flow
1. Client sends a request to the API endpoint.
2. For protected endpoints, the system validates the JWT from `Authorization: Bearer <token>`.
3. If authenticated, the app executes business logic in the corresponding blueprint.
4. Data helpers read or write JSON files in `data/`.
5. The response is returned in JSON format.

## Authentication Flow
- `POST /register`: create a user with hashed password.
- `POST /login`: verify credentials and return a JWT.
- Protected routes use `get_current_user(request)` to extract the username.
- If the token is invalid or missing, the app returns `401 Unauthorized`.

## Endpoints and Behavior
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/register` | POST | No | Register a new user |
| `/login` | POST | No | Authenticate and receive a JWT |
| `/auth/google` | POST | No | Authenticate or register via Google ID or verified Google ID token |
| `/profile` | GET, PATCH | Yes | Read or update profile preferences |
| `/admin/users` | GET | Yes | List users for administrators |
| `/admin/users/{username}/role` | PATCH | Yes | Update a user's role |
| `/destinations` | GET | No | Search the destination catalogue |
| `/autocomplete` | GET | No | Search local destination/resource suggestions |
| `/recommendations` | GET | Yes | Get personalised destination recommendations |
| `/itineraries` | POST | Yes | Create a new itinerary |
| `/itineraries/suggestions` | GET | Yes | Get hotel/activity/place suggestions based on location and budget |
| `/itineraries/{itinerary_id}` | PUT | Yes | Modify an existing itinerary |
| `/itineraries/{itinerary_id}/join` | POST | Yes | Join an existing itinerary |
| `/itineraries` | GET | Yes | List itineraries available to the user |
| `/itineraries/{itinerary_id}/share` | POST | Yes | Share an itinerary with another user |
| `/itineraries/{itinerary_id}/map` | GET | Yes | Get Google Maps metadata, directions, embed links, stage map links, and Cameroon-focused nearby searches |
| `/itineraries/{itinerary_id}/progress` | GET, PATCH, POST | Yes | Read or update stage progress and current location |
| `/itineraries/{itinerary_id}/feedback` | POST | Yes | Record trip feedback for recommendation ranking |
| `/itineraries/generate` | POST | Yes | Generate a draft itinerary from local catalogue/resource data |
| `/itineraries/{itinerary_id}/budget` | GET | Yes | Return budget/payment totals |
| `/itineraries/{itinerary_id}/audit` | GET | Yes | Return itinerary audit log |
| `/itineraries/{itinerary_id}/invite` | POST | Yes | Create limited-use invite links |
| `/invites/{token}/join` | POST | Yes | Join by invite token |
| `/itineraries/{itinerary_id}/calendar.ics` | GET | Yes | Export calendar event |
| `/itineraries/{itinerary_id}/export.pdf` | GET | Yes | Export PDF summary |
| `/itineraries/{itinerary_id}/stages/{stage_id}/checklist` | POST, PATCH | Yes | Manage stage checklists |
| `/trips/*` | Various | Yes | Compatibility aliases for itinerary lifecycle endpoints |
| `/notifications` | GET | Yes | List user notifications |
| `/notifications/{notification_id}/read` | POST | Yes | Mark a notification as read |
| `/health` / `/api/health` | GET | No | Liveness/readiness check |
| `/metrics` / `/api/metrics` | GET | No | In-process request metrics |
| `/resources/hotels` | POST | Yes | Add a hotel resource |
| `/resources/hotels/{hotel_id}` | DELETE | Yes | Remove a hotel resource |
| `/resources/hotels/{hotel_id}/reviews` | GET, POST | Optional/Yes | List or create hotel reviews |
| `/resources/activities` | POST | Yes | Add an activity resource |
| `/resources/activities/{activity_id}` | DELETE | Yes | Remove an activity resource |
| `/resources/activities/{activity_id}/reviews` | GET, POST | Optional/Yes | List or create activity reviews |
| `/resources/places` | POST | Yes | Add a place resource |
| `/resources/places/{place_id}` | DELETE | Yes | Remove a place resource |
| `/resources/places/{place_id}/reviews` | GET, POST | Optional/Yes | List or create place reviews |

## Current Implementation Details
- Stores users and itineraries in JSON files.
- Stores destination catalogue in `data/destinations.json`.
- Supports itinerary sharing, joining, payments, media, community groups, trip progress, feedback, and generated itinerary drafts.
- Money is stored and calculated in FCFA/XAF by default. The React UI can display and accept values in another supported currency, then converts them back to FCFA before API submission.
- The React UI includes a persistent English/French language switcher. French mode translates navigation, forms, alerts, placeholders, dashboard panels, itinerary detail views, payment labels, map controls, groups, media, and resource-management text.
- Map metadata uses Google Maps URLs for global search/directions/embed links without requiring an API key. Cameroon destinations receive extra Google Maps searches for hotels, restaurants, attractions, transport, hospitals, pharmacies, and banks.
- Uses a simple monolithic design for Phase 1.

## Future Functionality Expectations
- The system supports sharing trips and itineraries with friends and family.
- The system allows users to create, join, and modify trips.
- The system allows hotels, activities, and places to be added, removed, and referenced.
- The system enables administrators to manage hotel, activity, and place resources for discovery.
- The system provides location- and budget-based suggestions when building an itinerary.
- The system tracks trip stage advancement, current location, status, and progress percentage.
- Recommendations consider user preferences, history, budgets, location filters, and trip feedback.
- Cost and duration calculations are visible for each trip stage and total itinerary.
- The system should scale to millions of users.
- The deployment model should move from a single server to container orchestration in the cloud.

## Error Handling
- `400 Bad Request` for invalid input or malformed query parameters.
- `401 Unauthorized` for missing or invalid JWT tokens.
- `404 Not Found` if an authenticated user is missing from storage.
- `409 Conflict` if a registration username already exists.

## E2E Verification
- Production build smoke test: open the React app from Flask and confirm there are no browser console errors on first load.
- Authentication flow: register a user, log in, and render the dashboard without unauthorized admin calls for non-admin users.
- Itinerary flow: create an itinerary with hotel, activity, place, dates, and costs, then open its detail page.
- Collaboration and finance flow: load budget, load audit log, create an invite token, submit payment, and confirm receipts plus budget totals update in the UI.
- Media feed flow: stale upload references render a local placeholder instead of broken image requests.

## Deployment and Operations
- Local run: `pip install -r requirements.txt` and `python app/main.py`
- Docker run: `docker-compose up --build`
- The app listens on port `5000` by default.
- JSON files persist in `data/` and are mounted by Docker compose.
- Future deployment should use Kubernetes or similar cloud container orchestration with load balancing and auto-scaling.
