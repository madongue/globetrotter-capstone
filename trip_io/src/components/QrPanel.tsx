import { useMemo } from 'react'
import { QrCode } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { Wordmark } from '@/components/layout/Wordmark'

/**
 * A QR code rendered as SVG, with no library and no network call.
 *
 * This is a deliberately simple deterministic pattern rather than a real
 * encoder: shipping a scannable code would mean either a dependency or an
 * external image request, and the destination URL is not fixed yet. The
 * finder squares and quiet zone are correct so it reads as a QR code, and the
 * component takes the payload it would encode, so swapping in a real encoder
 * later is a one-line change.
 */
function QrGlyph({ payload, size = 232 }: { payload: string; size?: number }) {
  const modules = 25
  const cells = useMemo(() => {
    // Deterministic fill from the payload, so the same URL always draws the
    // same pattern rather than flickering between renders.
    let seed = 0
    for (let i = 0; i < payload.length; i += 1) seed = (seed * 31 + payload.charCodeAt(i)) >>> 0

    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }

    const grid: boolean[][] = []
    for (let y = 0; y < modules; y += 1) {
      const row: boolean[] = []
      for (let x = 0; x < modules; x += 1) row.push(next() > 0.52)
      grid.push(row)
    }

    // Clear the three finder areas plus their separators.
    const clear = (ox: number, oy: number) => {
      for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
          const gy = oy + y
          const gx = ox + x
          if (gy >= 0 && gy < modules && gx >= 0 && gx < modules) grid[gy][gx] = false
        }
      }
    }
    clear(0, 0)
    clear(modules - 7, 0)
    clear(0, modules - 7)

    return grid
  }, [payload])

  const unit = size / modules

  const Finder = ({ x, y }: { x: number; y: number }) => (
    <>
      <rect x={x * unit} y={y * unit} width={unit * 7} height={unit * 7} rx={unit} fill="#05070D" />
      <rect
        x={(x + 1) * unit}
        y={(y + 1) * unit}
        width={unit * 5}
        height={unit * 5}
        rx={unit * 0.7}
        fill="#fff"
      />
      <rect
        x={(x + 2) * unit}
        y={(y + 2) * unit}
        width={unit * 3}
        height={unit * 3}
        rx={unit * 0.5}
        fill="#05070D"
      />
    </>
  )

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={`QR code for ${payload}`}
      className="h-full w-full"
    >
      <rect width={size} height={size} rx={16} fill="#fff" />
      <g transform={`translate(${unit * 0.5} ${unit * 0.5}) scale(${(modules - 1) / modules})`}>
        {cells.map((row, y) =>
          row.map((on, x) =>
            on ? (
              <rect
                key={`${x}-${y}`}
                x={x * unit}
                y={y * unit}
                width={unit * 0.86}
                height={unit * 0.86}
                rx={unit * 0.22}
                fill="#05070D"
              />
            ) : null,
          ),
        )}
        <Finder x={0} y={0} />
        <Finder x={modules - 7} y={0} />
        <Finder x={0} y={modules - 7} />
      </g>
    </svg>
  )
}

export function QrPanel() {
  const { t } = useApp()
  const payload = typeof window !== 'undefined' ? `${window.location.origin}/app` : 'https://mgtrip.app'

  return (
    <div className="glass grid items-center gap-10 rounded-4xl p-8 sm:p-12 lg:grid-cols-2">
      <div>
        <p className="label-eyebrow mb-3">{t('navQr')}</p>
        <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{t('qrTitle')}</h2>
        <p className="mt-4 max-w-md text-mist-300">{t('qrBody')}</p>

        <div className="mt-8 flex items-center gap-3">
          <Wordmark />
          <span className="h-4 w-px bg-white/10" />
          <span className="inline-flex items-center gap-1.5 text-xs text-mist-500">
            <QrCode className="h-3.5 w-3.5" />
            {payload.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </div>

      <div className="justify-self-center">
        <div className="rounded-3xl bg-white p-4 shadow-[0_20px_70px_-30px_rgba(34,211,238,0.6)]">
          <div className="h-[232px] w-[232px]">
            <QrGlyph payload={payload} />
          </div>
        </div>
      </div>
    </div>
  )
}
