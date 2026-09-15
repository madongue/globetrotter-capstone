# GlobeTrotter — codebase audit

**Date:** 15 September 2026
**Commit audited:** `200bf5e`
**Scope:** read-only. No code was changed while producing this document.

This audit answers a product/UX/distributed-systems review of GlobeTrotter by
establishing what the application *actually does today*, so that the review's
recommendations can be merged into it rather than rebuilt over it.

---

## 1. Method

Findings here are behavioural, not structural: the application was started, three
users were registered, and the API was driven with live requests. Reading a route
definition proves a route exists; it does not prove the feature works. Where a
call failed, the endpoint was read before drawing any conclusion.

- 125 API routes inventoried (≈95 distinct — `/trips/*` is a registered alias of
  `/itineraries/*`)
- ~60 endpoints exercised with real requests, including permission boundaries
- Browser checks at 1440 × 950 and 390 × 844
- Full test suite run: **211 passing**

**Three of the initial failures were faults in the probe, not the application.**
They are recorded in §7 because the naming they exposed matters to the UI work.

---

## 2. What exists — architecture at a glance

| Layer | Detail |
|---|---|
| Backend | Flask, 21 modules, 7,743 lines, 125 API routes |
| Frontend | React 19 + Vite — **one `App.jsx` of 276 KB**, plus 3 extracted components |
| Storage | `DocumentStore` adapter → `JsonFileStore` or `SqlDocumentStore`, chosen by `DATABASE_URL` |
| Media | `LocalUploadStore` or `CloudinaryUploadStore`, chosen by `CLOUDINARY_URL` |
| Auth | JWT, with Flask-Limiter rate limiting on auth routes |
| Tests | 211 across 16 files, 4,043 lines |
| CI | 4 jobs per push — backend, backend-on-PostgreSQL, frontend build, Docker build |
| Containers | 2-stage `Dockerfile` (deployed) + 5-service `docker-compose.yml` (Phase 2) |

### Frontend structure

Six top-level pages, switched by `page === '…'` state rather than a router:

    home · login · register · dashboard · itinerary · group

Nine dashboard views, switched by `dashboardView === '…'`:

    overview · itineraries · discovery · community · media
    resources · suggest · settings · admin

Only three components are extracted from `App.jsx`: `TravelAssistant`,
`TravelMap`, and the Google sign-in button.

---

## 3. A — Already working (verified by live request)

### Catalogue

| Capability | Evidence |
|---|---|
| List places | 901 records |
| List hotels | 373 |
| List activities | 9 |
| Destinations | 11 |
| Place detail | returns name, category, description, image_url, latitude, longitude, cost, city, region |
| Offline guide per place | 200 |
| Comments on a place | 200 |
| Reviews on a place | 200 |
| Autocomplete | 200 |
| Region → division → subdivision → city → quarter tree | 200 |

> The review asks for "at least 100 places". The catalogue holds **901**.

### Saved places

Backed by `/api/wishlist`. Save → list → unsave all verified (200/200/200). The
feature the review calls "Saved Places" already exists under the name *wishlist*.

### Itineraries

| Capability | Evidence |
|---|---|
| Manual create | 200 |
| Auto-generate | 8 checkpoints, 140,000 FCFA for Kribi/3 days, in 0.41 s |
| Second generator `/generate` | 200 (see §4 — duplication) |
| **Day plans** | returned **3 days** for a 3-day trip |
| Swap checkpoints | 200, order survives reload |
| Edit checkpoint (name, cost, duration) | 200 |
| Remove checkpoint | 200 |
| Add catalogue place to a trip | 200 |
| Route plan | returns `waypoints`, `estimated_stop_count`, `google_maps_directions_url` |
| Budget breakdown | returns `cost_breakdown`, `currency`, `commission_total`, `net_paid_total` |
| Map payload | returns `map_info`, `location`, `country_focus` |
| PDF export | 1,277 bytes |
| Calendar `.ics` | 200 |
| Audit trail | 5 entries after 5 mutations |

The **DAY 1 / DAY 2 / DAY 3** structure the review asks for is already built and
served by `/api/itineraries/<id>/day-plans`.

### Sharing and permissions

Fully working, including the boundaries that are easy to get wrong:

| Check | Result |
|---|---|
| Share as viewer | 200 |
| Viewer can read | 200 |
| Viewer blocked from editing | **403** |
| Upgrade viewer → editor | 200 |
| Editor can edit | 200 |
| User with no access reads trip | **404**, not 403 — trip IDs cannot be probed |
| Editor attempts to re-share | **403** — owner-only |
| Invite by link/email | token issued |

### Community — real, not a mockup

| Check | Result |
|---|---|
| Create group | 200 |
| List groups | 200 |
| Group detail with members | 200, members array present |
| Second user joins | member count 1 → 2 |
| Create discussion post | 200 |
| List discussions | 200 |
| Reply to a post | 200 |

### Media

Post by URL, file upload, like, comment and share all return 200.

### Assistant

Answers from the catalogue, and — importantly — refuses correctly:

| Question | Behaviour |
|---|---|
| "What can I see in Kribi?" | lists real catalogued places |
| "How much for 3 days in Limbe?" | costed estimate from catalogue prices |
| "How do I swap checkpoints?" | written app help |
| "What can I see in Narnia?" | help fallback — **does not invent a destination** |
| "What are my trips?" | reads the asking user's own itineraries |

### Map

Already interactive Leaflet with markers and popups — **not a static image**.

---

## 4. B — Partially working

**Place detail is a panel, not a screen.** The API is complete
(`/api/resources/places/<id>`, plus `/guide`, `/comment`, `/reviews`). The UI
surfaces it inside Discovery. There is no dedicated Place Details page.

