import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, MapPin, PenLine, Plus, Route, Sparkles } from 'lucide-react';
import {
  Button, Card, CardMedia, EmptyState, Field, Input, SectionHead,
  SkeletonCards, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import CommunityTrips from '../components/CommunityTrips';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth, useTrips } from '../lib/useTravellerData';
import { formatMoney } from '../lib/useItinerary';
import * as api from '../lib/api';
import './trips.css';

/**
 * My Trips.
 *
 * Creation is two fields and two buttons — where and how long, then generate
 * or start empty. Everything else about a trip is decided in the editor, with
 * the plan in front of you, which is the only place those decisions can
 * actually be made well. A questionnaire before the plan exists asks people to
 * choose in the abstract.
 *
 * Both buttons post to endpoints that already exist: the generator to
 * /api/itineraries/quick, the manual path to /api/itineraries, which needs
 * only a title and a location.
 */

const CITIES = [
  'Yaounde', 'Douala', 'Kribi', 'Limbe', 'Buea',
  'Bamenda', 'Bafoussam', 'Garoua', 'Maroua', 'Ngaoundere',
];

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function TripsInner() {
  // Applies the chosen language to everything this page renders.
  const pageRef = useTranslatedPage();

  const navigate = useNavigate();
  const toast = useToast();
  const { token, username, isAuthenticated } = useAuth();
  const { trips, tripsLoading, reloadTrips } = useTrips(token);

  const [location, setLocation] = useState('');
  const [days, setDays] = useState('3');
  const [pending, setPending] = useState(null); // 'generate' | 'manual'

  const tripDays = Math.max(1, Math.min(Number(days) || 3, 14));

  const requireWhere = () => {
    if (location.trim()) return true;
    toast.push('Tell us where you are going first.', 'info');
    return false;
  };

  const generate = async () => {
    if (!requireWhere()) return;
    setPending('generate');
    try {
      const result = await api.quickPlan({ location: location.trim(), days: tripDays }, { token });
      const trip = result.itinerary;
      toast.push(
        result.matched
          ? `"${trip.title}" is ready — ${trip.stages?.length || 0} checkpoints to customise.`
          : `Created "${trip.title}". Nothing is catalogued for ${location.trim()} yet, so add stops yourself.`,
        result.matched ? 'success' : 'info',
      );
      // Straight into the editor: the plan is the point, not a confirmation.
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      toast.push(err.message || 'Could not generate that itinerary.', 'error');
    } finally {
      setPending(null);
    }
  };

  const planManually = async () => {
    if (!requireWhere()) return;
    setPending('manual');
    const where = location.trim();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const trip = await api.createTrip({
        // Named and dated from what was already given, so "plan manually"
        // does not become a second form.
        title: `${tripDays}-day trip to ${where}`,
        location: where,
        startDate: today,
        endDate: addDays(today, tripDays - 1),
      }, { token });
      toast.push('Empty trip created. Add your first stop from Explore.', 'success');
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      toast.push(err.message || 'Could not create that trip.', 'error');
    } finally {
      setPending(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt trips">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar trips__main">
          <EmptyState
            icon={<Route size={22} />}
            title="Sign in to plan a trip"
            body="Your itineraries, saved places and shared trips live in your account."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="gt trips">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Explore</Button>}
      />

      <main className="gt-page gt-has-tabbar trips__main">

        <Breadcrumbs />
        {/* ------------------------------------------------------- create */}
        <section className="create" aria-labelledby="create-heading">
          <h1 id="create-heading" className="gt-h2">Create your trip</h1>
          <p className="create__lede">
            Two things to decide. Everything else you change once the plan is in
            front of you.
          </p>

          <form className="create__form" onSubmit={(e) => { e.preventDefault(); generate(); }}>
            <Field label="Destination" className="create__field">
              <div className="gt-search">
                <span className="gt-search__icon" aria-hidden="true"><MapPin size={17} /></span>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Where do you want to go?"
                  list="trip-cities"
                  autoComplete="off"
                />
              </div>
            </Field>
            <datalist id="trip-cities">
              {CITIES.map((c) => <option key={c} value={c} />)}
            </datalist>

            <Field label="Number of days" className="create__field create__field--days">
              <div className="gt-search">
                <span className="gt-search__icon" aria-hidden="true"><Calendar size={17} /></span>
                <Input
                  type="number" min="1" max="14"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </div>
            </Field>
          </form>

          <div className="create__actions">
            <Button
              size="lg"
              onClick={generate}
              loading={pending === 'generate'}
              disabled={pending !== null}
            >
              <Sparkles size={18} /> Generate my itinerary
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={planManually}
              loading={pending === 'manual'}
              disabled={pending !== null}
            >
              <PenLine size={17} /> Plan manually
            </Button>
          </div>

          <p className="create__hint">
            Generating fills in a hotel, places and a day-by-day plan from the
            Cameroon catalogue — all of it editable afterwards.
          </p>
        </section>

        {/* -------------------------------------------------------- trips */}
        <section className="trips__list">
          <SectionHead
            title="My trips"
            subtitle={trips.length > 0 ? `${trips.length} trip${trips.length === 1 ? '' : 's'} planned.` : undefined}
          />

          {tripsLoading ? (
            <SkeletonCards count={3} wide />
          ) : trips.length === 0 ? (
            <EmptyState
              icon={<Route size={22} />}
              title="No trips yet"
              body="Start exploring Cameroon and build your first adventure."
              action={<Button size="sm" onClick={() => navigate('/explore')}>Explore Cameroon</Button>}
            />
          ) : (
            <div className="gt-grid gt-grid--wide">
              {trips.map((trip) => {
                const city = (trip.location || '').split(',')[0].trim().toLowerCase();
                const stops = trip.stages?.length || 0;
                const total = trip.cost_breakdown?.total_budget;
                return (
                  <Card as={Link} to={`/trips/${trip.id}`} interactive key={trip.id} className="trip">
                    <CardMedia src={`/images/destinations/${city}.jpg`} alt="" />
                    <div className="trip__body">
                      <strong className="trip__title">{trip.title}</strong>
                      <span className="trip__meta">
                        <MapPin size={12} aria-hidden="true" /> {trip.location}
                      </span>
                      <div className="trip__facts">
                        {trip.duration_days > 0 && <span>{trip.duration_days} day{trip.duration_days === 1 ? '' : 's'}</span>}
                        <span>{stops} checkpoint{stops === 1 ? '' : 's'}</span>
                      </div>
                      {total > 0 && <span className="trip__cost">{formatMoney(total, trip.currency_label || 'FCFA')}</span>}
                      <span className="trip__open">Open trip →</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Public trips by other travellers: copy one into your own account,
            or join the person who planned it. */}
        <CommunityTrips token={token} username={username} onCopied={reloadTrips} />
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Trips() {
  return <ToastProvider><TripsInner /></ToastProvider>;
}
