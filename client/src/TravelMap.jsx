import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CAMEROON_CENTER } from './mapCoordinates';

const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || DEFAULT_TILE_URL;
const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;

const markerIcon = L.divIcon({
  className: 'travel-map-marker',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -10],
});

const selectedMarkerIcon = L.divIcon({
  className: 'travel-map-marker travel-map-marker-selected',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -12],
});

function MapBounds({ markers, selectedPosition }) {
  const map = useMap();

  useEffect(() => {
    const points = [
      ...markers.map((marker) => marker.position),
      selectedPosition,
    ].filter(Boolean);

    if (points.length === 0) {
      map.setView(CAMEROON_CENTER, 6);
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 12);
      return;
    }

    map.fitBounds(points, { padding: [28, 28], maxZoom: 12 });
  }, [map, markers, selectedPosition]);

  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(event) {
      onMapClick?.({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });
  return null;
}

function formatPosition(position) {
  if (!position) return '';
  return `${Number(position[0]).toFixed(6)}, ${Number(position[1]).toFixed(6)}`;
}

export default function TravelMap({
  markers = [],
  selectedPosition,
  center = CAMEROON_CENTER,
  zoom = 6,
  className = '',
  ariaLabel = 'Interactive Cameroon map',
  onMapClick,
}) {
  const validMarkers = useMemo(() => markers.filter((marker) => (
    Array.isArray(marker.position)
    && marker.position.length === 2
    && marker.position.every((value) => Number.isFinite(Number(value)))
  )), [markers]);

  const normalizedSelectedPosition = Array.isArray(selectedPosition)
    && selectedPosition.length === 2
    && selectedPosition.every((value) => Number.isFinite(Number(value)))
    ? selectedPosition.map(Number)
    : null;

  return (
    <div className={`leaflet-map-canvas ${onMapClick ? 'leaflet-map-canvas-clickable' : ''} ${className}`} aria-label={ariaLabel}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="leaflet-map">
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
        <MapBounds markers={validMarkers} selectedPosition={normalizedSelectedPosition} />
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        {validMarkers.map((marker) => (
          <Marker key={marker.id || `${marker.name}-${marker.position.join(',')}`} position={marker.position} icon={marker.icon || markerIcon}>
            <Popup>
              <strong>{marker.name}</strong>
              {marker.location && <p>{marker.location}</p>}
              {marker.description && <p>{marker.description}</p>}
            </Popup>
          </Marker>
        ))}
        {normalizedSelectedPosition && (
          <Marker position={normalizedSelectedPosition} icon={selectedMarkerIcon}>
            <Popup>
              <strong>Selected point</strong>
              <p>{formatPosition(normalizedSelectedPosition)}</p>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
