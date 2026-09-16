import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BedDouble, ChevronDown, ChevronUp, Clock, ExternalLink, Map as MapIcon,
  MoreHorizontal, Pencil, Plus, Route, Settings2, Trash2, Wallet, X,
} from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton,
  ToastProvider, useToast,
} from '../components/ui';
import { TabBar, TopBar } from '../components/Navigation';
import TravelMap from '../TravelMap';
import { useTranslatedPage } from '../lib/i18n';
import { useAuth } from '../lib/useTravellerData';
import { formatClock, formatDuration, formatMoney, useItinerary } from '../lib/useItinerary';
import './itinerary.css';

/**
 * The itinerary editor.
 *
 * A day-by-day plan rather than a table of rows: each day is a timeline, each
 * checkpoint a stop on it, with the map beside it on desktop and behind a tab
 * on a phone.
 *
 * Every control here calls an endpoint that already exists and already knows
 * the rules — reordering persists through `stage_order`, an edit writes back
 * to the record a checkpoint was derived from, and costs are recalculated
 * server-side. The page re-renders from whatever the server returns.
 *
 * The panels this screen does not cover — payments, reservations, packing,
 * documents, sharing, progress and the audit log — are not gone; they are one
 * link away under "More trip tools", which opens the existing full view.
 */

const money = (value, label) => formatMoney(value, label) || '0 FCFA';

/* --------------------------------------------------------------- checkpoint */

function Checkpoint({
  stage, index, total, dayCount, dayId,
  onMove, onEdit, onRemove, onMoveToDay, busy,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: stage.name || '',
    cost: String(stage.cost ?? ''),
    duration_hours: String(stage.duration_hours ?? ''),
  });

  const save = async () => {
    const result = await onEdit(stage.id, {
      name: draft.name,
      cost: Number(draft.cost) || 0,
      duration_hours: Number(draft.duration_hours) || 1,
    });
    if (result.ok) setEditing(false);
  };

  return (
    <li className="cp">
      <div className="cp__time">
        <span className="cp__clock">{formatClock(stage.startMinutes)}</span>
        <span className="cp__dot" aria-hidden="true" />
      </div>

      <div className="cp__card">
        <div className="cp__head">
          <div className="cp__title">
            <strong>{stage.name}</strong>
            <span className="cp__meta">
              <Badge tone="neutral">{stage.type}</Badge>
              <span>{formatDuration(stage.duration_hours)}</span>
              <span className="cp__cost">{money(stage.cost)}</span>
            </span>
          </div>

          <div className="cp__controls">
            <Button icon size="sm" variant="ghost" disabled={index === 0 || busy}
              aria-label={`Move ${stage.name} earlier`} onClick={() => onMove(stage.id, 'up')}>
              <ChevronUp size={16} />
            </Button>
            <Button icon size="sm" variant="ghost" disabled={index === total - 1 || busy}
              aria-label={`Move ${stage.name} later`} onClick={() => onMove(stage.id, 'down')}>
              <ChevronDown size={16} />
            </Button>
            <Button icon size="sm" variant="ghost" aria-label={`Edit ${stage.name}`}
              aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
              {editing ? <X size={16} /> : <Pencil size={15} />}
            </Button>
            <Button icon size="sm" variant="ghost" aria-label={`Remove ${stage.name}`}
              disabled={busy} onClick={() => onRemove(stage.id, stage.name)}>
              <Trash2 size={15} />
            </Button>
          </div>
        </div>

        {editing && (
          <div className="cp__editor">
            <Field label="Name">
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </Field>
            <Field label="Cost (FCFA)">
              <Input type="number" min="0" value={draft.cost}
                onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))} />
            </Field>
            <Field label="Duration (hours)">
              <Input type="number" min="0.5" step="0.5" value={draft.duration_hours}
                onChange={(e) => setDraft((d) => ({ ...d, duration_hours: e.target.value }))} />
            </Field>

            {dayCount > 1 && (
              <Field label="Day">
                <Select value={dayId} onChange={(e) => onMoveToDay(stage.id, e.target.value)}>
                  {Array.from({ length: dayCount }, (_, i) => (
                    <option key={i} value={`day-${i + 1}`}>Day {i + 1}</option>
                  ))}
                </Select>
              </Field>
            )}

            <div className="cp__editor-actions">
              <Button size="sm" onClick={save} loading={busy}>Save checkpoint</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------- page */

