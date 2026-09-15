import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Plus } from 'lucide-react';
import { Button, Dialog, EmptyState, Spinner, useToast } from './ui';

/**
 * Choosing which trip a place goes into.
 *
 * Posts to the existing `/api/itineraries/<id>/places` endpoint, which already
 * knows how to add a catalogue place and recalculate the plan. Nothing about
 * that is reimplemented here — this only asks which trip.
 */
export default function AddToTripDialog({ open, place, trips, loading, onClose, onAdd }) {
  const [busyId, setBusyId] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  const add = async (trip) => {
    setBusyId(trip.id);
    const result = await onAdd(trip.id, place.id);
    setBusyId(null);

    if (result?.ok) {
      toast.push(`${place.name} added to ${trip.title}.`, 'success');
      onClose();
    } else {
      toast.push(result?.reason || 'Could not add this place.', 'error');
    }
  };

  if (!place) return null;

  return (
    <Dialog open={open} onClose={onClose} title={`Add ${place.name} to a trip`}>
      {loading ? (
        <div className="gt-row gt-gap-2"><Spinner /> <span className="gt-muted">Loading your trips…</span></div>
      ) : trips.length === 0 ? (
        <EmptyState
          icon={<MapPin size={20} />}
          title="No trips yet"
          body="Build a trip first and this place can go straight into it."
          action={(
            <Button size="sm" onClick={() => { onClose(); navigate('/trips'); }}>
              Build my trip
            </Button>
          )}
        />
      ) : (
        <ul className="attd-list">
          {trips.map((trip) => (
            <li key={trip.id}>
              <button
                type="button"
                className="attd-trip"
                onClick={() => add(trip)}
                disabled={busyId !== null}
              >
                <span className="attd-trip__text">
                  <strong>{trip.title}</strong>
                  <span className="gt-caption gt-muted">
                    {trip.location}
                    {trip.stages?.length ? ` · ${trip.stages.length} checkpoints` : ''}
                  </span>
                </span>
                {busyId === trip.id ? <Spinner /> : <Plus size={17} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
