import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Search } from 'lucide-react';
import {
  Button, Chip, EmptyState, SearchInput, SectionHead, ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import Breadcrumbs from '../components/Breadcrumbs';
import PlaceCard from '../components/PlaceCard';
import { useTranslatedPage } from '../lib/i18n';
import { categoryLabel } from '../lib/useCatalogue';
import { useAuth, useSavedPlaces, useTrips } from '../lib/useTravellerData';
import './saved.css';

/**
 * Saved places.
 *
 * The feature has always existed under the name *wishlist* -- this is the same
 * `/api/wishlist` data with a name travellers recognise. It reuses Explore's
 * card rather than defining a second one, so a place looks the same wherever
 * it is seen and the contextual-photo marking cannot drift between screens.
 *
 * The filter is built from the categories actually present in the saved list,
 * not from the catalogue's full set: offering "Hotels" to someone who has
 * saved none is a filter that can only ever empty the screen.
 */

function SavedInner() {
  const pageRef = useTranslatedPage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, isAuthenticated } = useAuth();
  const { savedItems, isSaved, toggleSaved } = useSavedPlaces(token);
  const { trips, addPlaceToTrip } = useTrips(token);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const categories = useMemo(() => {
    const present = new Map();
    savedItems.forEach((item) => {
      const label = categoryLabel(item);
      if (label) present.set(label, (present.get(label) || 0) + 1);
    });
    return [...present.entries()].sort((a, b) => b[1] - a[1]);
  }, [savedItems]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return savedItems.filter((item) => {
      if (category !== 'all' && categoryLabel(item) !== category) return false;
      if (!needle) return true;
      return [item.name, item.city, item.region, item.location]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [savedItems, query, category]);

  const unsave = async (placeId) => {
    const result = await toggleSaved(placeId);
    if (!result.ok) toast.push(result.reason || 'Could not update.', 'error');
  };

  const addToTrip = async (placeId) => {
    if (trips.length === 0) {
      toast.push('Create a trip first, then add places to it.', 'error');
      return;
    }
    const result = await addPlaceToTrip(trips[0].id, placeId);
    toast.push(result.ok ? result.message : (result.reason || 'Could not add it.'),
      result.ok ? 'success' : 'error');
  };

  if (!isAuthenticated) {
    return (
      <div ref={pageRef} className="gt saved">
        <TopBar actions={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
        <main className="gt-page gt-has-tabbar saved__main">
          <EmptyState
            icon={<Bookmark size={22} />}
            title="Sign in to see your saved places"
            body="Saving keeps a place for later, on any device you sign in from."
            action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  return (
    <div ref={pageRef} className="gt saved">
      <TopBar
        isAuthenticated
        actions={<Button size="sm" onClick={() => navigate('/explore')}>Find more</Button>}
      />

      <main className="gt-page gt-has-tabbar saved__main">

        <Breadcrumbs />
        <header className="saved__head">
          <h1 className="saved__title">Saved places</h1>
          <p className="saved__lede">
            {savedItems.length === 0
              ? 'Nothing saved yet.'
              : `${savedItems.length} place${savedItems.length === 1 ? '' : 's'} kept for later.`}
          </p>
        </header>

        {savedItems.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={20} />}
            title="No saved places yet"
            body="Tap the bookmark on any place while exploring and it will wait for you here."
            action={<Button size="sm" onClick={() => navigate('/explore')}>Start exploring</Button>}
          />
        ) : (
          <>
            <div className="saved__controls">
              <SearchInput
                icon={<Search size={16} />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your saved places"
                aria-label="Search your saved places"
              />
              {categories.length > 1 && (
                <div className="saved__filters">
                  <Chip active={category === 'all'} onClick={() => setCategory('all')}>
                    All ({savedItems.length})
                  </Chip>
                  {categories.map(([label, count]) => (
                    <Chip
                      key={label}
                      active={category === label}
                      onClick={() => setCategory(label)}
                    >
                      {label} ({count})
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <SectionHead title={`${results.length} shown`} />

            {results.length === 0 ? (
              <EmptyState
                title="Nothing matches that"
                body="Try a different word, or clear the filter."
                action={(
                  <Button size="sm" onClick={() => { setQuery(''); setCategory('all'); }}>
                    Clear
                  </Button>
                )}
              />
            ) : (
              <div className="gt-grid">
                {results.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    saved={isSaved(place.id)}
                    onToggleSave={unsave}
                    onAddToTrip={addToTrip}
                    canSave
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <TabBar isAuthenticated />
    </div>
  );
}

export default function Saved() {
  return <ToastProvider><SavedInner /></ToastProvider>;
}
