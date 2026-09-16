import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button, Chip, Field, Input, ToastProvider } from '../components/ui';
import { Brand, LanguageToggle } from '../components/Navigation';
import { useTranslatedPage } from '../lib/i18n';
import * as api from '../lib/api';
import './auth.css';

/**
 * Create an account.
 *
 * Four things, three of them required by the server: username, password and
 * phone. Interests are optional and come from `/interests` rather than being
 * typed, because the server drops any tag outside that controlled list -- a
 * free-text box here would look like it worked and quietly lose the answer.
 *
 * Registration does not return a token, so a successful sign-up is followed by
 * a sign-in with the same credentials. That is one extra request in exchange
 * for never having two places that know how to mint a session.
 */

function RegisterInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [interests, setInterests] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.listInterests({ signal: controller.signal })
      .then((payload) => setInterests(payload?.interests || []))
      .catch(() => setInterests([]));  // optional field; a failure hides it
    return () => controller.abort();
  }, []);

  const toggle = (interest) => setChosen((current) => (
    current.includes(interest)
      ? current.filter((item) => item !== interest)
      : [...current, interest]
  ));

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    // Checked here because the server has no second password to compare
    // against, so this is the only place the mismatch can be caught.
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await api.register({
        username: username.trim(),
        password,
        phone: phone.trim(),
        preferences: chosen,
      });
      const { token } = await api.login({ username: username.trim(), password });
      try {
        localStorage.setItem(api.TOKEN_KEY, token);
      } catch {
        // The account exists either way, so send them to sign in by hand
        // rather than losing the registration to a storage error.
        navigate('/login');
        return;
      }
      window.location.assign('/dashboard');
    } catch (err) {
      setError(
        err.status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : err.message || 'Could not create the account.',
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
            <h1 className="auth__headline">845 places across all ten regions.</h1>
            <p className="auth__sub">
              Save the ones you like, build a trip around them, and plan it with
              people you are travelling with.
            </p>
          </div>
          <span className="auth__ring" aria-hidden="true" />
        </aside>

        <main className="auth__main">
          <div className="auth__form-wrap">
            <h2 className="auth__title">Create your account</h2>
            <p className="auth__lede">It takes a moment. You can change your interests later.</p>

            <form className="auth__form" onSubmit={submit}>
              {error && (
                <p className="auth__error" role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}

              <Field label="Username">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  maxLength={40}
                  autoFocus
                  required
                  placeholder="madongue"
                />
              </Field>

              <Field label="Phone number">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  required
                  placeholder="+237 6 XX XX XX XX"
                />
              </Field>
              <p className="auth__hint">Used to sign in and to recover the account.</p>

              <div className="auth__row auth__row--two">
                <Field label="Password">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    placeholder="Choose a password"
                  />
                </Field>
                <Field label="Confirm password">
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    placeholder="Type it again"
                  />
                </Field>
              </div>

              {interests.length > 0 && (
                <Field label="What are you travelling for?" hint="Optional. Orders what you are shown.">
                  <div className="auth__chips">
                    {interests.map((interest) => (
                      <Chip
                        key={interest}
                        active={chosen.includes(interest)}
                        onClick={() => toggle(interest)}
                      >
                        {interest}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              <Button
                type="submit"
                disabled={busy || !username.trim() || !phone.trim() || !password || !confirm}
              >
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </form>

            <p className="auth__alt">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Register() {
  return <ToastProvider><RegisterInner /></ToastProvider>;
}
