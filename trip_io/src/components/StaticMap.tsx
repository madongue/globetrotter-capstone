import { useMemo, useState } from 'react'
import { Minus, Plus, Crosshair } from 'lucide-react'
import type { Destination } from '@/types'
import { cn } from '@/lib/utils'

/**
 * Yaoundé map.
 *
 * No Mapbox token is configured, so rather than an empty grey box this projects
 * the real coordinates onto a styled plane: markers sit in their true relative
 * positions, so the shape of the city — the centre clustered along Mfoundi,
 * Bastos to the north, Mvolyé south, Olembé well out — is accurate.
 *
 * `VITE_MAPBOX_TOKEN` is read here so swapping in real tiles is a matter of
 * setting the variable and rendering a GL map in place of the plane.
 */

const HAS_MAPBOX = Boolean(import.meta.env.VITE_MAPBOX_TOKEN)

/** Bounds covering Yaoundé with a margin, so nothing sits on the edge. */
const BOUNDS = { minLat: 3.79, maxLat: 3.99, minLng: 11.4, maxLng: 11.58 }

interface Props {
  destinations: Destination[]
  focusId?: string
  onSelect?: (destination: Destination) => void
  className?: string
}

export function StaticMap({ destinations, focusId, onSelect, className }: Props) {
  const [zoom, setZoom] = useState(1)
  const [hovered, setHovered] = useState<string | null>(null)

  const points = useMemo(
    () =>
      destinations.map((destination) => ({
        destination,
        // y inverted: latitude increases north, screen y increases downward.
        x: ((destination.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100,
        y: ((BOUNDS.maxLat - destination.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100,
      })),
    [destinations],
  )

  return (
    <div className={cn('relative overflow-hidden bg-ink-900', className)}>
      {/* Ground: faint grid plus a glow where the city centre sits. */}
      <div className="absolute inset-0 bg-grid-faint bg-grid opacity-70" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_58%_46%,rgba(6,182,212,0.12),transparent_55%)]"
        aria-hidden="true"
      />

      <div
        className="absolute inset-0 origin-center transition-transform duration-300"
        style={{ transform: `scale(${zoom})` }}
      >
        {/* The Mfoundi valley, which the centre of Yaoundé follows. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <path
            d="M52 8 C58 26, 62 40, 66 58 C69 72, 72 84, 74 98"
            fill="none"
            stroke="rgba(59,130,246,0.28)"
            strokeWidth="0.7"
          />
          <path
            d="M28 30 C40 40, 52 48, 68 52"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="0.5"
          />
          <path
            d="M40 92 C48 74, 56 62, 74 54"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="0.5"
          />
        </svg>

        {points.map(({ destination, x, y }) => {
          const isFocus = destination.id === focusId
          const isHover = destination.id === hovered
          return (
            <button
              key={destination.id}
              type="button"
              onClick={() => onSelect?.(destination)}
              onMouseEnter={() => setHovered(destination.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(destination.id)}
              onBlur={() => setHovered(null)}
              aria-label={destination.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span
                className={cn(
                  'block rounded-full border-2 transition-all duration-200',
                  isFocus
                    ? 'h-4 w-4 animate-pulse-ring border-cyan-300 bg-cyan-400'
                    : isHover
                      ? 'h-3.5 w-3.5 border-cyan-300 bg-cyan-400/80'
                      : 'h-2.5 w-2.5 border-cyan-400/60 bg-cyan-500/50',
                )}
              />
              {(isHover || isFocus) && (
                <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-[180px] -translate-x-1/2 rounded-lg border border-white/10 bg-ink-950/95 px-2.5 py-1.5 text-2xs text-mist-100 shadow-lift backdrop-blur-md">
                  <span className="block font-medium">{destination.name}</span>
                  <span className="block text-mist-500">{destination.quarter}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* --------------------------------------------------------- chrome */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(2)))}
          aria-label="Zoom in"
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-950/70 text-mist-300 backdrop-blur-md hover:text-mist-100"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
          aria-label="Zoom out"
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-950/70 text-mist-300 backdrop-blur-md hover:text-mist-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label="Reset view"
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-950/70 text-mist-300 backdrop-blur-md hover:text-mist-100"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      <p className="absolute bottom-2.5 left-3 text-[10px] text-mist-700">
        {HAS_MAPBOX
          ? 'Mapbox'
          : 'Yaoundé · positions from real coordinates'}
      </p>
    </div>
  )
}
