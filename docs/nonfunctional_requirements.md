# GlobeTrotter Non-Functional Requirements

## Performance
- The application shall start within 10 seconds in a local development environment.
- API endpoints shall respond within 1 second under light load.
- The system shall be designed to scale toward millions of users globally.
- The architecture shall support both vertical and horizontal scaling in later phases.

## Security
- Passwords shall be hashed before storage.
- JWTs shall be used for authentication on protected routes.
- The JWT signing key shall be configurable through the `SECRET_KEY` environment variable.
- The application shall not expose Flask debug mode in production.
- Authorization shall protect user-specific data, trips, and itinerary access.
- Google authentication supports server-side ID-token validation for local/development use and `GOOGLE_CLIENT_ID` audience checking.

## Reliability
- The application shall handle missing data files by initializing empty JSON arrays.
- The application shall return correct HTTP status codes for validation, authentication, and authorization errors.
- The application shall fail safely for malformed JSON input with a `400 Bad Request` response.
- The system architecture shall evolve to resist failures with no single point of failure.
- The system shall aim for 24/7 availability with minimal downtime.
- Real-time trip tracking shall update consistently and reflect current trip stage.

## Usability
- The API shall support both username/password and Google login.
- Trip creation and management workflows shall be straightforward and documented.
- Shared trips and collaborative trip visibility shall be clear.
- Cost and time summaries shall be easy to interpret.

## Data Integrity
- Usernames shall be unique.
- Sensitive data such as passwords shall never be stored in plain text.
- Itineraries and trips shall be associated with the correct authenticated user.
- Shared trip access shall preserve permissions and ownership.
- Hotels, activities, and places shall be represented as reusable entities with costs and durations.

## Maintainability
- The codebase shall separate concerns into blueprints and model helpers.
- The system shall use clear, documented data model conventions.
- Documentation for core logic and API behavior shall be available in `docs/`.
- The architecture shall support future decomposition into independent services.

## Observability
- API behavior is measurable through `/metrics` and `/api/metrics`, including request counts, error counts, route counts, and average latency.
- Health checks are available at `/health` and `/api/health` for local, Docker, and future orchestration probes.

## Portability
- The system shall run on Python 3.9+.
- The system shall support Docker-based local execution using the provided `Dockerfile` and `docker-compose.yml`.
- The architecture shall support container orchestration and cloud deployment.
- Configuration shall rely on environment variables where appropriate (`SECRET_KEY`, `PORT`, `FLASK_DEBUG`).


## Extensibility
- The architecture shall support adding new endpoints and features without major refactoring.
- The recommendation logic shall be replaceable with a more advanced algorithm.
- The system shall be able to incorporate caching, message queues, circuit breakers, and health endpoints in later phases.
