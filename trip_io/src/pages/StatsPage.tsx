import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Compass, Layers, Route, Send, Users } from 'lucide-react'
import { DESTINATIONS } from '@/data/destinations'
import { CATEGORIES, CATEGORY_BY_ID } from '@/data/categories'
import { useApp } from '@/store/AppContext'
import { Navbar } from '@/components/layout/Navbar'
import { SafeImage } from '@/components/ui'

export function StatsPage() {
  const { t, language, itineraries, submissions, posts } = useApp()

  const byCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const destination of DESTINATIONS) {
      for (const category of destination.categories) {
        counts.set(category, (counts.get(category) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [])

  const mostVisited = useMemo(
    () => [...DESTINATIONS].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5),
    [],
  )

  const max = byCategory[0]?.count ?? 1

  const tiles = [
    { icon: Compass, label: t('statSpots'), value: DESTINATIONS.length },
    {
      icon: Layers,
      label: language === 'fr' ? 'Catégories' : 'Categories',
      value: CATEGORIES.length,
    },
    { icon: Route, label: t('profileItineraries'), value: itineraries.length },
    { icon: Send, label: t('profileSubmissions'), value: submissions.length },
    {
      icon: Users,
      label: language === 'fr' ? 'Publications' : 'Community posts',
      value: posts.length,
    },
  ]

  return (
    <div className="min-h-dvh">
      <Navbar />

      <div className="mx-auto max-w-6xl px-5 pb-24 pt-32 lg:px-8">
        <p className="label-eyebrow">{t('navStats')}</p>
        <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">{t('statsTitle')}</h1>
        <p className="mt-4 max-w-xl text-mist-300">{t('statsSubtitle')}</p>

        {/* ------------------------------------------------------- tiles */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {tiles.map((tile, index) => (
            <motion.div
              key={tile.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
              className="surface p-5"
            >
              <tile.icon className="h-4 w-4 text-cyan-300" />
              <p className="mt-4 font-display text-3xl font-extrabold tabular-nums">{tile.value}</p>
              <p className="mt-1 text-2xs text-mist-500">{tile.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* ------------------------------------------------ by category */}
          <section className="surface p-6">
            <h2 className="text-sm font-semibold">
              {language === 'fr' ? 'Lieux par catégorie' : 'Destinations by category'}
            </h2>
            <ul className="mt-5 space-y-3">
              {byCategory.map((row, index) => (
                <li key={row.id}>
                  <div className="mb-1.5 flex items-baseline justify-between text-xs">
                    <span className="text-mist-300">
                      {CATEGORY_BY_ID[row.id as never]?.[language] ?? row.id}
                    </span>
                    <span className="font-mono tabular-nums text-mist-500">{row.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(row.count / max) * 100}%` }}
                      transition={{ duration: 0.7, delay: index * 0.05, ease: [0.22, 0.8, 0.3, 1] }}
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-azure-400"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* ----------------------------------------------- most visited */}
          <section className="surface p-6">
            <h2 className="text-sm font-semibold">
              {language === 'fr' ? 'Les plus consultés' : 'Most visited'}
            </h2>
            <ol className="mt-5 space-y-3">
              {mostVisited.map((destination, index) => (
                <li key={destination.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-mist-700">
                    {index + 1}
                  </span>
                  <SafeImage
                    src={destination.image}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-mist-100">{destination.name}</span>
                    <span className="block text-2xs text-mist-500">{destination.quarter}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-cyan-300">
                    {destination.reviewCount}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
