import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { DESTINATIONS, DESTINATION_BY_ID } from '@/data/destinations'
import { useApp } from '@/store/AppContext'
import { distanceKm } from '@/lib/utils'
import { DestinationCard } from '@/components/DestinationCard'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Destination } from '@/types'
import type { StringKey } from '@/lib/i18n'

/** Roughly the middle of Yaoundé, used when geolocation is unavailable. */
const CITY_CENTRE = { lat: 3.8667, lng: 11.5167 }

function Rail({ title, destinations }: { title: string; destinations: Destination[] }) {
  if (destinations.length === 0) return null
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-2 lg:mx-0 lg:px-0">
        {destinations.map((destination, index) => (
          <DestinationCard
            key={destination.id}
            destination={destination}
            layout="rail"
            index={index}
          />
        ))}
      </div>
    </section>
  )
}

export function ForYou() {
  const { t, favorites } = useApp()

  const sections = useMemo(() => {
    const saved = favorites.map((id) => DESTINATION_BY_ID[id]).filter(Boolean)

    // Recommendations follow the categories the user has actually saved. With
    // nothing saved yet, fall back to the highest-rated places rather than
    // showing an empty rail.
    const savedCategories = new Set(saved.flatMap((destination) => destination.categories))
    const recommended = (
      savedCategories.size
        ? DESTINATIONS.filter(
            (destination) =>
              !favorites.includes(destination.id) &&
              destination.categories.some((category) => savedCategories.has(category)),
          )
        : DESTINATIONS.filter((destination) => destination.featured)
    ).slice(0, 8)

    const popular = [...DESTINATIONS]
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 8)

    const nearYou = [...DESTINATIONS]
      .sort((a, b) => distanceKm(CITY_CENTRE, a) - distanceKm(CITY_CENTRE, b))
      .slice(0, 8)

    // "Perfect for today" reads the clock: museums and markets in the daytime,
    // bars and live music once it is late enough for them to be open.
    const hour = new Date().getHours()
    const eveningish = hour >= 17
    const perfectToday = DESTINATIONS.filter((destination) =>
      eveningish
        ? destination.categories.some((category) =>
            ['nightlife', 'bar', 'food', 'entertainment'].includes(category),
          )
        : destination.categories.some((category) =>
            ['museum', 'tourism', 'nature', 'shopping', 'culture'].includes(category),
          ),
    ).slice(0, 8)

    const hidden = DESTINATIONS.filter((destination) => destination.hiddenGem)

    return [
      { key: 'recommended' as StringKey, items: recommended },
      { key: 'popular' as StringKey, items: popular },
      { key: 'nearYou' as StringKey, items: nearYou },
      { key: 'perfectToday' as StringKey, items: perfectToday },
      { key: 'hiddenGems' as StringKey, items: hidden },
    ]
  }, [favorites])

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader
        eyebrow={t('forYouTitle')}
        title={t('forYouTitle')}
        body={t('forYouSubtitle')}
      />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        {sections.map((section) => (
          <Rail key={section.key} title={t(section.key)} destinations={section.items} />
        ))}
      </motion.div>
    </div>
  )
}
