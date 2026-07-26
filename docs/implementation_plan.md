# GlobeTrotter Implementation Plan

## Goal

Create a fully functional React frontend for GlobeTrotter and complete each backend feature iteratively. Each iteration will include backend API work, frontend page/component creation, integration wiring, tests, and documentation updates.

## Approach

The project will be delivered in iterative stages. Each stage delivers a complete feature set and demonstrates it with both API and frontend support.

For every feature group:
- Define functional scope.
- Implement backend API endpoints and data persistence.
- Create React pages and components for user interaction.
- Connect frontend to backend using the SPA API contract.
- Add tests for backend and frontend workflows.
- Update documentation to reflect the new feature.

## Iteration Plan

### Iteration 1: Core authentication and app shell

**Scope**
- User registration
- Login
- JWT authentication
- Basic homepage, login page, register page, dashboard page

**Backend work**
- Confirm existing `/register`, `/login`, `/auth/google` endpoints.
- Ensure JWT generation and user lookups are correct.
- Add API documentation for auth endpoints.

**Frontend work**
- Build `Home`, `Login`, `Register`, `Dashboard` views.
- Implement auth forms and client-side user feedback.
- Store JWT token safely in browser local storage.
- Add navigation and route state for page transitions.

**Tests**
- Backend unit tests for registration and login.
- Frontend route sanity checks via component rendering.

**Documentation**
- Add user auth flow to `docs/functional_requirements.md`.
- Add React frontend run/build instructions to `README.md`.

### Iteration 2: Destination discovery and recommendations

**Scope**
- Destination search API
- Recommendations API
- Search page and results list
- Recommendations page or dashboard cards

**Backend work**
- Ensure `/destinations` supports query filters: tag, continent, max_cost.
- Ensure `/recommendations` requires auth and returns personalized results.
- Add example query usage to API docs.

**Frontend work**
- Add a destination search page with filter controls.
- Create a recommendations section on the dashboard.
- Display results in card format with destination metadata.

**Tests**
- Backend tests for destination filtering and recommendations authorization.
- Frontend component tests for search form and result rendering.

**Documentation**
- Add destination search and recommendation behavior to docs.
- Document frontend pages and intended UI flows.

### Iteration 3: Itinerary creation and management

**Scope**
- Create itinerary endpoint `/itineraries`
- List itineraries `/itineraries`
- Update itinerary `/itineraries/{id}`
- Share itinerary `/itineraries/{id}/share`
- Join itinerary `/itineraries/{id}/join`
- Itinerary detail/dashboard pages

**Backend work**
- Validate itinerary payloads and calculate cost breakdown.
- Persist itineraries and sharing metadata.
- Ensure route authorization for owners and participants.
- Add itinerary map metadata support.

**Frontend work**
- Create itinerary creation page/form.
- Add itinerary list and detail views.
- Allow sharing and joining from the UI.
- Show cost breakdown, participants, and map metadata.

**Tests**
- Backend tests for itinerary creation, update, share, join.
- Frontend flows for itinerary creation and list navigation.

**Documentation**
- Add itinerary lifecycle and UI walkthrough to docs.
- Update API table with itinerary-specific docs.

### Iteration 4: Payments, receipts, and commissions

**Scope**
- Record payments `/itineraries/{id}/pay`
- Generate receipts and commission calculations
- Support event ticket sales and payment sharing
- Display payment history and receipts in the app

**Backend work**
- Implement receipt generation in itinerary payment logic.
- Track commission and net values for payments.
- Validate event ticket availability and `event_listing` behavior.

**Frontend work**
- Create payment form on itinerary details.
- Show payment history and receipts.
- Display `event_listing` sales details when present.

**Tests**
- Backend payment/receipt test coverage.
- Frontend view tests for receipt display and payment actions.

**Documentation**
- Document receipt structure and payment workflows.
- Update `functional_requirements.md` with monetization details.

### Iteration 5: Social groups, media, and discussions

**Scope**
- Groups creation and join
- Discussions within groups
- Media sharing: upload links, comment, like, share
- Feed or group page in React

**Backend work**
- Add `/groups` and discussion endpoints.
- Add `/media` endpoints for posts, comments, likes, shares.
- Persist groups and media to JSON stores.

**Frontend work**
- Create group list and detail pages.
- Add discussion boards and reply flows.
- Build media feed, post creation, comments, and likes.

**Tests**
- Backend tests for group membership, discussion threads, and media interactions.
- Frontend tests for group feed and media posting UI.

**Documentation**
- Document community workflows and endpoint behaviors.
- Add group/discussion UI pages to docs.

### Iteration 6: Admin resource management

**Scope**
- Admin endpoints for hotels, activities, places
- Admin interface for adding and removing resources

**Backend work**
- Enforce admin controls on `/resources/*` endpoints.
- Add resource creation and deletion documentation.

**Frontend work**
- Create an admin resource management page or dashboard extension.
- Display hotel/activity/place creation forms.

**Tests**
- Backend role-based access and resource CRUD tests.
- Frontend admin UI edge case tests.

**Documentation**
- Document admin role requirements and API usage.

### Iteration 7: Production React integration and deploy path

**Scope**
- Serve React build from Flask in production
- Keep development proxy working with Vite
- Update Dockerfile and deployment docs

**Backend work**
- Add production static file serving for `client/dist`.
- Ensure API routes and frontend assets coexist safely.
- Add a catch-all route to serve `index.html` for client-side routing.

**Frontend work**
- Confirm built asset configuration and route base.
- Adjust API bindings if needed to match production routes.

**Tests**
- Smoke test production build served by Flask.
- Validate static assets and API accessibility together.

**Documentation**
- Document production build steps and deployment instructions.
- Update `README.md` and `docs/implementation_plan.md`.

## Implementation Notes

- The React frontend should call the same API contract used by the Flask backend.
- Development uses Vite with proxying to Flask for backend requests.
- Production serves built React assets from the Flask app if required.
- All new functionality should be tracked in the docs as soon as it is usable.

## Tracking and Review

Use the following checklist for each iteration:
- [ ] Backend endpoints implemented
- [ ] Frontend pages/components created
- [ ] API flow connected in the UI
- [ ] Backend tests added or updated
- [ ] Frontend route/component tests added
- [ ] Documentation updated
- [ ] Manual verification completed
