import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button, Field, Input, ToastProvider } from '../components/ui';
import { Brand, LanguageToggle } from '../components/Navigation';
import { useTranslatedPage } from '../lib/i18n';
import * as api from '../lib/api';
import './auth.css';

/**
 * Sign in.
 *
 * The server accepts either a username or a phone number in the same field,
 * so this asks for one box labelled as both rather than making the visitor
 * choose a login method before they have typed anything.
 *
 * `/login` returns a bare `{ token }` -- no name, no role -- so anything the
 * next screen needs about the account comes from `/profile` afterwards. This
 * page stores the token and gets out of the way.
 */

function LoginInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.getStats({ signal: controller.signal }).then(setStats).catch(() => {
      // The panel simply stays quiet; it is decoration, not information the
      // visitor needs in order to sign in.
    });
    return () => controller.abort();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      // A phone number is the only thing here that can contain a digit-led
      // string with punctuation; anything else is treated as a username and
      // the server decides.
      const looksLikePhone = /^[+\d][\d\s().-]{5,}$/.test(identifier.trim());
      const { token } = await api.login({
        username: looksLikePhone ? '' : identifier.trim(),
        phone: looksLikePhone ? identifier.trim() : '',
        password,
      });
      try {
        localStorage.setItem(api.TOKEN_KEY, token);
      } catch {
        setError('Your browser is blocking site data, so the session cannot be kept.');
        setBusy(false);
        return;
      }
      // A full load rather than a client-side navigation: the original App
      // shell reads the token once at mount, and this keeps both halves of the
      // application agreeing about who is signed in.
      window.location.assign('/dashboard');
    } catch (err) {
      setError(
        err.status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : err.message || 'Could not sign in.',
      );
      setBusy(false);
    }
  };

  return (
    <div ref={pageRef} className="gt auth">
      <header className="gt-page auth__bar">
        <Brand />
        <LanguageToggle />
      </header>

      <div className="auth__split">
        <aside className="auth__aside">
          <div className="auth__aside-head">
            <h1 className="auth__headline">Cameroon, planned in two fields.</h1>
            <p className="auth__sub">
              Pick a destination and a number of days. We fill in the hotel, the
              places and the day-by-day plan — you change whatever you like
              afterwards.
            </p>
          </div>

          {stats && (
            <dl className="auth__figures">
              <div className="auth__figure">
                <dt>Places</dt>
                <dd>{stats.total_places}</dd>
              </div>
              <div className="auth__figure">
                <dt>Hotels</dt>
                <dd>{stats.total_hotels}</dd>
              </div>
              <div className="auth__figure">
                <dt>Regions</dt>
                <dd>10</dd>
              </div>
            </dl>
          )}
          <span className="auth__ring" aria-hidden="true" />
        </aside>

        <main className="auth__main">
          <div className="auth__form-wrap">
            <h2 className="auth__title">Welcome back</h2>
            <p className="auth__lede">Sign in to reach your trips, saved places and groups.</p>

            <form className="auth__form" onSubmit={submit}>
              {error && (
                <p className="auth__error" role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}

              <Field label="Username or phone">
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="madongue"
                />
              </Field>

              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                />
              </Field>

              <Button type="submit" disabled={busy || !identifier.trim() || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="auth__alt">
              New here? <Link to="/register">Create an account</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Login() {
  return <ToastProvider><LoginInner /></ToastProvider>;
}
