import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bookmark, Camera, Globe, LogOut, MapPin, Route, Settings as SettingsIcon, Users,
} from 'lucide-react';
import {
  Badge, Button, Card, Chip, EmptyState, SectionHead, Skeleton, ToastProvider, useToast,
} from '../components/ui';
import { LanguageToggle, TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import { Avatar } from './Community';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth, useSavedPlaces, useTrips } from '../lib/useTravellerData';
import { formatMoney } from '../lib/useItinerary';
import * as api from '../lib/api';
import './profile.css';

/**
 * Profile.
 *
 * Everything here is derived from data the application already holds — trips,
 * saved places, group memberships. Nothing is invented: there is no follower
 * count, no "profile completeness", no streak, because the application does
 * not record any of that and a made-up number on a profile is worse than a
 * shorter profile.
 *
 * Preferences are the one editable thing, and they post to the same
 * `/api/profile` endpoint the original settings screen has always used.
 */

const INTERESTS = [
  'beach', 'nature', 'culture', 'history', 'food',
  'nightlife', 'adventure', 'wildlife', 'photography', 'shopping',
];

function ProfileInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, username, isAuthenticated } = useAuth();
  const { savedItems } = useSavedPlaces(token);
  const { trips } = useTrips(token);

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!token) { setLoading(false); return undefined; }
    let cancelled = false;

    Promise.all([
      fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null)),
      api.listGroups({ token }).catch(() => []),
    ]).then(([me, allGroups]) => {
      if (cancelled) return;
      setProfile(me);
      const list = Array.isArray(allGroups) ? allGroups : (allGroups?.groups || []);
      setGroups(list.filter((g) => (g.members || []).includes(me?.username)));
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [token]);

  const preferences = profile?.preferences || [];

  const totalPlanned = useMemo(
    () => trips.reduce((sum, trip) => sum + (Number(trip.cost_breakdown?.total_budget) || 0), 0),
    [trips],
  );

  const togglePreference = async (interest) => {
    const next = preferences.includes(interest)
      ? preferences.filter((p) => p !== interest)
      : [...preferences, interest];

    setProfile((current) => ({ ...current, preferences: next }));
    setSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferences: next }),
      });
      if (!response.ok) throw new Error((await response.json())?.error || 'Could not save.');
    } catch (err) {
      // Put it back: the screen should not claim something the server refused.
      setProfile((current) => ({ ...current, preferences }));
      toast.push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const pickPicture = async (event) => {
    const file = event.target.files?.[0];
    // Clearing the input matters: choosing the same file twice in a row fires
    // no change event otherwise, so a failed upload could not be retried.
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const result = await api.uploadAvatar(file, { token });
      setProfile(result.profile);
      toast.push('Profile picture updated.');
    } catch (err) {
      toast.push(err.message || 'Could not upload that picture.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const dropPicture = async () => {
    setUploading(true);
    try {
      const result = await api.removeAvatar({ token });
      setProfile(result.profile);
      toast.push('Profile picture removed.');
    } catch (err) {
      toast.push(err.message || 'Could not remove it.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const signOut = () => {
    try { localStorage.removeItem('gt_token'); } catch { /* private window */ }
    navigate('/');
    window.location.reload();
  };

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt profile">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar profile__main">
          <EmptyState
            icon={<Users size={22} />}
            title="Sign in to see your profile"
            body="Your trips, saved places and groups live in your account."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
      </div>
    );
  }

  const stats = [
    { icon: <Route size={18} />, value: trips.length, label: 'Trips', to: '/trips' },
    { icon: <Bookmark size={18} />, value: savedItems.length, label: 'Saved places', to: '/saved' },
    { icon: <Users size={18} />, value: groups.length, label: 'Groups', to: '/community' },
  ];

  return (
    <div ref={pageRef} className="gt profile">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Explore</Button>}
      />

      <header className="profile__head">
        <div className="gt-page profile__head-inner">
          {/* The picture is the control. A separate "change picture" button
              elsewhere on the page would be one more thing to find; clicking
              the face is what people try first. */}
          <div className="profile__portrait">
            <button
              type="button"
              className="profile__portrait-btn"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              aria-label={profile?.avatar_url ? 'Change your profile picture' : 'Add a profile picture'}
            >
              <Avatar
                username={profile?.username || username}
                src={profile?.avatar_url}
                size={76}
              />
              <span className="profile__portrait-hint" aria-hidden="true">
                <Camera size={15} />
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="profile__file"
              onChange={pickPicture}
              tabIndex={-1}
            />
            {profile?.avatar_url && (
              <button
                type="button"
                className="profile__portrait-drop"
                onClick={dropPicture}
                disabled={uploading}
              >
                Remove
              </button>
            )}
          </div>
          <div className="profile__who">
            <h1 className="gt-h2">{profile?.username || username}</h1>
            <p className="profile__meta">
              {profile?.role === 'admin' && <Badge tone="primary">Administrator</Badge>}
              {profile?.google_linked && <Badge tone="neutral">Google account</Badge>}
              <span className="gt-small gt-muted">Travelling in Cameroon</span>
            </p>
          </div>
        </div>
      </header>

      <main className="gt-page gt-has-tabbar profile__main">

        <Breadcrumbs />
        {/* ------------------------------------------------------- figures */}
        <div className="profile__stats">
          {stats.map((stat) => (
            <Link key={stat.label} to={stat.to} className="pstat">
              <span className="pstat__icon" aria-hidden="true">{stat.icon}</span>
              <span className="pstat__value">{loading ? '—' : stat.value}</span>
              <span className="pstat__label">{stat.label}</span>
            </Link>
          ))}
        </div>

        {totalPlanned > 0 && (
          <p className="profile__planned gt-small gt-muted">
            {formatMoney(totalPlanned, 'FCFA')} planned across your trips.
          </p>
        )}

        {/* ---------------------------------------------------------- trips */}
        <section className="profile__section">
          <SectionHead
            title="My trips"
            action={<Button variant="ghost" size="sm" onClick={() => navigate('/trips')}>See all</Button>}
          />
          {loading ? <Skeleton height="4rem" /> : trips.length === 0 ? (
            <EmptyState
              icon={<Route size={20} />}
              title="No trips yet"
              body="Start exploring Cameroon and build your first adventure."
              action={<Button size="sm" onClick={() => navigate('/trips')}>Create your trip</Button>}
            />
          ) : (
            <ul className="plist">
              {trips.slice(0, 4).map((trip) => (
                <li key={trip.id}>
                  <Link to={`/trips/${trip.id}`} className="plist__row">
                    <span className="plist__text">
                      <strong>{trip.title}</strong>
                      <span className="gt-caption gt-muted">
                        <MapPin size={11} aria-hidden="true" /> {trip.location}
                        {trip.stages?.length ? ` · ${trip.stages.length} checkpoints` : ''}
                      </span>
                    </span>
                    {trip.cost_breakdown?.total_budget > 0 && (
                      <span className="plist__value">
                        {formatMoney(trip.cost_breakdown.total_budget, trip.currency_label || 'FCFA')}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------- groups */}
        <section className="profile__section">
          <SectionHead
            title="My groups"
            action={<Button variant="ghost" size="sm" onClick={() => navigate('/community')}>Community</Button>}
          />
          {loading ? <Skeleton height="3rem" /> : groups.length === 0 ? (
            <p className="gt-small gt-muted">You have not joined a group yet.</p>
          ) : (
            <ul className="plist">
              {groups.slice(0, 4).map((group) => (
                <li key={group.id}>
                  <Link to={`/community/${group.id}`} className="plist__row">
                    <span className="plist__text">
                      <strong>{group.name}</strong>
                      <span className="gt-caption gt-muted">
                        {(group.members || []).length} member{(group.members || []).length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ----------------------------------------------------- preferences */}
        <section className="profile__section">
          <SectionHead
            title="What you are travelling for"
            subtitle="Used to order the recommendations you are shown."
          />
          <div className="profile__chips">
            {INTERESTS.map((interest) => (
              <Chip
                key={interest}
                active={preferences.includes(interest)}
                onClick={() => togglePreference(interest)}
                disabled={saving}
              >
                {interest}
              </Chip>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- settings */}
        <section className="profile__section">
          <SectionHead title="Settings" />
          <Card className="profile__settings">
            <div className="prow">
              <span className="prow__label"><Globe size={16} aria-hidden="true" /> Language</span>
              <LanguageToggle />
            </div>
            <div className="prow">
              <span className="prow__label"><SettingsIcon size={16} aria-hidden="true" /> Notifications, currency and the rest</span>
              {/* Those panels still live on the original settings screen; this
                  links there rather than duplicating them. */}
              <Button size="sm" variant="secondary" onClick={() => navigate('/settings')}>Open settings</Button>
            </div>
            <div className="prow">
              <span className="prow__label"><LogOut size={16} aria-hidden="true" /> Sign out</span>
              <Button size="sm" variant="danger" onClick={signOut}>Sign out</Button>
            </div>
          </Card>
        </section>
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Profile() {
  return <ToastProvider><ProfileInner /></ToastProvider>;
}
