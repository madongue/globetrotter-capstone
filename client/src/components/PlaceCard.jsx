import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, MapPin, Plus, Star } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardMedia, CardTitle } from './ui';
import { categoryLabel, isContextualImage } from '../lib/useCatalogue';

/**
 * One place, as a travel card.
 *
 * Used by Explore, by Home's featured rails and by Nearby places, so the
 * catalogue looks the same wherever it appears. Built entirely from the Phase A
 * primitives — it adds composition, not new styling.
 */

const fcfa = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${amount.toLocaleString('en-US')} FCFA`;
};

export default function PlaceCard({
  place,
  saved = false,
  onToggleSave,
  onAddToTrip,
  canSave = true,
  showDescription = true,
}) {
  const price = fcfa(place.cost ?? place.cost_per_night);
  const rating = Number(place.rating) || 0;
  const contextual = isContextualImage(place);
  const where = [place.city, place.region].filter(Boolean).join(', ');

  // Only places have a detail page; hotels and activities are catalogue
  // entries without one, so their cards do not pretend to be links.
  const href = place.__kind === 'place' || !place.__kind ? `/places/${place.id}` : null;

  const media = (
    <CardMedia
      src={place.image_url}
      alt={contextual ? `${place.city || place.name}, for context` : place.name}
      contextual={contextual}
      contextLabel={place.city ? `${place.city} · city photo` : 'City photo'}
      action={canSave && onToggleSave ? (
        <Button
          icon
          size="sm"
          className="gt-card__action"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
          onClick={(event) => {
            // The card is a link; saving must not navigate.
            event.preventDefault();
            event.stopPropagation();
            onToggleSave(place);
          }}
        >
          <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
        </Button>
      ) : null}
    />
  );

  const body = (
    <CardBody>
      <div className="pc-head">
        <CardTitle>{place.name}</CardTitle>
        {rating > 0 && (
          <span className="pc-rating" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
            <Star size={13} fill="currentColor" strokeWidth={0} />
            {rating.toFixed(1)}
          </span>
        )}
      </div>

      {where && (
        <p className="pc-where">
          <MapPin size={12} aria-hidden="true" />
          {where}
        </p>
      )}

      {showDescription && place.description && (
        <p className="pc-desc">{place.description}</p>
      )}

      <div className="pc-foot">
        <Badge tone={place.curated ? 'primary' : 'neutral'}>{categoryLabel(place)}</Badge>
        {price ? <span className="pc-price">{price}</span> : <span className="pc-free">Free</span>}
      </div>

      {onAddToTrip && (
        <Button
          size="sm"
          variant="secondary"
          className="pc-add"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAddToTrip(place);
          }}
        >
          <Plus size={15} /> Add to trip
        </Button>
      )}
    </CardBody>
  );

  if (!href) {
    return <Card className="pc">{media}{body}</Card>;
  }

  return (
    <Card as={Link} to={href} interactive className="pc">
      {media}
      {body}
    </Card>
  );
}
