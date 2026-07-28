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
   - The system shall allow users to choose preference tags from a predefined interest list during registration and profile setup.
   - The system shall prevent duplicate usernames.
   - The system shall store passwords securely using hashing.
   - The system shall issue JWTs for authenticated sessions.
   - The system shall expose the predefined interest list through `/interests`.

2. Market-Informed Planning
   - The system shall support onboarding via Google login and password-based registration.
   - The system shall provide a Cameroon-focused destination discovery experience with tags, budget, region, division, subdivision, city, and quarter filters.
   - The system shall enable shared trips and trip collaboration in later project phases.
   - The system shall provide local AI-style itinerary generation and place autocomplete.
   - The system shall surface recommendations in a personalised, ranked order based on preferences and history.

2. Login
   - The system shall allow registered users to log in with a username and password.
   - The system shall issue a JWT access token on successful authentication.
   - The system shall reject invalid credentials.

3. Destination Search
   - The system shall allow visitors and users to search destinations without authentication.
   - The system shall support free-text search across Cameroon destination name, region, division, subdivision, city, quarter, and description.
   - The system shall allow filtering by tag.
   - The system shall allow filtering by Cameroon region, division, subdivision, city, and quarter.
   - The system shall allow filtering by maximum average daily cost.
   - The system shall expose a Cameroon location hierarchy through `/cameroon-locations`.

4. Personalised Recommendations
   - The system shall require authentication to retrieve recommendations.
   - The system shall recommend destinations, trips, and cities based on user preference tags, saved places, browsing history, and feedback.
   - The system shall order recommendation results by relevance score and user criteria.
   - The system shall support an optional `limit` parameter for result count.
   - The system shall support research by budget, location, and feedback.
   - The system shall record place browsing events and use them to improve city and destination ranking.
   - The system shall allow users to save Cameroon places to a trip waitlist/wishlist.

