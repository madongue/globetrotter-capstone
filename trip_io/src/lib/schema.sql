-- =============================================================================
-- trip_io — Supabase schema
--
-- The app currently reads from src/data and persists user state to
-- localStorage. The shapes in src/types mirror these tables one-to-one, so
-- moving to Supabase is a change of data source rather than of interface.
--
-- Row-level security is on for every table holding user data: without it,
-- Supabase's anon key would let any visitor read every user's favourites.
-- =============================================================================

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- users
-- Profile data. Authentication itself lives in auth.users; this row is created
-- on signup and referenced by everything else.
-- -----------------------------------------------------------------------------
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  name         text not null,
  avatar_color text not null default '#22D3EE',
  language     text not null default 'en' check (language in ('en', 'fr')),
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- categories
-- Bilingual by design: Cameroon is officially bilingual, so a category has two
-- labels rather than one label and a translation table bolted on later.
-- -----------------------------------------------------------------------------
create table public.categories (
  id      text primary key,
  icon    text not null,
  name_en text not null,
  name_fr text not null,
  sort    integer not null default 0
);

-- -----------------------------------------------------------------------------
-- destinations
-- -----------------------------------------------------------------------------
create table public.destinations (
  id                    uuid primary key default uuid_generate_v4(),
  slug                  text not null unique,
  name                  text not null,
  quarter               text not null,
  city                  text not null default 'Yaoundé',
  summary_en            text not null,
  summary_fr            text not null,
  description_en        text not null,
  description_fr        text not null,
  image_url             text,
  -- True when image_url shows the city rather than this exact place, so the
  -- interface can say so instead of implying a photo it does not have.
  image_is_contextual   boolean not null default false,
  lat                   double precision not null,
  lng                   double precision not null,
  price_from            integer,            -- FCFA; 0 means free, null unknown
  price_note_en         text,
  price_note_fr         text,
  opening_hours         jsonb,              -- [{day, opens, closes}]
  visit_minutes         integer not null default 60,
  tags                  text[] not null default '{}',
  featured              boolean not null default false,
  hidden_gem            boolean not null default false,
  -- Denormalised from reviews so listing pages do not need an aggregate.
  rating                numeric(2,1) not null default 0,
  review_count          integer not null default 0,
  created_at            timestamptz not null default now()
);

create index destinations_quarter_idx on public.destinations (quarter);
create index destinations_rating_idx  on public.destinations (rating desc);
create index destinations_tags_idx    on public.destinations using gin (tags);

-- A destination belongs to several categories, so this is its own table
-- rather than an array column: it keeps the join indexable and the category
-- vocabulary referentially intact.
create table public.destination_categories (
  destination_id uuid not null references public.destinations (id) on delete cascade,
  category_id    text not null references public.categories (id) on delete restrict,
  primary key (destination_id, category_id)
);

create index destination_categories_category_idx
  on public.destination_categories (category_id);

-- -----------------------------------------------------------------------------
-- favorites
-- -----------------------------------------------------------------------------
create table public.favorites (
  user_id        uuid not null references public.users (id) on delete cascade,
  destination_id uuid not null references public.destinations (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, destination_id)
);

-- -----------------------------------------------------------------------------
-- reviews
-- One review per user per destination, enforced by the primary key.
-- -----------------------------------------------------------------------------
create table public.reviews (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.users (id) on delete cascade,
  destination_id uuid not null references public.destinations (id) on delete cascade,
  rating         smallint not null check (rating between 1 and 5),
  body           text,
  created_at     timestamptz not null default now(),
  unique (user_id, destination_id)
);

create index reviews_destination_idx on public.reviews (destination_id);

