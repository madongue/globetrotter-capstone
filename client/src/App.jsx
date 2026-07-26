import { useState } from 'react';

const API_BASE = '/api';

function App() {
  const [page, setPage] = useState('home');
  const [token, setToken] = useState(localStorage.getItem('gt_token') || '');
  const [alert, setAlert] = useState(null);

  const navigate = (target) => {
    setAlert(null);
    setPage(target);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = event.target;
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Login failed' });
      return;
    }
    localStorage.setItem('gt_token', result.token);
    setToken(result.token);
    setAlert({ type: 'success', message: 'Login successful.' });
    setPage('dashboard');
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    const form = event.target;
    const preferences = form.preferences.value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
        preferences,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Registration failed' });
      return;
    }
    setAlert({ type: 'success', message: 'Account created. You can now login.' });
    setPage('login');
  };

  const handleLogout = () => {
    localStorage.removeItem('gt_token');
    setToken('');
    setPage('home');
    setAlert({ type: 'success', message: 'Logged out successfully.' });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container header-inner">
          <div className="brand">GlobeTrotter</div>
          <nav className="nav-bar">
            <button type="button" onClick={() => navigate('home')}>Home</button>
            {!token && <button type="button" onClick={() => navigate('login')}>Login</button>}
            {!token && <button type="button" onClick={() => navigate('register')}>Register</button>}
            {token && <button type="button" onClick={() => navigate('dashboard')}>Dashboard</button>}
            {token && <button type="button" onClick={handleLogout}>Logout</button>}
          </nav>
        </div>
      </header>

      <main className="container main-content">
        {alert && (
          <div className={`alert ${alert.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {alert.message}
          </div>
        )}

        {page === 'home' && (
          <section className="hero-section">
            <div className="hero-copy">
              <p className="eyebrow">Travel meets community</p>
              <h1>Plan trips, sell event tickets, and connect with travel travelers.</h1>
              <p>GlobeTrotter brings itineraries, payments, groups, and media sharing into one polished React experience.</p>
              <div className="hero-actions">
                <button type="button" className="button button-primary" onClick={() => navigate('register')}>Get Started</button>
                <button type="button" className="button button-secondary" onClick={() => navigate('login')}>Sign In</button>
              </div>
            </div>
            <div className="hero-cards">
              <article className="feature-card">
                <h3>Shared travel plans</h3>
                <p>Build itineraries together, invite friends, and track every booking.</p>
              </article>
              <article className="feature-card">
                <h3>Ticket monetization</h3>
                <p>Sell event tickets with receipts, commission tracking, and secure payment records.</p>
              </article>
              <article className="feature-card">
                <h3>Community feed</h3>
                <p>Post photos, comment, like, and reach travel groups with media sharing.</p>
              </article>
            </div>
          </section>
        )}

        {page === 'login' && (
          <section className="form-section">
            <div className="form-card">
              <h2>Sign in</h2>
              <form onSubmit={handleLogin}>
                <label>
                  Username
                  <input name="username" type="text" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" required />
                </label>
                <button type="submit" className="button button-primary">Login</button>
              </form>
              <p className="form-footnote">
                New here? <button type="button" className="link-button" onClick={() => navigate('register')}>Create an account</button>
              </p>
            </div>
          </section>
        )}

        {page === 'register' && (
          <section className="form-section">
            <div className="form-card">
              <h2>Create account</h2>
              <form onSubmit={handleRegister}>
                <label>
                  Username
                  <input name="username" type="text" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" required />
                </label>
                <label>
                  Interests
                  <input name="preferences" type="text" placeholder="beach, food, culture" />
                </label>
                <button type="submit" className="button button-primary">Register</button>
              </form>
              <p className="form-footnote">
                Already have an account? <button type="button" className="link-button" onClick={() => navigate('login')}>Login</button>
              </p>
            </div>
          </section>
        )}

        {page === 'dashboard' && token && (
          <section className="dashboard-section">
            <div className="grid-2">
              <div className="panel panel-primary">
                <h2>Welcome back</h2>
                <p>Access your itineraries, event receipts, and community groups in one place.</p>
                <div className="dashboard-actions">
                  <button type="button" className="button button-secondary">Create itinerary</button>
                  <button type="button" className="button button-secondary">Join a group</button>
                </div>
              </div>
              <div className="panel">
                <h3>Quick links</h3>
                <ul>
                  <li>My itineraries</li>
                  <li>Media feed</li>
                  <li>Group discussions</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {page === 'dashboard' && !token && (
          <div className="form-card">
            <h2>Please log in to view your dashboard.</h2>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
