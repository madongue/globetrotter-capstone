import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, MapPin, ArrowUpRight, Clock } from 'lucide-react'
import type { Destination } from '@/types'
import { CATEGORY_BY_ID } from '@/data/categories'
import { useApp } from '@/store/AppContext'
import { cn, formatDuration, formatFcfa } from '@/lib/utils'
import { Rating, SafeImage } from '@/components/ui'

interface Props {
  destination: Destination
  /** Horizontal cards are used in the "For You" rails. */
  layout?: 'grid' | 'rail'
  index?: number
}

export function DestinationCard({ destination, layout = 'grid', index = 0 }: Props) {
  const { t, language, isFavorite, toggleFavorite } = useApp()
  const navigate = useNavigate()
  const saved = isFavorite(destination.id)
  const primary = CATEGORY_BY_ID[destination.categories[0]]

  const price =
    destination.priceFrom === 0
      ? t('free')
      : destination.priceFrom === null
        ? null
        : `${t('from')} ${formatFcfa(destination.priceFrom)}`

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        // Stagger only the first screenful; beyond that the delay is noticeable
        // as sluggishness rather than polish.
        delay: Math.min(index, 8) * 0.04,
        ease: [0.22, 0.8, 0.3, 1],
      }}
      className={cn(
        'group surface relative flex flex-col transition-colors duration-300 hover:border-white/20',
        layout === 'rail' && 'w-[280px] shrink-0',
      )}
    >
      <Link
        to={`/app/destinations/${destination.slug}`}
        className="relative block aspect-[4/3] overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
      >
        <SafeImage
          src={destination.image}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/10 to-transparent" />

        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-950/60 px-2.5 py-1 text-2xs font-medium text-mist-100 backdrop-blur-md">
          {primary ? primary[language] : destination.categories[0]}
        </span>

        {price && (
          <span className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-ink-950/60 px-2.5 py-1 text-2xs font-medium text-cyan-300 backdrop-blur-md">
            {price}
          </span>
        )}
      </Link>

      <button
        type="button"
        onClick={() => toggleFavorite(destination.id)}
        aria-pressed={saved}
        aria-label={saved ? t('removeFavorite') : t('addFavorite')}
        className={cn(
          'absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border backdrop-blur-md transition-all duration-200',
          saved
            ? 'border-rose-400/40 bg-rose-500/25 text-rose-300'
            : 'border-white/15 bg-ink-950/60 text-mist-300 hover:text-rose-300',
        )}
      >
        <motion.span
          key={String(saved)}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        >
          <Heart className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} />
        </motion.span>
      </button>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[0.95rem] font-semibold leading-snug text-mist-100">
          <Link
            to={`/app/destinations/${destination.slug}`}
            className="after:absolute after:inset-0 after:content-[''] hover:text-white"
          >
            {destination.name}
          </Link>
        </h3>

        <p className="mt-1 flex items-center gap-1 text-xs text-mist-500">
          <MapPin className="h-3 w-3 shrink-0" />
          {destination.quarter}
        </p>

        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-mist-300">
          {destination.summary[language]}
        </p>

        <div className="mt-3 flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <Rating value={destination.rating} count={destination.reviewCount} />
          {destination.visitMinutes > 0 && (
            <span className="inline-flex items-center gap-1 text-2xs text-mist-500">
              <Clock className="h-3 w-3" />
              {formatDuration(destination.visitMinutes, language)}
            </span>
          )}
        </div>

        <div className="relative z-10 mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => navigate(`/app/map?focus=${destination.id}`)}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-xs text-mist-300 transition-colors hover:bg-white/[0.06] hover:text-mist-100"
          >
            <MapPin className="h-3.5 w-3.5" />
            {t('showOnMap')}
          </button>
          <Link
            to={`/app/destinations/${destination.slug}`}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/[0.07] text-xs font-medium text-mist-100 transition-colors hover:bg-cyan-500/20 hover:text-cyan-200"
          >
            {t('viewDetails')}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </motion.article>
  )
}
