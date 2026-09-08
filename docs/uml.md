# UML design

Diagrams for GlobeTrotter. They are written in Mermaid, so GitHub renders them
directly on this page — nothing needs to be installed to read them.

Each diagram names the files it describes, so a claim here can be checked
against the code.

---

## 1. Use case diagram

Who uses the system and what they can do.

```mermaid
graph LR
    Traveller(("Traveller"))
    Admin(("Administrator"))
    Maps["OpenStreetMap<br/>tiles + geocoding"]
    Cloud["Cloudinary<br/>media hosting"]

    subgraph GlobeTrotter
        UC1["Register / sign in"]
        UC2["Plan a trip in one step"]
        UC3["Build an itinerary in detail"]
        UC4["Swap and edit checkpoints"]
        UC5["Browse the Cameroon catalogue"]
        UC6["Share a trip with another traveller"]
        UC7["Join a community group"]
        UC8["Upload photos and videos"]
        UC9["Record payments and expenses"]
        UC10["Moderate places and users"]
        UC11["Ask the travel assistant"]
    end

    Traveller --> UC1
    Traveller --> UC2
    Traveller --> UC3
    Traveller --> UC4
    Traveller --> UC5
    Traveller --> UC6
    Traveller --> UC7
    Traveller --> UC8
    Traveller --> UC9
    Traveller --> UC11
    Admin --> UC10
    Admin --> UC1

    UC2 -.->|includes| UC5
    UC4 -.->|extends| UC2
    UC11 -.->|reads| UC5
    UC5 --> Maps
    UC8 --> Cloud
```

---

## 2. Class diagram

The domain objects and how they relate. `Itinerary` is the centre of the model:
everything else either belongs to one or is referenced by one.

```mermaid
classDiagram
    class User {
        +str username
        +str phone
        +str password_hash
        +str role
        +datetime created_at
        +datetime last_active_at
    }

    class Itinerary {
        +str id
        +str owner_username
        +str title
        +str location
        +date start_date
        +date end_date
        +str visibility
        +list~str~ stage_order
        +dict cost_breakdown
        +dict progress
        +add_place()
        +reorder_checkpoints()
        +share_with()
    }

    class Stage {
        +str id
        +str type
        +str name
        +float cost
        +float duration_hours
        +str status
        +dict map_info
    }

    class Hotel {
        +str id
        +str name
        +str location
        +float cost_per_night
    }

    class Place {
        +str id
        +str name
        +str category
        +float cost
        +float latitude
        +float longitude
        +str image_url
    }

    class Activity {
        +str id
        +str name
        +float cost
        +float duration_hours
    }

    class Group {
        +str id
        +str name
        +list~str~ members
        +list~Message~ messages
    }

    class Media {
        +str id
        +str url
        +str kind
        +str uploaded_by
    }

    class Payment {
        +str id
        +float amount
        +str method
        +str status
        +datetime paid_at
    }

    User "1" --> "*" Itinerary : owns
    User "*" --> "*" Itinerary : shared with
    User "*" --> "*" Group : belongs to
    User "1" --> "*" Media : uploads
    Itinerary "1" *-- "*" Stage : derived checkpoints
    Itinerary "1" --> "0..1" Hotel : books
    Itinerary "1" --> "*" Place : visits
    Itinerary "1" --> "*" Activity : does
    Itinerary "1" --> "*" Payment : records
    Group "1" --> "*" Itinerary : discusses
```

**Note on `Stage`.** A stage is a *derived* object, not a stored one. It is
rebuilt from the itinerary's hotel, activities and places on every save by
`_build_stage_plan()` in [app/itineraries.py](../app/itineraries.py). That is why
the traveller's chosen order has to be persisted separately, as `stage_order` —
see the sequence diagram in section 4.

---

## 3. Component diagram

How the running system is put together today (Phase 1, one container).

```mermaid
graph TB
    Browser["Browser<br/>React 19 SPA"]

    subgraph Container["Single container — Dockerfile"]
        Gunicorn["gunicorn<br/>2 workers x 4 threads"]
        subgraph Flask["Flask app — app/main.py"]
            Auth["auth.py<br/>register, login, JWT"]
            Itin["itineraries.py<br/>trips, checkpoints, payments"]
            Res["resources.py<br/>catalogue, discovery"]
            Comm["community.py<br/>groups, media"]
        end
        Store["store.py<br/>DocumentStore adapter"]
        Static["client/dist<br/>built SPA"]
    end

    Json[("data/*.json<br/>JSON files")]
    Pg[("PostgreSQL<br/>documents table")]

    Browser -->|HTTPS /api| Gunicorn
    Browser -->|HTML, JS, CSS| Static
    Gunicorn --> Flask
    Auth --> Store
    Itin --> Store
    Res --> Store
    Comm --> Store
    Store -->|DATABASE_URL unset| Json
    Store -->|DATABASE_URL set| Pg
```

---

## 4. Sequence diagram — planning a trip in one step

The short path, added because the detailed form took too long to complete
during a live demonstration.

