# What each role can do

**GlobeTrotter — capability reference**

Two roles: **traveller** (`user`) and **administrator** (`admin`). Everything below
is drawn from the routes the application actually serves — 136 API rules, of
which about 106 are distinct (`/trips/*` is a registered alias of
`/itineraries/*`). Where something is deliberately *not* possible, it says so,
because a capability list that only lists capabilities is half an answer.

---

## 1. How a role is decided

| | |
|---|---|
| Default on registration | `user` |
| Becoming the first administrator | Set `ADMIN_USERNAMES` (comma-separated) in the environment, then register with exactly that username |
| Afterwards | Any administrator can promote or demote any account from the Accounts table on `/admin` |
| Self-demotion | Refused. An administrator cannot remove their own admin role, so the platform cannot be left with none |

There is no "first registered user becomes admin" rule. That is deliberate: on a
host with non-persistent storage the user list can reset to empty, and whoever
registered next would inherit the platform.

---

## 2. Signed out

A visitor with no account can:

- Browse the whole catalogue — **845 places, 373 hotels, 9 activities, 11 destinations**
- Open any place's detail page: description, cost, region, photographs, map
- See a place on an interactive map, and open directions in Google Maps
- Search and filter the catalogue, and use autocomplete
- Read the public statistics on the home page
- **Ask the assistant** about places, costs and how the app works
- Register, sign in, and request a password reset

They cannot save anything, plan anything, or see other travellers.

---

## 3. What a traveller can do

### Account

- Register with a username, phone number and password
- Sign in with **either** the username or the phone number
- Sign in with Google, if a `GOOGLE_CLIENT_ID` is configured
- Request a password reset and set a new password with the token
- Edit their travel interests, which reorder what they are recommended
- Switch the interface between **English and French**
- Switch the display currency (FCFA, EUR, USD, GBP, NGN) — prices are recorded in FCFA and converted for display
- Read and dismiss their notifications
- Sign out

### Discovering

- Browse and filter all 845 places by category, region and free text
- Open a place: description, typical cost, region, opening context, offline guide
- See the place on a Leaflet map, and get directions to it
- See traveller **photographs and videos** attached to a place
- Read and write **reviews** and **comments** on a place
- See what is **nearby** a place — other places, hotels and activities
- **Save** a place for later, and browse everything they have saved
- Get personalised **recommendations** and suggested cities

### Planning a trip

- **Create a trip in two fields** — a destination and a number of days; the app fills in the hotel, the places and a day-by-day plan
- Create a trip manually instead
- **Generate** a fuller itinerary with budget and preference inputs
- Add any catalogue place to an existing trip
- **Reorder checkpoints** — move one up or down, or reorder the whole list
- **Edit a checkpoint** — its name, cost and duration
- **Remove a checkpoint**
- Move a checkpoint to a different day
- Rename the trip, and set its start and end dates
- See and edit the **day-by-day plan** (Day 1 / Day 2 / Day 3)
- See the **route** across the trip, optimise the order of stops, and open the whole route in Google Maps
- See the trip on a **map** with every checkpoint marked
- See a **cost breakdown** — accommodation, activities, places, total
- Keep a **packing list**, **expenses**, **reservations** and **trip documents**
- Track **progress** through the trip while travelling
- Record a **payment** and get a receipt
- Export the trip as a **PDF**, or as a **calendar `.ics` file**
- Read the trip's **audit trail** — every change, who made it and when

### Sharing a trip

- Share a trip with another traveller as **viewer** or **editor**
- Upgrade a viewer to an editor
- Invite someone by link or email token
- Make a trip **public**, so the community can see it
- A viewer can read but not edit (403); someone with no access gets **404, not 403**, so trip IDs cannot be probed
- Only the owner may share — an editor cannot re-share

### The community

- Create a group, browse groups, **join** and **leave**
- Post a **discussion** in a group, reply to one, and like a reply
- **Live chat** in a group, delivered on a two-second cursor
- **Audio and video calls** with another member of a group *(see the limits in §6)*
- Post **photos and videos** — uploaded from the device, or by web address
- Like and comment on other travellers' photos
- Browse **public trips from the community**, and for each one:
  - **Copy** it into their own account (dates cleared, so it becomes theirs)
  - **Join** it, becoming a participant on the owner's trip
  - **Rate** it 1–5 with a comment

### Contributing to the catalogue

- **Suggest a place** the catalogue is missing (place, hotel or activity)
- **Suggest a correction** to an entry that already exists — a wrong price, a changed name
- See their own submissions and what became of each: pending, approved or rejected

Neither goes live directly. Both queue for an administrator.

