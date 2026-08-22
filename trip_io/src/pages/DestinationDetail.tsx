import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Clock,
  Heart,
  MapPin,
  Route,
  Share2,
  Ticket,
  Check,
} from 'lucide-react'
import { DESTINATIONS, DESTINATION_BY_SLUG } from '@/data/destinations'
import { SEED_REVIEWS } from '@/data/community'
import { CATEGORY_BY_ID } from '@/data/categories'
import { useApp } from '@/store/AppContext'
import { cn, distanceKm, formatDuration, formatFcfa, initials, timeAgo } from '@/lib/utils'
import { Badge, Button, EmptyState, Rating, SafeImage } from '@/components/ui'
import { DestinationCard } from '@/components/DestinationCard'
import { StaticMap } from '@/components/StaticMap'
import { Gallery } from '@/components/Gallery'
import { useGallery } from '@/lib/useGallery'
import { useVideos } from '@/lib/useVideos'

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export function DestinationDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { t, language, isFavorite, toggleFavorite, requireAuth } = useApp()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)

  const destination = slug ? DESTINATION_BY_SLUG[slug] : undefined
  // Called before the not-found return so the hook order stays stable.
  const gallery = useGallery(slug ?? '', destination?.image ?? '', destination?.imageIsContextual)
  const fetchedVideos = useVideos(destination?.image ?? '', destination?.imageIsContextual)

  if (!destination) {
    return (
      <div className="px-5 py-16 lg:px-10">
        <EmptyState
          title={t('noResultsTitle')}
          body={t('noResultsBody')}
          action={
            <Link to="/app/destinations">
              <Button size="sm">{t('sideDestinations')}</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const saved = isFavorite(destination.id)
  const reviews = SEED_REVIEWS.filter((review) => review.destinationId === destination.id)
  const today = new Date().getDay()
  const todayHours = destination.hours?.find((entry) => entry.day === today)

  const nearby = DESTINATIONS.filter((other) => other.id !== destination.id)
    .map((other) => ({ other, km: distanceKm(destination, other) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: destination.name, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The user dismissed the share sheet, or the clipboard was blocked.
      // Neither is an error worth surfacing.
    }
  }

  const addToItinerary = () => {
    if (!requireAuth()) return
    setAdded(true)
    setTimeout(() => navigate('/app/itineraries', { state: { add: destination.id } }), 400)
  }

  return (
    <article className="pb-12">
      {/* ----------------------------------------------------------- hero */}
      <div className="relative h-[46vh] min-h-[320px] w-full overflow-hidden">
        <SafeImage
          src={destination.image}
          alt={destination.name}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/20" />

        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('back')}
          className="absolute left-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-ink-950/60 text-mist-100 backdrop-blur-md transition-colors hover:bg-ink-950/80"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {destination.imageIsContextual && (
          <p className="absolute inset-x-5 bottom-5 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-2xs text-mist-300 backdrop-blur-md sm:max-w-sm">
            {t('contextualPhoto')}
          </p>
        )}
      </div>

      <div className="mx-auto -mt-16 max-w-6xl px-5 lg:px-10">
        {/* ---------------------------------------------------- summary */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-raised rounded-3xl p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {destination.categories.map((id) => (
                  <Badge key={id} tone="accent">
                    {CATEGORY_BY_ID[id]?.[language] ?? id}
                  </Badge>
                ))}
              </div>

              <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                {destination.name}
              </h1>

              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-mist-500">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {destination.quarter}, {destination.city}
                </span>
                {destination.visitMinutes > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(destination.visitMinutes, language)} {t('minutes')}
                  </span>
                )}
                {todayHours && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 font-medium',
                      todayHours.opens ? 'text-emerald-400' : 'text-rose-400',
                    )}
                  >
                    {todayHours.opens
                      ? `${t('openNow')} · ${todayHours.opens}–${todayHours.closes}`
                      : t('closedToday')}
                  </span>
                )}
              </p>

              <div className="mt-4">
                <Rating value={destination.rating} count={destination.reviewCount} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleFavorite(destination.id)}
                aria-pressed={saved}
                aria-label={saved ? t('removeFavorite') : t('addFavorite')}
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-xl border transition-colors',
                  saved
                    ? 'border-rose-400/40 bg-rose-500/20 text-rose-300'
                    : 'border-white/10 bg-white/[0.04] text-mist-300 hover:text-rose-300',
                )}
              >
                <Heart className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} />
              </button>

              <button
                type="button"
                onClick={share}
                aria-label={t('share')}
                className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-mist-300 transition-colors hover:text-mist-100"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
              </button>

              <Button onClick={addToItinerary}>
                {added ? <Check className="h-4 w-4" /> : <Route className="h-4 w-4" />}
                {t('addToItinerary')}
              </Button>
            </div>
          </div>
          {copied && <p className="mt-3 text-xs text-emerald-400">{t('linkCopied')}</p>}
        </motion.div>

        {/* ------------------------------------------------------- body */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-10">
            <section>
              <h2 className="text-lg font-semibold">{t('overview')}</h2>
              <p className="mt-3 leading-relaxed text-mist-300">
                {destination.description[language]}
              </p>

              <div className="mt-5 flex flex-wrap gap-1.5">
                {destination.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            </section>

            {(destination.videos?.length || fetchedVideos.length) > 0 && (
              <section>
                <h2 className="text-lg font-semibold">
                  {language === 'fr' ? 'Regarder' : 'Watch'}
                </h2>
                <div className="mt-3 space-y-4">
                  {[
                    ...(destination.videos ?? []),
                    ...fetchedVideos.map((video) => ({
                      url: video.url,
                      caption: video.caption ?? {
                        en: 'Footage from Wikimedia Commons.',
                        fr: 'Images via Wikimedia Commons.',
                      },
                      sourceUrl: video.sourceUrl,
                      license: video.license,
                      author: video.author,
                    })),
                  ].map((video) => (
                    <figure key={video.url} className="overflow-hidden rounded-2xl border border-white/[0.08]">
                      <video
                        src={video.url}
                        controls
                        preload="metadata"
                        playsInline
                        poster={destination.image}
                        className="aspect-video w-full bg-black object-cover"
                      />
                      <figcaption className="p-3 text-sm text-mist-300">
                        {video.caption[language]}
                        <a
                          href={video.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-2xs text-mist-700 hover:text-mist-500"
                        >
                          {video.author} · {video.license} · Wikimedia Commons
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {gallery.length > 1 && (
              <section>
                <h2 className="text-lg font-semibold">{t('photos')}</h2>
                <p className="mt-1 text-2xs text-mist-700">
                  {gallery.length} {language === 'fr' ? 'photos' : 'photos'} ·{' '}
                  {language === 'fr' ? 'faites défiler' : 'scroll to browse'}
                </p>
                <Gallery images={gallery} alt={destination.name} className="mt-3" />
              </section>
            )}

            <section>
              <h2 className="text-lg font-semibold">{t('location')}</h2>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08]">
                <StaticMap
                  destinations={[destination]}
                  focusId={destination.id}
                  className="h-[280px]"
                />
              </div>
            </section>

            {reviews.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold">
                  {language === 'fr' ? 'Avis' : 'Reviews'}
                </h2>
                <ul className="mt-4 space-y-4">
                  {reviews.map((review) => (
                    <li key={review.id} className="surface p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid h-9 w-9 place-items-center rounded-full text-2xs font-bold text-ink-950"
                          style={{ background: review.avatarColor }}
                        >
                          {initials(review.author)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-mist-100">{review.author}</p>
                          <p className="text-2xs text-mist-500">
                            {timeAgo(review.createdAt, language)}
                          </p>
                        </div>
                        <Rating value={review.rating} className="ml-auto" />
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-mist-300">{review.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* ------------------------------------------------------ aside */}
          <aside className="space-y-6">
            <div className="surface p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Ticket className="h-4 w-4 text-cyan-300" />
                {t('priceInfo')}
              </h3>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {destination.priceFrom === 0
                  ? t('free')
                  : destination.priceFrom === null
                    ? '—'
                    : formatFcfa(destination.priceFrom)}
              </p>
              {destination.priceNote && (
                <p className="mt-1.5 text-2xs text-mist-500">{destination.priceNote[language]}</p>
              )}
            </div>

            {destination.hours && (
              <div className="surface p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-cyan-300" />
                  {t('openingHours')}
                </h3>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {destination.hours.map((entry) => (
                    <li
                      key={entry.day}
                      className={cn(
                        'flex justify-between',
                        entry.day === today ? 'text-mist-100' : 'text-mist-500',
                      )}
                    >
                      <span>{(language === 'fr' ? DAYS_FR : DAYS_EN)[entry.day]}</span>
                      <span className="tabular-nums">
                        {entry.opens ? `${entry.opens}–${entry.closes}` : t('closedNow')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-3 text-sm font-semibold">{t('nearby')}</h3>
              <ul className="space-y-2">
                {nearby.map(({ other, km }) => (
                  <li key={other.id}>
                    <Link
                      to={`/app/destinations/${other.slug}`}
                      className="group flex items-center gap-3 rounded-xl border border-white/[0.08] p-2.5 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <SafeImage
                        src={other.image}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-mist-100">
                          {other.name}
                        </span>
                        <span className="block text-2xs text-mist-500">
                          {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} ·{' '}
                          {other.quarter}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        {/* -------------------------------------------------- more places */}
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-semibold">
            {language === 'fr' ? 'À découvrir aussi' : 'More to see'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.filter(
              (other) =>
                other.id !== destination.id &&
                other.categories.some((category) => destination.categories.includes(category)),
            )
              .slice(0, 3)
              .map((other, index) => (
                <DestinationCard key={other.id} destination={other} index={index} />
              ))}
          </div>
        </section>
      </div>
    </article>
  )
}
