import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Clock, Compass, ExternalLink, Heart, Info, MapPin, Plus, Star,
} from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, SectionHead, Skeleton, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import PlaceCard from '../components/PlaceCard';
import AddToTripDialog from '../components/AddToTripDialog';
import TravelMap from '../TravelMap';
import { categoryLabel, isContextualImage } from '../lib/useCatalogue';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth, useSavedPlaces, useTrips } from '../lib/useTravellerData';
import * as api from '../lib/api';
import './place-details.css';

/**
 * One place, as a destination page.
 *
 * Previously a panel inside Discovery; now a real address, so a place can be
 * linked, bookmarked and shared.
 *
 * Everything on it comes from `/api/resources/places/<id>`, which already
 * returns the place, nearby entries, traveller photos, videos and an offline
 * guide in one response. Nothing is invented: a field the catalogue does not
 * hold — opening hours, most obviously — is simply not shown.
 */

const fcfa = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${amount.toLocaleString('en-US')} FCFA`;
};

function PlaceDetailsInner() {
  // Applies the chosen language to everything this page renders.
  const pageRef = useTranslatedPage();

  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { token, isAuthenticated } = useAuth();
  const { isSaved, toggleSaved } = useSavedPlaces(token);
  const { trips, tripsLoading, addPlaceToTrip } = useTrips(token);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [tripTarget, setTripTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setActiveImage(0);

    api.getPlace(id, { signal: controller.signal })
      .then((payload) => { if (!cancelled) { setData(payload); setLoading(false); } })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        setError(err.status === 404 ? 'notfound' : (err.message || 'Could not load this place.'));
        setLoading(false);
      });

    // A new place means a new page; start at the top rather than halfway down
    // the previous one.
    window.scrollTo({ top: 0 });

    return () => { cancelled = true; controller.abort(); };
  }, [id]);

  const place = data?.place;
  const photos = data?.photos || [];

  /* The server groups nearby entries as { places, hotels, activities } rather
     than a flat list. Places come first because they are what someone reading
     about one attraction is most likely to want next; somewhere to stay and
     something to do follow. Each is tagged so PlaceCard knows which of them
     has a detail page of its own. */
  const nearby = React.useMemo(() => {
    const groups = data?.nearby;
    if (!groups) return [];
    if (Array.isArray(groups)) return groups.map((item) => ({ ...item, __kind: 'place' }));
    return [
      ...(groups.places || []).map((item) => ({ ...item, __kind: 'place' })),
      ...(groups.activities || []).map((item) => ({ ...item, __kind: 'activity' })),
      ...(groups.hotels || []).map((item) => ({
        ...item, __kind: 'hotel', cost: item.cost_per_night ?? item.cost,
      })),
    ].filter((item) => item.id !== data?.place?.id);
  }, [data]);

  /* The gallery. The catalogue's own `images` first, then traveller
     photographs, then `image_url` as a fallback. Contextual city shots are
     kept but labelled rather than dropped: showing nothing would be worse,
     and showing one unlabelled would be dishonest.

     Entries in `images` are objects carrying the URL alongside the
     photographer and licence — most are Wikimedia Commons under CC BY-SA,
     which requires the credit to travel with the picture — so each is
     normalised rather than assumed to be a string. */
  const gallery = React.useMemo(() => {
    if (!place) return [];

    const normalise = (entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') return { url: entry };
      if (typeof entry === 'object' && (entry.url || entry.image_url)) {
        return {
          url: entry.url || entry.image_url,
          author: entry.author || entry.username || '',
          license: entry.license || '',
          sourceUrl: entry.source_url || '',
        };
      }
      return null;
    };

    const all = [
      ...(Array.isArray(place.images) ? place.images : []),
      ...photos,
      place.image_url,
    ].map(normalise).filter(Boolean);

    const seen = new Set();
    return all.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [place, photos]);

  const activePhoto = gallery[activeImage] || null;

  const onToggleSave = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    const result = await toggleSaved(place.id);
    if (result.ok) toast.push(result.saved ? `${place.name} saved.` : `${place.name} removed.`, 'success');
    else if (result.reason !== 'auth') toast.push(result.reason, 'error');
  };

  const shell = (children) => (
    <div ref={pageRef} className="gt pd">
      <TopBar
        isAuthenticated={isAuthenticated}
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Explore</Button>}
      />
      {children}
      <TabBar isAuthenticated={isAuthenticated} />
    </div>
  );

  if (loading) {
    return shell(
      <main className="gt-page gt-has-tabbar pd__main">
        <Skeleton height="clamp(16rem, 42vh, 26rem)" style={{ borderRadius: 'var(--gt-radius-xl)' }} />
        <div className="gt-stack gt-gap-3" style={{ marginTop: 'var(--gt-space-5)', maxWidth: '40rem' }}>
          <Skeleton height="2.2rem" width="60%" />
          <Skeleton height="1rem" width="35%" />
          <Skeleton height="1rem" />
          <Skeleton height="1rem" width="85%" />
        </div>
      </main>,
    );
  }

  if (error || !place) {
    return shell(
      <main className="gt-page gt-has-tabbar pd__main">
        <EmptyState
          icon={<Compass size={22} />}
          title={error === 'notfound' ? 'We have no record of that place' : 'Could not load this place'}
          body={
            error === 'notfound'
              ? 'The link may be out of date. Explore the catalogue to find somewhere else.'
              : 'Check your connection and try again.'
          }
          action={<Button size="sm" onClick={() => navigate('/explore')}>Explore Cameroon</Button>}
        />
      </main>,
    );
  }

  const contextual = isContextualImage(place);
  const price = fcfa(place.cost);
  const rating = Number(place.rating) || 0;
  const where = [place.city, place.division, place.region].filter(Boolean).join(', ');
  const hasCoords = Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude));
  const mapsUrl = place.map_info?.google_map_url
    || (hasCoords ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}` : null);
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];

  return shell(
    <main className="gt-has-tabbar">
      {/* ------------------------------------------------------- gallery */}
      <section className="gt-page pd__gallery-wrap">
        <Link to="/explore" className="pd__back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to Explore
        </Link>

        <div className="pd__gallery">
          <figure className="pd__hero">
            {activePhoto ? (
              <img src={activePhoto.url} alt={place.name} />
            ) : (
              <div className="gt-skeleton pd__hero-empty" aria-hidden="true" />
            )}
            {contextual && activeImage === 0 && (
              <figcaption className="pd__contextual">
                <Info size={13} aria-hidden="true" />
                Photograph of {place.city || 'the surrounding area'}, not of this place
              </figcaption>
            )}
          </figure>

          {activePhoto?.author && (
            <p className="pd__credit">
              Photograph by {activePhoto.author}
              {activePhoto.license ? ` · ${activePhoto.license}` : ''}
              {activePhoto.sourceUrl && (
                <> · <a href={activePhoto.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></>
              )}
            </p>
          )}

          {gallery.length > 1 && (
            <div className="pd__thumbs" role="group" aria-label="Photographs">
              {gallery.slice(0, 5).map((photo, index) => (
                <button
                  key={photo.url}
                  type="button"
                  className={`pd__thumb${index === activeImage ? ' is-active' : ''}`}
                  aria-label={`Photograph ${index + 1} of ${Math.min(gallery.length, 5)}`}
                  aria-current={index === activeImage}
                  onClick={() => setActiveImage(index)}
                >
                  <img src={photo.url} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------- title and body */}
      <div className="gt-page pd__body">
        <div className="pd__col-main">
          <header className="pd__title">
            <div className="pd__badges">
              <Badge tone={place.curated ? 'primary' : 'neutral'}>{categoryLabel(place)}</Badge>
              {rating > 0 && (
                <span className="pd__rating">
                  <Star size={14} fill="currentColor" strokeWidth={0} />
                  {rating.toFixed(1)}
                  {reviews.length > 0 && <span className="gt-muted"> · {reviews.length} review{reviews.length === 1 ? '' : 's'}</span>}
                </span>
              )}
            </div>

            <h1 className="gt-h1 pd__name">{place.name}</h1>

            {where && (
              <p className="pd__where">
                <MapPin size={15} aria-hidden="true" /> {where}
              </p>
            )}
          </header>

          {/* ----------------------------------------------------- about */}
          <section className="pd__section">
            <h2 className="gt-h3">About</h2>
            <p className="pd__desc">
              {place.description || `${place.name} is listed in the GlobeTrotter catalogue for ${place.city || 'Cameroon'}.`}
            </p>

            <dl className="pd__facts">
              {price && (<><dt>Typical cost</dt><dd>{price}{place.cost_note ? ` · ${place.cost_note}` : ''}</dd></>)}
              {!price && (<><dt>Typical cost</dt><dd className="pd__free">Free</dd></>)}
              {place.best_season && (<><dt>Best season</dt><dd>{place.best_season}</dd></>)}
              {place.difficulty && (<><dt>Difficulty</dt><dd style={{ textTransform: 'capitalize' }}>{place.difficulty}</dd></>)}
              {place.guide_required !== undefined && (
                <><dt>Guide</dt><dd>{place.guide_required ? 'Recommended' : 'Optional'}</dd></>
              )}
              {hasCoords && (
                <><dt>Coordinates</dt>
                  <dd className="pd__coords">{Number(place.latitude).toFixed(4)}, {Number(place.longitude).toFixed(4)}</dd></>
              )}
            </dl>

            {/* Opening hours are deliberately absent: no record in the
                catalogue carries them, and inventing one is worse than
                omitting it. */}
            <p className="pd__nohours">
              <Clock size={13} aria-hidden="true" />
              Opening hours are not catalogued for this place — check locally before travelling.
            </p>

            {place.transport_note && (
              <p className="pd__note"><Info size={14} aria-hidden="true" /> {place.transport_note}</p>
            )}

            {Array.isArray(place.safety_notes) && place.safety_notes.length > 0 && (
              <ul className="pd__safety">
                {place.safety_notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            )}
          </section>

          {/* ---------------------------------------------------- reviews */}
          <section className="pd__section">
            <h2 className="gt-h3">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="gt-muted pd__empty-line">
                No reviews yet. Travellers who have been can add the first one.
              </p>
            ) : (
              <ul className="pd__reviews">
                {reviews.slice(0, 6).map((review, index) => (
                  <li key={review.id || index}>
                    <div className="pd__review-head">
                      <strong>{review.username || review.author || 'A traveller'}</strong>
                      {Number(review.rating) > 0 && (
                        <span className="pd__rating">
                          <Star size={12} fill="currentColor" strokeWidth={0} />
                          {Number(review.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p>{review.comment || review.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ actions / map */}
        <aside className="pd__col-side">
          <Card className="pd__actions" padded>
            <div className="pd__price-row">
              <span>{price || 'Free'}</span>
              {price && <span className="gt-caption gt-muted">typical cost</span>}
            </div>

            <Button size="lg" block onClick={() => (isAuthenticated ? setTripTarget(place) : navigate('/login'))}>
              <Plus size={17} /> Add to trip
            </Button>

            <Button variant="secondary" block onClick={onToggleSave} aria-pressed={isSaved(place.id)}>
              <Heart size={16} fill={isSaved(place.id) ? 'currentColor' : 'none'} />
              {isSaved(place.id) ? 'Saved' : 'Save this place'}
            </Button>

            {mapsUrl && (
              <Button variant="ghost" block onClick={() => window.open(mapsUrl, '_blank', 'noopener')}>
                <ExternalLink size={15} /> Open in Google Maps
              </Button>
            )}
          </Card>

          {hasCoords && (
            <Card className="pd__map">
              <TravelMap
                markers={[{
                  id: place.id,
                  name: place.name,
                  location: where,
                  // TravelMap takes a [lat, lon] pair, not separate fields.
                  position: [Number(place.latitude), Number(place.longitude)],
                }]}
                center={[Number(place.latitude), Number(place.longitude)]}
                zoom={13}
                className="pd__map-canvas"
                ariaLabel={`Map showing the location of ${place.name}`}
              />
            </Card>
          )}
        </aside>
      </div>

      {/* --------------------------------------------------- nearby places */}
      {nearby.length > 0 && (
        <section className="gt-page pd__nearby">
          <SectionHead
            title="Nearby places"
            subtitle={`Other entries catalogued around ${place.city || 'here'}.`}
          />
          <div className="gt-grid">
            {nearby.slice(0, 8).map((item) => (
              <PlaceCard
                key={item.id}
                place={item}
                saved={isSaved(item.id)}
                onToggleSave={isAuthenticated ? (p) => toggleSaved(p.id) : undefined}
                canSave={isAuthenticated}
                showDescription={false}
              />
            ))}
          </div>
        </section>
      )}

      <AddToTripDialog
        open={Boolean(tripTarget)}
        place={tripTarget}
        trips={trips}
        loading={tripsLoading}
        onClose={() => setTripTarget(null)}
        onAdd={addPlaceToTrip}
      />
    </main>,
  );
}

export default function PlaceDetails() {
  return <ToastProvider><PlaceDetailsInner /></ToastProvider>;
}
