import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  Route as RouteIcon,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { DESTINATION_BY_ID } from '@/data/destinations'
import { CATEGORIES } from '@/data/categories'
import { generateItinerary, resequence } from '@/lib/itinerary'
import { useApp } from '@/store/AppContext'
import { cn, formatDuration, formatTime } from '@/lib/utils'
import { Button, EmptyState, Field, Input, SafeImage, Select } from '@/components/ui'
import { PageHeader } from '@/components/layout/PageHeader'
import type { CategoryId, Itinerary } from '@/types'

export function Itineraries() {
  const { t, language, itineraries, saveItinerary, deleteItinerary, requireAuth } = useApp()
  const location = useLocation()

  const [building, setBuilding] = useState(false)
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState<'half' | 'full' | 'two'>('full')
  const [interests, setInterests] = useState<CategoryId[]>(['culture', 'food'])
  const [draft, setDraft] = useState<Itinerary | null>(null)

  // Arriving from "Add to itinerary" on a destination page.
  useEffect(() => {
    const add = (location.state as { add?: string } | null)?.add
    if (add) setBuilding(true)
  }, [location.state])

  const generate = () => {
    const name =
      title.trim() ||
      (language === 'fr' ? 'Une journée à Yaoundé' : 'A day in Yaoundé')
    setDraft(generateItinerary(duration, interests, name))
  }

  const commit = () => {
    if (!draft) return
    if (!requireAuth()) return
    saveItinerary(draft)
    setDraft(null)
    setBuilding(false)
    setTitle('')
  }

  const move = (itinerary: Itinerary, index: number, direction: -1 | 1) => {
    const next = [...itinerary.items]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    const updated = { ...itinerary, items: resequence(next) }
    if (draft && draft.id === itinerary.id) setDraft(updated)
    else saveItinerary(updated)
  }

  const removeStop = (itinerary: Itinerary, itemId: string) => {
    const updated = {
      ...itinerary,
      items: resequence(itinerary.items.filter((item) => item.id !== itemId)),
    }
    if (draft && draft.id === itinerary.id) setDraft(updated)
    else saveItinerary(updated)
  }

  const Timeline = ({ itinerary, editable }: { itinerary: Itinerary; editable?: boolean }) => (
    <ol className="relative mt-4 space-y-3 before:absolute before:left-[52px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-white/10">
      {itinerary.items.map((item, index) => {
        const destination =
          item.destinationId === 'lunch' ? null : DESTINATION_BY_ID[item.destinationId]
        return (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
            className="relative flex gap-4"
          >
            <time className="w-[44px] shrink-0 pt-3 text-right font-mono text-xs tabular-nums text-cyan-300">
              {formatTime(item.startMinutes)}
            </time>

            <span className="relative z-10 mt-4 h-2 w-2 shrink-0 rounded-full bg-cyan-400 ring-4 ring-ink-950" />

            <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              {destination ? (
                <>
                  <SafeImage
                    src={destination.image}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/app/destinations/${destination.slug}`}
                      className="block truncate text-sm font-medium text-mist-100 hover:text-cyan-300"
                    >
                      {destination.name}
                    </Link>
                    <p className="truncate text-2xs text-mist-500">
                      {destination.quarter} · {formatDuration(item.durationMinutes, language)}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-300">
                    <UtensilsCrossed className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-mist-100">
                      {language === 'fr' ? 'Déjeuner' : 'Lunch'}
                    </p>
                    <p className="text-2xs text-mist-500">
                      {formatDuration(item.durationMinutes, language)}
                    </p>
                  </div>
                </>
              )}

              {editable && (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => move(itinerary, index, -1)}
                    aria-label={t('itinMoveUp')}
                    className="grid h-7 w-7 place-items-center rounded-md text-mist-500 hover:bg-white/[0.08] hover:text-mist-100"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(itinerary, index, 1)}
                    aria-label={t('itinMoveDown')}
                    className="grid h-7 w-7 place-items-center rounded-md text-mist-500 hover:bg-white/[0.08] hover:text-mist-100"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStop(itinerary, item.id)}
                    aria-label={t('itinRemove')}
                    className="grid h-7 w-7 place-items-center rounded-md text-mist-500 hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader
        eyebrow={t('itinTitle')}
        title={t('itinTitle')}
        body={t('itinSubtitle')}
        actions={
          <Button size="sm" onClick={() => setBuilding((value) => !value)}>
            <Sparkles className="h-4 w-4" />
            {t('itinNew')}
          </Button>
        }
      />

      {/* ------------------------------------------------------- builder */}
      {building && (
        <motion.section
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="surface mt-6 overflow-hidden p-5 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={language === 'fr' ? 'Titre' : 'Title'}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={language === 'fr' ? 'Une journée à Yaoundé' : 'A day in Yaoundé'}
              />
            </Field>

            <Field label={t('itinDuration')}>
              <Select
                value={duration}
                onChange={(event) => setDuration(event.target.value as typeof duration)}
              >
                <option value="half">{t('itinHalfDay')}</option>
                <option value="full">{t('itinFullDay')}</option>
                <option value="two">{t('itinTwoDays')}</option>
              </Select>
            </Field>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-medium text-mist-300">{t('itinInterests')}</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.slice(0, 12).map((category) => {
                const on = interests.includes(category.id)
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() =>
                      setInterests((current) =>
                        on
                          ? current.filter((value) => value !== category.id)
                          : [...current, category.id],
                      )
                    }
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition-colors',
                      on
                        ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                        : 'border-white/10 text-mist-500 hover:text-mist-100',
                    )}
                  >
                    {category[language]}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={generate}>
              <Sparkles className="h-4 w-4" />
              {t('itinGenerate')}
            </Button>
            {draft && (
              <Button variant="secondary" onClick={commit}>
                {t('itinSave')}
              </Button>
            )}
          </div>

          {draft && (
            <div className="mt-6 border-t border-white/[0.08] pt-5">
              <h3 className="text-sm font-semibold">{draft.title}</h3>
              <Timeline itinerary={draft} editable />
            </div>
          )}
        </motion.section>
      )}

      {/* -------------------------------------------------------- saved */}
      {itineraries.length === 0 && !building ? (
        <div className="mt-8">
          <EmptyState
            icon={<RouteIcon className="h-5 w-5" />}
            title={t('itinEmpty')}
            body={t('itinEmptyBody')}
            action={
              <Button size="sm" onClick={() => setBuilding(true)}>
                {t('itinGenerate')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {itineraries.map((itinerary) => (
            <section key={itinerary.id} className="surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{itinerary.title}</h2>
                  <p className="mt-1 text-2xs text-mist-500">
                    {itinerary.date} · {itinerary.items.length}{' '}
                    {language === 'fr' ? 'étapes' : 'stops'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteItinerary(itinerary.id)}
                  aria-label="Delete itinerary"
                  className="grid h-8 w-8 place-items-center rounded-lg text-mist-500 hover:bg-rose-500/15 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Timeline itinerary={itinerary} editable />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
