import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, MapPin, Star, UserPlus, Users } from 'lucide-react';
import {
  Button, Card, CardMedia, EmptyState, SectionHead, SkeletonCards, useToast,
} from './ui';
import { formatMoney } from '../lib/useItinerary';
import * as api from '../lib/api';
import './community-trips.css';

/**
 * Trips other travellers have made public.
 *
 * Two things you can do with someone else's trip, and they are not the same:
 *
 *   Copy  duplicates it into your own account, dates cleared, so you can
 *         rearrange it without touching theirs. You end up with your own trip.
 *   Join  adds you to theirs as a participant. There is still one trip, and
 *         it is still the owner's.
 *
 * Both exist on the server already; the labels here are chosen so the
 * difference is legible before you click, rather than after.
 *
 * A trip's own trips are filtered out: the server returns every public trip
 * including your own, and offering to copy your own trip is noise.
 */

function averageRating(trip) {
  const feedback = trip.feedback || [];
  if (feedback.length === 0) return null;
  const total = feedback.reduce((sum, item) => sum + (Number(item.rating) || 0), 0);
  return { value: Math.round((total / feedback.length) * 10) / 10, count: feedback.length };
}

export default function CommunityTrips({ token, username, onCopied }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyOn, setBusyOn] = useState('');

  const load = useCallback(() => {
    if (!token) { setLoading(false); return undefined; }
    const controller = new AbortController();
    api.listCommunityTrips({ token, signal: controller.signal })
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : (payload?.itineraries || []);
        setTrips(list);
      })
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);

  useEffect(() => load(), [load]);

  const others = useMemo(
    () => trips.filter((trip) => (trip.owner_username || trip.username) !== username),
    [trips, username],
  );

  const copy = async (trip) => {
    setBusyOn(trip.id);
    try {
      const result = await api.copyTrip(trip.id, { token });
      const copied = result?.itinerary || result;
      toast.push('Copied into your trips.');
      onCopied?.();
      if (copied?.id) navigate(`/trips/${copied.id}`);
    } catch (error) {
      toast.push(error.message || 'Could not copy that trip.', 'error');
    } finally {
      setBusyOn('');
    }
  };

  const join = async (trip) => {
    setBusyOn(trip.id);
    try {
      await api.joinTrip(trip.id, {}, { token });
      // Reflect the new participant without a round trip; the server returns
      // the itinerary but the list only needs the count.
      setTrips((current) => current.map((item) => (
        item.id === trip.id
          ? { ...item, participants: [...(item.participants || []), username] }
          : item
      )));
      toast.push(`You joined ${trip.title}.`);
    } catch (error) {
      toast.push(error.message || 'Could not join that trip.', 'error');
    } finally {
      setBusyOn('');
    }
  };

  if (loading) {
    return (
      <section className="ctrips">
        <SectionHead title="Trips from the community" />
        <SkeletonCards count={3} wide />
      </section>
    );
  }

  return (
    <section className="ctrips">
      <SectionHead
        title="Trips from the community"
        subtitle={others.length > 0
          ? 'Copy one to make it yours, or join the traveller who planned it.'
          : undefined}
      />

      {others.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="No public trips yet"
          body="When travellers make a trip public, it appears here for anyone to copy or join."
        />
      ) : (
        <div className="gt-grid gt-grid--wide">
          {others.map((trip) => {
            const city = (trip.location || '').split(',')[0].trim().toLowerCase();
            const stops = trip.stages?.length || 0;
            const total = trip.cost_breakdown?.total_budget;
            const owner = trip.owner_username || trip.username;
            const rating = averageRating(trip);
            const joined = (trip.participants || []).includes(username);

            return (
              <Card key={trip.id} className="ctrip">
                <Link to={`/trips/${trip.id}`} className="ctrip__link">
                  <CardMedia src={`/images/destinations/${city}.jpg`} alt="" />
                  <div className="ctrip__body">
                    <strong className="ctrip__title">{trip.title}</strong>
                    <span className="ctrip__meta">
                      <MapPin size={12} aria-hidden="true" /> {trip.location}
                    </span>
                    <div className="ctrip__facts">
                      <span>by {owner}</span>
                      <span>{stops} checkpoint{stops === 1 ? '' : 's'}</span>
                      {(trip.participants || []).length > 0 && (
                        <span>{trip.participants.length} joined</span>
                      )}
                    </div>
                    {rating && (
                      <span className="ctrip__rating">
                        <Star size={13} fill="currentColor" aria-hidden="true" />
                        {rating.value}
                        <span className="gt-caption gt-muted">
                          ({rating.count} rating{rating.count === 1 ? '' : 's'})
                        </span>
                      </span>
                    )}
                    {total > 0 && (
                      <span className="ctrip__cost">
                        {formatMoney(total, trip.currency_label || 'FCFA')}
                      </span>
                    )}
                  </div>
                </Link>

                <div className="ctrip__actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyOn === trip.id}
                    onClick={() => copy(trip)}
                  >
                    <Copy size={14} aria-hidden="true" /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant={joined ? 'ghost' : 'secondary'}
                    disabled={busyOn === trip.id || joined}
                    onClick={() => join(trip)}
                  >
                    <UserPlus size={14} aria-hidden="true" /> {joined ? 'Joined' : 'Join'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
