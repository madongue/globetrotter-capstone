import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { DESTINATIONS } from '@/data/destinations'
import { CATEGORIES, CATEGORY_BY_ID } from '@/data/categories'
import { useApp } from '@/store/AppContext'
import { cn, normalise } from '@/lib/utils'
import { Input, Rating, SafeImage } from '@/components/ui'
import { StaticMap } from '@/components/StaticMap'
import { PageHeader } from '@/components/layout/PageHeader'
import type { CategoryId, Destination } from '@/types'

export function MapPage() {
  const { t, language } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryId | null>(null)

  const focusId = params.get('focus')

  const visible = useMemo(() => {
    const q = normalise(query)
    return DESTINATIONS.filter((destination) => {
      if (category && !destination.categories.includes(category)) return false
      if (!q) return true
      return normalise(`${destination.name} ${destination.quarter}`).includes(q)
    })
  }, [query, category])

  const selected = focusId ? DESTINATIONS.find((d) => d.id === focusId) : undefined

  const select = (destination: Destination) => {
    setParams({ focus: destination.id }, { replace: true })
  }

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader eyebrow={t('mapTitle')} title={t('mapSubtitle')} />

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* -------------------------------------------------------- list */}
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('mapSearch')}
              aria-label={t('mapSearch')}
              className="pl-10"
            />
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-2xs transition-colors',
                category === null
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                  : 'border-white/10 text-mist-500',
              )}
            >
              {t('filterAll')}
            </button>
            {CATEGORIES.slice(0, 10).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(category === item.id ? null : item.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-2xs transition-colors',
                  category === item.id
                    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                    : 'border-white/10 text-mist-500 hover:text-mist-100',
                )}
              >
                {item[language]}
              </button>
            ))}
          </div>

          <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1 lg:max-h-[560px]">
            {visible.map((destination) => (
              <li key={destination.id}>
                <button
                  type="button"
                  onClick={() => select(destination)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors',
                    destination.id === focusId
                      ? 'border-cyan-500/40 bg-cyan-500/10'
                      : 'border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04]',
                  )}
                >
                  <SafeImage
                    src={destination.image}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-mist-100">
                      {destination.name}
                    </span>
                    <span className="block truncate text-2xs text-mist-500">
                      {destination.quarter}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-mist-500">
                {t('noResultsTitle')}
              </li>
            )}
          </ul>
        </div>

        {/* --------------------------------------------------------- map */}
        <div className="relative order-1 lg:order-2">
          <StaticMap
            destinations={visible}
            focusId={focusId ?? undefined}
            onSelect={select}
            className="h-[380px] rounded-2xl border border-white/[0.08] lg:h-[620px]"
          />

          {selected && (
            <div className="glass-raised absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-2xl p-3 sm:max-w-sm">
              <SafeImage
                src={selected.image}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-mist-100">{selected.name}</p>
                <p className="truncate text-2xs text-mist-500">
                  {CATEGORY_BY_ID[selected.categories[0]]?.[language]} · {selected.quarter}
                </p>
                <Rating value={selected.rating} className="mt-1" />
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate(`/app/destinations/${selected.slug}`)}
                  className="rounded-lg bg-cyan-500 px-3 py-1.5 text-2xs font-semibold text-ink-950"
                >
                  {t('viewDetails')}
                </button>
                <button
                  type="button"
                  onClick={() => setParams({}, { replace: true })}
                  aria-label="Close"
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-2xs text-mist-500"
                >
                  <X className="mx-auto h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
