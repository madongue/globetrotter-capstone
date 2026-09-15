import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Bookmark, Compass, Home, Image as ImageIcon, Lightbulb,
  Map as MapIcon, Settings, User, Users,
} from 'lucide-react';
import { NAV_ITEMS, TAB_ITEMS } from '../routes';

/**
 * The two navigation shapes from the design board.
 *
 * `TopBar` runs across the top on desktop; `TabBar` sits at the foot of the
 * screen on phones. They are deliberately different components rather than one
 * responsive component, because they are different designs — the audit found
 * the desktop sidebar stacking vertically on a phone and filling the entire
 * first screen with menu items before any content appeared.
 *
 * Both read the same NAV_ITEMS table that the router reads, so a destination
 * cannot drift out of step with its URL.
 */

// Explicit map rather than a dynamic lookup: importing lucide's whole index
// pulls every icon into the bundle, which cost 637 kB the last time it
// happened here.
const ICONS = {
  home: Home,
  compass: Compass,
  map: MapIcon,
  users: Users,
  user: User,
  bookmark: Bookmark,
  image: ImageIcon,
  lightbulb: Lightbulb,
  settings: Settings,
};

function Icon({ name, size = 20 }) {
  const Glyph = ICONS[name] || Compass;
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" />;
}

/** The wordmark, with the tagline from the board on wider screens. */
export function Brand({ withTagline = false }) {
  return (
    <NavLink to="/" className="gt-brand">
      <span className="gt-brand__mark" aria-hidden="true">
        <Compass size={19} strokeWidth={2.4} />
      </span>
      <span>
        GlobeTrotter
        {withTagline && <span className="gt-brand__tag">Explore Cameroon. Create Memories.</span>}
      </span>
    </NavLink>
  );
}

export function TopBar({ isAuthenticated = false, actions = null }) {
  const items = NAV_ITEMS.filter((item) => !item.authOnly || isAuthenticated);

  return (
    <header className="gt-topbar">
      <div className="gt-page gt-topbar__inner">
        <Brand withTagline />

        <nav className="gt-topnav" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              /* The five primary destinations always show. The rest appear
                 only when the bar is wide enough to hold them without
                 crowding out the actions on the right; below that they stay
                 reachable from the account menu and their own URLs. */
              className={`gt-topnav__link${item.primary ? '' : ' gt-topnav__link--wide'}`}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {actions && <div className="gt-topbar__actions">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * The phone tab bar.
 *
 * Renders nothing when signed out: four of its five destinations require an
 * account, and a bar of dead ends is worse than no bar.
 */
export function TabBar({ isAuthenticated = false }) {
  if (!isAuthenticated) return null;

  return (
    <nav className="gt-tabbar" aria-label="Main">
      {TAB_ITEMS.map((item) => (
        <NavLink key={item.path} to={item.path} className="gt-tab">
          <span className="gt-tab__icon"><Icon name={item.icon} /></span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
