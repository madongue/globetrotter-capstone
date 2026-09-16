import React, { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { Button, Textarea, useToast } from './ui';
import * as api from '../lib/api';
import './trip-feedback.css';

/**
 * Ratings and comments on a trip.
 *
 * The server carries both on one endpoint: `POST /itineraries/<id>/feedback`
 * requires a rating of 1-5 and treats the comment as optional. So there is no
 * "comment without a rating" to offer, and this asks for the star first.
 *
 * Existing feedback is not fetched separately — it rides along on the
 * itinerary, which the page has already loaded. The reply to a new rating
 * carries the updated itinerary too, so the list refreshes without a second
 * request.
 *
 * Everyone with access to the trip may rate it, including the owner. That is
 * the server's rule, not this component's: the endpoint checks access, not
 * authorship.
 */

const STARS = [1, 2, 3, 4, 5];

function Stars({ value, size = 15 }) {
  return (
    <span className="tfb__stars" aria-label={`${value} out of 5`}>
      {STARS.map((n) => (
        <Star
          key={n}
          size={size}
          aria-hidden="true"
          className={n <= value ? 'tfb__star tfb__star--on' : 'tfb__star'}
          fill={n <= value ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

export default function TripFeedback({ trip, token, onUpdated }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const entries = useMemo(
    () => [...(trip?.feedback || [])].reverse(),
    [trip],
  );

  const average = useMemo(() => {
    if (entries.length === 0) return 0;
    const total = entries.reduce((sum, item) => sum + (Number(item.rating) || 0), 0);
    return Math.round((total / entries.length) * 10) / 10;
  }, [entries]);

  const submit = async (event) => {
    event.preventDefault();
    if (!rating) return;
    setBusy(true);
    try {
      const result = await api.rateTrip(trip.id, { rating, comment: comment.trim() }, { token });
      setRating(0);
      setComment('');
      // The reply carries the whole updated itinerary, so the list above can
      // refresh from it rather than the page re-fetching.
      if (result?.itinerary) onUpdated?.(result.itinerary);
      toast.push('Thanks — your rating was recorded.');
    } catch (error) {
      toast.push(error.message || 'Could not record that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || rating;

  return (
    <section className="tfb">
      <header className="tfb__head">
        <h2 className="gt-h4">Ratings and comments</h2>
        {entries.length > 0 && (
          <p className="tfb__avg">
            <Stars value={Math.round(average)} />
            <strong>{average}</strong>
            <span className="gt-caption gt-muted">
              {entries.length} rating{entries.length === 1 ? '' : 's'}
            </span>
          </p>
        )}
      </header>

      {token ? (
        <form className="tfb__form" onSubmit={submit}>
          <div
            className="tfb__pick"
            role="radiogroup"
            aria-label="Your rating"
            onMouseLeave={() => setHover(0)}
          >
            {STARS.map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                className={n <= shown ? 'tfb__pick-star tfb__pick-star--on' : 'tfb__pick-star'}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(0)}
                onClick={() => setRating(n)}
              >
                <Star size={22} fill={n <= shown ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            ))}
          </div>

          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder="How was this trip? What would you tell someone planning it?"
            aria-label="Your comment"
          />

          <Button type="submit" size="sm" disabled={busy || !rating}>
            {busy ? 'Sending…' : 'Post rating'}
          </Button>
          {!rating && (
            <p className="gt-caption gt-muted">Choose a star rating to post.</p>
          )}
        </form>
      ) : (
        <p className="gt-small gt-muted">Sign in to rate this trip.</p>
      )}

      {entries.length === 0 ? (
        <p className="gt-small gt-muted">No ratings yet.</p>
      ) : (
        <ul className="tfb__list">
          {entries.map((item) => (
            <li className="tfb__item" key={item.id}>
              <div className="tfb__item-head">
                <strong>{item.username}</strong>
                <Stars value={Number(item.rating) || 0} size={13} />
                {item.created_at && (
                  <span className="gt-caption gt-muted">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {item.comment && <p className="tfb__comment">{item.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
