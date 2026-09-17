/**
 * The URL map.
 *
 * GlobeTrotter's navigation has always been two pieces of component state —
 * `page` for the top-level screen and `dashboardView` for the section inside
 * the dashboard. That works, but it means the address bar never changes: no
 * link can be sent to anyone, the back button does nothing, and a refresh
 * always lands on the home page.
 *
 * Rather than rewrite navigation, this file makes the URL a faithful mirror of
 * that state. One table, read in both directions:
 *
 *   URL changes   → the matching state is applied
 *   state changes → the matching URL is pushed
 *
 * Every existing `setPage(...)` and `setDashboardView(...)` call keeps working
 * exactly as before and now updates the address bar as a side effect. Nothing
 * about the 109 pieces of state inside App.jsx has to move for this to work,
 * which is what makes it a safe first step.
 */

/**
 * Canonical routes, most specific first.
 *
 * `page` and `view` are the state this path represents. `param` names the
 * entity id carried in the path, for the two screens that show one thing.
 */
export const ROUTES = [
  { path: '/',            page: 'home' },
  { path: '/login',       page: 'login' },
  { path: '/register',    page: 'register' },

  // The dashboard's sections. These are the names the redesign will use in the
  // interface, which do not all match the internal view keys — "explore" reads
  // better than "discovery", and "saved" better than "resources".
  { path: '/dashboard',   page: 'dashboard', view: 'overview' },
  { path: '/explore',     page: 'dashboard', view: 'discovery' },
  { path: '/map',         page: 'dashboard', view: 'discovery' },
  { path: '/trips',       page: 'dashboard', view: 'itineraries' },
  { path: '/community',   page: 'dashboard', view: 'community' },
  { path: '/media',       page: 'dashboard', view: 'media' },
  { path: '/saved',       page: 'dashboard', view: 'resources' },
  { path: '/suggest',     page: 'dashboard', view: 'suggest' },
  { path: '/admin',       page: 'dashboard', view: 'admin' },

  // Account. The design board puts "Profile" in the tab bar, and today the
  // account screen is the dashboard's settings view — so /profile is the
  // canonical path for it and /settings is kept as an alias so any existing
  // link still resolves. Phase D splits them into two real pages.
  { path: '/profile',     page: 'dashboard', view: 'settings' },
  { path: '/settings',    page: 'dashboard', view: 'settings', alias: true },

  // Rebuilt in Phase B as standalone pages, outside App. Listed so that
  // matchPath recognises them as real addresses rather than sending them to
  // the fallback.
  { path: '/places/:id',    page: 'place',     param: 'placeId' },

  // The original itinerary screen, kept reachable. Phase C's editor covers
  // the plan, the checkpoints, the map and the cost; payments, reservations,
  // packing, documents, sharing, progress and the audit log still live here,
  // so the redesign adds a route rather than removing features. Declared
  // before /trips/:id so the longer path wins.
  { path: '/trips/:id/manage', page: 'itinerary', param: 'itineraryId', suffix: 'manage' },

  // Single-entity screens.
  { path: '/trips/:id',     page: 'itinerary', param: 'itineraryId' },
  { path: '/community/:id', page: 'group',     param: 'groupId' },
];

/** Where an unrecognised path sends the visitor. */
export const FALLBACK_PATH = '/';

/**
 * Resolve a pathname to the state it represents.
 *
 * Returns `null` for a path this application does not own — an unknown URL
 * should fall back rather than silently render the home page under the wrong
 * address.
 */
export function matchPath(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';

  for (const route of ROUTES) {
    if (!route.path.includes(':')) {
      if (route.path === clean) return { ...route, id: null };
      continue;
    }
    // One parameter, optionally followed by a fixed segment — enough for
    // /trips/:id, /community/:id and /trips/:id/manage.
    const base = route.path.slice(0, route.path.indexOf('/:'));
    if (clean.startsWith(`${base}/`)) {
      let rest = clean.slice(base.length + 1);
      if (route.suffix) {
        const tail = `/${route.suffix}`;
        if (!rest.endsWith(tail)) continue;
        rest = rest.slice(0, -tail.length);
      }
      if (rest && !rest.includes('/')) return { ...route, id: rest };
    }
  }
  return null;
}

/**
 * The path that represents a given state.
 *
 * `entityId` supplies the id for the two single-entity screens; without one
 * they cannot be addressed, so those fall back to their list.
 */
export function pathFor(page, view, entityId, { suffix } = {}) {
  if (page === 'itinerary') {
    if (!entityId) return '/trips';
    return suffix ? `/trips/${entityId}/${suffix}` : `/trips/${entityId}`;
  }
  if (page === 'group')     return entityId ? `/community/${entityId}` : '/community';

  if (page === 'dashboard') {
    // Aliases are accepted on the way in but never produced on the way out,
    // or the address would flip between two spellings of the same screen.
    const hit = ROUTES.find((r) => r.page === 'dashboard' && r.view === view && !r.alias);
    return hit ? hit.path : '/dashboard';
  }

  const hit = ROUTES.find((r) => r.page === page && !r.path.includes(':') && !r.alias);
  return hit ? hit.path : FALLBACK_PATH;
}

/**
 * The navigation shown in the interface, in order.
 *
 * Kept beside the route table so a destination cannot appear in the menu
 * without a URL, or gain a URL and be forgotten in the menu. `primary` marks
 * the handful that belong in the mobile tab bar, where there is room for five.
 */
export const NAV_ITEMS = [
  { path: '/dashboard', label: 'Home',      icon: 'home',     primary: true,  authOnly: true },
  { path: '/explore',   label: 'Explore',   icon: 'compass',  primary: true,  authOnly: false },
  { path: '/map',       label: 'Map',       icon: 'map',      primary: false, authOnly: false },
  { path: '/trips',     label: 'Trips',     icon: 'map',      primary: true,  authOnly: true },
  { path: '/community', label: 'Community', icon: 'users',    primary: true,  authOnly: true },
  { path: '/profile',   label: 'Profile',   icon: 'user',     primary: true,  authOnly: true },
  { path: '/saved',     label: 'Saved',     icon: 'bookmark', primary: false, authOnly: true },
  { path: '/media',     label: 'Media',     icon: 'image',    primary: false, authOnly: true },
  { path: '/suggest',   label: 'Suggest a place', icon: 'lightbulb', primary: false, authOnly: true },
];

/** The five that fit the mobile tab bar, in the board's order. */
export const TAB_ITEMS = NAV_ITEMS.filter((item) => item.primary);
