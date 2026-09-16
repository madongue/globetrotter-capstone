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

/** The one-step planner behind "Generate my itinerary". */
export const quickPlan = ({ location, days }, { token } = {}) =>
  request('/itineraries/quick', { method: 'POST', body: { location, days }, token });

/**
 * An empty trip, for someone who would rather choose every stop themselves.
 *
 * The same endpoint the detailed form has always used; only `title` and
 * `location` are required, so "plan manually" needs no extra questions.
 */
export const createTrip = ({ title, location, startDate, endDate }, { token } = {}) =>
  request('/itineraries', {
    method: 'POST',
    body: {
      title,
      location,
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
    },
    token,
  });

export const getTrip = (tripId, { token, signal } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}`, { token, signal });

export const updateTrip = (tripId, changes, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}`, { method: 'PUT', body: changes, token });

/* ----------------------------------------------------------- checkpoints */

/** Move one checkpoint relative to its neighbour. The order is saved. */
export const moveCheckpoint = (tripId, stageId, direction, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/stages`, {
    method: 'PATCH', body: { move: stageId, direction }, token,
  });

export const reorderCheckpoints = (tripId, stageIds, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/stages`, {
    method: 'PATCH', body: { stage_ids: stageIds }, token,
  });

/** Rename, reprice or retime a checkpoint. Writes through to its source record. */
export const updateCheckpoint = (tripId, stageId, changes, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/stages/${encodeURIComponent(stageId)}`, {
    method: 'PATCH', body: changes, token,
  });

export const removeCheckpoint = (tripId, stageId, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/stages/${encodeURIComponent(stageId)}`, {
    method: 'DELETE', token,
  });

/* ------------------------------------------------------------- day plans */

export const getDayPlans = (tripId, { token, signal } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/day-plans`, { token, signal });

/** Rewrite which checkpoints fall on which day. */
export const saveDayPlans = (tripId, dayPlans, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/day-plans`, {
    method: 'PATCH', body: { day_plans: dayPlans }, token,
  });

/* ----------------------------------------------------------------- route */

export const getRoute = (tripId, { token, signal } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/route`, { token, signal });

/** Recompute the route, optionally in a given checkpoint order. */
export const optimiseRoute = (tripId, stageIds, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/route`, {
    method: 'POST', body: stageIds ? { stage_ids: stageIds } : {}, token,
  });

/* ------------------------------------------------------------ community */

export const listGroups = ({ token, signal } = {}) => request('/groups', { token, signal });

export const getGroup = (groupId, { token, signal } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}`, { token, signal });

export const createGroup = ({ name, description }, { token } = {}) =>
  request('/groups', { method: 'POST', body: { name, description }, token });

export const joinGroup = (groupId, { token } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/join`, { method: 'POST', body: {}, token });

export const leaveGroup = (groupId, { token } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/leave`, { method: 'POST', body: {}, token });

export const listDiscussions = (groupId, { token, signal } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/discussions`, { token, signal });

/**
 * Start a discussion.
 *
 * `type` and `location` are optional; omitting them yields the record this
 * endpoint has always produced. Membership is required, which is why the
 * composer joins first when it needs to.
 */
export const createDiscussion = (groupId, { title, message, type, location }, { token } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/discussions`, {
    method: 'POST',
    body: { title, message, ...(type ? { type } : {}), ...(location ? { location } : {}) },
    token,
  });

export const replyToDiscussion = (groupId, discussionId, message, { token } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/discussions/${encodeURIComponent(discussionId)}/reply`, {
    method: 'POST', body: { message }, token,
  });

/** One call flips the like, so the caller need not know its current state. */
export const likeDiscussion = (groupId, discussionId, { token } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/discussions/${encodeURIComponent(discussionId)}/like`, {
    method: 'POST', body: {}, token,
  });

export const listMedia = ({ token, signal } = {}) => request('/media', { token, signal });

/* --------------------------------------------------------------- public */

export const getStats = ({ signal } = {}) => request('/stats', { signal });
