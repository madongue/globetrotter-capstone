import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, UserRound, X } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import { LanguageToggle } from './LanguageToggle'
import { Wordmark } from './Wordmark'
import type { StringKey } from '@/lib/i18n'

const LINKS: { key: StringKey; hash: string }[] = [
  { key: 'navGetApp', hash: '#get-the-app' },
  { key: 'navExplore', hash: '#explore' },
  { key: 'navFeatures', hash: '#features' },
  { key: 'navStats', hash: '#stats' },
  { key: 'navQr', hash: '#qr' },
]

/** Sticky, translucent site navigation for the public pages. */
export function Navbar() {
  const { t, user } = useApp()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile sheet on navigation, or it lingers over the new page.
  useEffect(() => setOpen(false), [location.pathname, location.hash])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled ? 'border-b border-white/[0.07] bg-ink-950/80 backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
        <Link to="/" className="shrink-0" aria-label="trip_io home">
          <Wordmark />
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <li key={link.key}>
              <a
                href={link.hash}
                className="rounded-lg px-3 py-2 text-sm text-mist-300 transition-colors hover:bg-white/[0.05] hover:text-mist-100"
              >
                {t(link.key)}
              </a>
            </li>
          ))}
          <li>
            <Link
              to="/api"
              className="rounded-lg px-3 py-2 text-sm text-mist-300 transition-colors hover:bg-white/[0.05] hover:text-mist-100"
            >
              {t('navApi')}
            </Link>
          </li>
          <li>
            <Link
              to="/app/community"
              className="rounded-lg px-3 py-2 text-sm text-mist-300 transition-colors hover:bg-white/[0.05] hover:text-mist-100"
            >
              {t('navCommunity')}
            </Link>
          </li>
        </ul>

        <div className="flex items-center gap-2">
          <LanguageToggle className="hidden sm:inline-flex" />

          <Link
            to={user ? '/app/profile' : '/signin'}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-mist-300 transition-colors hover:text-mist-100"
            aria-label={user ? t('profileTitle') : t('navSignIn')}
          >
            {user ? (
              <span
                className="grid h-full w-full place-items-center rounded-full text-2xs font-bold text-ink-950"
                style={{ background: user.avatarColor }}
              >
                {user.name.slice(0, 1)}
              </span>
            ) : (
              <UserRound className="h-4 w-4" />
            )}
          </Link>

          <Link
            to="/app/destinations"
            className="hidden h-9 items-center rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-ink-950 transition-colors hover:bg-cyan-400 sm:inline-flex"
          >
            {t('navOpenApp')}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-mist-300 lg:hidden"
            aria-expanded={open}
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-white/[0.07] bg-ink-950/95 backdrop-blur-xl lg:hidden"
          >
            <ul className="space-y-1 px-5 py-4">
              {LINKS.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.hash}
                    className="block rounded-lg px-3 py-2.5 text-sm text-mist-300 hover:bg-white/[0.05]"
                  >
                    {t(link.key)}
                  </a>
                </li>
              ))}
              <li>
                <Link to="/api" className="block rounded-lg px-3 py-2.5 text-sm text-mist-300">
                  {t('navApi')}
                </Link>
              </li>
              <li>
                <Link
                  to="/app/community"
                  className="block rounded-lg px-3 py-2.5 text-sm text-mist-300"
                >
                  {t('navCommunity')}
                </Link>
              </li>
              <li className="flex items-center gap-3 px-3 pt-3">
                <LanguageToggle />
                <Link
                  to="/app/destinations"
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-cyan-500 text-sm font-semibold text-ink-950"
                >
                  {t('navOpenApp')}
                </Link>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
