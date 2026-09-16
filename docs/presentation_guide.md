# Presentation guide

One section per point on the lecturer's checklist, each saying what the answer
is and which file to open to show it.

| # | Point | Section |
| --- | --- | --- |
| 1 | The GitHub | [1](#1-the-github) |
| 2 | The UML design | [2](#2-the-uml-design) |
| 3 | Data source design | [3](#3-data-source-design) |
| 4 | Containerization | [4](#4-containerization) |
| 5 | Demo — planning an itinerary | [5](#5-demo--planning-an-itinerary) |
| 8 | Data from this itinerary | [8](#8-data-from-this-itinerary) |
| 9 | Swapping and updating checkpoints | [9](#9-swapping-and-updating-checkpoints) |

---

## 1. The GitHub

**Repository:** https://github.com/madongue/globetrotter-capstone

```
globetrotter-capstone/
├── app/                    Flask backend — the Phase 1 monolith
│   ├── __init__.py         create_app(): config, blueprints, rate limiting
│   ├── auth.py             register, login, JWT, password reset
│   ├── itineraries.py      trips, checkpoints, payments, sharing
│   ├── resources.py        catalogue and discovery
│   ├── models.py           domain reads and writes
│   ├── store.py            storage adapter — JSON or SQL
│   └── media_storage.py    uploads — local disk or Cloudinary
├── client/                 React 19 + Vite frontend
│   └── src/App.jsx         the single-page application
├── services/               Phase 2 microservices (built, not deployed)
├── data/                   JSON collections used when DATABASE_URL is unset
├── tests/                  172 tests
├── docs/                   this guide, the UML, requirements, architecture
├── Dockerfile              one container: builds the SPA, runs gunicorn
├── docker-compose.yml      five containers: the Phase 2 split
└── .github/workflows/      CI — tests on every push, including on Postgres
```

**Points worth making:**

- Continuous integration runs on every push: `.github/workflows/`. Four jobs,
  one of which runs the whole suite against a real PostgreSQL service
  container, so the SQL backend is tested and not merely written.
- 172 tests, all passing. Run them with `python -m pytest`.
- The commit history shows the phases: JSON storage first, then the storage
  adapter, then Postgres, then the media adapter.

---

## 2. The UML design

Seven diagrams are in **[docs/uml.md](uml.md)**: use case, class, component,
two sequence diagrams, activity, and deployment. They are written in Mermaid,
so GitHub renders them on the page — open the file in the browser and they are
already drawn.

The two most worth walking through are the sequence diagrams, because they
answer points 5 and 9 directly.

One thing to be ready to explain from the class diagram: **`Stage` is derived,
not stored.** Checkpoints are rebuilt from the itinerary's hotel, activities and
places every time the trip is saved. That design decision is what makes point 9
interesting — see section 9 below.

---

## 3. Data source design

**Answer: both, chosen at runtime. JSON files by default, PostgreSQL when
`DATABASE_URL` is set. Not MySQL.**

The switch is a storage adapter in **[app/store.py](../app/store.py)**:

```python
def get_store(database_url=None, path_resolver=None):
    url = database_url if database_url is not None else os.environ.get("DATABASE_URL", "")
    if url:
        return SqlDocumentStore(url)
    return JsonFileStore(path_resolver)
```

`DocumentStore` is an abstract base class with two implementations:

| | `JsonFileStore` | `SqlDocumentStore` |
| --- | --- | --- |
| Storage | one file per collection under `data/` | one `documents` table |
| Concurrency | `filelock` around each read-modify-write | Postgres advisory locks |
| Durability | atomic writes — temp file, then `os.replace()` | transactions |
| Used for | local development, the test suite | deployment |

The SQL schema is deliberately one table, not one per entity:

```python
Table("documents",
      Column("collection", String(64), primary_key=True),
      Column("doc_key",    String(255), primary_key=True),
      Column("ordinal",    Integer, nullable=False),
      Column("data",       JSON().with_variant(JSONB, "postgresql"), nullable=False))
```

**Why this shape.** The application's records are documents with varying fields
(a place from OpenStreetMap has different keys from a curated one). Storing the
document in a `JSONB` column keeps both backends reading and writing the same
structure, so the adapter can be swapped without touching a single line of
`models.py` or any route. `ordinal` preserves insertion order, which the JSON
files gave for free.

**Current data**, all of which is real, in `data/`:

| Collection | Records |
| --- | --- |
| places | 845 |
| hotels | 373 |
| audit_log | 116 |
| media | 44 |
| destinations | 11 |
| itineraries | 10 |
| activities | 9 |
| users | 3 |

The migration from JSON to Postgres is scripted in
`scripts/migrate_json_to_db.py`, and it was verified by comparing all 1,337
documents byte for byte after the move.

**If asked why not MySQL:** the catalogue records are documents of varying
shape, and Postgres `JSONB` indexes and queries them natively. MySQL's JSON
type is weaker for this, and Render — where the app is deployed — offers
managed Postgres.

---

## 4. Containerization

### What runs today

One container, built by **[Dockerfile](../Dockerfile)**, in two stages:

1. `node:20-alpine` installs the frontend dependencies and runs `npm run build`.
2. `python:3.11-slim` installs the Python dependencies, copies the source, and
   copies the built SPA out of stage 1.

Only the second stage ships, so Node and the frontend dependencies never reach
production. It runs under gunicorn — 2 workers × 4 threads — not the Flask
development server.

### What happens if the app is split into multiple containers

This is the question to prepare for. **[docker-compose.yml](../docker-compose.yml)**
already defines the split, and the code is in **[services/](../services/)**:

| Container | Port | Responsibility |
| --- | --- | --- |
| gateway | 5000 | routes requests to the services below |
| user-service | 8001 | registration, login, JWT |
| itinerary-service | 8002 | trips and checkpoints |
| recommendation-service | 8003 | suggestions |
| destination-service | 8004 | the catalogue |

**What gets better**

- Each service scales on its own. The catalogue is read constantly and the
  itinerary service is written to rarely, so they no longer have to be sized
  together.
- A crash is contained. If the recommendation service fails, sign-in and saved
  trips keep working.
- Deployments are independent — the catalogue can ship without redeploying auth.
- The teams and the code both get clearer boundaries.

**What gets harder — be honest about these**

1. **Shared state stops being shared.** Today every blueprint calls
   `models.py`, which calls one store. Split apart, each service needs its own
   database, and a trip that references a place now crosses a service boundary.
   *This is the single biggest change.* The JSON backend cannot survive the
   split at all: five containers writing the same file would corrupt it, and
   `filelock` does not work across containers. **Splitting forces Postgres.**
2. **A function call becomes a network call.** Building an itinerary reads
   hotels, activities and places. In one process that is three function calls;
   across services it is three HTTP round trips that can time out, arrive out of
   order, or partially fail.
3. **Transactions no longer hold.** Creating an itinerary and debiting a payment
   currently succeed or fail together. Across two services that guarantee is
   gone and has to be rebuilt — a saga, or an outbox, or accepting eventual
   consistency.
4. **Authentication has to be distributed.** The JWT is verified in-process
   today. Every service would need the signing secret, or the gateway verifies
   once and forwards a trusted identity.
5. **Rate limiting breaks.** `Flask-Limiter` currently counts in memory, per
   worker. Across containers the counters would need Redis to be shared.
6. **Debugging costs more.** One stack trace becomes five logs that must be
   correlated by a request id.

### It was actually run, and it found two real defects

All five services were started locally on ports 8001–8004 and 5000, and the
whole flow was driven through the gateway: register and log in via
user-service, list destinations via destination-service, then generate a plan
and swap, edit and delete its checkpoints via itinerary-service. Every step
returned 200 or 201.

Two defects appeared only once the app was split, and both are worth
describing, because they *are* the answer to this question:

1. **A routing gap.** The gateway named each forwarded route by hand, so the
   itinerary service's newer routes — quick planning, checkpoint reordering,
   packing lists, expenses — were unreachable through it. The service had them;
   the gateway did not forward them. In a monolith a route exists as soon as it
   is written; behind a gateway it has to be published twice, and forgetting the
   second time is a silent 404. Fixed with a catch-all forward for
   `/itineraries/…` and `/trips/…` so the two stay in step.
2. **A timeout that only a network can have.** Generating a plan scans 845
   places and 373 hotels and takes about 6 seconds against the JSON backend. In
   one process nobody notices. Through the gateway it exceeded the 5-second
   proxy budget and returned `502 upstream service unavailable` — for a request
   that had actually **succeeded** upstream. The work was done, the itinerary
   was saved, and the caller was told it had failed. Fixed by raising the budget
   to 30 seconds (`UPSTREAM_TIMEOUT_SECONDS`).

The second is the better story: splitting turns a function call into a network
call, and a network call has a deadline, a partial-failure mode, and a way to
lie to the caller that a function call simply does not have.

Both fixes are pinned by tests in `tests/test_gateway.py`.

**The honest summary:** the split is built, and the request path was verified
end to end by running all five services. It has **not** been run under Docker —
Docker is not installed on the development machine — so `docker-compose.yml` is
written and configured but untested. It is not deployed either, because at this
scale the monolith is the correct choice. The value of having built it is that
the boundaries are proven, and that splitting surfaced two failures the
monolith structurally cannot have.

---

## 5. Demo — planning an itinerary

> The detailed form asked for a title, an area, a region, a division, a
> subdivision, a city, a quarter, a hotel, a hotel cost, an activity, an
> activity cost, a place, a place cost and two dates before it would create
> anything. That is fourteen fields, and it is what ran out of time in the
> previous presentation. A one-step path has been added and made the default.

### The short demo — about 20 seconds

1. Sign in.
2. **Itineraries** in the sidebar.
3. The first panel on the page is **"Plan a trip in one step"**.
4. Type a destination — `Kribi`, `Yaounde`, `Limbe` and `Buea` all have good
   catalogue coverage. The field offers the ten main cities as you type.
5. Set the number of days.
6. Click **Build my itinerary**.

The plan opens immediately with its checkpoints, its map, its dates and its
total cost. Nothing else needs to be filled in.

### What the server does

`POST /api/itineraries/quick` — `create_quick_itinerary()` in
[app/itineraries.py](../app/itineraries.py):

1. Matches hotels, places and activities against the destination.
2. Ranks the matches: curated first, then real names over generic ones
   ("Hotel"), then sightseeing over eateries, then places with their own
   photograph, then rating.
3. Selects roughly two stops per day, with eateries capped at a quarter of the
   stops.
4. Sets the dates from today for the requested length.
5. Totals the cost, builds the checkpoints, plans the route, and saves.

**Worth mentioning if asked about the ranking.** 594 of the 845 catalogue
places are restaurants, because most of the catalogue comes from OpenStreetMap.
Ranking by name alone produced a plan made entirely of bars in alphabetical
order. The category ranking and the eatery cap in `_quick_plan_rank()` and
`_balanced_stop_selection()` are what turn the catalogue into a day out.

### The detailed path still exists

Lower on the same page, under **"Create itinerary in detail"**. Nothing was
removed — a second, shorter path was added alongside it.

---

## 8. Data from this itinerary

Everything the plan carries. `GET /api/itineraries/<id>` returns all of it, and
the detail page shows it.

**Identity and ownership** — `id`, `owner_username`, `participants`,
`shared_with`, `shared_permissions`, `visibility`, `created_at`, `updated_at`.

**The trip** — `title`, `location` plus the inferred Cameroon geography
(`region`, `division`, `subdivision`, `city`, `quarter`), `start_date`,
`end_date`, `duration_days`, `notes`.

**The plan** — `hotel`, `activities`, `places_to_visit`, and the derived
`stages`, each carrying `id`, `type`, `name`, `location`, `cost`,
`duration_hours`, `status`, `checklist` and `map_info`.

**Money** — `cost_breakdown` (hotel, activities, places, total), `currency`,
`currency_label`, `payment_method`, `payment_status`, `expenses`, and payment
receipts with a commission rate.

**Progress** — `progress` (status, current stage, completed stages, percent),
`stage_summary` (total duration, completed and active counts), `day_plans`,
`packing_list`, `documents`.

**Navigation** — `route_plan` with the ordered stops, the estimated stop count
and a Google Maps directions link; `map_info` with coordinates per checkpoint.

**Governance** — every change is written to the audit log with the user, the
action, the entity and a timestamp. `GET /api/itineraries/<id>/audit` returns
the trail for one trip.

**A good line to have ready.** A trip generated for Kribi over 3 days comes back
with 8 checkpoints, a total of 140,000 FCFA, dated from today, with coordinates
for every stop and a route plan ready to open in Google Maps — from two fields.

**Export.** `GET /api/itineraries/<id>/export.pdf` produces a PDF of the plan.

---

## 9. Swapping and updating checkpoints

**Answer: yes — swap, reorder, edit and remove, all saved.**

### Show it

On any open itinerary, scroll to **Trip stages**. Each checkpoint is numbered
and carries four controls:

| Control | Effect |
| --- | --- |
| ↑ | swap with the checkpoint above |
| ↓ | swap with the checkpoint below |
| Edit | change the name, cost or duration inline |
| Remove | drop the checkpoint |

Move one and the numbered list, the map and the **Trip progress** panel all
reorder together, because they read the same saved order. Reload the page and
the change is still there.

### The endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `PATCH` | `/api/itineraries/<id>/stages` | reorder — `{move, direction}`, `{swap: [a, b]}`, or `{stage_ids: [...]}` |
| `PATCH` | `/api/itineraries/<id>/stages/<stage_id>` | change name, location, cost, duration or status |
| `DELETE` | `/api/itineraries/<id>/stages/<stage_id>` | remove a checkpoint |

### The interesting part — why this was not trivial

Checkpoints are **derived**, not stored. `_build_stage_plan()` rebuilds them
from the hotel, the activities and the places on every save, always in that
fixed order. So reordering the list in memory would be undone by the very next
save of the trip.

Two changes make reordering durable:

1. **`stage_order`** — the traveller's sequence is persisted on the itinerary as
   a list of checkpoint ids. After each rebuild, `_apply_stage_order()` re-sorts
   the fresh stages to follow it. Anything added since keeps its natural place
   at the end.
2. **`_ensure_stage_ids()`** — a checkpoint's id used to fall back to its
   position in the list, which is stable only until one is deleted, at which
   point every later checkpoint silently inherits its neighbour's id, and with
   it that neighbour's stored order, progress and checklist. The positional id
   is now written onto the record the first time it is seen, pinning the id to
   the record instead of to the slot.

Editing has the same shape: a change to a checkpoint is written back to the
hotel, activity or place it came from, because writing it to the derived stage
would be discarded on the next rebuild. `_source_record_for_stage()` does that
lookup.

There are **16 tests** covering this in `tests/test_itineraries.py`, including
one that swaps two checkpoints, then saves an unrelated field, then reloads, to
prove the order survives the rebuild, and one that deletes a checkpoint and
asserts the remaining ids did not shift.

---

## Running it

```bash
# Backend
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest                      # 172 tests

# Frontend
cd client && npm install && npm run build

# One container
docker build -t globetrotter-app .
docker run -p 5000:5000 -v "$(pwd)/data:/globetrotter/data" globetrotter-app

# Five containers — the Phase 2 split (configured, not yet run under Docker)
docker compose up

# The same split without Docker — what was actually verified
SECRET_KEY=dev python -m flask --app services.user_service.main:app          run --port 8001
SECRET_KEY=dev python -m flask --app services.itinerary_service.main:app     run --port 8002
SECRET_KEY=dev python -m flask --app services.recommendation_service.main:app run --port 8003
SECRET_KEY=dev python -m flask --app services.destination_service.main:app   run --port 8004
SECRET_KEY=dev   USER_SERVICE_URL=http://127.0.0.1:8001   ITINERARY_SERVICE_URL=http://127.0.0.1:8002   RECOMMENDATION_SERVICE_URL=http://127.0.0.1:8003   DESTINATION_SERVICE_URL=http://127.0.0.1:8004   python -m flask --app services.gateway.main:app run --port 5000
```

**Live deployment:** https://globetrotter-capstone-1-kuqk.onrender.com
