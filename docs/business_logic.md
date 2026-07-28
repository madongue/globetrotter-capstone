# GlobeTrotter Business Logic

## Overview
GlobeTrotter is a travel assistant API for discovering destinations, receiving personalised recommendations, and managing travel itineraries.

The application is designed as a semester-long capstone project with an evolution path from a monolith to microservices, then to cloud deployment and resilience.

The core business logic is organized around:
- User account management
- Destination discovery
- Personalised recommendations
- Itinerary planning
- Shareable travel itineraries (future phase)

## Business Goals
- Allow users to search Cameroon travel destinations and get personalised recommendations.
- Allow users to register, log in, and authenticate via Google.
- Allow users to create, join, view, and modify trips.
- Allow hotels, activities, and places to be added, removed, and referenced within a trip.
- Support real-time tracking and trip stage advancement.
- Calculate trip cost and duration per stage and overall.
- Support trip and itinerary sharing with other users.
- Support research by budget, feedback, Cameroon region/division/subdivision/city/quarter, and other criteria.
- Support multiple user roles for different access levels.
- Deliver a system that can scale to millions of users while keeping the product geography focused on Cameroon.
- Keep the system available 24/7 with minimal downtime.
- Make recommendations based on user preferences, history, and trip feedback.

## Competitor Benchmarking
This project is informed by travel planning applications and open-source references that emphasize shared trips, mobile-friendly discovery, and preference-driven recommendations.

Benchmarks include:
- `mywanderlust`: shared travel boards, trip profile pages, and collaborative trip planning among multiple people.
- `Full-Stack AI Trip Planner`: Google login, place autocomplete, responsive UI, and AI-generated itineraries.

Takeaway features for GlobeTrotter:
- Offer both username/password and Google authentication.
- Provide a trip dashboard where users can build and share trips.
- Use filterable Cameroon destination search, budget planning, and region/division/subdivision/city/quarter discovery.
- Build a recommendation service that ranks destinations by user preferences and travel history.
- Use local AI-style trip generation and catalogue autocomplete for place discovery workflows.

## User Account Management
### Register
- Accepts `username`, `password`, and optional predefined `preferences`.
- Supports registration through Google OAuth as an alternate login path.
- Validates required fields.
- Ensures the username is unique.
- Hashes passwords using Werkzeug before saving.
- Persists new users into `data/users.json`.
- Interest values are controlled by `app/interests.py`; unknown free-form values are ignored.

### Login
- Accepts `username` and `password`.
- Supports login via Google OAuth.
- Verifies credentials against saved users or external Google authentication.
- Issues a JWT token on successful authentication.
- The token is valid for 24 hours.

### Authentication
- Uses JWT bearer tokens in the `Authorization` header.
- The secret key is loaded from `SECRET_KEY` environment variable.
- Protected routes validate the token and extract the current username.
- Google login accepts either a local demo `google_id` or an `id_token` verified through Google's tokeninfo endpoint; `GOOGLE_CLIENT_ID` enables audience checks.

## Destination Discovery
### Destination Catalogue
- The catalogue is loaded from `data/destinations.json`.
- Each destination record includes name, country, region, division, subdivision, city, quarters, tags, description, and average cost.
- Cameroon is the required country focus for location-facing records. Locations are normalized to include `Cameroon` and enriched with inferred administrative metadata when possible.
- Destination, place, hotel, and activity resources can include image URLs, source URLs, related services, cost notes, and Google Maps metadata.

### Search Logic
- Supports optional filters:
  - `q`: free-text search against name, Cameroon geography, and description
  - `tag`: filter by interest tag
  - `region`: filter by Cameroon region
  - `division`: filter by Cameroon division/department
  - `subdivision`: filter by subdivision/arrondissement
  - `city`: filter by city or town
  - `quarter`: filter by quarter or neighbourhood
  - `max_cost`: filter by maximum average daily cost
- A destination matches only if it satisfies all supplied filters.
- Search returns all matching destination objects.

## Personalised Recommendations
### Recommendation Logic
- Requires an authenticated user.
- Loads the user’s saved `preferences`.
- Scores each destination by counting matching preference tags.
- Sorts destinations by score descending and then by name.
- Returns a limited result set (default 5) via an optional `limit` parameter.
- Includes `match_score` in returned objects for transparency.
- Recommendations incorporate preferences, past trips, positive feedback tags, budget, and Cameroon geography criteria.

## Research and Discovery
- Users shall be able to research travel locations and available trips by budget, location, user feedback, and other criteria.
- The system shall support filtering and discovery workflows that combine preferences with cost, ratings, and destination features.

