import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bookmark, ChevronRight, Compass, Image as ImageIcon, Lightbulb, MapPin,
  Route, Shield, Sparkles, Users,
} from 'lucide-react';
import {
  Button, Card, EmptyState, SectionHead, Skeleton, ToastProvider,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth, useSavedPlaces, useTrips } from '../lib/useTravellerData';
import { formatMoney } from '../lib/useItinerary';
import * as api from '../lib/api';
import './dashboard.css';

/**
 * The signed-in overview.
 *
 * Replaces the original dashboard, whose sidebar listed seven sections before
 * any content appeared. Navigation now lives in the top bar and the mobile tab
 * bar like every other screen, so this page can spend its space on the two
 * questions someone returning actually has: what am I planning, and what do I
 * do next.
 *
 * Every figure is counted from data the account already holds. There is no
 * streak, no completion percentage and no activity score, because none of
 * those are recorded and a number nobody can verify is worse than no number.
 */

function DashboardInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const { token, username, isAuthenticated } = useAuth();
  const { savedItems } = useSavedPlaces(token);
  const { trips, tripsLoading } = useTrips(token);

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return undefined; }
    let cancelled = false;

    Promise.all([
      api.getProfile({ token }).catch(() => null),
      api.listGroups({ token }).catch(() => []),
      // Own submissions only; the endpoint returns everything for an admin.
      api.listPlaceRequests({ token }).catch(() => []),
    ]).then(([me, allGroups, requests]) => {
      if (cancelled) return;
      setProfile(me);
      const groupList = Array.isArray(allGroups) ? allGroups : (allGroups?.groups || []);
      setGroups(groupList.filter((group) => (group.members || []).includes(me?.username)));
      const requestList = Array.isArray(requests) ? requests : (requests?.requests || []);
      setSuggestions(requestList.filter((item) => item.submitted_by === me?.username));
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [token]);

  /* The trip to put at the top: the one starting soonest that has not already
     finished, falling back to the most recently created if none carry dates. */
  const nextTrip = useMemo(() => {
    if (trips.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = trips
      .filter((trip) => trip.start_date && trip.start_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return upcoming[0] || trips[0];
  }, [trips]);

  const isAdmin = profile?.role === 'admin';

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt dash">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar dash__main">
          <EmptyState
            icon={<Route size={22} />}
            title="Sign in to see your dashboard"
            body="Your trips, saved places and groups live in your account."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  const stats = [
    { icon: <Route size={18} />, value: trips.length, label: 'Trips planned', to: '/trips' },
    { icon: <Bookmark size={18} />, value: savedItems.length, label: 'Saved places', to: '/saved' },
    { icon: <Users size={18} />, value: groups.length, label: 'Groups joined', to: '/community' },
    { icon: <Lightbulb size={18} />, value: suggestions.length, label: 'My suggestions', to: '/suggest' },
  ];

  const shortcuts = [
    { icon: <Compass size={18} />, title: 'Explore places', body: '845 places across all ten regions', to: '/explore' },
    { icon: <Users size={18} />, title: 'Community', body: 'Groups, discussions and the chat', to: '/community' },
    { icon: <ImageIcon size={18} />, title: 'Photos', body: 'What other travellers shared', to: '/media' },
    { icon: <Lightbulb size={18} />, title: 'Suggest a place', body: 'Add somewhere we are missing', to: '/suggest' },
  ];

  return (
    <div ref={pageRef} className="gt dash">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" onClick={() => navigate('/trips')}>Plan a trip</Button>}
      />

      <main className="gt-page gt-has-tabbar dash__main">
        <header className="dash__head">
          <div>
            <h1 className="dash__hello">Welcome back, {profile?.username || username}</h1>
            <p className="dash__date">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          </div>
        </header>

        {/* ------------------------------------------------------- figures */}
        <div className="dash__stats">
          {stats.map((stat) => (
            <Link key={stat.label} to={stat.to} className="dstat">
              <span className="dstat__icon" aria-hidden="true">{stat.icon}</span>
              <span className="dstat__value">{loading ? '—' : stat.value}</span>
              <span className="dstat__label">{stat.label}</span>
            </Link>
          ))}
        </div>

        <div className="dash__cols">
          {/* ---------------------------------------------------- next trip */}
          <section>
            <SectionHead
              title="Your next trip"
              action={trips.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/trips')}>All trips</Button>
              )}
            />
            {tripsLoading ? (
              <Skeleton height="10rem" />
            ) : nextTrip ? (
              <div className="dash__next">
                <p className="dash__next-label">Coming up</p>
                <h2 className="dash__next-title">{nextTrip.title}</h2>
                <p className="dash__next-meta">
                  <span><MapPin size={13} aria-hidden="true" /> {nextTrip.location}</span>
                  {nextTrip.stages?.length > 0 && (
                    <span>{nextTrip.stages.length} checkpoints</span>
                  )}
                  {nextTrip.cost_breakdown?.total_budget > 0 && (
                    <span>
                      {formatMoney(
                        nextTrip.cost_breakdown.total_budget,
                        nextTrip.currency_label || 'FCFA',
                      )}
                    </span>
                  )}
                </p>
                <div className="dash__next-actions">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/trips/${nextTrip.id}`)}>
                    Open itinerary
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/trips/${nextTrip.id}/manage`)}>
                    Payments and documents
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Sparkles size={20} />}
                title="No trips yet"
                body="Give us a destination and a number of days — we fill in the rest."
                action={<Button size="sm" onClick={() => navigate('/trips')}>Build my trip</Button>}
              />
            )}
          </section>

          {/* ---------------------------------------------------- shortcuts */}
          <section>
            <SectionHead title="Go to" />
            <div className="dash__links">
              {shortcuts.map((item) => (
                <Link key={item.to} to={item.to} className="dlink">
                  <span className="dlink__icon" aria-hidden="true">{item.icon}</span>
                  <span className="dlink__text">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </span>
                  <ChevronRight size={16} className="dlink__go" aria-hidden="true" />
                </Link>
              ))}

              {/* Rendered only for an administrator. The endpoints behind it
                  refuse everyone else with 403, but a link that always 403s is
                  a worse answer than no link. */}
              {isAdmin && (
                <Link to="/admin" className="dlink dlink--admin">
                  <span className="dlink__icon" aria-hidden="true"><Shield size={18} /></span>
                  <span className="dlink__text">
                    <strong>Admin dashboard</strong>
                    <span>Platform analytics, accounts and pending requests</span>
                  </span>
                  <ChevronRight size={16} className="dlink__go" aria-hidden="true" />
                </Link>
              )}
            </div>
          </section>
        </div>
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Dashboard() {
  return <ToastProvider><DashboardInner /></ToastProvider>;
}
