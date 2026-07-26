# GlobeTrotter Architecture

## Overview
This document describes the GlobeTrotter capstone architecture across four phases:
1. Monolith
2. Microservices
3. Cloud Deployment
4. Resilience

The current repository implements Phase 1: the monolith.

## Phase 1: Monolith

### Architecture Overview
In Phase 1, GlobeTrotter is a single server application with:
- API Layer
- Business Logic
- Data Access
- JSON file storage

### Components
- `app/main.py`: application entrypoint
- `app/__init__.py`: Flask app factory and blueprint registration
- `app/auth.py`: user registration, login, and JWT handling
- `app/destinations.py`: destination search endpoint
- `app/recommendations.py`: personalised destination recommendations
- `app/itineraries.py`: itinerary creation and listing
- `app/models.py`: JSON file read/write helpers and domain data operations

### Data Stores
- `data/destinations.json`: static destination catalogue
- `data/users.json`: registered users
- `data/itineraries.json`: saved itineraries

### Strengths
- Simple to build and deploy
- Good for rapid iteration
- Easy to test basic flows

### Limitations
- Vertical scaling only
- Single point of failure
- JSON file storage is not concurrent-safe or performant at scale
- Redeploying any change requires restarting the whole application
- Team collaboration can be harder as everyone works on the same codebase

### Phase 1 Deliverable
A working monolithic API with at least five endpoints:
- `POST /register`
- `POST /login`
- `GET /destinations`
- `GET /recommendations`
- `POST /itineraries`
- `GET /itineraries`

## Phase 2: Microservices

### Architecture Overview
Phase 2 decomposes the monolith into independent services behind an API Gateway. Each service owns its own data and domain logic.

### Proposed Service Boundaries
- User Service
  - Manages registration, login, profiles, and preferences
  - Owns `users` data
- Itinerary Service
  - Manages itinerary creation, storage, and retrieval
  - Owns `itineraries` data
- Recommendation Service
  - Computes destination recommendations based on preferences and user history
  - Reads destination, user, and itinerary data
- Destination Service (optional)
  - Publishes destination catalogue data
  - Owns `destinations` data

### Communication Patterns
- API Gateway to services via synchronous REST APIs
- Services may communicate directly for request-response workflows
- Asynchronous messaging may be introduced later for tasks such as recommendation refresh or itinerary sharing

### Benefits
- Service autonomy and independent deployment
- Fault isolation
- Technology choice per service
- Ability to scale services independently

### Challenges
- Network latency
- Data consistency across services
- Service discovery and routing
- Testing across multiple services
- Deployment coordination

### Phase 2 Deliverable
Three independent services communicating via REST, with an API Gateway routing client requests.

## Phase 3: Cloud Deployment

### Architecture Overview
Phase 3 deploys services to the cloud using container orchestration.

### Key Technologies
- Docker containers for each service
- Kubernetes or Docker Swarm for orchestration
- Load balancer for incoming traffic
- Service discovery inside the cluster
- Container registry for images

### Deployment Goals
- Package services as Docker images
- Run services in pods or containers
- Expose a single frontend gateway to the internet
- Use auto-scaling for service instances
- Support rolling deployments with minimal downtime

### Phase 3 Deliverable
A cloud-deployed system with container orchestration, load balancing, and auto-scaling.

## Phase 4: Resilience

### Architecture Overview
Phase 4 adds resilience features that protect the system from failures and improve reliability.

### Resilience Patterns
- Caching
  - Use Redis or similar to cache frequently accessed data such as destination catalogue or recommendations
- Message Queues
  - Use RabbitMQ, SQS, or another queue for asynchronous tasks and decoupling
- Circuit Breakers
  - Prevent cascading failures when downstream services are unhealthy
- Retries and Backoff
  - Apply exponential retry policies for transient failures
- Health Checks
  - Provide readiness and liveness probes for containers / services
- Distributed Tracing
  - Add telemetry to trace requests across services

### Benefits
- Better fault tolerance
- Improved availability
- Reduced latency for cached operations
- More resilient service-to-service communication

### Phase 4 Deliverable
A resilient distributed system that survives failures using caching, message queues, circuit breakers, retries, and observability.

## Architecture Roadmap
1. Complete Phase 1 monolith and validate core API behavior.
2. Decompose into microservices and introduce service boundaries.
3. Containerize services and deploy to cloud infrastructure with orchestration.
4. Add resilience and observability patterns to enable production-style reliability.

## Notes
- The current repository is Phase 1.
- Phase 2+ is scoped as future work and should maintain compatibility with the monolith’s core API contract where possible.