## Roles
- The system shall support multiple user roles, such as regular users, trip owners, shared guests, and administrators.
- Roles determine access to trip creation, trip modification, resource management, and sharing capabilities.

## Trip and Itinerary Management
### Create Trip
- Requires an authenticated user.
- Accepts:
  - `title`
  - `location`
  - `hotel`
  - `activities`
  - `places_to_visit`
  - `start_date`
  - `end_date`
  - `notes`
- Validates that `title` and `location` exist and that lists are provided where expected.
- Records trip metadata and the owning username.
- Calculates cost and duration for each trip stage and the overall itinerary.
- Persists trips into `data/itineraries.json` or a future dedicated `trips` store.

### Join Trip
- Requires an authenticated user.
- Allows a user to join an existing trip if they are invited or allowed.
- Associates the user with the trip and updates participant tracking.
- Supports optional payments when joining and generates a receipt for each payment.

### Modify Trip
- Requires authentication and trip ownership or authorized access.
- Allows updating hotels, activities, places, dates, and notes.
- Keeps trip state current with stage advancement and cost updates.

### Event Listings and Commissionable Sales
- Trip owners can include event listings with ticket pricing and commission rates.
- Users can purchase event tickets through itinerary payment flows.
- The system generates receipts with commission and net payout details.
- Seat availability is decremented when tickets are sold.
- Budget dashboards compare planned totals, payments, commissions, net paid, and remaining balance.

### Community Groups and Media
- Authenticated users can create and join community groups.
- Groups maintain members, discussion threads, and shared media.
- Users can post photos or videos, comment, like, and share media posts.
- Media posts can be scoped to groups or itineraries, with share permissions and tagging.
- Media can be URL-based or uploaded to local JSON-backed storage under `data/uploads`.

### List Trips and Itineraries
- Requires an authenticated user.
- Returns trips and itineraries that belong to or are shared with the user.
- Data is filtered by user access rights.

### Hotels and Infrastructure
- Hotels, activities, and places can be added, removed, or referenced by trips.
- These entities are treated as reusable resources in the system.
- Administrators can add hotels, activities, and places so that all users can discover them.
- Costs and durations are attached to each item.
- Users can view resources through map metadata and suggested resources when building a trip.
- Seed resources include researched Cameroon attractions across natural sites, parks, monuments, museums, beaches, palaces, hotels, and guided activities.
- Administrators can manage resources through dedicated endpoints for hotels, activities, and places.

### Real-Time Tracking
- Trip progress is tracked by stage through `/itineraries/{id}/progress` and `/trips/{id}/progress`.
- Each stage can report current status, location, completion state, and expected completion metadata.
- The current monolith stores updates synchronously in JSON; future distributed phases can replace this with live push notifications.

### Trip Cost and Time Calculation
- Each activity and stage is calculated for cost and duration.
- The system computes total trip cost and expected trip time.
- Cost calculation supports budget-based research and comparison.

### Share Trips and Itineraries
- Users can share trips and itineraries with other users.
- Shared trips preserve ownership and access control.
- Shared itinerary views provide a read-only or collaborative edit mode depending on `view` or `edit` permissions.
- The system records local notifications for sharing, joining, progress, payments, and feedback events.
- Owners can create limited-use invite links with view/edit permissions.
- Itinerary actions write audit log entries for review.
- Itineraries can be exported as PDF summaries and calendar `.ics` files.
- Each stage can maintain a checklist of tasks.

### Recommendations Evolution
- The system recommends destinations based on user preferences, trip history, budget/location criteria, and positive feedback tags.
- Users can submit trip feedback through `/itineraries/{id}/feedback`.
- Personalized suggestions improve as users create trips and record feedback.

## Data Persistence Rules
- Users and itineraries are appended to JSON arrays stored in `data/users.json` and `data/itineraries.json`.
- Destination data is read-only from `data/destinations.json`.
- If data files do not exist, the app initializes them as empty arrays.

## Architecture and Evolution
- Current architecture is a monolith with an API layer, business logic, and JSON-based data access.
- Future architecture phases include microservice decomposition, containerized cloud deployment, and resilient patterns such as caching, message queues, and circuit breakers.

## Business Constraints
- Usernames must be unique.
- Passwords are never stored in plain text.
- Only authenticated users can create or view protected resources.
- Recommendations are based on user preferences and may incorporate popularity signals later.
- The system is designed for learning and progressive modernization.
