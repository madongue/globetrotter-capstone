import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FALLBACK_PATH, matchPath, pathFor } from './routes';

/**
 * Keep the address bar and the application's navigation state in step.
 *
 * This is the whole of the router integration. It deliberately moves no state
 * and no markup: `page` and `dashboardView` stay exactly where they were,
 * every existing `setPage(...)` call still works, and this hook only mirrors
 * the two together.
 *
 * Two hazards make this less trivial than it looks, and both are guarded:
 *
 *   1. Both effects run on the same mount pass. The URL→state effect applies
 *      "/explore", but the state→URL effect runs immediately afterwards still
 *      holding the *previous* render's `page` ("home") and would push "/" over
 *      the address the visitor actually asked for. So the state→URL effect
 *      skips its first invocation outright.
 *
 *   2. A URL naming a trip is applied before that trip has been fetched, so
 *      for a moment the state says "itinerary page" with no itinerary. The
 *      state→URL effect would compute "/trips" from that and navigate away
 *      from the deep link mid-load. It therefore stays quiet while an entity
 *      fetch is outstanding.
 *
 * @param {object}   o
 * @param {string}   o.page             current top-level screen
 * @param {string}   o.view             current dashboard section
 * @param {Function} o.setPage
 * @param {Function} o.setView
 * @param {string}   [o.entityId]       id of the open trip or group, if any
 * @param {Function} [o.onEntityRoute]  called when a URL names an entity that
 *                                      is not the one currently open, so the
 *                                      page can load it — this is what makes a
 *                                      pasted link to a trip actually work.
 *                                      May return a promise; the hook waits.
 */
export function useRouteSync({ page, view, setPage, setView, entityId, onEntityRoute }) {
  const location = useLocation();
  const navigate = useNavigate();

  const stateToUrlHasRun = useRef(false);
  const pendingEntity = useRef(null);
  const lastEntityHandled = useRef(null);
  /* Some screens hang a fixed segment off the entity id — /trips/:id/manage.
     The state alone cannot say which of those variants is open, so the last
     matched suffix is remembered; without it the state→URL effect would
     rewrite /trips/:id/manage back to /trips/:id and bounce the visitor out
     of the screen they asked for. */
  const activeSuffix = useRef(undefined);

  /* ---------------------------------------------------------- URL → state */
  useEffect(() => {
    const match = matchPath(location.pathname);

    if (!match) {
      // An unknown path. Send it somewhere real rather than rendering a screen
      // at an address that does not describe it.
      if (location.pathname !== FALLBACK_PATH) navigate(FALLBACK_PATH, { replace: true });
      return;
    }

    activeSuffix.current = match.suffix;

    if (match.page !== page) setPage(match.page);
    if (match.view && match.view !== view) setView(match.view);

    // A URL naming an entity we do not currently have open: a pasted link, a
    // refresh, or the back button returning to a trip.
    if (match.param && match.id && match.id !== entityId && match.id !== lastEntityHandled.current) {
      lastEntityHandled.current = match.id;
      pendingEntity.current = match.id;

      Promise.resolve(onEntityRoute?.(match.param, match.id)).finally(() => {
        // Cleared only if no newer navigation has started in the meantime.
        if (pendingEntity.current === match.id) pendingEntity.current = null;
      });
    }
    // Keyed on the location alone: this effect reads the state but must not
    // re-run when the state changes, or it would fight the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  /* ---------------------------------------------------------- state → URL */
  useEffect(() => {
    // Hazard 1: on mount this still holds the pre-URL state.
    if (!stateToUrlHasRun.current) {
      stateToUrlHasRun.current = true;
      return;
    }

    // Hazard 2: an entity is still loading, so the state is not yet a
    // complete description of where we are.
    if (pendingEntity.current) return;

    const target = pathFor(page, view, entityId, { suffix: activeSuffix.current });
    if (target !== location.pathname) navigate(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, view, entityId]);
}
