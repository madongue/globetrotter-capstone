import { Link } from 'react-router-dom'
import { Heart, LogOut, Route, Send, UserRound } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { initials } from '@/lib/utils'
import { Button, EmptyState } from '@/components/ui'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { PageHeader } from '@/components/layout/PageHeader'

export function Profile() {
  const { t, user, signOut, favorites, itineraries, submissions, language } = useApp()

  if (!user) {
    return (
      <div className="px-5 py-8 lg:px-10">
        <PageHeader eyebrow={t('profileTitle')} title={t('profileTitle')} />
        <div className="mt-8">
          <EmptyState
            icon={<UserRound className="h-5 w-5" />}
            title={t('navSignIn')}
            body={t('authGuestNote')}
            action={
              <Link to="/signin">
                <Button size="sm">{t('authSignIn')}</Button>
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  const stats = [
    { icon: Heart, label: t('profileFavorites'), value: favorites.length, to: '/app/favorites' },
    { icon: Route, label: t('profileItineraries'), value: itineraries.length, to: '/app/itineraries' },
    { icon: Send, label: t('profileSubmissions'), value: submissions.length, to: '/app/submissions' },
  ]

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader eyebrow={t('profileTitle')} title={t('profileTitle')} />

      <div className="mt-8 max-w-3xl space-y-6">
        <section className="surface flex flex-wrap items-center gap-5 p-6">
          <span
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-lg font-bold text-ink-950"
            style={{ background: user.avatarColor }}
          >
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{user.name}</h2>
            <p className="text-sm text-mist-500">{user.email}</p>
            <p className="mt-1 text-2xs text-mist-700">
              {language === 'fr' ? 'Membre depuis' : 'Member since'}{' '}
              {new Date(user.joinedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB')}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            {t('profileSignOut')}
          </Button>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              to={stat.to}
              className="surface p-5 transition-colors hover:border-white/20"
            >
              <stat.icon className="h-4 w-4 text-cyan-300" />
              <p className="mt-3 font-display text-2xl font-bold tabular-nums">{stat.value}</p>
              <p className="text-2xs text-mist-500">{stat.label}</p>
            </Link>
          ))}
        </div>

        <section className="surface p-6">
          <h3 className="text-sm font-semibold">{t('profileLanguage')}</h3>
          <p className="mt-1 text-2xs text-mist-500">
            {language === 'fr'
              ? 'Cameroun est bilingue ; choisissez la langue de l’interface.'
              : 'Cameroon is bilingual; choose the interface language.'}
          </p>
          <div className="mt-4">
            <LanguageToggle />
          </div>
        </section>
      </div>
    </div>
  )
}
