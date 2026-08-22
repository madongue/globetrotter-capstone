import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SafeImage } from '@/components/ui'

export interface GalleryImage {
  url: string
  sourceUrl?: string
  license?: string
  author?: string
}

/**
 * Horizontal photo strip with a full-screen viewer.
 *
 * The strip scrolls by touch on a phone and by the arrow buttons on a desktop,
 * where there is no obvious affordance for horizontal scrolling. Opening an
 * image traps nothing and closes on Escape, so it stays keyboard-navigable.
 */
export function Gallery({
  images,
  alt,
  className,
}: {
  images: GalleryImage[]
  alt: string
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<number | null>(null)

  const scrollBy = (direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' })
  }

  const step = useCallback(
    (direction: -1 | 1) => {
      setOpen((current) => {
        if (current === null) return current
        const next = current + direction
        if (next < 0) return images.length - 1
        if (next >= images.length) return 0
        return next
      })
    },
    [images.length],
  )

  useEffect(() => {
    if (open === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    // The viewer covers the page; letting the page scroll behind it is
    // disorienting on a phone.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, step])

  if (images.length === 0) return null

  const active = open === null ? null : images[open]

  return (
    <div className={cn('relative', className)}>
      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth"
      >
        {images.map((image, index) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={`${alt} — photo ${index + 1} of ${images.length}`}
            className="group relative aspect-[4/3] w-[74%] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/[0.08] sm:w-[46%] lg:w-[31%]"
          >
            <SafeImage
              src={image.url}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-ink-950/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>

      {/* Desktop needs a visible way to move the strip. */}
      {images.length > 2 && (
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-1 lg:flex">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Previous photos"
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-ink-950/80 text-mist-100 backdrop-blur-md transition-colors hover:bg-ink-950"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="More photos"
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-ink-950/80 text-mist-100 backdrop-blur-md transition-colors hover:bg-ink-950"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex flex-col bg-ink-950/96 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={alt}
          >
            <div className="flex items-center justify-between p-4">
              <span className="font-mono text-xs tabular-nums text-mist-500">
                {(open ?? 0) + 1} / {images.length}
              </span>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-mist-100 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center px-4 pb-4">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous"
                className="absolute left-3 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-ink-900/70 text-mist-100 hover:bg-ink-900"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <motion.img
                key={active.url}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                src={active.url}
                alt={alt}
                className="max-h-full max-w-full rounded-xl object-contain"
              />

              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next"
                className="absolute right-3 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-ink-900/70 text-mist-100 hover:bg-ink-900"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {(active.author || active.license) && (
              <p className="px-4 pb-6 text-center text-2xs text-mist-700">
                {active.sourceUrl ? (
                  <a
                    href={active.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-mist-500"
                  >
                    {active.author} · {active.license} · Wikimedia Commons
                  </a>
                ) : (
                  <>
                    {active.author} · {active.license}
                  </>
                )}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
