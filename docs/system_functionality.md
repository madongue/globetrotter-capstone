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
| `/auth/google` | POST | No | Authenticate or register via Google |
| `/destinations` | GET | No | Search the destination catalogue |
| `/recommendations` | GET | Yes | Get personalised destination recommendations |
| `/itineraries` | POST | Yes | Create a new itinerary |
| `/itineraries/suggestions` | GET | Yes | Get hotel/activity/place suggestions based on location and budget |
| `/itineraries/{itinerary_id}` | PUT | Yes | Modify an existing itinerary |
| `/itineraries/{itinerary_id}/join` | POST | Yes | Join an existing itinerary |
| `/itineraries` | GET | Yes | List itineraries available to the user |
| `/itineraries/{itinerary_id}/share` | POST | Yes | Share an itinerary with another user |
| `/itineraries/{itinerary_id}/map` | GET | Yes | Get map metadata for an itinerary |
| `/resources/hotels` | POST | Yes | Add a hotel resource |
| `/resources/hotels/{hotel_id}` | DELETE | Yes | Remove a hotel resource |
| `/resources/activities` | POST | Yes | Add an activity resource |
| `/resources/activities/{activity_id}` | DELETE | Yes | Remove an activity resource |
| `/resources/places` | POST | Yes | Add a place resource |
| `/resources/places/{place_id}` | DELETE | Yes | Remove a place resource |

## Current Implementation Details
- Stores users and itineraries in JSON files.
- Stores destination catalogue in `data/destinations.json`.
- Does not yet support itinerary sharing.
- Uses a simple monolithic design for Phase 1.

## Future Functionality Expectations
- The system should support sharing trips and itineraries with friends and family.
- The system should allow users to create, join, and modify trips.
- The system should allow hotels, activities, and places to be added, removed, and referenced.
- The system should enable administrators to manage hotel, activity, and place resources for discovery.
- The system should provide location- and budget-based suggestions when building an itinerary.
- The system should track trip stage advancement and real-time progress.
- Recommendations should consider user preferences, history, budgets, and feedback.
- Cost and duration calculations should be visible for each trip stage and total itinerary.
- The system should scale to millions of users.
- The deployment model should move from a single server to container orchestration in the cloud.

## Error Handling
- `400 Bad Request` for invalid input or malformed query parameters.
- `401 Unauthorized` for missing or invalid JWT tokens.
- `404 Not Found` if an authenticated user is missing from storage.
- `409 Conflict` if a registration username already exists.

## Deployment and Operations
- Local run: `pip install -r requirements.txt` and `python app/main.py`
- Docker run: `docker-compose up --build`
- The app listens on port `5000` by default.
- JSON files persist in `data/` and are mounted by Docker compose.
- Future deployment should use Kubernetes or similar cloud container orchestration with load balancing and auto-scaling.
