# GlobeTrotter Functional Requirements

## Purpose
Specify the features and user journeys that GlobeTrotter must support as it evolves from a monolith into a distributed travel assistant.

## Actors
- Visitor: Unauthenticated user who can search destinations, register, and learn about the service.
- Registered User: Authenticated user who can log in, receive recommendations, create and manage trips, and join shared trips.
- Trip Owner: Authenticated user who creates a trip and manages its itinerary, participants, and progress.
- Shared User: User who has been granted access to view or collaborate on another user’s trip.
- Administrator / Operator: User role managing hotels, activities, locations, and platform resources.

## Functional Requirements

1. Registration and Authentication
   - The system shall allow visitors to register using a username and password.
   - The system shall allow users to register and log in using Google authentication.
   - The system shall allow users to supply preference tags during registration.
   - The system shall prevent duplicate usernames.
   - The system shall store passwords securely using hashing.
   - The system shall issue JWTs for authenticated sessions.

2. Market-Informed Planning
   - The system shall support onboarding via Google login and password-based registration.
   - The system shall provide a destination discovery experience similar to modern travel planners with tags, budget, and location filters.
   - The system shall enable shared trips and trip collaboration in later project phases.
   - The system shall prepare for future features such as AI-assisted itinerary generation and place autocomplete.
   - The system shall surface recommendations in a personalised, ranked order based on preferences and history.

2. Login
   - The system shall allow registered users to log in with a username and password.
   - The system shall issue a JWT access token on successful authentication.
   - The system shall reject invalid credentials.

3. Destination Search
   - The system shall allow visitors and users to search destinations without authentication.
   - The system shall support free-text search across name, country, and description.
   - The system shall allow filtering by tag.
   - The system shall allow filtering by continent.
   - The system shall allow filtering by maximum average daily cost.

4. Personalised Recommendations
   - The system shall require authentication to retrieve recommendations.
   - The system shall recommend destinations and trips based on user preference tags and history.
   - The system shall order recommendation results by relevance score and user criteria.
   - The system shall support an optional `limit` parameter for result count.
   - The system shall support research by budget, location, and feedback.

5. Trip and Itinerary Creation
   - The system shall require authentication to create trips.
   - The system shall allow users to create trips with a title, location, hotel, activities, places to visit, dates, and notes.
   - The system shall allow users to join existing trips if authorized.
   - The system shall allow users to modify trips they own or are authorized to edit.
   - The system shall calculate cost and duration per trip stage and for the whole trip.
   - The system shall allow hotels, activities, and places to be added, removed, or referenced.
   - The system shall provide trip suggestions for hotels, activities, and places when creating a trip based on budget and desired location.

6. Trip and Itinerary Listing
   - The system shall require authentication to list trips and itineraries.
   - The system shall return trips that belong to or are shared with the authenticated user.
   - The system shall return results as a JSON array.

7. Sharing Trips and Itineraries
   - The system shall support sharing trips and itineraries with other users.
   - Shared trips shall preserve ownership and access control.
   - Shared trips may allow read-only or collaborative access based on permissions.

8. Role-Based Access
   - The system shall support multiple roles: regular users, trip owners, shared users, and administrators.
   - The system shall enforce role-based permissions for trip management and resource administration.

## Endpoints

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| POST | `/register` | No | Register a new user |
| POST | `/login` | No | Authenticate and receive a JWT |
| POST | `/auth/google` | No | Authenticate or register via Google |
| POST | `/forgot-password` | No | Request a password reset token |
| POST | `/reset-password` | No | Reset a password using a token |
| GET | `/destinations` | No | Search the destination catalogue |
| GET | `/recommendations` | Yes | Get personalised destination recommendations |
| POST | `/itineraries` | Yes | Create a new itinerary |
| GET | `/itineraries/suggestions` | Yes | Get suggested resources based on budget and location |
| PUT | `/itineraries/{itinerary_id}` | Yes | Modify an existing itinerary |
| POST | `/itineraries/{itinerary_id}/join` | Yes | Join an existing itinerary and optionally pay a share |
| POST | `/itineraries/{itinerary_id}/pay` | Yes | Record a payment, generate a receipt, and track commission |
| POST | `/itineraries/{itinerary_id}/share` | Yes | Share an itinerary with another user |
| POST | `/groups` | Yes | Create a community group |
| GET | `/groups` | Yes | List all community groups |
| POST | `/groups/{group_id}/join` | Yes | Join a community group |
| GET | `/media` | Yes | List shared media posts and group media |
| POST | `/media` | Yes | Create a shared media post |
| POST | `/media/{media_id}/comment` | Yes | Comment on a media post |
| POST | `/media/{media_id}/like` | Yes | Like a media post |
| POST | `/media/{media_id}/share` | Yes | Share a media post with another user |
| GET | `/itineraries/{itinerary_id}/map` | Yes | Get itinerary map metadata |
| GET | `/itineraries` | Yes | List itineraries available to the user |
| POST | `/resources/hotels` | Yes | Add a hotel resource |
| DELETE | `/resources/hotels/{hotel_id}` | Yes | Remove a hotel resource |
| POST | `/resources/activities` | Yes | Add an activity resource |
| DELETE | `/resources/activities/{activity_id}` | Yes | Remove an activity resource |
| POST | `/resources/places` | Yes | Add a place resource |
| DELETE | `/resources/places/{place_id}` | Yes | Remove a place resource |

## Acceptance Criteria

- A visitor can register and receive confirmation.
- A registered user can log in and obtain a JWT.
- Users can authenticate using Google.
- Destination search returns matching destination objects for valid inputs.
- Recommendations return a sorted list of destinations or trips for an authenticated user.
- Trip creation returns the created trip and persists it.
- Trip joining associates a user with an existing trip.
- Trip modification updates the trip details and cost calculations.
- Trip listing returns only trips that belong to or are shared with the current user.
- Shared trips preserve access controls and permissions.
- Invalid JWT or missing authorization returns `401 Unauthorized`.
- Invalid payloads return `400 Bad Request` with a clear error message.
- Administrators can manage hotels, activities, and places.
- Users can research trips by budget, location, feedback, and other criteria.
- Trip progress and stage advancement are tracked and displayed.
- Cost and duration are calculated for each trip stage and total itinerary.
