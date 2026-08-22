import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Compass,
  Heart,
  Map as MapIcon,
  Route,
  Settings,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cn, initials } from '@/lib/utils'
import { LanguageToggle } from './LanguageToggle'
import { Wordmark } from './Wordmark'
import type { StringKey } from '@/lib/i18n'
import { Link } from 'react-router-dom'

const NAV: { to: string; icon: typeof Compass; key: StringKey }[] = [
  { to: '/app/destinations', icon: Compass, key: 'sideDestinations' },
  { to: '/app/for-you', icon: Sparkles, key: 'sideForYou' },
  { to: '/app/favorites', icon: Heart, key: 'sideFavorites' },
  { to: '/app/map', icon: MapIcon, key: 'sideMap' },
  { to: '/app/itineraries', icon: Route, key: 'sideItineraries' },
  { to: '/app/profile', icon: UserRound, key: 'sideProfile' },
]

/**
 * Dashboard chrome.
 *
 * Desktop gets a fixed sidebar; below `lg` it collapses to an icon rail, and
 * on phones it becomes a bottom bar, which is where a thumb actually reaches.
 */
export function AppShell() {
  const { t, user, favorites } = useApp()
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-ink-950">
      {/* ------------------------------------------------------- sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.07] bg-ink-900/60 backdrop-blur-xl sm:flex',
          'w-[76px] xl:w-64',
        )}
      >
        <div className="flex h-16 items-center justify-center border-b border-white/[0.07] xl:justify-start xl:px-6">
          <Link to="/" aria-label="mg trip home">
            {/* Collapsed rail: the initials alone, since the full mark does
                not fit at 76px. */}
            <span className="font-display text-xl font-extrabold tracking-tight text-cyan-400 xl:hidden">
              mg
            </span>
            <span className="hidden xl:inline">
              <Wordmark />
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  'justify-center xl:justify-start',
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-300'
                    : 'text-mist-500 hover:bg-white/[0.05] hover:text-mist-100',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="side-active"
                      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-cyan-400"
                    />
                  )}
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="hidden xl:inline">{t(item.key)}</span>
                  {item.key === 'sideFavorites' && favorites.length > 0 && (
                    <span className="ml-auto hidden rounded-full bg-white/[0.08] px-1.5 text-2xs tabular-nums text-mist-300 xl:inline">
                      {favorites.length}
                    </span>
                  )}
                  {/* Tooltip for the collapsed rail. */}
                  <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-white/10 bg-ink-850 px-2 py-1 text-2xs text-mist-100 opacity-0 transition-opacity group-hover:opacity-100 sm:block xl:hidden">
                    {t(item.key)}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-white/[0.07] p-3">
          <div className="flex justify-center xl:justify-start">
            <LanguageToggle />
          </div>

          <NavLink
            to="/app/profile"
            className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-mist-500 transition-colors hover:bg-white/[0.05] hover:text-mist-100"
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            <span className="hidden text-sm xl:inline">{t('sideSettings')}</span>
          </NavLink>

          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-2xs font-bold text-ink-950"
              style={{ background: user?.avatarColor ?? '#334155' }}
            >
              {user ? initials(user.name) : '?'}
            </span>
            <span className="hidden min-w-0 xl:block">
              <span className="block truncate text-xs font-medium text-mist-100">
                {user?.name ?? t('navSignIn')}
              </span>
              <span className="block truncate text-2xs text-mist-500">
                {user?.email ?? t('authGuestNote').slice(0, 24)}
              </span>
            </span>
          </div>
        </div>
      </aside>

      {/* --------------------------------------------------------- content */}
      <div className="sm:pl-[76px] xl:pl-64">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 0.8, 0.3, 1] }}
          className="min-h-dvh pb-24 sm:pb-0"
        >
          <Outlet />
        </motion.main>
      </div>

      {/* ----------------------------------------------------- bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/90 backdrop-blur-xl sm:hidden"
        aria-label="Primary"
      >
        <ul className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV.slice(0, 5).map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 py-2.5 text-2xs transition-colors',
                    isActive ? 'text-cyan-300' : 'text-mist-500',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <item.icon className="h-5 w-5" />
                      {isActive && (
                        <motion.span
                          layoutId="tab-dot"
                          className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-400"
                        />
                      )}
                    </span>
                    <span className="leading-none">{t(item.key)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
