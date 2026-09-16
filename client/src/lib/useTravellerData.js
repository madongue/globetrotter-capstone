import { useCallback, useEffect, useState } from 'react';
import * as api from './api';

/**
 * The signed-in traveller's saved places and trips.
 *
 * Both are needed by Explore and by Place Details — one to render the save
 * control in the right state, the other to populate "Add to trip" — so they
 * live here rather than being fetched twice.
 *
 * Everything is optimistic: the control responds immediately and rolls back if
 * the server disagrees. Waiting 200ms to see whether a heart filled in makes
 * an interface feel broken even when it is working.
 */

export function useAuth() {
  const [token, setToken] = useState(() => api.getToken());
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Signing in or out happens in App.jsx, which writes the same key. A storage
  // event fires for other tabs; the focus check covers this one.
  useEffect(() => {
    const sync = () => setToken(api.getToken());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  // Who is signed in. Needed wherever the interface has to tell this
  // traveller's own contributions from everyone else's — their likes, their
  // group memberships, their posts.
  useEffect(() => {
    let cancelled = false;
    if (!token) { setUsername(''); return undefined; }
    fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (cancelled || !profile?.username) return;
        setUsername(profile.username);
        // Carried here so every screen that shows "you" can show your face
        // without fetching the profile again for itself.
        setAvatarUrl(profile.avatar_url || '');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  return { token, username, avatarUrl, isAuthenticated: Boolean(token) };
}

export function useSavedPlaces(token) {
  const [ids, setIds] = useState(() => new Set());
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!token) { setIds(new Set()); setItems([]); return; }
    try {
      const payload = await api.listSavedPlaces({ token });
      const list = Array.isArray(payload) ? payload : (payload?.wishlist || payload?.places || []);
      setItems(list);
      setIds(new Set(list.map((p) => p.id || p.place_id).filter(Boolean)));
    } catch {
      // A failure here should not stop the page rendering; the save controls
      // simply start in their unsaved state.
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const isSaved = useCallback((placeId) => ids.has(placeId), [ids]);

  const toggle = useCallback(async (placeId) => {
    if (!token || !placeId) return { ok: false, reason: 'auth' };

    const wasSaved = ids.has(placeId);
    setIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(placeId); else next.add(placeId);
      return next;
    });

    try {
      if (wasSaved) await api.unsavePlace(placeId, { token });
      else await api.savePlace(placeId, { token });
      load();
      return { ok: true, saved: !wasSaved };
    } catch (error) {
      // Put it back the way it was; the traveller's screen should not claim
      // something the server did not accept.
      setIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(placeId); else next.delete(placeId);
        return next;
      });
      return { ok: false, reason: error.message };
    }
  }, [token, ids, load]);

  return { savedIds: ids, savedItems: items, isSaved, toggleSaved: toggle, reloadSaved: load };
}

export function useTrips(token) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setTrips([]); return; }
    setLoading(true);
    try {
      const payload = await api.listTrips({ token });
      setTrips(Array.isArray(payload) ? payload : (payload?.itineraries || []));
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const addPlace = useCallback(async (tripId, placeId) => {
    if (!token) return { ok: false, reason: 'auth' };
    try {
      const result = await api.addPlaceToTrip(tripId, placeId, { token });
      load();
      return { ok: true, message: result?.message || 'Added to your trip.' };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }, [token, load]);

  return { trips, tripsLoading: loading, addPlaceToTrip: addPlace, reloadTrips: load };
}