-- -----------------------------------------------------------------------------
-- itineraries
-- -----------------------------------------------------------------------------
create table public.itineraries (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.users (id) on delete cascade,
  title          text not null,
  date           date,
  duration_hours integer not null default 8,
  interests      text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create table public.itinerary_items (
  id               uuid primary key default uuid_generate_v4(),
  itinerary_id     uuid not null references public.itineraries (id) on delete cascade,
  -- Null for a break such as lunch, which is a stop on the day but not a place.
  destination_id   uuid references public.destinations (id) on delete set null,
  start_minutes    integer not null,   -- minutes from midnight
  duration_minutes integer not null,
  position         integer not null,
  note             text
);

create index itinerary_items_itinerary_idx
  on public.itinerary_items (itinerary_id, position);

-- -----------------------------------------------------------------------------
-- submissions
-- User-proposed places, held for moderation before they reach destinations.
-- -----------------------------------------------------------------------------
create table public.submissions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users (id) on delete cascade,
  name         text not null,
  category_id  text references public.categories (id),
  description  text not null,
  address      text not null,
  website      text,
  hours        text,
  price        text,
  contact      text,
  photos       text[] not null default '{}',
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  review_note  text,
  submitted_at timestamptz not null default now()
);

create index submissions_status_idx on public.submissions (status, submitted_at desc);

-- -----------------------------------------------------------------------------
-- community
-- -----------------------------------------------------------------------------
create table public.community_posts (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.users (id) on delete cascade,
  destination_id uuid references public.destinations (id) on delete set null,
  body           text not null,
  images         text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create index community_posts_created_idx on public.community_posts (created_at desc);

create table public.community_comments (
  id         uuid primary key default uuid_generate_v4(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- Likes as rows rather than a counter, so a user cannot like twice and the
-- count is always derivable from the truth.
create table public.community_likes (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- =============================================================================
-- Row-level security
-- =============================================================================

alter table public.users              enable row level security;
alter table public.favorites          enable row level security;
alter table public.reviews            enable row level security;
alter table public.itineraries        enable row level security;
alter table public.itinerary_items    enable row level security;
alter table public.submissions        enable row level security;
alter table public.community_posts    enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes    enable row level security;

-- Destinations and categories are public reference data: guests browse without
-- an account, so these stay readable and are written only by the service role.
alter table public.destinations enable row level security;
alter table public.categories   enable row level security;

create policy "destinations are public"
  on public.destinations for select using (true);
create policy "categories are public"
  on public.categories for select using (true);

create policy "read own profile"
  on public.users for select using (auth.uid() = id);
create policy "update own profile"
  on public.users for update using (auth.uid() = id);

create policy "own favorites"
  on public.favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own itineraries"
  on public.itineraries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own itinerary items"
  on public.itinerary_items for all
  using (
    exists (
      select 1 from public.itineraries i
      where i.id = itinerary_id and i.user_id = auth.uid()
    )
  );

create policy "own submissions"
  on public.submissions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reviews and community content are readable by everyone but writable only by
-- their author.
create policy "reviews are public"     on public.reviews for select using (true);
create policy "write own review"       on public.reviews for insert with check (auth.uid() = user_id);
create policy "update own review"      on public.reviews for update using (auth.uid() = user_id);

create policy "posts are public"       on public.community_posts for select using (true);
create policy "write own post"         on public.community_posts for insert with check (auth.uid() = user_id);
create policy "delete own post"        on public.community_posts for delete using (auth.uid() = user_id);

create policy "comments are public"    on public.community_comments for select using (true);
create policy "write own comment"      on public.community_comments for insert with check (auth.uid() = user_id);

create policy "likes are public"       on public.community_likes for select using (true);
create policy "toggle own like"        on public.community_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- Keep the denormalised rating honest
-- =============================================================================

create or replace function public.refresh_destination_rating()
returns trigger language plpgsql security definer as $$
begin
  update public.destinations d
  set rating = coalesce(
        (select round(avg(r.rating)::numeric, 1) from public.reviews r
         where r.destination_id = d.id), 0),
      review_count = (select count(*) from public.reviews r
                      where r.destination_id = d.id)
  where d.id = coalesce(new.destination_id, old.destination_id);
  return null;
end;
$$;

create trigger reviews_refresh_rating
after insert or update or delete on public.reviews
for each row execute function public.refresh_destination_rating();
