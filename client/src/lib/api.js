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

/* ------------------------------------------------------------------ chat */

export const listChatRooms = ({ token, signal } = {}) => request('/chat/rooms', { token, signal });

/**
 * Messages in a room, optionally only those newer than a cursor.
 *
 * The cursor is an ISO timestamp ending in "+00:00", and a bare plus in a
 * query string decodes to a space — so it is encoded here rather than left to
 * chance. (The server also undoes the mangling, but a client should not rely
 * on that.)
 */
export const readChat = (roomId, { since, token, signal } = {}) => {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request(`/chat/rooms/${encodeURIComponent(roomId)}/messages${query}`, { token, signal });
};

export const sendChat = (roomId, text, { token } = {}) =>
  request(`/chat/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST', body: { text }, token,
  });

/* --------------------------------------------------------------- public */

export const getStats = ({ signal } = {}) => request('/stats', { signal });

/* ------------------------------------------------------------- accounts */

/**
 * Sign in with either a username or a phone number.
 *
 * The server returns `{ token }` and nothing else -- not the role, not the
 * display name -- so a caller that needs either must follow up with
 * `getProfile`. Storing the token is the caller's job.
 */
export const login = ({ username, phone, password }) =>
  request('/login', { method: 'POST', body: { username, phone, password } });

/**
 * Register.
 *
 * `phone` is required by the server, and `preferences` must come from the
 * controlled list served by `/interests` — free text is silently dropped.
 */
export const register = ({ username, password, phone, preferences = [] }) =>
  request('/register', { method: 'POST', body: { username, password, phone, preferences } });

export const listInterests = ({ signal } = {}) => request('/interests', { signal });

export const getProfile = ({ token, signal } = {}) => request('/profile', { token, signal });

export const updateProfile = (changes, { token } = {}) =>
  request('/profile', { method: 'PATCH', body: changes, token });

export const requestPasswordReset = (username) =>
  request('/forgot-password', { method: 'POST', body: { username } });

export const resetPassword = ({ token: resetToken, password }) =>
  request('/reset-password', { method: 'POST', body: { token: resetToken, password } });

/* ---------------------------------------------------------------- media */

/**
 * Post a photo by URL.
 *
 * The server's key is `url`, and `type` defaults to "photo". `group_id` posts
 * into a group, which it refuses unless the poster has joined it.
 */
export const postMedia = ({ url, caption = '', type = 'photo', groupId = null, placeId = null }, { token } = {}) =>
  request('/media', {
    method: 'POST',
    body: { url, caption, type, group_id: groupId, place_id: placeId },
    token,
  });

export const likeMedia = (mediaId, { token } = {}) =>
  request(`/media/${encodeURIComponent(mediaId)}/like`, { method: 'POST', token });

/** The server takes `comment`, not `text`; sending the wrong key returns 400. */
export const commentOnMedia = (mediaId, comment, { token } = {}) =>
  request(`/media/${encodeURIComponent(mediaId)}/comment`, {
    method: 'POST', body: { comment }, token,
  });

/* ----------------------------------------------------------- suggestions */

export const listPlaceRequests = ({ token, signal } = {}) =>
  request('/resources/requests', { token, signal });

export const submitPlaceRequest = (submission, { token } = {}) =>
  request('/resources/requests', { method: 'POST', body: submission, token });

/**
 * Propose a correction to an entry that already exists.
 *
 * Goes through the same queue and the same approve/reject endpoints as a new
 * suggestion; only what approval does with it differs. Send just the fields
 * being corrected -- the server records the difference against the live
 * record, so anything unchanged is dropped rather than re-applied on approval.
 */
export const submitPlaceCorrection = ({ targetId, type = 'places', reason, ...fields }, { token } = {}) =>
  request('/resources/requests', {
    method: 'POST',
    body: { mode: 'edit', type, target_id: targetId, reason, ...fields },
    token,
  });

export const approvePlaceRequest = (requestId, { token } = {}) =>
  request(`/resources/requests/${encodeURIComponent(requestId)}/approve`, { method: 'POST', token });

export const rejectPlaceRequest = (requestId, note, { token } = {}) =>
  request(`/resources/requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'POST', body: { review_note: note || '' }, token,
  });

/* ---------------------------------------------------------------- admin */
//
// Every one of these is refused with 403 for a non-admin account; the screens
// that call them check the role first so the refusal is never what tells the
// user they are not allowed.

export const adminStats = ({ token, signal } = {}) => request('/admin/stats', { token, signal });

export const adminUsers = ({ token, signal } = {}) => request('/admin/users', { token, signal });

export const setUserRole = (username, role, { token } = {}) =>
  request(`/admin/users/${encodeURIComponent(username)}/role`, {
    method: 'PATCH', body: { role }, token,
  });

/* -------------------------------------------------------- notifications */

export const listNotifications = ({ token, signal } = {}) =>
  request('/notifications', { token, signal });

