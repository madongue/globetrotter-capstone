/**
 * A thin transport layer over the existing GlobeTrotter API.
 *
 * Deliberately thin. Every function here is one fetch and one shape check —
 * no ranking, no filtering, no pricing, no business rules. Those live on the
 * server and stay there; duplicating them in the client is how two versions of
 * the truth start to disagree.
 *
 * It exists so that the redesigned pages have one place to look for an
 * endpoint, rather than scattering `fetch(...)` through the components.
 */

const API_BASE = '/api';

/** The key App.jsx already uses; the redesigned pages share the same session. */
export const TOKEN_KEY = 'gt_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    // Private windows and blocked site data throw rather than return null.
    return '';
  }
}

async function request(path, { method = 'GET', body, token, signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* ------------------------------------------------------------- catalogue */

/**
 * Places, already ranked by the server.
 *
 * The ordering is `_discovery_rank` in app/resources.py: curated entries with
 * their own photograph first, then anything else photographed, then the rest.
 * That ranking is the reason Explore does not look like a restaurant
 * directory, and it is not re-implemented here.
 */
export const listPlaces = ({ limit, featured, signal } = {}) => {
  const params = new URLSearchParams();
  if (featured) params.set('featured', '1');
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return request(`/resources/places${query ? `?${query}` : ''}`, { signal });
};

export const listHotels = ({ signal } = {}) => request('/resources/hotels', { signal });
export const listActivities = ({ signal } = {}) => request('/resources/activities', { signal });
export const listDestinations = ({ signal } = {}) => request('/destinations', { signal });

/**
 * One place, with everything the detail page needs.
 *
 * The server already returns the place, nearby services, traveller photos,
 * videos and an offline guide in a single response, so the page makes one
 * request rather than five.
 */
export const getPlace = (placeId, { signal } = {}) =>
  request(`/resources/places/${encodeURIComponent(placeId)}`, { signal });

export const getPlaceComments = (placeId, { token, signal } = {}) =>
  request(`/resources/places/${encodeURIComponent(placeId)}/comment`, { token, signal });

/* --------------------------------------------------------- saved places */

export const listSavedPlaces = ({ token, signal } = {}) => request('/wishlist', { token, signal });
export const savePlace = (placeId, { token } = {}) =>
  request('/wishlist', { method: 'POST', body: { place_id: placeId }, token });
export const unsavePlace = (placeId, { token } = {}) =>
  request(`/wishlist/${encodeURIComponent(placeId)}`, { method: 'DELETE', token });

/* ---------------------------------------------------------------- trips */

export const listTrips = ({ token, signal } = {}) => request('/itineraries', { token, signal });

export const addPlaceToTrip = (tripId, placeId, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/places`, {
    method: 'POST',
    body: { place_id: placeId },
    token,
  });

/** The one-step planner behind "Build my trip". */
export const quickPlan = ({ location, days }, { token } = {}) =>
  request('/itineraries/quick', { method: 'POST', body: { location, days }, token });

/* --------------------------------------------------------------- public */

export const getStats = ({ signal } = {}) => request('/stats', { signal });
