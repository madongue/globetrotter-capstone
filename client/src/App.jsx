import { useEffect, useState } from 'react';

const API_BASE = '/api';

function App() {
  const [page, setPage] = useState('home');
  const [token, setToken] = useState(localStorage.getItem('gt_token') || '');
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [itineraries, setItineraries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedItinerary, setSelectedItinerary] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mobile');
  const [paymentTargetType, setPaymentTargetType] = useState('total');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newItinerary, setNewItinerary] = useState({
    title: '',
    location: '',
    hotelName: '',
    hotelCost: '',
    activityName: '',
    activityCost: '',
    placeName: '',
    placeCost: '',
    startDate: '',
    endDate: '',
  });

  const navigate = (target) => {
    setAlert(null);
    setPage(target);
  };

  const fetchDashboardData = async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const [recoRes, itinRes, groupsRes] = await Promise.all([
        fetch(`${API_BASE}/recommendations?limit=4`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/itineraries`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (recoRes.ok) {
        setRecommendations(await recoRes.json());
      } else {
        setRecommendations([]);
      }

      if (itinRes.ok) {
        setItineraries(await itinRes.json());
      } else {
        setItineraries([]);
      }

      if (groupsRes.ok) {
        setGroups(await groupsRes.json());
      } else {
        setGroups([]);
      }
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to load dashboard data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (page === 'dashboard' && token) {
      fetchDashboardData();
    }
  }, [page, token]);

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
    setRecommendations([]);
    setItineraries([]);
    setAlert({ type: 'success', message: 'Logged out successfully.' });
  };

  const handleDestinationSearch = async (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/destinations?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        const result = await response.json();
        setAlert({ type: 'error', message: result.error || 'Destination search failed.' });
        setSearchResults([]);
        return;
      }
      setSearchResults(await response.json());
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to search destinations.' });
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItinerary = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to create an itinerary.' });
      return;
    }

    const title = newItinerary.title.trim();
    const location = newItinerary.location.trim();
    if (!title || !location) {
      setAlert({ type: 'error', message: 'Title and location are required.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title,
        location,
        hotel: newItinerary.hotelName.trim()
          ? {
              name: newItinerary.hotelName.trim(),
              cost_per_night: Number(newItinerary.hotelCost) || 0,
            }
          : {},
        activities: newItinerary.activityName.trim()
          ? [{ name: newItinerary.activityName.trim(), cost: Number(newItinerary.activityCost) || 0 }]
          : [],
        places_to_visit: newItinerary.placeName.trim()
          ? [{ name: newItinerary.placeName.trim(), cost: Number(newItinerary.placeCost) || 0 }]
          : [],
        start_date: newItinerary.startDate,
        end_date: newItinerary.endDate,
      };

      const response = await fetch(`${API_BASE}/itineraries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create itinerary.' });
        return;
      }

      setItineraries((current) => [result, ...current]);
      setAlert({ type: 'success', message: 'Itinerary created successfully.' });
      setNewItinerary({
        title: '',
        location: '',
        hotelName: '',
        hotelCost: '',
        activityName: '',
        activityCost: '',
        placeName: '',
        placeCost: '',
        startDate: '',
        endDate: '',
      });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to create a group.' });
      return;
    }

    const name = newGroupName.trim();
    if (!name) {
      setAlert({ type: 'error', message: 'Group name is required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description: newGroupDescription.trim() }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create group.' });
        return;
      }

      setGroups((current) => [result, ...current]);
      setAlert({ type: 'success', message: 'Group created successfully.' });
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create group.' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (groupId) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to join a group.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups/${groupId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to join group.' });
        return;
      }

      setAlert({ type: 'success', message: result.message || 'Joined group successfully.' });
      await fetchDashboardData();
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to join group.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItinerary = (itinerary) => {
    setSelectedItinerary(itinerary);
    setPaymentAmount('');
    setPaymentMethod('mobile');
    setPaymentTargetType('total');
    setPage('itinerary');
  };

  const handlePayItinerary = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login to complete payment.' });
      return;
    }

    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setAlert({ type: 'error', message: 'Enter a valid payment amount.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          payment_method: paymentMethod,
          target_type: paymentTargetType,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Payment failed.' });
        return;
      }

      setSelectedItinerary(result.itinerary);
      setItineraries((current) => current.map((item) => (item.id === result.itinerary.id ? result.itinerary : item)));
      setAlert({ type: 'success', message: 'Payment complete. Receipt generated.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to process payment.' });
    } finally {
      setLoading(false);
    }
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
              <h1>Plan trips, sell event tickets, and connect with travelers.</h1>
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
                  <li>Destination recommendations</li>
                  <li>Group discussions</li>
                </ul>
              </div>
            </div>

            <div className="grid-3 mt-24">
              <div className="panel">
                <h3>Recent itineraries</h3>
                {loading ? (
                  <p>Loading...</p>
                ) : itineraries.length === 0 ? (
                  <p>No itineraries found yet.</p>
                ) : (
                  <ul className="list-card">
                    {itineraries.map((itinerary) => (
                      <li key={itinerary.id} className="itinerary-card">
                        <div>
                          <strong>{itinerary.title}</strong>
                          <p>{itinerary.location}</p>
                        </div>
                        <button type="button" className="button button-secondary" onClick={() => handleSelectItinerary(itinerary)}>
                          View
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel">
                <h3>Recommended destinations</h3>
                {loading ? (
                  <p>Loading...</p>
                ) : recommendations.length === 0 ? (
                  <p>No recommendations available yet.</p>
                ) : (
                  <ul className="list-card">
                    {recommendations.map((item) => (
                      <li key={item.name}>
                        <strong>{item.name}</strong>
                        <p>{item.country}</p>
                        <p className="small-text">Match score: {item.match_score}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel">
                <h3>Create itinerary</h3>
                <form onSubmit={handleCreateItinerary} className="stacked-form">
                  <label>
                    Title
                    <input
                      value={newItinerary.title}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Beach Escape"
                      required
                    />
                  </label>
                  <label>
                    Location
                    <input
                      value={newItinerary.location}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Bali"
                      required
                    />
                  </label>
                  <label>
                    Hotel name
                    <input
                      value={newItinerary.hotelName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, hotelName: event.target.value }))}
                      placeholder="Seaside Hotel"
                    />
                  </label>
                  <label>
                    Hotel cost
                    <input
                      type="number"
                      value={newItinerary.hotelCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, hotelCost: event.target.value }))}
                      placeholder="120"
                    />
                  </label>
                  <label>
                    Activity name
                    <input
                      value={newItinerary.activityName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, activityName: event.target.value }))}
                      placeholder="Surf Lesson"
                    />
                  </label>
                  <label>
                    Activity cost
                    <input
                      type="number"
                      value={newItinerary.activityCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, activityCost: event.target.value }))}
                      placeholder="50"
                    />
                  </label>
                  <label>
                    Place to visit
                    <input
                      value={newItinerary.placeName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, placeName: event.target.value }))}
                      placeholder="Uluwatu"
                    />
                  </label>
                  <label>
                    Place cost
                    <input
                      type="number"
                      value={newItinerary.placeCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, placeCost: event.target.value }))}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Start date
                    <input
                      type="date"
                      value={newItinerary.startDate}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, startDate: event.target.value }))}
                    />
                  </label>
                  <label>
                    End date
                    <input
                      type="date"
                      value={newItinerary.endDate}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, endDate: event.target.value }))}
                    />
                  </label>
                  <button type="submit" className="button button-primary">Create itinerary</button>
                </form>
              </div>
            </div>
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Destination search</h3>
                <form onSubmit={handleDestinationSearch} className="search-form">
                  <label>
                    Search
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Paris, Bali, beach"
                      required
                    />
                  </label>
                  <button type="submit" className="button button-primary">Search</button>
                </form>
                {searchResults.length > 0 && (
                  <div className="search-results">
                    <h4>Results</h4>
                    <ul className="list-card">
                      {searchResults.map((dest) => (
                        <li key={dest.name}>
                          <strong>{dest.name}</strong>
                          <p>{dest.country} • {dest.continent}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="panel">
                <h3>Groups</h3>
                <form onSubmit={handleCreateGroup} className="stacked-form">
                  <label>
                    Group name
                    <input
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      placeholder="Bali Travelers"
                      required
                    />
                  </label>
                  <label>
                    Description
                    <input
                      value={newGroupDescription}
                      onChange={(event) => setNewGroupDescription(event.target.value)}
                      placeholder="Share tips and meet other travellers"
                    />
                  </label>
                  <button type="submit" className="button button-primary">Create group</button>
                </form>
                {groups.length > 0 ? (
                  <ul className="list-card mt-16">
                    {groups.slice(0, 4).map((group) => (
                      <li key={group.id} className="group-card">
                        <div>
                          <strong>{group.name}</strong>
                          <p>{group.description}</p>
                        </div>
                        <button type="button" className="button button-secondary" onClick={() => handleJoinGroup(group.id)}>
                          Join
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No groups available yet.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {page === 'dashboard' && !token && (
          <div className="form-card">
            <h2>Please log in to view your dashboard.</h2>
          </div>
        )}

        {page === 'itinerary' && selectedItinerary && (
          <section className="dashboard-section">
            <div className="panel panel-primary">
              <button type="button" className="link-button" onClick={() => setPage('dashboard')}>
                ← Back to dashboard
              </button>
              <h2>{selectedItinerary.title}</h2>
              <p>{selectedItinerary.location}</p>
              <p>{selectedItinerary.notes}</p>
              <div className="detail-grid">
                <div>
                  <strong>Participants</strong>
                  <p>{selectedItinerary.participants?.join(', ') || 'None'}</p>
                </div>
                <div>
                  <strong>Status</strong>
                  <p>{selectedItinerary.payment_status}</p>
                </div>
                <div>
                  <strong>Total budget</strong>
                  <p>${selectedItinerary.cost_breakdown?.total_budget ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Trip details</h3>
                <p><strong>Hotel:</strong> {selectedItinerary.hotel?.name || 'None'}</p>
                <p><strong>Activities:</strong></p>
                <ul>
                  {(selectedItinerary.activities || []).map((activity) => (
                    <li key={activity.name}>{activity.name} — ${activity.cost}</li>
                  ))}
                </ul>
                <p><strong>Places to visit:</strong></p>
                <ul>
                  {(selectedItinerary.places_to_visit || []).map((place) => (
                    <li key={place.name}>{place.name} — ${place.cost}</li>
                  ))}
                </ul>
              </div>
              <div className="panel">
                <h3>Payment receipt</h3>
                {selectedItinerary.receipts?.length > 0 ? (
                  <ul className="list-card">
                    {selectedItinerary.receipts.map((receipt) => (
                      <li key={receipt.id}>
                        <strong>{receipt.note || receipt.target_type}</strong>
                        <p>Amount: ${receipt.amount.toFixed(2)}</p>
                        <p>Commission: ${receipt.commission_amount.toFixed(2)}</p>
                        <p>Net: ${receipt.net_amount.toFixed(2)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No payments recorded yet.</p>
                )}
              </div>
            </div>

            <div className="panel mt-24">
              <h3>Make a payment</h3>
              <form onSubmit={handlePayItinerary} className="stacked-form">
                <label>
                  Amount
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder="150"
                    required
                  />
                </label>
                <label>
                  Payment method
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option value="mobile">Mobile</option>
                    <option value="card">Card</option>
                  </select>
                </label>
                <label>
                  Target type
                  <select value={paymentTargetType} onChange={(event) => setPaymentTargetType(event.target.value)}>
                    <option value="total">Total</option>
                    <option value="share">Share</option>
                    <option value="event_ticket">Event ticket</option>
                  </select>
                </label>
                <button type="submit" className="button button-primary">Submit payment</button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
