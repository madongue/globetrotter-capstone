import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import './breadcrumbs.css';

/**
 * Fil d'Ariane — the trail back out of a page.
 *
 * Two jobs, because they are different needs:
 *
 *   - the trail itself answers "where am I", and every step in it is a link,
 *     so the traveller can jump to any ancestor and not only the last one;
 *   - the Back control answers "get me out of here", and is the one people
 *     actually reach for on a phone, where the trail is narrow.
 *
 * Back prefers real history when there is any, because that returns you to the
 * scroll position and the filters you had. Arriving cold on a deep link — a
 * shared trip, a place from a search result — there is no history to go back
 * to, and the browser would leave the application entirely; in that case it
 * falls back to the trail's parent, which is always somewhere sensible.
 *
 * The trail is derived from the URL, so it cannot disagree with the address
 * bar. Pages that show one named thing pass its name in, because the URL only
 * carries an id and "Trip a3f2…" is not a breadcrumb anyone can read.
 */

/** Where each section sits, and what it is called in the trail. */
const SECTIONS = {
  dashboard: { label: 'Home', path: '/dashboard' },
  explore: { label: 'Explore', path: '/explore' },
  places: { label: 'Explore', path: '/explore' },
  trips: { label: 'Trips', path: '/trips' },
  community: { label: 'Community', path: '/community' },
  media: { label: 'Photos', path: '/media' },
  saved: { label: 'Saved places', path: '/saved' },
  suggest: { label: 'Suggest a place', path: '/suggest' },
  profile: { label: 'Profile', path: '/profile' },
  settings: { label: 'Settings', path: '/settings' },
  admin: { label: 'Admin', path: '/admin' },
  login: { label: 'Sign in', path: '/login' },
  register: { label: 'Create an account', path: '/register' },
};

/**
 * Build the trail for a pathname.
 *
 * `currentLabel` names the last step when the URL ends in an id. Exported so
 * it can be tested without rendering, and reused by anything else that needs
 * to know where a path sits.
 */
export function trailFor(pathname, currentLabel) {
  const parts = (pathname || '/').split('/').filter(Boolean);
  const trail = [{ label: 'Home', path: '/', icon: true }];
  if (parts.length === 0) return trail;

  const section = SECTIONS[parts[0]];
  if (!section) return trail;

  // The dashboard *is* home, so it never appears twice.
  if (section.path !== '/dashboard') {
    trail.push({ label: section.label, path: section.path });
  } else {
    trail[0] = { label: 'Home', path: '/dashboard', icon: true };
  }

  if (parts.length > 1) {
    // /trips/:id/manage — the editor and its deeper "manage" screen.
    const isManage = parts[2] === 'manage';
    const entityPath = `/${parts[0]}/${parts[1]}`;
    trail.push({
      label: currentLabel || 'Details',
      path: isManage ? entityPath : null,
    });
    if (isManage) trail.push({ label: 'Payments and documents', path: null });
  }

  return trail;
}

export default function Breadcrumbs({ currentLabel, className }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const trail = trailFor(pathname, currentLabel);

  // The home page is its own root: a trail reading only "Home" tells nobody
  // anything, so it renders nothing at all rather than an empty bar.
  if (trail.length < 2) return null;

  const parent = [...trail].reverse().find((step) => step.path);

  const goBack = () => {
    // `idx > 0` means this page was reached from somewhere inside the
    // application, so history holds a position worth returning to.
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(parent?.path || '/');
  };

  return (
    <div className={['crumbs', className].filter(Boolean).join(' ')}>
      <button type="button" className="crumbs__back" onClick={goBack}>
        <ChevronLeft size={16} aria-hidden="true" />
        Back
      </button>

      <nav aria-label="Breadcrumb" className="crumbs__nav">
        <ol className="crumbs__list">
          {trail.map((step, index) => {
            const last = index === trail.length - 1;
            return (
              <li className="crumbs__item" key={`${step.label}-${index}`}>
                {index > 0 && (
                  <ChevronRight size={13} className="crumbs__sep" aria-hidden="true" />
                )}
                {last || !step.path ? (
                  <span className="crumbs__here" aria-current={last ? 'page' : undefined}>
                    {step.icon && <Home size={13} aria-hidden="true" />}
                    {step.label}
                  </span>
                ) : (
                  <Link to={step.path} className="crumbs__link">
                    {step.icon && <Home size={13} aria-hidden="true" />}
                    {step.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
