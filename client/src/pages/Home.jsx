import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, Compass, MapPin, Search, Sparkles } from 'lucide-react';
import {
  Button, Card, CardMedia, Field, Input, SectionHead, SkeletonCards, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import PlaceCard from '../components/PlaceCard';
import AddToTripDialog from '../components/AddToTripDialog';
import { useCatalogue } from '../lib/useCatalogue';
import { useAuth, useSavedPlaces, useTrips } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './home.css';

/**
 * The landing page.
 *
 * Photography first. The previous home screen opened with counters — trips
 * planned, places saved, groups joined — which describe an account rather than
 * a country, and which read as a dashboard to anyone arriving for the first
 * time. Those numbers still exist on the dashboard, where they answer a
 * question someone is actually asking.
 *
 * What survives unchanged is the part that does work: the destination and
 * number-of-days inputs, which post to the same `/api/itineraries/quick`
 * endpoint they always did.
 */

const CITY_SUGGESTIONS = [
  'Yaounde', 'Douala', 'Kribi', 'Limbe', 'Buea',
  'Bamenda', 'Bafoussam', 'Garoua', 'Maroua', 'Ngaoundere',
];

function HomeInner() {
  const navigate = useNavigate();
  const toast = useToast();
  const { token, isAuthenticated } = useAuth();
  const { destinations, places, loading } = useCatalogue();
  const { isSaved, toggleSaved } = useSavedPlaces(token);
  const { trips, tripsLoading, addPlaceToTrip } = useTrips(token);

  const [location, setLocation] = useState('');
  const [days, setDays] = useState('3');
  const [building, setBuilding] = useState(false);
  const [tripTarget, setTripTarget] = useState(null);

  /* The hero photograph. Kribi's coast is the most recognisably Cameroonian
     image in the catalogue and the one most likely to make someone want to
     go. */
  const heroImage = '/images/destinations/kribi.jpg';

  // Curated attractions carry their own photographs; the server already ranks
  // them first, so taking from the front is enough.
  const featured = useMemo(
    () => places.filter((p) => p.curated && p.image_url).slice(0, 6),
    [places],
  );

  const experiences = useMemo(
    () => places.filter((p) => !p.curated && p.image_url).slice(0, 4),
    [places],
  );

  const buildTrip = async (event) => {
    event.preventDefault();
    const where = location.trim();

    if (!where) {
      toast.push('Tell us where you are going first.', 'info');
      return;
    }
    if (!isAuthenticated) {
      // Nothing is lost — the destination is carried through the sign-in.
      navigate('/login', { state: { intent: 'build-trip', location: where, days } });
      return;
    }

    setBuilding(true);
    try {
      const result = await api.quickPlan({ location: where, days: Number(days) || 3 }, { token });
      const trip = result?.itinerary;
      toast.push(
        result?.matched
          ? `"${trip.title}" is ready with ${trip.stages?.length || 0} checkpoints.`
          : `Created "${trip.title}", but nothing is catalogued for ${where} yet.`,
        result?.matched ? 'success' : 'info',
      );
      navigate(`/trips/${trip.id}`);
    } catch (error) {
      toast.push(error.message || 'Could not build your trip.', 'error');
    } finally {
      setBuilding(false);
    }
  };

  const onToggleSave = async (place) => {
    if (!isAuthenticated) { navigate('/login'); return; }
    const result = await toggleSaved(place.id);
    if (result.ok) toast.push(result.saved ? `${place.name} saved.` : `${place.name} removed.`, 'success');
    else if (result.reason !== 'auth') toast.push(result.reason, 'error');
  };

  const onAddToTrip = (place) => {
    if (!isAuthenticated) { navigate('/login'); return; }
    setTripTarget(place);
  };

  return (
    <div className="gt home">
      <TopBar
        isAuthenticated={isAuthenticated}
        actions={isAuthenticated
          ? <Button size="sm" onClick={() => navigate('/trips')}>My trips</Button>
          : (
            <>
              <Button size="sm" variant="ghost" onClick={() => navigate('/login')}>Sign in</Button>
              <Button size="sm" onClick={() => navigate('/register')}>Get started</Button>
            </>
          )}
      />

      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <img className="hero__bg" src={heroImage} alt="" aria-hidden="true" />
        <div className="hero__scrim" />

        <div className="gt-page hero__inner">
          <p className="hero__eyebrow">
            <Compass size={15} aria-hidden="true" /> 901 places across all 10 regions
          </p>

          <h1 className="hero__title">Explore Cameroon,<br />Your&nbsp;Way</h1>

          <p className="hero__lede">
            Discover incredible places, build your perfect itinerary, and travel
            Cameroon with confidence.
          </p>

          <form className="hero__form" onSubmit={buildTrip}>
            <Field label="Destination" className="hero__field">
              <div className="gt-search">
                <span className="gt-search__icon" aria-hidden="true"><MapPin size={17} /></span>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Kribi"
                  list="home-cities"
                  autoComplete="off"
                />
              </div>
            </Field>
            <datalist id="home-cities">
              {CITY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
            </datalist>

            <Field label="Days" className="hero__field hero__field--days">
              <div className="gt-search">
                <span className="gt-search__icon" aria-hidden="true"><Calendar size={17} /></span>
                <Input
                  type="number" min="1" max="14"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </div>
            </Field>

            <Button type="submit" size="lg" loading={building} className="hero__cta">
              {building ? 'Building…' : <>Build my trip <ArrowRight size={17} /></>}
            </Button>
          </form>

          <p className="hero__hint">
            Two fields. We fill in the hotel, the places and the day-by-day plan —
            you change whatever you like afterwards.
          </p>
        </div>
      </section>

      <main className="gt-page gt-has-tabbar home__main">
        {/* --------------------------------------------- popular destinations */}
        <section className="home__section">
          <SectionHead
            title="Popular destinations"
            subtitle="Eleven cities, and everything worth stopping for between them."
            action={<Button variant="ghost" size="sm" onClick={() => navigate('/explore')}>Explore all <ArrowRight size={15} /></Button>}
          />

          <div className="dest-rail">
            {destinations.length === 0
              ? Array.from({ length: 5 }, (_, i) => <div key={i} className="dest-card gt-skeleton" />)
              : destinations.slice(0, 8).map((d) => (
                <Link
                  key={d.name}
                  to={`/explore?city=${encodeURIComponent(d.city || d.name)}`}
                  className="dest-card"
                >
                  <img src={d.image_url} alt="" loading="lazy" decoding="async" />
                  <span className="dest-card__scrim" />
                  <span className="dest-card__text">
                    <strong>{d.name}</strong>
                    <span>{d.region}</span>
                  </span>
                </Link>
              ))}
          </div>
        </section>

        {/* -------------------------------------------------- featured places */}
        <section className="home__section">
          <SectionHead
            title="Featured places"
            subtitle="Curated attractions, each with a photograph of its own."
            action={<Button variant="ghost" size="sm" onClick={() => navigate('/explore')}>See more <ArrowRight size={15} /></Button>}
          />

          {loading ? <SkeletonCards count={6} /> : (
            <div className="gt-grid">
              {featured.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  saved={isSaved(place.id)}
                  onToggleSave={onToggleSave}
                  onAddToTrip={onAddToTrip}
                  canSave={isAuthenticated}
                />
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------- recommended experiences */}
        {experiences.length > 0 && (
          <section className="home__section">
            <SectionHead
              title="Recommended experiences"
              subtitle="Places travellers are adding to their trips."
            />
            <div className="gt-grid">
              {experiences.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  saved={isSaved(place.id)}
                  onToggleSave={onToggleSave}
                  onAddToTrip={onAddToTrip}
                  canSave={isAuthenticated}
                  showDescription={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* ------------------------------------------------ continue a trip */}
        {isAuthenticated && trips.length > 0 && (
          <section className="home__section">
            <SectionHead title="Continue your trip" subtitle="Pick up where you left off." />
            <div className="gt-grid gt-grid--wide">
              {trips.slice(0, 3).map((trip) => (
                <Card as={Link} to={`/trips/${trip.id}`} interactive key={trip.id} className="trip-card">
                  <CardMedia src={`/images/destinations/${(trip.location || '').split(',')[0].trim().toLowerCase()}.jpg`} alt="" />
                  <div className="trip-card__body">
                    <strong>{trip.title}</strong>
                    <span className="gt-caption gt-muted">
                      {trip.location}
                      {trip.stages?.length ? ` · ${trip.stages.length} checkpoints` : ''}
                    </span>
                    {trip.cost_breakdown?.total_budget > 0 && (
                      <span className="trip-card__cost">
                        {Number(trip.cost_breakdown.total_budget).toLocaleString('en-US')} FCFA
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* --------------------------------------------------------- closing */}
        <section className="home__cta">
          <Sparkles size={22} aria-hidden="true" />
          <h2 className="gt-h2">More than a trip — it&rsquo;s a connection</h2>
          <p className="gt-muted">
            Plan it, cost it in FCFA, share it with whoever is coming, and take it
            with you offline.
          </p>
          <Button size="lg" onClick={() => navigate('/explore')}>
            <Search size={17} /> Start exploring
          </Button>
        </section>
      </main>

      <TabBar isAuthenticated={isAuthenticated} />

      <AddToTripDialog
        open={Boolean(tripTarget)}
        place={tripTarget}
        trips={trips}
        loading={tripsLoading}
        onClose={() => setTripTarget(null)}
        onAdd={addPlaceToTrip}
      />
    </div>
  );
}

export default function Home() {
  return <ToastProvider><HomeInner /></ToastProvider>;
}
