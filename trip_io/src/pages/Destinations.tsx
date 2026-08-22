import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { CategoryIcon } from '@/components/CategoryIcon'
import { DESTINATIONS } from '@/data/destinations'
import { CATEGORIES } from '@/data/categories'
import { useApp } from '@/store/AppContext'
import { cn, normalise } from '@/lib/utils'
import { DestinationCard } from '@/components/DestinationCard'
import { Button, CardSkeleton, EmptyState, Input } from '@/components/ui'
import { PageHeader } from '@/components/layout/PageHeader'
import type { CategoryId } from '@/types'

export function Destinations() {
  const { t, language } = useApp()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<CategoryId[]>([])
  const [loading, setLoading] = useState(true)

  // A brief skeleton on first paint. Real data arrives synchronously here, but
  // the app is designed to fetch, and the states should exist and be styled.
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 380)
    return () => clearTimeout(timer)
  }, [])

  const results = useMemo(() => {
    const q = normalise(query)
    return DESTINATIONS.filter((destination) => {
      const matchesCategory =
        active.length === 0 || active.some((id) => destination.categories.includes(id))
      if (!matchesCategory) return false
      if (!q) return true

      const haystack = normalise(
        [
          destination.name,
          destination.quarter,
          destination.summary[language],
          ...destination.tags,
          ...destination.categories,
        ].join(' '),
      )
      return haystack.includes(q)
    })
  }, [query, active, language])

  const toggleCategory = (id: CategoryId) =>
    setActive((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )

  const hasFilters = active.length > 0 || query.length > 0

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader
        eyebrow={t('destTitle')}
        title={t('destSubtitle')}
        body={t('destDescription')}
        actions={
          <>
            <Link to="/app/submit">
              <Button variant="secondary" size="sm">
                <Plus className="h-4 w-4" />
                {t('destSuggest')}
              </Button>
            </Link>
            <Link to="/app/submissions">
              <Button variant="ghost" size="sm">
                {t('destSubmissions')}
              </Button>
            </Link>
          </>
        }
      />

      {/* --------------------------------------------------------- search */}
      <form
        onSubmit={(event) => event.preventDefault()}
        role="search"
        className="mt-8 flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-12 pl-11 pr-10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-mist-500 hover:bg-white/10 hover:text-mist-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button type="submit" size="lg" className="h-12 sm:w-32">
          {t('searchButton')}
        </Button>
      </form>

      {/* ------------------------------------------------------ categories */}
      <div className="mt-5 flex items-center gap-3">
        <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-mist-700 sm:block" />
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setActive([])}
            aria-pressed={active.length === 0}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              active.length === 0
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                : 'border-white/10 text-mist-500 hover:text-mist-100',
            )}
          >
            {t('filterAll')}
          </button>

          {CATEGORIES.map((category) => {
            const on = active.includes(category.id)
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategory(category.id)}
                aria-pressed={on}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                  on
                    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                    : 'border-white/10 text-mist-500 hover:border-white/20 hover:text-mist-100',
                )}
              >
                <CategoryIcon name={category.icon} className="h-3.5 w-3.5" />
                {category[language]}
              </button>
            )
          })}
        </div>
      </div>

      {/* --------------------------------------------------------- results */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-mist-500" aria-live="polite">
          <span className="font-semibold tabular-nums text-mist-100">{results.length}</span>{' '}
          {t('resultsCount')}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setActive([])
              setQuery('')
            }}
            className="text-xs text-cyan-300 hover:text-cyan-200"
          >
            {t('clearFilters')}
          </button>
        )}
      </div>

      <h2 className="sr-only">
        {language === 'fr' ? 'Résultats' : 'Results'}
      </h2>

      {loading ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title={t('noResultsTitle')}
            body={t('noResultsBody')}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActive([])
                  setQuery('')
                }}
              >
                {t('clearFilters')}
              </Button>
            }
          />
        </motion.div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {results.map((destination, index) => (
            <DestinationCard key={destination.id} destination={destination} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
