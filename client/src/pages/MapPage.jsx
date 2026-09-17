import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, Crosshair, ExternalLink, Heart, MapPin, Navigation, Plus, Search, X,
} from 'lucide-react';
import {
  Badge, Button, Chip, Field, Input, SearchInput, Select, Textarea,
  ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import TravelMap from '../TravelMap';
import { useTranslatedPage } from '../lib/i18n';
import { CATEGORY_FILTERS, categoryLabel, useCatalogue } from '../lib/useCatalogue';
import { useAuth, useSavedPlaces, useTrips } from '../lib/useTravellerData';
import { formatMoney } from '../lib/useItinerary';
import * as api from '../lib/api';
import './map-page.css';

/**
 * The whole application on one map.
 *
 * Four things share it, which is the point: the catalogue, the trips the
 * traveller is on, how far through one of them they are, and where they are
 * standing. Each is a layer that can be turned off, because a map showing
 * everything at once shows nothing.
 *
 * On the data
 * -----------
 * The pins carry what the catalogue actually holds -- the name, what kind of
 * place it is, where it sits administratively, the typical cost, and for the
 * curated entries the season, the transport note and the safety notes. What
 * it deliberately does not do is pull Google's own listings: that needs a
 * billed API key this deployment does not have, and copying their place data
 * into ours would breach their terms. Every place instead links out to Google
 * Maps for the things they do better -- live opening hours, reviews,
 * turn-by-turn directions -- which is a link, not a copy.
 */

/** Pins drawn at once. Leaflet renders each itself; see the note in Explore. */
const PIN_LIMIT = 400;

const BLANK_DRAFT = { name: '', description: '', cost: '' };

function coordsOf(item) {
  const lat = Number(item?.latitude ?? item?.map_info?.latitude);
  const lon = Number(item?.longitude ?? item?.map_info?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return null;
  return [lat, lon];
}

const directionsTo = ([lat, lon]) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

function MapPageInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();

  const { token, isAuthenticated } = useAuth();
  const catalogue = useCatalogue();
  const { trips, reloadTrips } = useTrips(token);
  const { isSaved, toggleSaved } = useSavedPlaces(token);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showTrips, setShowTrips] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  // Where the traveller is, and whether they asked to be followed.
  const [here, setHere] = useState(null);
  const [following, setFollowing] = useState(false);
  const watchId = useRef(null);
  const lastSent = useRef(0);

  // Dropping a new place on the map.
  const [placing, setPlacing] = useState(false);
  const [dropped, setDropped] = useState(null);
  const [draft, setDraft] = useState(BLANK_DRAFT);

  /* ------------------------------------------------------ catalogue pins */

  const results = useMemo(
    () => catalogue.filter({ query, category }),
    [catalogue, query, category],
  );

  const placePins = useMemo(() => results.reduce((pins, item) => {
    if (pins.length >= PIN_LIMIT) return pins;
    const position = coordsOf(item);
    if (position) {
      pins.push({
        id: `place-${item.__kind}-${item.id}`,
        name: item.name,
        location: [item.city, item.region].filter(Boolean).join(', '),
        position,
        variant: 'place',
        entry: item,
      });
    }
    return pins;
  }, []), [results]);

  /* ---------------------------------------------------------- trip pins */

  const tripPins = useMemo(() => {
    if (!showTrips) return [];
    return trips.flatMap((trip) => {
      // `progress.completed_stages` is the server's record of what has been
      // reached; a checkpoint in it is drawn as done rather than pending.
      const done = new Set(trip.progress?.completed_stages || []);
      return (trip.stages || []).map((stage) => {
        const position = coordsOf(stage) || coordsOf(stage.map_info ? stage : null);
        if (!position) return null;
        return {
          id: `trip-${trip.id}-${stage.id}`,
          name: stage.name,
          location: `${trip.title} · ${stage.location || ''}`.trim(),
          position,
          variant: done.has(stage.id) ? 'done' : 'trip',
          entry: { ...stage, __trip: trip, __done: done.has(stage.id) },
        };
      }).filter(Boolean);
    });
  }, [showTrips, trips]);

  const markers = useMemo(() => {
    const all = [...placePins, ...tripPins];
    if (here) {
      all.push({
        id: 'me', name: 'You are here', position: here, variant: 'me',
      });
    }
    if (dropped) {
      all.push({ id: 'dropped', name: 'New place', position: dropped, variant: 'trip' });
    }
    return all;
  }, [placePins, tripPins, here, dropped]);

  /* ------------------------------------------------------ live position */

  const stopFollowing = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setFollowing(false);
  }, []);

  // A watch left running keeps the GPS awake and the battery draining long
  // after the page is gone.
  useEffect(() => stopFollowing, [stopFollowing]);

  const startFollowing = () => {
    if (!navigator.geolocation) {
      toast.push('This browser cannot report a location.', 'error');
      return;
    }
    setFollowing(true);
    watchId.current = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        setHere([coords.latitude, coords.longitude]);

        /* Shared with the trip, but not on every reading: a watch fires as
           often as the GPS has an opinion, and writing each one would be a
           request a second for a position that has moved a few metres. */
        const now = Date.now();
        const trip = trips[0];
        if (trip && now - lastSent.current > 15000) {
          lastSent.current = now;
          try {
            await api.updateTripTracking(
              trip.id,
              { latitude: coords.latitude, longitude: coords.longitude },
              { token },
            );
          } catch { /* the map still shows it; only sharing failed */ }
        }
      },
      (error) => {
        stopFollowing();
        toast.push(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was refused.'
            : 'Could not read your location.',
          'error',
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  };

  /* ---------------------------------------------------------- selection */

  const onMarkerClick = (marker) => {
    if (marker.id === 'me' || marker.id === 'dropped') return;
    setSelected(marker);
  };

  const onMapClick = ({ latitude, longitude }) => {
    if (!placing) return;
    setDropped([latitude, longitude]);
  };

  /* ------------------------------------------------------------ actions */

  const addToTrip = async (place, tripId) => {
    setBusy(true);
    try {
      await api.addPlaceToTrip(tripId, place.id, { token });
      await reloadTrips();
      toast.push(`${place.name} added to your trip.`);
    } catch (error) {
      toast.push(error.message || 'Could not add it.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createTripHere = async (place) => {
    setBusy(true);
    try {
      const where = place.city || place.location || place.region;
      const result = await api.quickPlan({ location: where, days: 3 }, { token });
      const trip = result?.itinerary || result;
      if (!trip?.id) throw new Error('The trip came back without an id.');
      await api.addPlaceToTrip(trip.id, place.id, { token }).catch(() => {});
      toast.push(`Trip to ${where} created.`);
      navigate(`/trips/${trip.id}`);
    } catch (error) {
      toast.push(error.message || 'Could not build a trip there.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async (place) => {
    const result = await toggleSaved(place.id);
    if (!result.ok) toast.push(result.reason || 'Could not save it.', 'error');
    else toast.push(result.saved ? `${place.name} saved.` : `${place.name} removed.`);
  };

  const submitDropped = async (event) => {
    event.preventDefault();
    if (!dropped) return;
    setBusy(true);
    try {
      await api.submitPlaceRequest({
        type: 'places',
        name: draft.name.trim(),
        // The point is the truth here; the town name is only for reading.
        location: selectedRegionName || 'Cameroon',
        description: draft.description.trim(),
        cost: draft.cost === '' ? 0 : Number(draft.cost),
        latitude: dropped[0],
        longitude: dropped[1],
      }, { token });
      setDropped(null);
      setDraft(BLANK_DRAFT);
      setPlacing(false);
      toast.push('Sent for review with the exact position you picked.');
    } catch (error) {
      toast.push(error.message || 'Could not send that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // The nearest catalogue entry gives the dropped point a plausible town,
  // which is better than asking someone to type one they may not know.
  const selectedRegionName = useMemo(() => {
    if (!dropped) return '';
    let best = null;
    let bestDistance = Infinity;
    placePins.forEach((pin) => {
      const d = (pin.position[0] - dropped[0]) ** 2 + (pin.position[1] - dropped[1]) ** 2;
      if (d < bestDistance) { bestDistance = d; best = pin; }
    });
    return best?.location || '';
  }, [dropped, placePins]);

  const entry = selected?.entry;
  const isTripPin = Boolean(entry?.__trip);

  return (
    <div ref={pageRef} className="gt mapp">
      <TopBar
        isAuthenticated={isAuthenticated}
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Cards</Button>}
      />

      <main className="mapp__main">
        <div className="gt-page"><Breadcrumbs /></div>

        {/* ------------------------------------------------------ controls */}
        <div className="gt-page mapp__controls">
          <SearchInput
            icon={<Search size={16} />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the map"
            aria-label="Search the map"
          />
          <div className="mapp__chips">
            {CATEGORY_FILTERS.map((filter) => (
              <Chip
                key={filter.id}
                active={category === filter.id}
                onClick={() => setCategory(filter.id)}
              >
                {filter.label}
              </Chip>
            ))}
          </div>

          <div className="mapp__layers">
            {isAuthenticated && (
              <Chip active={showTrips} onClick={() => setShowTrips((v) => !v)}>
                <MapPin size={13} aria-hidden="true" /> My trips
              </Chip>
            )}
            <Chip
              active={following}
              onClick={() => (following ? stopFollowing() : startFollowing())}
            >
              <Crosshair size={13} aria-hidden="true" />
              {following ? 'Following you' : 'Where am I'}
            </Chip>
            {isAuthenticated && (
              <Chip
                active={placing}
                onClick={() => { setPlacing((v) => !v); setDropped(null); }}
              >
                <Plus size={13} aria-hidden="true" /> Add a place
              </Chip>
            )}
          </div>

          <p className="mapp__count gt-caption gt-muted">
            {placePins.length < results.length
              ? `${placePins.length} of ${results.length.toLocaleString('en-US')} shown — narrow the search to map the rest.`
              : `${placePins.length} place${placePins.length === 1 ? '' : 's'} on the map.`}
            {showTrips && tripPins.length > 0 && ` ${tripPins.length} checkpoints from your trips.`}
            {placing && ' Tap the map to drop a point.'}
          </p>
        </div>

        {/* ----------------------------------------------------- the map */}
        <div className={`mapp__canvas-wrap${placing ? ' is-placing' : ''}`}>
          <TravelMap
            markers={markers}
            className="mapp__canvas"
            ariaLabel="Every place, your trips and your position, on one map"
            onMarkerClick={onMarkerClick}
            onMapClick={placing ? onMapClick : undefined}
            // Fit once to whatever is loaded; after that the view is the
            // reader's, not the filter's.
            fitBounds={!selected && !dropped}
          />

          {/* ------------------------------------------- selected place */}
          {selected && (
            <aside className="mapp__panel">
              <button
                type="button"
                className="mapp__close"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>

              <h2 className="mapp__name">{selected.name}</h2>
              <p className="mapp__where">
                <MapPin size={13} aria-hidden="true" /> {selected.location || 'Cameroon'}
              </p>

              {isTripPin ? (
                <>
                  <p className="mapp__badges">
                    <Badge tone={entry.__done ? 'success' : 'warning'}>
                      {entry.__done ? 'Reached' : 'Still to visit'}
                    </Badge>
                    {entry.duration_hours > 0 && (
                      <Badge tone="neutral">{entry.duration_hours} h</Badge>
                    )}
                  </p>
                  <div className="mapp__actions">
                    <Button size="sm" onClick={() => navigate(`/trips/${entry.__trip.id}`)}>
                      Open this trip
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => window.open(directionsTo(selected.position), '_blank', 'noopener')}
                    >
                      <Navigation size={14} aria-hidden="true" /> Directions
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mapp__badges">
                    <Badge tone="primary">{categoryLabel(entry) || 'Place'}</Badge>
                    {entry?.cost > 0
                      ? <Badge tone="neutral">{formatMoney(entry.cost, 'FCFA')}</Badge>
                      : <Badge tone="success">Free</Badge>}
                    {entry?.rating > 0 && <Badge tone="neutral">★ {entry.rating}</Badge>}
                  </p>

                  {entry?.description && (
                    <p className="mapp__desc">{entry.description}</p>
                  )}

                  {/* Facts the catalogue holds and nothing has ever shown. */}
                  <dl className="mapp__facts">
                    {entry?.best_season && (
                      <div><dt>Best season</dt><dd>{entry.best_season}</dd></div>
                    )}
                    {entry?.transport_note && (
                      <div><dt>Getting there</dt><dd>{entry.transport_note}</dd></div>
                    )}
                    {entry?.difficulty && (
                      <div><dt>Difficulty</dt><dd>{entry.difficulty}</dd></div>
                    )}
                    {entry?.guide_required && (
                      <div><dt>Guide</dt><dd>Recommended</dd></div>
                    )}
                    <div>
                      <dt>Position</dt>
                      <dd>{selected.position[0].toFixed(4)}, {selected.position[1].toFixed(4)}</dd>
                    </div>
                  </dl>

                  {(entry?.safety_notes || []).length > 0 && (
                    <ul className="mapp__safety">
                      {entry.safety_notes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  )}

                  <div className="mapp__actions">
                    {isAuthenticated && trips.length > 0 && (
                      <Field label="Add to a trip">
                        <Select
                          defaultValue=""
                          disabled={busy}
                          onChange={(e) => e.target.value && addToTrip(entry, e.target.value)}
                        >
                          <option value="">Choose a trip…</option>
                          {trips.map((trip) => (
                            <option key={trip.id} value={trip.id}>{trip.title}</option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    {isAuthenticated && (
                      <Button size="sm" disabled={busy} onClick={() => createTripHere(entry)}>
                        <Plus size={14} aria-hidden="true" /> Build a trip here
                      </Button>
                    )}

                    {isAuthenticated && (
                      <Button size="sm" variant="secondary" onClick={() => save(entry)}>
                        <Heart size={14} fill={isSaved(entry.id) ? 'currentColor' : 'none'} aria-hidden="true" />
                        {isSaved(entry.id) ? 'Saved' : 'Save'}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => window.open(directionsTo(selected.position), '_blank', 'noopener')}
                    >
                      <Navigation size={14} aria-hidden="true" /> Directions
                    </Button>

                    <Button size="sm" variant="ghost" onClick={() => navigate(`/places/${entry.id}`)}>
                      <ExternalLink size={14} aria-hidden="true" /> Full page
                    </Button>
                  </div>
                </>
              )}
            </aside>
          )}

          {/* -------------------------------------------- a dropped point */}
          {dropped && (
            <aside className="mapp__panel mapp__panel--drop">
              <button
                type="button"
                className="mapp__close"
                onClick={() => setDropped(null)}
                aria-label="Discard this point"
              >
                <X size={16} />
              </button>

              <h2 className="mapp__name">A place here</h2>
              <p className="mapp__where">
                {dropped[0].toFixed(5)}, {dropped[1].toFixed(5)}
                {selectedRegionName && <> · near {selectedRegionName}</>}
              </p>

              <form className="mapp__form" onSubmit={submitDropped}>
                <Field label="What is it called?">
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Ekom Nkam Waterfalls"
                    required
                  />
                </Field>
                <Field label="Typical cost (FCFA)" hint="0 if it is free">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={draft.cost}
                    onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
                    placeholder="0"
                  />
                </Field>
                <Field label="What makes it worth the trip?" hint="Optional">
                  <Textarea
                    rows={3}
                    maxLength={400}
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  />
                </Field>
                <Button type="submit" size="sm" disabled={busy || !draft.name.trim()}>
                  <Check size={14} aria-hidden="true" /> Send for review
                </Button>
                <p className="gt-caption gt-muted">
                  An administrator reviews it. The position you picked is kept exactly.
                </p>
              </form>
            </aside>
          )}
        </div>

        {/* -------------------------------------------------------- legend */}
        <div className="gt-page mapp__legend">
          <span><i className="mapp__key mapp__key--place" /> Catalogue</span>
          {showTrips && <span><i className="mapp__key mapp__key--trip" /> On your trip</span>}
          {showTrips && <span><i className="mapp__key mapp__key--done" /> Already reached</span>}
          {here && <span><i className="mapp__key mapp__key--me" /> You</span>}
        </div>
      </main>

      <TabBar isAuthenticated={isAuthenticated} />
    </div>
  );
}

export default function MapPage() {
  return <ToastProvider><MapPageInner /></ToastProvider>;
}
