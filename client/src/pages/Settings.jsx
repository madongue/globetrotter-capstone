import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Coins, Globe, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import {
  Badge, Button, Card, Chip, EmptyState, Field, Select, SectionHead, Skeleton,
  ToastProvider, useToast,
} from '../components/ui';
import { LanguageToggle, TabBar, TopBar } from '../components/Navigation';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './settings.css';

/**
 * Account settings.
 *
 * Carries what the original settings screen carried, minus one panel: its
 * "Place autocomplete" box searched the catalogue, which is what Explore is
 * for, and a second search in a settings screen was a place for it to hide
 * rather than a setting.
 *
 * Currency is stored in localStorage under `gt_currency`, the key the original
 * shell already reads, so the choice applies to both halves of the application
 * and survives a reload. It is a display preference, not account data -- the
 * server always prices in FCFA.
 */

const CURRENCIES = [
  { code: 'XAF', label: 'FCFA — Central African franc' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'USD', label: 'USD — US dollar' },
  { code: 'GBP', label: 'GBP — Pound sterling' },
  { code: 'NGN', label: 'NGN — Nigerian naira' },
];

const CURRENCY_KEY = 'gt_currency';

function readCurrency() {
  try {
    return localStorage.getItem(CURRENCY_KEY) || 'XAF';
  } catch {
    return 'XAF';
  }
}

function SettingsInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState(null);
  const [interests, setInterests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [currency, setCurrency] = useState(readCurrency);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) { setLoading(false); return; }
    Promise.all([
      api.getProfile({ token }).catch(() => null),
      api.listInterests().then((p) => p?.interests || []).catch(() => []),
      api.listNotifications({ token }).catch(() => []),
    ]).then(([me, interestList, notificationList]) => {
      setProfile(me);
      setInterests(interestList);
      setNotifications(Array.isArray(notificationList) ? notificationList : []);
    }).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const preferences = profile?.preferences || [];

  const changeCurrency = (code) => {
    setCurrency(code);
    try {
      localStorage.setItem(CURRENCY_KEY, code);
    } catch {
      toast.push('Your browser is blocking site data, so this will not be remembered.', 'error');
      return;
    }
    toast.push('Currency updated.');
  };

  const togglePreference = async (interest) => {
    const next = preferences.includes(interest)
      ? preferences.filter((item) => item !== interest)
      : [...preferences, interest];

    setProfile((current) => ({ ...current, preferences: next }));
    setSaving(true);
    try {
      await api.updateProfile({ preferences: next }, { token });
    } catch (error) {
      // Put it back: the screen should not claim something the server refused.
      setProfile((current) => ({ ...current, preferences }));
      toast.push(error.message || 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const markRead = async (notification) => {
    try {
      await api.markNotificationRead(notification.id, { token });
      setNotifications((current) => current.map(
        (item) => (item.id === notification.id ? { ...item, read: true } : item),
      ));
    } catch (error) {
      toast.push(error.message || 'Could not mark it read.', 'error');
    }
  };

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt settings">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar settings__main">
          <EmptyState
            icon={<SettingsIcon size={22} />}
            title="Sign in to change your settings"
            body="Settings belong to your account."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  const unread = notifications.filter((item) => !item.read).length;

  return (
    <div ref={pageRef} className="gt settings">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/profile')}>Profile</Button>}
      />

      <main className="gt-page gt-has-tabbar settings__main">
        <header className="settings__head">
          <h1 className="settings__title">Settings</h1>
          <p className="settings__lede">
            Signed in as <strong>{profile?.username}</strong>
            {profile?.role === 'admin' && <> · <Badge tone="primary">Administrator</Badge></>}
          </p>
        </header>

        {/* ------------------------------------------------------- display */}
        <section>
          <SectionHead title="Display" subtitle="Applies on this device." />
          <Card className="settings__card">
            <div className="srow">
              <span className="srow__label"><Globe size={16} aria-hidden="true" /> Language</span>
              <LanguageToggle />
            </div>
            <div className="srow">
              <span className="srow__label"><Coins size={16} aria-hidden="true" /> Currency</span>
              <Field className="srow__field">
                <Select value={currency} onChange={(e) => changeCurrency(e.target.value)}>
                  {CURRENCIES.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="settings__note">
              Prices are recorded in FCFA and converted for display only.
            </p>
          </Card>
        </section>

        {/* ---------------------------------------------------- preferences */}
        <section>
          <SectionHead
            title="What you are travelling for"
            subtitle="Used to order the places you are shown."
          />
          {loading ? <Skeleton height="4rem" /> : (
            <div className="settings__chips">
              {interests.map((interest) => (
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
          )}
        </section>

        {/* -------------------------------------------------- notifications */}
        <section>
          <SectionHead
            title={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
          />
          {loading ? <Skeleton height="4rem" /> : notifications.length === 0 ? (
            <EmptyState
              icon={<Bell size={20} />}
              title="Nothing yet"
              body="Invitations and trip updates will appear here."
            />
          ) : (
            <ul className="settings__notices">
              {notifications.map((notification) => (
                <li
                  className={`notice${notification.read ? '' : ' notice--unread'}`}
                  key={notification.id}
                >
                  <span className="notice__text">
                    <strong>{notification.type}</strong>
                    <span>{notification.message}</span>
                  </span>
                  {!notification.read && (
                    <Button size="sm" variant="ghost" onClick={() => markRead(notification)}>
                      Mark read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------------- account */}
        <section>
          <SectionHead title="Account" />
          <Card className="settings__card">
            <div className="srow">
              <span className="srow__label"><Sparkles size={16} aria-hidden="true" /> Trips, saved places and groups</span>
              <Button size="sm" variant="secondary" onClick={() => navigate('/profile')}>
                Open profile
              </Button>
            </div>
          </Card>
        </section>
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Settings() {
  return <ToastProvider><SettingsInner /></ToastProvider>;
}