### The assistant

- Ask about places, costs, hotels, and how any feature works
- Ask about **their own trips** — what they have, where it goes, what it costs
- Be offered **what to do next**, chosen from what their role can actually do

---

## 4. What an administrator can additionally do

An administrator is a traveller with more. Everything in §3 still applies.

### Analytics — `/admin`

Twelve live figures, grouped by the question they answer:

| Group | Figures |
|---|---|
| People | registered accounts · active today · administrators · community groups |
| Planning | itineraries created · shared publicly · photos posted |
| Catalogue | places · hotels · activities |
| Review queue | pending suggestions, out of the total ever submitted |

All counted from live data. Nothing is sampled or estimated.

### Reviewing what travellers send in

- See every pending suggestion, who sent it and when
- For a **correction**, see exactly which fields would change, and the reason given
- **Approve** — a new suggestion joins the catalogue; a correction is applied to the existing entry, and only the fields that actually changed
- **Reject**, with a note the submitter can read
- A decision is final: the same request cannot be approved twice

### Accounts and roles

- List every account, with its role and interests
- Search accounts by name
- **Promote** an account to administrator
- **Demote** an administrator back to a traveller
- Cannot demote themselves

### The catalogue directly

- Create, edit and delete places, hotels and activities
- Attach photographs and videos, and set map coordinates
- Edit a place's information and its location

### The assistant, as an administrator

Asking the same questions returns administrator answers, read from the same
collections the dashboard reads:

- *"How many users do I have?"* → the account and administrator counts
- *"What is waiting for review?"* → the actual pending items, named, with who sent each
- *"Who are the administrators?"* → the list

And it offers administrator actions — the review queue, the analytics, the
accounts table. **A traveller asking those exact questions gets none of it**, and
is not told the review queue exists.

---

## 5. What the assistant does and does not do

Every answer ends with up to three things to do next, chosen for the role
asking. The list is never empty.

Most of them navigate. One **acts**: name a destination and the first action
builds that trip and opens it — *"Create a 3-day trip to Limbe"* creates the
trip, with its hotel, places and day-by-day plan, rather than opening the
planning page and forgetting where you said you were going.

What it will **not** do is act without being asked. It never approves a
suggestion, changes a role, deletes anything, or spends money on its own
reading of a sentence — those stay one deliberate click by the person
accountable for them. Creating a trip is safe to offer because it is additive,
reversible, and exactly what was just described.

It also answers only from the application's own data, so it will say a place is
not in the catalogue rather than invent one.

---

## 6. Honest limits

Things people reasonably expect that this application does **not** do:

| | |
|---|---|
| **Calls are two people** | WebRTC peer-to-peer is a connection between two browsers. Three or more needs a media server to mix the streams. |
| **Calls need a cooperative network** | STUN only, no TURN relay. On the same Wi-Fi or most home connections calls connect; on some mobile networks no direct path exists and the call will fail — the interface says so rather than spinning. |
| **Chat is polled, not pushed** | Two-second cursor rather than WebSockets, because the app runs multiple workers with no shared broker. Correct under any number of workers; a two-second delay is the cost. |
| **Uploaded files are not permanent on the free tier** | They go to local disk, which Render discards on redeploy. Setting `CLOUDINARY_URL` switches to cloud storage; the code path already exists. |
| **`opening_hours` is not a field** | No place record carries opening times, so nothing can display them. |
| **No password change while signed in** | Only the forgotten-password flow can set a new one. |
| **Metrics are per process** | `/api/metrics` counts one worker's requests. A single platform-wide number needs a collector such as Prometheus — Phase 4. |

---

## 7. Where to find each thing

| Capability | Screen | Served by |
|---|---|---|
| Discovery, place detail | `/explore`, `/places/:id` | `app/resources.py`, `app/destinations.py` |
| Planning, checkpoints, map, budget | `/trips`, `/trips/:id` | `app/itineraries.py` |
| Payments, documents, packing, audit | `/trips/:id/manage` | `app/itineraries.py` |
| Groups, discussions, chat, calls | `/community`, `/community/:id` | `app/chat.py`, `app/calls.py`, `app/itineraries.py` |
| Photos and videos | `/media` | `app/itineraries.py`, `app/media_storage.py` |
| Saved places | `/saved` | `app/itineraries.py` (wishlist) |
| Suggestions and corrections | `/suggest` | `app/resources.py` |
| Account, language, currency | `/profile`, `/settings` | `app/auth.py` |
| Analytics, review queue, roles | `/admin` | `app/auth.py`, `app/resources.py` |
| The assistant | every screen | `app/assistant.py` |