**Profile is thin.** `/api/profile` returns `username`, `role`, `preferences`,
`google_linked`, `id`. No trip count, saved-place count, group membership or
activity feed — all of which the review asks for and all of which are derivable
from data the application already holds.

**Two competing trip generators.** `create_quick_itinerary()` at
`app/itineraries.py:1034` and `generate_itinerary()` at `:3122`. Both return 200.
This is duplication to reconcile deliberately, not to delete on sight.

**Dashboard "Community groups" counter** showed `1` for a user who had joined no
groups. It may be counting all groups rather than the user's. One check needed.

---

## 5. C — Missing

| Gap | Detail |
|---|---|
| **Leave a group** | No endpoint. Join exists; leave returns 405. |
| **Password-reset UI** | `/forgot-password` and `/reset-password` work server-side; `grep` finds **0** references in `App.jsx`. Working endpoints nobody can reach. |
| **`opening_hours`** | Not a field on any place record. The review asks for it; the data does not carry it. |
| **Client-side router** | Six pages switched by state. No deep links to a place, trip or group; the browser back button does not work. |
| **Phase 3 (cloud)** | No Kubernetes, no load balancer, no service discovery, no autoscaling. |
| **Phase 4 (resilience)** | No Redis in use (one code comment mentions it as a future option), no message queue, no circuit breakers, no distributed tracing. `/api/health` and `/api/metrics` exist. |

---

## 6. D — Needs UI/UX work

### The structural finding

**The entire frontend is one 276 KB `App.jsx`** holding six pages and nine
dashboard views as conditional blocks. This is the root cause of the
"administrative dashboard" feel: there are no page components to design, only
branches inside one function.

Every other UI recommendation in the review depends on this being addressed
first. It is also the single riskiest change in the project, because there is no
frontend test coverage to catch a regression.

### Mobile

At 390 px the sidebar stacks vertically and consumes the **entire first screen** —
seven menu items before any content appears. No bottom navigation exists
(0 references to `bottom-nav`, `mobile-nav` or `tab-bar` anywhere).

This is precisely the "desktop layout squeezed into mobile" the review names.

### Other

- 25 elements render below 12 px
- The home page is the only screen carrying real destination imagery
- 12 media queries across 59 KB of CSS — modest for an app this size

### What is already fine

- No horizontal overflow at any width tested
- The dark theme holds contrast and reads well
- Discovery cards, since a recent fix, show photographs and wrap correctly

---

## 7. Corrections to the review's assumptions

The review was written without access to the running application. Three of its
premises do not hold:

1. **"Community should not be only a static UI mockup."**
   It already isn't — create, join, post and reply are wired end to end.

2. **"Viewer / Editor permissions."**
   These exist, but the API vocabulary is `view` / `edit`. A UI mismatch to
   translate, not a missing feature.

3. **"Do not turn the map into a static image."**
   It was never static — it is Leaflet.

Additionally, media actions take the keys `comment` and `username` (not `text`).
Sending the wrong key returns 400, which reads as a broken feature and is not.

---

## 8. E — Must not break

- Authentication and JWT
- Rate limiting on auth routes
- The storage adapter (`get_store()` — JSON/PostgreSQL switch)
- Checkpoint ordering: persisted `stage_order` plus pinned positional IDs
- The sharing permission model, including 404-not-403 for non-shared trips
- The Leaflet map
- 211 passing tests
- 4 CI jobs
- The API gateway's catch-all forwarding for `/itineraries/*` and `/trips/*`

---

## 9. Pre-existing data problems to fix first

Found while plotting the catalogue; both sit underneath any Explore redesign:

- **56 places are not in Cameroon.** They carry regions from Nigeria (Borno,
  Bauchi, Cross River, Plateau, Kano, Gombe, Jigawa, Ebonyi, Adamawa State),
  Equatorial Guinea (Bioko Norte, Bioko Sur), Gabon (Woleu-Ntem), and Congo /
  CAR (Sangha, Sangha-Mbaéré) — yet every one is tagged `country: Cameroon`.
  The OpenStreetMap import used a bounding box that crossed the borders.
- **33 places spell the region "Litoral"** instead of "Littoral", splitting one
  of the ten regions in two for every filter that reads it.
- **594 of 901 places are restaurants**, which is why the trip generator and
  Discovery both need their ranking — without it, a generated day is a list of
  bars in alphabetical order.
- Only **46 places carry a photograph of their own**; 513 more show a city
  photograph standing in, flagged by `image_is_contextual`.

---

## 10. Recommended sequence

Ordered so that each step stands on a stable version of the one before, and so
the application remains demonstrable throughout.

| # | Work | Risk |
|---|---|---|
| 1 | Fix catalogue data — 56 foreign places, Littoral typo | Low |
| 2 | Introduce a router; split `App.jsx` into page components | **High** |
| 3 | Place Details screen + Explore redesign on those components | Medium |
| 4 | Mobile navigation and layout | Medium |
| 5 | Small gaps — leave-group, password-reset UI, richer profile | Low |
| 6 | Reconcile the two generators | Low |

**Step 2 is the one to plan before touching.** Splitting a 276 KB component with
no frontend test coverage is the largest regression risk in the project; it
should be done incrementally, with the application running and verified at every
step, rather than as one rewrite.

Phases 3 and 4 of the course requirements are untouched and are separate work
from the product improvements above.

---

## 11. Bottom line

The backend is in considerably better shape than the review assumes. Most of
what it asks for already exists and works — including day plans, checkpoint
reordering, the permission model, community discussions and the grounded
assistant.

**The gap is frontend structure and presentation, not functionality.** The
application behaves like a travel platform and looks like an admin dashboard,
because six pages and nine views share a single 276 KB component with no router.
Fixing that is the prerequisite for nearly everything else on the list.