```mermaid
sequenceDiagram
    actor T as Traveller
    participant UI as React SPA
    participant API as POST /api/itineraries/quick
    participant Cat as Catalogue matcher
    participant DB as DocumentStore

    T->>UI: types "Kribi", 3 days
    T->>UI: clicks "Build my itinerary"
    UI->>API: {location, days} + JWT
    API->>API: verify token
    API->>Cat: match hotels, places, activities for Kribi
    Cat->>DB: read hotels, places, activities
    DB-->>Cat: candidate records
    Cat->>Cat: rank (curated, sightseeing, photo, rating)
    Cat->>Cat: cap eateries at a quarter of the stops
    Cat-->>API: 1 hotel, 3 activities, 6 places
    API->>API: set dates, build checkpoints, total the cost
    API->>DB: save itinerary
    API-->>UI: 201 {itinerary, matched}
    UI-->>T: opens the plan with 8 checkpoints
```

---

## 5. Sequence diagram — swapping a checkpoint

Shows why the order must be stored rather than simply reordered in place.

```mermaid
sequenceDiagram
    actor T as Traveller
    participant UI as React SPA
    participant API as PATCH /api/itineraries/{id}/stages
    participant Sync as _sync_itinerary_calculations
    participant DB as DocumentStore

    T->>UI: clicks ↑ on checkpoint 3
    UI->>API: {move: "place-4", direction: "up"}
    API->>DB: load itinerary
    API->>API: check edit permission
    API->>API: swap ids in the order list
    API->>API: store as itinerary.stage_order
    API->>Sync: recalculate
    Sync->>Sync: rebuild stages from hotel/activities/places
    Note over Sync: the rebuild would lose the new order,<br/>so _apply_stage_order re-sorts by stage_order
    Sync->>Sync: recompute cost, duration, route plan
    API->>DB: save itinerary
    API-->>UI: 200 {itinerary}
    UI-->>T: list, map and progress all reorder
```

---

## 6. Activity diagram — creating an itinerary

Both paths through the feature, side by side.

```mermaid
flowchart TD
    Start([Traveller opens Itineraries]) --> Choice{Which path?}

    Choice -->|One step| Q1[Type destination]
    Q1 --> Q2[Choose number of days]
    Q2 --> Q3[Click 'Build my itinerary']
    Q3 --> Q4[Server picks hotel, places, activities]
    Q4 --> Q5{Anything catalogued<br/>for this place?}
    Q5 -->|Yes| Done
    Q5 -->|No| Q6[Save empty plan<br/>and say so] --> Done

    Choice -->|In detail| D1[Type title and location]
    D1 --> D2[Pick region, division, city]
    D2 --> D3[Request suggestions]
    D3 --> D4[Enter hotel and cost]
    D4 --> D5[Enter activity and cost]
    D5 --> D6[Enter place and cost]
    D6 --> D7[Set dates and visibility]
    D7 --> D8[Submit] --> Done

    Done[Itinerary opens with checkpoints] --> Edit{Adjust it?}
    Edit -->|Swap| E1[↑ / ↓ reorder] --> Edit
    Edit -->|Change| E2[Edit name, cost, duration] --> Edit
    Edit -->|Drop| E3[Remove checkpoint] --> Edit
    Edit -->|Done| End([Trip ready to share, book or export])
```

---

## 7. Deployment diagram

What runs where today, and what Phase 2 changes.

```mermaid
graph TB
    subgraph Now["Phase 1 — deployed today on Render"]
        direction TB
        C1["globetrotter-app container<br/>gunicorn + Flask + built SPA"]
        D1[("Postgres<br/>or data/*.json")]
        C1 --> D1
    end

    subgraph Next["Phase 2 — docker-compose.yml, not yet deployed"]
        direction TB
        GW["gateway :5000"]
        S1["user-service :8001"]
        S2["itinerary-service :8002"]
        S3["recommendation-service :8003"]
        S4["destination-service :8004"]
        GW --> S1
        GW --> S2
        GW --> S3
        GW --> S4
    end

    Now -.->|split by blueprint| Next
```

---

## Where each diagram comes from

| Diagram | Code it describes |
| --- | --- |
| Use case | [app/auth.py](../app/auth.py), [app/itineraries.py](../app/itineraries.py), [app/community.py](../app/community.py), [app/admin.py](../app/admin.py), [app/assistant.py](../app/assistant.py) |
| Class | [app/models.py](../app/models.py), `_build_stage_plan()` in [app/itineraries.py](../app/itineraries.py) |
| Component | [app/main.py](../app/main.py), [app/store.py](../app/store.py), [Dockerfile](../Dockerfile) |
| Quick-plan sequence | `create_quick_itinerary()` in [app/itineraries.py](../app/itineraries.py) |
| Checkpoint sequence | `reorder_itinerary_stages()` and `_apply_stage_order()` in [app/itineraries.py](../app/itineraries.py) |
| Activity | `handleQuickPlan()` and `handleCreateItinerary()` in [client/src/App.jsx](../client/src/App.jsx) |
| Deployment | [Dockerfile](../Dockerfile), [docker-compose.yml](../docker-compose.yml), [services/](../services/) |
