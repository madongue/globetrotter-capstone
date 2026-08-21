import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { DESTINATION_BY_ID } from '@/data/destinations'
import { useApp } from '@/store/AppContext'
import { Button, EmptyState } from '@/components/ui'
import { DestinationCard } from '@/components/DestinationCard'
import { PageHeader } from '@/components/layout/PageHeader'

export function Favorites() {
  const { t, favorites, user } = useApp()
  const saved = favorites.map((id) => DESTINATION_BY_ID[id]).filter(Boolean)

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader
        eyebrow={t('sideFavorites')}
        title={t('favTitle')}
        body={
          saved.length
            ? `${saved.length} ${t('resultsCount')}`
            : user
              ? t('favEmptyBody')
              : t('authGuestNote')
        }
      />

      {saved.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Heart className="h-5 w-5" />}
            title={t('favEmptyTitle')}
            body={t('favEmptyBody')}
            action={
              <Link to="/app/destinations">
                <Button size="sm">{t('favEmptyCta')}</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {saved.map((destination, index) => (
            <DestinationCard key={destination.id} destination={destination} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