function ItineraryInner() {
  // Applies the chosen language to everything this page renders.
  const pageRef = useTranslatedPage();

  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, isAuthenticated } = useAuth();

  const {
    trip, days, loading, error, busy,
    moveCheckpoint, editCheckpoint, deleteCheckpoint, moveToDay, renameTrip,
  } = useItinerary(id, token);

  const [mobileTab, setMobileTab] = useState('plan'); // plan | map
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const markers = useMemo(() => {
    if (!trip) return [];
    return (trip.stages || [])
      .map((stage) => {
        const lat = Number(stage.map_info?.latitude ?? stage.latitude);
        const lon = Number(stage.map_info?.longitude ?? stage.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return { id: stage.id, name: stage.name, location: stage.location, position: [lat, lon] };
      })
      .filter(Boolean);
  }, [trip]);

  const withResult = async (promise, successMessage) => {
    const result = await promise;
    if (result.ok) { if (successMessage) toast.push(successMessage, 'success'); }
    else toast.push(result.reason, 'error');
    return result;
  };

  const onMove = (stageId, direction) => withResult(moveCheckpoint(stageId, direction));
  const onEdit = (stageId, changes) => withResult(editCheckpoint(stageId, changes), 'Checkpoint updated.');
  const onMoveToDay = (stageId, dayId) => withResult(moveToDay(stageId, dayId), 'Moved to another day.');

  const onRemove = async (stageId, name) => {
    // Deleting a stop is the one destructive control on the page.
    if (!window.confirm(`Remove ${name} from this trip?`)) return;
    await withResult(deleteCheckpoint(stageId), 'Checkpoint removed.');
  };

  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === trip.title) { setRenaming(false); return; }
    const result = await withResult(renameTrip(next), 'Trip renamed.');
    if (result.ok) setRenaming(false);
  };

  const shell = (children) => (
    <div ref={pageRef} className="gt itin">
      <TopBar
        isAuthenticated={isAuthenticated}
        actions={<Button size="sm" variant="secondary" onClick={() => navigate('/explore')}>Add places</Button>}
      />
      {children}
      <TabBar isAuthenticated={isAuthenticated} />
    </div>
  );

  if (!isAuthenticated) {
    return shell(
      <main className="gt-page gt-has-tabbar itin__main">
        <EmptyState icon={<Route size={22} />} title="Sign in to see this trip"
          action={<Button size="sm" onClick={() => navigate('/login')}>Sign in</Button>} />
      </main>,
    );
  }

  if (loading) {
    return shell(
      <main className="gt-page gt-has-tabbar itin__main">
        <Skeleton height="2.4rem" width="46%" />
        <div style={{ marginTop: 'var(--gt-space-4)' }}><Skeleton height="1rem" width="30%" /></div>
        <div style={{ marginTop: 'var(--gt-space-6)' }}><Skeleton height="18rem" /></div>
      </main>,
    );
  }

  if (error || !trip) {
    return shell(
      <main className="gt-page gt-has-tabbar itin__main">
        <EmptyState
          icon={<Route size={22} />}
          title={error === 'notfound' ? 'That trip is not available' : 'Could not load this trip'}
          body={error === 'notfound'
            ? 'It may have been deleted, or shared with someone else.'
            : 'Check your connection and try again.'}
          action={<Button size="sm" onClick={() => navigate('/trips')}>Back to my trips</Button>}
        />
      </main>,
    );
  }

  const label = trip.currency_label || 'FCFA';
  const breakdown = trip.cost_breakdown || {};
  const stops = (trip.stages || []).length;
  const routeUrl = trip.route_plan?.google_maps_directions_url;

  return shell(
    <main className="itin__main gt-has-tabbar">
      {/* ------------------------------------------------------- header */}
      <header className="itin__head">
        <div className="gt-page">
          <Link to="/trips" className="itin__back"><ArrowLeft size={16} aria-hidden="true" /> My trips</Link>

          {renaming ? (
            <div className="itin__rename">
              <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                aria-label="Trip name" autoFocus />
              <Button size="sm" onClick={saveTitle} loading={busy}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            </div>
          ) : (
            <h1 className="gt-h1 itin__title">
              {trip.title}
              <Button icon size="sm" variant="ghost" aria-label="Rename this trip"
                onClick={() => { setTitleDraft(trip.title); setRenaming(true); }}>
                <Pencil size={15} />
              </Button>
            </h1>
          )}

          <div className="itin__facts">
            <span><MapIcon size={14} aria-hidden="true" /> {trip.location}</span>
            {trip.start_date && (
              <span><Clock size={14} aria-hidden="true" /> {trip.start_date}{trip.end_date && trip.end_date !== trip.start_date ? ` → ${trip.end_date}` : ''}</span>
            )}
            <span><Route size={14} aria-hidden="true" /> {stops} checkpoint{stops === 1 ? '' : 's'}</span>
            <span className="itin__total"><Wallet size={14} aria-hidden="true" /> {money(breakdown.total_budget, label)}</span>
          </div>

          <div className="itin__actions">
            <Button size="sm" onClick={() => navigate('/explore')}><Plus size={15} /> Add a place</Button>
            {routeUrl && (
              <Button size="sm" variant="secondary" onClick={() => window.open(routeUrl, '_blank', 'noopener')}>
                <ExternalLink size={15} /> Open route in Google Maps
              </Button>
            )}
            {/* Payments, reservations, packing, documents, sharing, progress
                and the audit log still live on the original screen. */}
            <Button size="sm" variant="ghost" onClick={() => navigate(`/trips/${trip.id}/manage`)}>
              <Settings2 size={15} /> More trip tools
            </Button>
          </div>
        </div>
      </header>

      {/* --------------------------------------------- mobile plan/map tabs */}
      <div className="gt-page itin__tabs" role="tablist" aria-label="Trip view">
        <button type="button" role="tab" aria-selected={mobileTab === 'plan'}
          className={`itin__tab${mobileTab === 'plan' ? ' is-active' : ''}`}
          onClick={() => setMobileTab('plan')}>Plan</button>
        <button type="button" role="tab" aria-selected={mobileTab === 'map'}
          className={`itin__tab${mobileTab === 'map' ? ' is-active' : ''}`}
          onClick={() => setMobileTab('map')}>Map</button>
      </div>

      <div className={`gt-page itin__body itin__body--${mobileTab}`}>
        {/* ------------------------------------------------------- days */}
        <div className="itin__plan">
          {/* The catalogue records how long a stop takes but not what time it
              opens, so the clock is worked out from durations. Saying so keeps
              a derived time from reading as a recorded one. */}
          <p className="itin__times-note">
            <Clock size={13} aria-hidden="true" />
            Times are suggestions, worked out from how long each stop takes.
            Opening hours are not in the catalogue — check locally before you go.
          </p>

          {days.length === 0 || days.every((d) => d.stops.length === 0 && d.lodging.length === 0) ? (
            <EmptyState
              icon={<Plus size={22} />}
              title="This trip is empty"
              body="Find somewhere in the catalogue and add it — your plan builds up from there."
              action={<Button size="sm" onClick={() => navigate('/explore')}>Explore Cameroon</Button>}
            />
          ) : days.map((day) => (
            <section key={day.id} className="day" aria-labelledby={`${day.id}-heading`}>
              <div className="day__head">
                <div>
                  <h2 id={`${day.id}-heading`} className="day__title">{day.title || `Day ${day.day}`}</h2>
                  {day.date && <p className="day__date">{day.date}</p>}
                </div>
                <div className="day__totals">
                  {day.hours > 0 && <span>{formatDuration(day.hours)}</span>}
                  {day.cost > 0 && <span className="day__cost">{money(day.cost, label)}</span>}
                </div>
              </div>

              {day.lodging.map((stage) => (
                <div key={stage.id} className="day__base">
                  <BedDouble size={16} aria-hidden="true" />
                  <span><strong>{stage.name}</strong> · your base for this day</span>
                  <span className="day__base-cost">{money(stage.cost, label)}</span>
                </div>
              ))}

              {day.stops.length === 0 ? (
                <p className="day__empty">Nothing planned for this day yet.</p>
              ) : (
                <ol className="day__timeline">
                  {day.stops.map((stage, index) => (
                    <Checkpoint
                      key={stage.id}
                      stage={stage}
                      index={index}
                      total={day.stops.length}
                      dayCount={days.length}
                      dayId={day.id}
                      busy={busy}
                      onMove={onMove}
                      onEdit={onEdit}
                      onRemove={onRemove}
                      onMoveToDay={onMoveToDay}
                    />
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>

        {/* ------------------------------------------------ map and costs */}
        <aside className="itin__side">
          <Card className="itin__map">
            {markers.length > 0 ? (
              <TravelMap
                markers={markers}
                className="itin__map-canvas"
                ariaLabel={`Map of the checkpoints in ${trip.title}`}
              />
            ) : (
              <div className="itin__map-empty">
                <MapIcon size={20} aria-hidden="true" />
                <p className="gt-small gt-muted">No checkpoint on this trip has coordinates yet.</p>
              </div>
            )}
            {markers.length > 0 && (
              <p className="itin__map-note">
                {markers.length} of {stops} checkpoints are mapped
                {routeUrl && <> · <a href={routeUrl} target="_blank" rel="noreferrer noopener">open the route</a></>}
              </p>
            )}
          </Card>

          <Card padded className="itin__budget">
            <h2 className="gt-h4">Trip cost</h2>
            <dl className="itin__cost">
              <dt>Accommodation</dt><dd>{money(breakdown.hotel_cost, label)}</dd>
              <dt>Activities</dt><dd>{money(breakdown.activity_cost, label)}</dd>
              <dt>Places</dt><dd>{money(breakdown.place_cost, label)}</dd>
            </dl>
            <div className="itin__total-row">
              <span>Total</span>
              <strong>{money(breakdown.total_budget, label)}</strong>
            </div>
            <p className="itin__cost-note">
              Adding, removing or repricing a checkpoint updates this total.
              Transport between towns and meals you book yourself are not included.
            </p>
          </Card>
        </aside>
      </div>
    </main>,
  );
}

export default function Itinerary() {
  return <ToastProvider><ItineraryInner /></ToastProvider>;
}
