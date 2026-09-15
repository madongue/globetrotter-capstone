import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';

/**
 * Loading and searching the Cameroon catalogue.
 *
 * The catalogue is 901 places, 373 hotels and 9 activities, and the places
 * alone are 1.3 MB and take two seconds to serve. Waiting for all of it before
 * showing anything would make Explore feel broken, so it arrives in two
 * stages:
 *
 *   1. the first 120 places, already ranked by the server — fast enough to
 *      paint immediately, and the best entries are at the front;
 *   2. the rest, in the background, after which filtering and search cover the
 *      whole catalogue.
 *
 * `complete` says which stage we are in, so the interface can be honest about
 * whether a search has seen everything yet.
 */

const FIRST_PAGE = 120;

/**
 * Categories as a traveller thinks of them, mapped onto what the catalogue
 * actually stores. The catalogue has fifteen category values; a filter bar
 * with fifteen chips is a database browser, not a travel app.
 */
export const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'sites', label: 'Tourist sites' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'restaurants', label: 'Restaurants' },
];

const SIGHTSEEING = new Set([
  'national_park', 'waterfall', 'beach', 'mountain', 'natural_site', 'nature',
  'viewpoint', 'museum', 'heritage', 'monument', 'religious', 'market',
  'man_made_site',
]);

const FOOD = new Set(['restaurant', 'bar', 'cafe']);

/** Which filter chip an entry belongs under. */
export function categoryOf(item) {
  if (item.__kind === 'hotel') return 'hotels';
  const category = (item.category || '').toLowerCase();
  if (FOOD.has(category)) return 'restaurants';
  if (SIGHTSEEING.has(category)) return 'sites';
  return 'sites';
}

/** A readable label for a raw catalogue category. */
export function categoryLabel(item) {
  if (item.__kind === 'hotel') return 'Hotel';
  if (item.__kind === 'activity') return 'Experience';
  const raw = (item.category || '').replace(/_/g, ' ').trim();
  if (!raw) return 'Place';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * True when the image shows the surrounding city rather than this place.
 *
 * The catalogue flags these, and only 46 of 901 places carry a photograph of
 * their own. Labelling the stand-ins is the honest option: a generic city shot
 * presented as a photograph of one specific waterfall is a difference the
 * traveller discovers on arrival.
 */
export const isContextualImage = (item) =>
  Boolean(item.image_is_contextual) ||
  (typeof item.image_url === 'string' && item.image_url.startsWith('/images/destinations/'));

const norm = (value) => (value || '').toString().toLowerCase();

export function useCatalogue() {
  const [places, setPlaces] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [activities, setActivities] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(null);

  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        // Stage one: enough to fill the screen, ranked best-first.
        const [firstPage, dests] = await Promise.all([
          api.listPlaces({ limit: FIRST_PAGE, signal }),
          api.listDestinations({ signal }),
        ]);
        if (aborted.current) return;
        setPlaces(firstPage || []);
        setDestinations(dests || []);
        setLoading(false);

        // Stage two: the rest, so search and filters see the whole catalogue.
        const [allPlaces, allHotels, allActivities] = await Promise.all([
          api.listPlaces({ signal }),
          api.listHotels({ signal }),
          api.listActivities({ signal }),
        ]);
        if (aborted.current) return;
        setPlaces(allPlaces || []);
        setHotels(allHotels || []);
        setActivities(allActivities || []);
        setComplete(true);
      } catch (err) {
        if (aborted.current || err.name === 'AbortError') return;
        setError(err.message || 'Could not load the catalogue.');
        setLoading(false);
      }
    })();

    return () => {
      aborted.current = true;
      controller.abort();
    };
  }, []);

  /**
   * One list to search across, tagged by kind.
   *
   * Places keep the server's ranking, which puts curated and photographed
   * entries first. Hotels and activities are appended rather than interleaved
   * so that ordering survives.
   */
  const everything = useMemo(() => [
    ...places.map((p) => ({ ...p, __kind: 'place' })),
    ...activities.map((a) => ({ ...a, __kind: 'activity' })),
    ...hotels.map((h) => ({ ...h, __kind: 'hotel', cost: h.cost_per_night ?? h.cost })),
  ], [places, activities, hotels]);

  const regions = useMemo(() => {
    const seen = new Set();
    everything.forEach((item) => { if (item.region) seen.add(item.region); });
    return [...seen].sort();
  }, [everything]);

  const cities = useMemo(() => {
    const seen = new Set();
    everything.forEach((item) => { if (item.city) seen.add(item.city); });
    return [...seen].sort();
  }, [everything]);

  /** Apply the filter bar. Pure, and never re-orders what the server ranked. */
  const filter = useCallback(({ query = '', category = 'all', region = '', city = '', maxCost = null } = {}) => {
    const needle = norm(query).trim();

    return everything.filter((item) => {
      if (category !== 'all' && categoryOf(item) !== category) return false;
      if (region && item.region !== region) return false;
      if (city && item.city !== city) return false;

      if (maxCost != null) {
        const cost = Number(item.cost) || 0;
        // A free entry is always within budget; an unpriced one is not
        // excluded on a guess.
        if (cost > maxCost) return false;
      }

      if (!needle) return true;
      const haystack = norm([
        item.name, item.description, item.city, item.region,
        item.division, item.category, (item.tags || []).join(' '),
      ].join(' '));
      return haystack.includes(needle);
    });
  }, [everything]);

  return {
    places, hotels, activities, destinations, everything,
    regions, cities, filter,
    loading, complete, error,
    total: everything.length,
  };
}
