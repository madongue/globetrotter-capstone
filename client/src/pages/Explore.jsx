import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Compass, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Button, Chip, EmptyState, Field, SearchInput, Select,
  SkeletonCards, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import PlaceCard from '../components/PlaceCard';
import AddToTripDialog from '../components/AddToTripDialog';
import { CATEGORY_FILTERS, useCatalogue } from '../lib/useCatalogue';
import { useAuth, useSavedPlaces, useTrips } from '../lib/useTravellerData';
import './explore.css';

/**
 * Explore Cameroon.
 *
 * The catalogue is 845 places, and 594 of them are eateries imported from
 * OpenStreetMap. Shown in file order it reads as a restaurant directory, so
 * two things keep the attractions in front:
 *
 *   - the server's own ranking (`_discovery_rank`), which puts curated,
 *     photographed entries first and which this page never re-sorts;
 *   - a "Tourist sites" filter that is the first thing after "All".
 *
 * Results are paged in the browser rather than by the server, because the
 * catalogue endpoint returns the whole ranked list and re-requesting it per
 * page would be slower than keeping it.
 */

const PAGE_SIZE = 24;

const PRICE_BANDS = [
  { id: '', label: 'Any price', max: null },
  { id: 'free', label: 'Free', max: 0 },
  { id: '10k', label: 'Under 10,000 FCFA', max: 10000 },
  { id: '50k', label: 'Under 50,000 FCFA', max: 50000 },
  { id: '100k', label: 'Under 100,000 FCFA', max: 100000 },
];

function ExploreInner() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const { token, isAuthenticated } = useAuth();
  const catalogue = useCatalogue();
  const { isSaved, toggleSaved } = useSavedPlaces(token);
  const { trips, tripsLoading, addPlaceToTrip } = useTrips(token);

  // The URL carries the filters, so a filtered view can be linked and the back
  // button steps through searches rather than leaving the page.
  const query    = searchParams.get('q') || '';
  const category = searchParams.get('category') || 'all';
  const region   = searchParams.get('region') || '';
  const city     = searchParams.get('city') || '';
  const priceId  = searchParams.get('price') || '';

  const [draftQuery, setDraftQuery] = useState(query);
  const [showFilters, setShowFilters] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [tripTarget, setTripTarget] = useState(null);

  // Typing should not push a history entry per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      if (draftQuery === query) return;
      setParam('q', draftQuery, { replace: true });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftQuery]);

  useEffect(() => { setVisible(PAGE_SIZE); }, [query, category, region, city, priceId]);

  const setParam = (key, value, { replace = false } = {}) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace });
  };

  const maxCost = PRICE_BANDS.find((b) => b.id === priceId)?.max ?? null;

  const results = useMemo(
    () => catalogue.filter({ query, category, region, city, maxCost }),
    [catalogue, query, category, region, city, maxCost],
  );

  const activeFilters = [
    region && { key: 'region', label: region },
    city && { key: 'city', label: city },
    priceId && { key: 'price', label: PRICE_BANDS.find((b) => b.id === priceId)?.label },
  ].filter(Boolean);

  const clearAll = () => {
    setDraftQuery('');
    setSearchParams(new URLSearchParams());
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
    <div className="gt explore">
      <TopBar
        isAuthenticated={isAuthenticated}
        actions={isAuthenticated
          ? <Button size="sm" onClick={() => navigate('/trips')}>My trips</Button>
          : <Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
      />

      <header className="explore__head">
        <div className="gt-page">
          <h1 className="gt-h1">Explore Cameroon</h1>
          <p className="explore__lede">
            Beaches, rainforest, highlands and cities — {catalogue.total || 845} places
            across all ten regions, with somewhere to stay and something to eat
            beside each of them.
          </p>

          <div className="explore__search">
            <SearchInput
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Where do you want to go?"
              icon={<Search size={18} />}
              aria-label="Search places"
            />
            <Button
              variant="secondary"
              className="explore__filter-toggle"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilters.length > 0 && <span className="explore__filter-count">{activeFilters.length}</span>}
            </Button>
          </div>

          <div className="explore__chips" role="group" aria-label="Category">
            {CATEGORY_FILTERS.map((c) => (
              <Chip
                key={c.id}
                active={category === c.id}
                onClick={() => setParam('category', c.id === 'all' ? '' : c.id)}
              >
                {c.label}
              </Chip>
            ))}
          </div>

          {showFilters && (
            <div className="explore__filters">
              <Field label="Region">
                <Select value={region} onChange={(e) => setParam('region', e.target.value)}>
                  <option value="">All regions</option>
                  {catalogue.regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="City">
                <Select value={city} onChange={(e) => setParam('city', e.target.value)}>
                  <option value="">All cities</option>
                  {catalogue.cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Price">
                <Select value={priceId} onChange={(e) => setParam('price', e.target.value)}>
                  {PRICE_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </Select>
              </Field>
            </div>
          )}

          {activeFilters.length > 0 && (
            <div className="explore__active">
              {activeFilters.map((f) => (
                <Chip key={f.key} active onClick={() => setParam(f.key, '')}>
                  {f.label} <X size={13} aria-hidden="true" />
                </Chip>
              ))}
              <Button variant="ghost" size="sm" onClick={clearAll}>Clear all</Button>
            </div>
          )}
        </div>
      </header>

      <main className="gt-page gt-has-tabbar explore__main">
        <div className="explore__count">
          <span>
            <strong>{results.length.toLocaleString('en-US')}</strong>
            {results.length === 1 ? ' place' : ' places'}
            {query && <> matching &ldquo;{query}&rdquo;</>}
          </span>
          {/* Honest about the two-stage load: until the rest arrives, a search
              has not seen the whole catalogue. */}
          {!catalogue.complete && (
            <span className="gt-caption gt-muted">Still loading the full catalogue…</span>
          )}
        </div>

        {catalogue.loading ? (
          <SkeletonCards count={8} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<Compass size={22} />}
            title="Nothing matches that yet"
            body={
              query
                ? `We have nothing catalogued for “${query}”. Try a city such as Kribi, Limbe or Yaoundé.`
                : 'Try widening the filters — or clear them and browse everything.'
            }
            action={<Button size="sm" onClick={clearAll}>Clear filters</Button>}
          />
        ) : (
          <>
            <div className="gt-grid">
              {results.slice(0, visible).map((place) => (
                <PlaceCard
                  key={`${place.__kind}-${place.id}`}
                  place={place}
                  saved={isSaved(place.id)}
                  onToggleSave={onToggleSave}
                  onAddToTrip={onAddToTrip}
                  canSave={isAuthenticated}
                />
              ))}
            </div>

            {visible < results.length && (
              <div className="explore__more">
                <Button variant="secondary" size="lg" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Show more places
                </Button>
                <p className="gt-caption gt-muted">
                  Showing {Math.min(visible, results.length)} of {results.length.toLocaleString('en-US')}
                </p>
              </div>
            )}
          </>
        )}
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

export default function Explore() {
  return <ToastProvider><ExploreInner /></ToastProvider>;
}