export const markNotificationRead = (notificationId, { token } = {}) =>
  request(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST', token });

/* ------------------------------------------------- rating, copying, joining */

/**
 * Rate a trip, with an optional comment.
 *
 * One endpoint carries both: the server requires a rating of 1-5 and treats
 * the comment as optional, so there is no way to leave a comment without a
 * rating. The reply carries the whole updated itinerary, so the caller can
 * refresh from it rather than re-fetching.
 */
export const rateTrip = (tripId, { rating, comment = '', tags = [] }, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/feedback`, {
    method: 'POST', body: { rating, comment, tags }, token,
  });

/** Duplicate a public or shared trip into your own account. */
export const copyTrip = (tripId, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/copy`, { method: 'POST', token });

/**
 * Join a trip as a participant.
 *
 * `paymentAmount` is optional; sending it also records a receipt, and for a
 * trip listed as an event it takes a seat. Omitted, joining is free.
 */
export const joinTrip = (tripId, { paymentAmount, paymentMethod = 'mobile' } = {}, { token } = {}) =>
  request(`/itineraries/${encodeURIComponent(tripId)}/join`, {
    method: 'POST',
    body: paymentAmount == null ? {} : { payment_amount: paymentAmount, payment_method: paymentMethod },
    token,
  });

/** Trips other travellers have made public. */
export const listCommunityTrips = ({ token, signal } = {}) =>
  request('/itineraries/community', { token, signal });

/** Trips the recommender suggests for this traveller. */
export const listSuggestedTrips = ({ token, signal } = {}) =>
  request('/itineraries/suggestions', { token, signal });

/**
 * Upload a photo or video file.
 *
 * Multipart, so it does not go through `request` — that sets a JSON content
 * type, and a multipart body must be left to the browser so it can add the
 * boundary. The server classifies photo vs video from the file itself.
 */
export async function uploadMedia({ file, caption = '', placeId = null, groupId = null }, { token } = {}) {
  const body = new FormData();
  body.append('file', file);
  body.append('caption', caption);
  if (placeId) body.append('place_id', placeId);
  if (groupId) body.append('group_id', groupId);

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error || `Upload failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* ----------------------------------------------------------------- calls */
//
// Signalling only. The audio and video go browser-to-browser and never touch
// the server; these carry the introduction the two peers need first.

export const startCall = ({ roomId, mode = 'video' }, { token } = {}) =>
  request('/calls', { method: 'POST', body: { room_id: roomId, mode }, token });

export const getActiveCall = (roomId, { token, signal } = {}) =>
  request(`/calls/active?room_id=${encodeURIComponent(roomId)}`, { token, signal });

export const answerCall = (callId, { token } = {}) =>
  request(`/calls/${encodeURIComponent(callId)}/answer`, { method: 'POST', token });

export const sendCallSignal = (callId, { kind, payload }, { token } = {}) =>
  request(`/calls/${encodeURIComponent(callId)}/signals`, {
    method: 'POST', body: { kind, payload }, token,
  });

/** Signals from the other peer only; your own are filtered out server-side. */
export const readCallSignals = (callId, { since, token, signal } = {}) => {
  // Same "+00:00 decodes to a space" trap the chat cursor has.
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request(`/calls/${encodeURIComponent(callId)}/signals${query}`, { token, signal });
};

export const endCall = (callId, reason, { token } = {}) =>
  request(`/calls/${encodeURIComponent(callId)}/end`, {
    method: 'POST', body: { reason: reason || 'hung_up' }, token,
  });

/* ------------------------------------------------------------- assistant */

/**
 * Ask the assistant.
 *
 * The token is read here rather than passed, because the dock is mounted on
 * every page and has no reason to care who is signed in — the server decides
 * what to answer and what to offer from the role on the account.
 */
export const askAssistant = (message) =>
  request('/assistant/chat', { method: 'POST', body: { message }, token: getToken() });

export const assistantStarters = ({ signal } = {}) =>
  request('/assistant/starters', { token: getToken(), signal });

/* ------------------------------------------------- group moderation */
//
// A traveller's group waits for review; an administrator's is live at once.
// The state lives on the group, so these are status changes rather than a
// separate request being turned into a group.

/** Groups waiting for review. Refused for anyone but an administrator. */
export const listPendingGroups = ({ token, signal } = {}) =>
  request('/groups?status=pending', { token, signal });

export const approveGroup = (groupId, note, { token } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/approve`, {
    method: 'POST', body: { note: note || '' }, token,
  });

export const rejectGroup = (groupId, note, { token } = {}) =>
  request(`/groups/${encodeURIComponent(groupId)}/reject`, {
    method: 'POST', body: { note: note || '' }, token,
  });

/* ------------------------------------------------------ profile picture */

/**
 * Upload a profile picture.
 *
 * Multipart, so it bypasses `request` for the reason uploadMedia does: a
 * multipart body must be left to the browser to build, boundary and all.
 * The server decides whether the file is an image from the file itself.
 */
export async function uploadAvatar(file, { token } = {}) {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch('/api/profile/avatar', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error || `Upload failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** Go back to the lettered circle. The stored file is left alone. */
export const removeAvatar = ({ token } = {}) =>
  request('/profile/avatar', { method: 'DELETE', token });

/** Use a picture already on the web instead of uploading one. */
export const setAvatarUrl = (avatarUrl, { token } = {}) =>
  request('/profile', { method: 'PATCH', body: { avatar_url: avatarUrl }, token });