5. Trip and Itinerary Creation
   - The system shall require authentication to create trips.
   - The system shall allow users to create trips with a title, location, hotel, activities, places to visit, dates, and notes.
   - The system shall allow users to join existing trips if authorized.
   - The system shall allow users to modify trips they own or are authorized to edit.
   - The system shall calculate cost and duration per trip stage and for the whole trip.
   - The system shall allow hotels, activities, and places to be added, removed, or referenced.
   - The system shall provide trip suggestions for hotels, activities, and places when creating a trip based on budget and desired location.
   - The system shall allow users to confirm hotel, activity, transport, and place reservations for a trip.
   - The system shall generate a booking confirmation code and receipt for every confirmed reservation.
   - The system shall allow authorized editors to modify or cancel reservations attached to a trip.
   - The system shall allow users to compare hotel prices in FCFA by location, city, and maximum budget before booking.
   - The system shall support live trip tracking coordinates and expose Google Maps links for the latest position.

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
| POST | `/auth/google` | No | Authenticate or register via Google ID or verified Google ID token |
| GET/PATCH | `/profile` | Yes | Read or update profile preferences |
| GET | `/interests` | No | Return the predefined onboarding/profile interest list |
| GET | `/admin/users` | Yes | List users for administrators |
| PATCH | `/admin/users/{username}/role` | Yes | Update a user's role |
| POST | `/forgot-password` | No | Request a password reset token |
| POST | `/reset-password` | No | Reset a password using a token |
| GET | `/destinations` | No | Search the destination catalogue |
| GET | `/cameroon-locations` | No | Return Cameroon regions, divisions, subdivisions, cities, and quarters for filters |
| GET | `/autocomplete` | No | Search local destination/resource suggestions |
| GET | `/recommendations` | Yes | Get personalised destination recommendations |
| GET | `/recommendations/cities` | Yes | Get personalised Cameroon city recommendations from interests, browsing, and saved places |
| GET/POST | `/browsing-events` | Yes | List or record place browsing signals for personalisation |
| GET/POST | `/wishlist` | Yes | List or save Cameroon places to the user's waitlist |
| DELETE | `/wishlist/{place_id}` | Yes | Remove a place from the user's waitlist |
| POST | `/itineraries` | Yes | Create a new itinerary |
| GET | `/itineraries/suggestions` | Yes | Get suggested resources based on budget and location |
| PUT | `/itineraries/{itinerary_id}` | Yes | Modify an existing itinerary |
| POST | `/itineraries/{itinerary_id}/join` | Yes | Join an existing itinerary and optionally pay a share |
| POST | `/itineraries/{itinerary_id}/pay` | Yes | Record a payment, generate a receipt, and track commission |
| GET/POST | `/itineraries/{itinerary_id}/reservations` | Yes | List or confirm trip bookings with receipts |
| PATCH/DELETE | `/itineraries/{itinerary_id}/reservations/{reservation_id}` | Yes | Modify or cancel a trip reservation |
| GET/PATCH/POST | `/itineraries/{itinerary_id}/tracking` | Yes | Read or update live map tracking coordinates |
| POST | `/itineraries/{itinerary_id}/share` | Yes | Share an itinerary with another user |
| GET/PATCH/POST | `/itineraries/{itinerary_id}/progress` | Yes | Read or update itinerary stage progress |
| POST | `/itineraries/{itinerary_id}/feedback` | Yes | Record feedback for an itinerary |
| POST | `/itineraries/generate` | Yes | Generate a draft itinerary from local catalogue data |
| GET | `/itineraries/{itinerary_id}/budget` | Yes | Return budget, payment, commission, and remaining totals |
| GET | `/itineraries/{itinerary_id}/audit` | Yes | Return itinerary audit events |
| POST | `/itineraries/{itinerary_id}/invite` | Yes | Create a limited-use invite link |
| POST | `/invites/{token}/join` | Yes | Join an itinerary by invite token |
| GET | `/itineraries/{itinerary_id}/calendar.ics` | Yes | Export calendar event |
| GET | `/itineraries/{itinerary_id}/export.pdf` | Yes | Export PDF itinerary summary |
| POST/PATCH | `/itineraries/{itinerary_id}/stages/{stage_id}/checklist` | Yes | Add or update stage checklist items |
| Various | `/trips/*` | Yes | Trip aliases for itinerary endpoints |
| GET | `/notifications` | Yes | List authenticated user's notifications |
| POST | `/notifications/{notification_id}/read` | Yes | Mark a notification as read |
| GET | `/health` / `/api/health` | No | Liveness/readiness check |
| GET | `/metrics` / `/api/metrics` | No | In-process request metrics |
| POST | `/groups` | Yes | Create a community group |
| GET | `/groups` | Yes | List all community groups |
| POST | `/groups/{group_id}/join` | Yes | Join a community group |
| GET | `/media` | Yes | List shared media posts and filter by group, city, or place |
| POST | `/media` | Yes | Create a shared media post, optionally linked to a Cameroon place |
| POST | `/media/upload` | Yes | Upload a media file and create a shared place-linked post |
| GET | `/places/{place_id}/photos` | Yes | List traveller-uploaded photos for a Cameroon place |
| POST | `/media/{media_id}/comment` | Yes | Comment on a media post |
| POST | `/media/{media_id}/like` | Yes | Like a media post |
| POST | `/media/{media_id}/share` | Yes | Share a media post with another user |
| GET | `/itineraries/{itinerary_id}/map` | Yes | Get itinerary map metadata |
| GET | `/itineraries` | Yes | List itineraries available to the user |
| POST | `/resources/hotels` | Yes | Add a hotel resource |
| GET | `/resources/hotels/compare` | No | Compare hotel prices by Cameroon location, city, and budget |
| DELETE | `/resources/hotels/{hotel_id}` | Yes | Remove a hotel resource |
| GET/POST | `/resources/hotels/{hotel_id}/reviews` | Optional/Yes | List or create hotel reviews |
| POST | `/resources/activities` | Yes | Add an activity resource |
| DELETE | `/resources/activities/{activity_id}` | Yes | Remove an activity resource |
| GET/POST | `/resources/activities/{activity_id}/reviews` | Optional/Yes | List or create activity reviews |
| POST | `/resources/places` | Yes | Add a place resource |
| DELETE | `/resources/places/{place_id}` | Yes | Remove a place resource |
| GET/POST | `/resources/places/{place_id}/reviews` | Optional/Yes | List or create place reviews |

## Acceptance Criteria

- A visitor can register and receive confirmation.
- A registered user can log in and obtain a JWT.
- Users can authenticate using Google.
- Destination search returns matching destination objects for valid inputs.
- Destination, recommendation, itinerary suggestion, resource, and map workflows are scoped to Cameroon territory by default.
- Registration and profile setup accept only predefined interest values.
- Cameroon places, hotels, and activities include region metadata, costs or cost notes where known, related services, image URLs, source URLs, and Google Maps metadata.
- Recommendations return a sorted list of destinations or trips for an authenticated user.
- City recommendations rank Cameroon cities from saved places, browsing history, preferences, and local catalogue matches.
- Users can save and remove Cameroon places from a trip waitlist.
- Users can upload traveller photos linked to a specific Cameroon place and filter media by that place.
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
- Hotel prices can be compared in FCFA before booking.
- Booking confirmations create persistent reservation records and receipts.
- Authorized users can cancel or modify reservations for hotels, activities, places, transport, or other trip items.
- Live tracking updates the itinerary with current coordinates, a trail, and Google Maps links.
