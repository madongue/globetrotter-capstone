# GlobeTrotter Competitor Analysis

## Purpose
This document captures competitor research and feature inspiration for GlobeTrotter. It maps the current project vision to real travel planning applications and identifies features to adopt in the next iterations.

## Competitors Reviewed

### mywanderlust
- Open-source travel planning web app built with Ruby on Rails and AngularJS.
- Focuses on collaborative travel planning among multiple people.
- Provides shared trip boards, trip profiles, and group itinerary organization.
- Emphasizes destination sharing and planning feedback.

### Full-Stack AI Trip Planner
- Modern React + Firebase application with TailwindCSS.
- Supports Google authentication and responsive UI.
- Includes place autocomplete and Google photo display.
- Uses AI-assisted trip generation to help users build a travel plan quickly.
- Emphasizes modern onboarding and discovery flows.

## Key Features to Adopt

### Authentication and Onboarding
- Offer both username/password registration and Google login.
- Use social login to reduce onboarding friction.
- Collect preference tags during signup for personalised recommendations.

### Destination Discovery
- Provide a searchable destination catalogue with free-text and tag filters.
- Support budget filtering and Cameroon region/division/subdivision/city/quarter discovery.
- Surface destination details, descriptions, and photos where available.

### Trip and Itinerary Management
- Allow users to create trips with title, dates, location, hotel, activities, and notes.
- Support joining shared trips and collaborative planning.
- Show trip participants and ownership metadata.
- Store trips as shareable objects that can be revisited and edited.

### Recommendations and AI Assistance
- Provide personalised recommendations based on user preferences and history.
- Rank results by relevance score and user-specific criteria.
- Provide local AI-style itinerary generation and smarter trip suggestions.

### User Experience
- Build simple, mobile-friendly interfaces with responsive design.
- Make the trip creation flow clear and easy to use.
- Offer a dashboard or profile view for users to manage multiple trips.
- Provide clear status information for shared vs owned trips.

### Platform Evolution
- Begin with a monolithic Flask API and JSON storage for phase 1.
- Design for future decomposition into microservices, API gateway, and cloud deployment.
- Include place autocomplete, richer destination/resource cards, and notification support.

## Recommendations for GlobeTrotter
- Add a dedicated `/trips` API surface to support creating, updating, joining, and sharing itineraries.
- Implement Google OAuth as a priority for user onboarding.
- Expand destination search filters to include tags, budget, Cameroon geography, and free-text.
- Enhance recommendation logic with user history and trip feedback.
- Introduce shareable trip boards and participant access controls.
- Track trip cost and duration with detail per stage and overall itinerary.
- Keep the app architecture modular so future phases can add cloud-native resilience.

## Feature Gap Analysis

| Feature | Current Status | Target Direction |
|---|---|---|
| Username/password auth | Implemented | Maintain alongside Google login |
| Google auth | Implemented with local Google ID and verified ID-token support | Use production Google auth libraries for cloud hardening |
| Destination search | Implemented with filters and autocomplete | Continue enriching catalogue metadata |
| Recommendations | Implemented with preferences, history, budget, location, and feedback signals | Continue improving ranking quality |
| Trip creation | Implemented with hotels, activities, places, sharing, participants, costs, durations, and stages | Continue improving collaboration UX |
| Shared trip boards | Implemented through shared itineraries, view/edit permissions, participants, groups, discussions, and media | Continue improving collaboration UX |
| AI itinerary generation | Implemented as a local catalogue-based draft generator | Replace or augment with external AI later |
| Mobile-friendly UI | Implemented in React with responsive dashboard panels | Continue visual polish and usability testing |

## Conclusion
GlobeTrotter is aligned with modern travel planner expectations. The current monolith includes reliable destination search, secure login, itinerary creation, collaborative trip planning, shared trips, and AI-style recommendation/generation flows.
