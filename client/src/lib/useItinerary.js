import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';

/**
 * One trip, and everything the editor does to it.
 *
 * Every mutation goes to an endpoint that already exists and already knows the
 * rules — reordering persists through `stage_order`, editing writes back to
 * the hotel/activity/place a checkpoint was derived from, costs are
 * recalculated server-side. None of that is reimplemented here.
 *
 * Each endpoint returns the whole updated itinerary, so the hook replaces its
 * state from the response rather than patching a local copy and hoping the two
 * stay in step.
 */

/** Where a derived day starts when no real time is recorded. */
const DAY_START_MINUTES = 9 * 60;

/** Accommodation is a base for the day, not a stop on the clock. */
const isLodging = (stage) => stage?.type === 'hotel';

const pad = (n) => String(n).padStart(2, '0');

export const formatClock = (minutes) => {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(Math.round(wrapped % 60))}`;
};

export const formatDuration = (hours) => {
  const total = Math.round((Number(hours) || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${m} min`;
};

export const formatMoney = (value, label = 'FCFA') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return `${Math.round(amount).toLocaleString('en-US')} ${label}`;
};

export function useItinerary(tripId, token) {
  const [trip, setTrip] = useState(null);
  const [dayPlans, setDayPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  /** Replace local state from a mutation response. */
  const absorb = useCallback((payload) => {
    const next = payload?.itinerary || payload;
    if (next?.id) {
      setTrip(next);
      if (Array.isArray(next.day_plans)) setDayPlans(next.day_plans);
    }
    return next;
  }, []);

  const load = useCallback(async (signal) => {
    if (!tripId || !token) { setLoading(false); return; }
    try {
      const [tripPayload, dayPayload] = await Promise.all([
        api.getTrip(tripId, { token, signal }),
        api.getDayPlans(tripId, { token, signal }).catch(() => null),
      ]);
      setTrip(tripPayload);
      setDayPlans(dayPayload?.day_plans || tripPayload?.day_plans || []);
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.status === 404 ? 'notfound' : (err.message || 'Could not load this trip.'));
    } finally {
      setLoading(false);
    }
  }, [tripId, token]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Run one mutation, keeping a single in-flight edit at a time. */
  const mutate = useCallback(async (fn) => {
    setBusy(true);
    try {
      absorb(await fn());
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message || 'That change could not be saved.' };
    } finally {
      setBusy(false);
    }
  }, [absorb]);

  const moveCheckpoint = useCallback(
    (stageId, direction) => mutate(() => api.moveCheckpoint(tripId, stageId, direction, { token })),
    [mutate, tripId, token],
  );

  const editCheckpoint = useCallback(
    (stageId, changes) => mutate(() => api.updateCheckpoint(tripId, stageId, changes, { token })),
    [mutate, tripId, token],
  );

  const deleteCheckpoint = useCallback(
    (stageId) => mutate(() => api.removeCheckpoint(tripId, stageId, { token })),
    [mutate, tripId, token],
  );

  const addPlace = useCallback(
    (placeId) => mutate(() => api.addPlaceToTrip(tripId, placeId, { token })),
    [mutate, tripId, token],
  );

  const renameTrip = useCallback(
    (title) => mutate(() => api.updateTrip(tripId, { title }, { token })),
    [mutate, tripId, token],
  );

  const setDates = useCallback(
    (startDate, endDate) => mutate(() => api.updateTrip(tripId, { start_date: startDate, end_date: endDate }, { token })),
    [mutate, tripId, token],
  );

  /** Move a checkpoint to another day by rewriting the day plan. */
  const moveToDay = useCallback(async (stageId, targetDayId) => {
    const next = dayPlans.map((plan) => ({
      ...plan,
      stage_ids: plan.id === targetDayId
        ? [...plan.stage_ids.filter((id) => id !== stageId), stageId]
        : plan.stage_ids.filter((id) => id !== stageId),
    }));
    setBusy(true);
    try {
      const payload = await api.saveDayPlans(tripId, next, { token });
      setDayPlans(payload?.day_plans || next);
      if (payload?.itinerary) setTrip(payload.itinerary);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    } finally {
      setBusy(false);
    }
  }, [dayPlans, tripId, token]);

  const refreshRoute = useCallback(
    () => mutate(() => api.optimiseRoute(tripId, (trip?.stages || []).map((s) => s.id), { token })),
    [mutate, tripId, token, trip],
  );

  /**
   * The itinerary as days of checkpoints, with a suggested clock.
   *
   * The catalogue records how long a stop takes but not what time it starts,
   * so times are derived: each day opens at 09:00 and each stop follows the
   * one before it. The interface labels them as suggestions — presenting a
   * derived time as a fixed one would be inventing a fact about the place.
   *
   * Accommodation is lifted out as the day's base rather than consuming
   * 48 hours of the running clock.
   */
  const days = useMemo(() => {
    if (!trip) return [];
    const byId = new Map((trip.stages || []).map((s) => [s.id, s]));

    const plans = dayPlans.length > 0
      ? dayPlans
      // No day plan yet (a manually created trip): treat the whole thing as
      // one day rather than showing nothing.
      : [{ id: 'day-1', day: 1, title: 'Day 1', date: trip.start_date, stage_ids: (trip.stages || []).map((s) => s.id) }];

    const placed = new Set();

    const built = plans.map((plan) => {
      const stages = (plan.stage_ids || []).map((id) => byId.get(id)).filter(Boolean);
      stages.forEach((s) => placed.add(s.id));

      const lodging = stages.filter(isLodging);
      const stops = stages.filter((s) => !isLodging(s));

      let clock = DAY_START_MINUTES;
      const scheduled = stops.map((stage) => {
        const startMinutes = clock;
        clock += Math.round((Number(stage.duration_hours) || 1) * 60);
        return { ...stage, startMinutes };
      });

      return {
        ...plan,
        lodging,
        stops: scheduled,
        cost: stages.reduce((sum, s) => sum + (Number(s.cost) || 0), 0),
        hours: stops.reduce((sum, s) => sum + (Number(s.duration_hours) || 0), 0),
      };
    });

    // A checkpoint added after the day plan was written belongs somewhere
    // rather than vanishing from the page.
    const orphans = (trip.stages || []).filter((s) => !placed.has(s.id));
    if (orphans.length > 0 && built.length > 0) {
      const last = built[built.length - 1];
      let clock = DAY_START_MINUTES + last.stops.reduce((sum, s) => sum + Math.round((Number(s.duration_hours) || 1) * 60), 0);
      orphans.filter((s) => !isLodging(s)).forEach((stage) => {
        last.stops.push({ ...stage, startMinutes: clock, isNew: true });
        clock += Math.round((Number(stage.duration_hours) || 1) * 60);
      });
      last.lodging.push(...orphans.filter(isLodging));
    }

    return built;
  }, [trip, dayPlans]);

  return {
    trip, days, dayPlans, loading, error, busy,
    reload: load,
    // Exposed so a component that has already been handed the updated
    // itinerary by a mutation can apply it without a second request.
    // NOTE: `reload` takes an AbortSignal, so it must never be used as a
    // pass-through callback for a payload -- the payload lands in fetch's
    // `signal` and throws.
    absorb,
    moveCheckpoint, editCheckpoint, deleteCheckpoint, addPlace,
    moveToDay, renameTrip, setDates, refreshRoute,
  };
}
