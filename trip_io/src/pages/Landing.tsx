import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Coins,
  Globe2,
  Languages,
  MapPinned,
  Route,
  Smartphone,
  Sparkles,
  Apple,
  Monitor,
} from 'lucide-react'
import { DESTINATIONS } from '@/data/destinations'
import { useApp } from '@/store/AppContext'
import { Navbar } from '@/components/layout/Navbar'
import { Wordmark } from '@/components/layout/Wordmark'
import { Starfield } from '@/components/Starfield'
import { SafeImage, SectionHeading } from '@/components/ui'
import { QrPanel } from '@/components/QrPanel'
import type { StringKey } from '@/lib/i18n'

const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0 },
}

export function Landing() {
  const { t } = useApp()

  const showcase = DESTINATIONS.filter((d) => d.featured || d.rating >= 4.4).slice(0, 10)

  const platforms: { icon: typeof Smartphone; label: StringKey; note: StringKey }[] = [
    { icon: Smartphone, label: 'heroAndroid', note: 'heroAndroidNote' },
    { icon: Apple, label: 'heroIos', note: 'heroIosNote' },
    { icon: Monitor, label: 'heroWeb', note: 'heroWebNote' },
  ]

  const features: { icon: typeof Sparkles; title: StringKey; body: StringKey }[] = [
    { icon: MapPinned, title: 'feature1Title', body: 'feature1Body' },
    { icon: Route, title: 'feature2Title', body: 'feature2Body' },
    { icon: Languages, title: 'feature3Title', body: 'feature3Body' },
    { icon: Coins, title: 'feature4Title', body: 'feature4Body' },
  ]

  return (
    <div className="min-h-dvh">
      <Navbar />

      {/* ============================================ hero / get the app */}
      <section id="get-the-app" className="relative isolate overflow-hidden pt-16">
        <div className="absolute inset-0 -z-10">
          <SafeImage
            src="/images/destinations/yaounde-skyline.jpg"
            alt=""
            className="h-full w-full object-cover"
          />
          {/* The photograph is a bright daytime cityscape, so the scrim has to
              be heavy: at lighter values the navbar and body copy were not
              legible against it. Blue-biased rather than neutral black, which
              keeps the image warm underneath instead of muddy. */}
          <div className="absolute inset-0 bg-ink-950/75" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950 via-ink-950/80 to-ink-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_10%,rgba(8,47,73,0.55),transparent_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(6,182,212,0.14),transparent_55%)]" />
        </div>

        <Starfield className="absolute inset-0 -z-10 h-full w-full" />

        <div className="mx-auto max-w-7xl px-5 py-24 text-center sm:py-32 lg:px-8">
          <motion.p
            initial="hidden"
            animate="show"
            variants={rise}
            transition={{ duration: 0.5 }}
            className="label-eyebrow"
          >
            {t('heroLabel')}
          </motion.p>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={rise}
            transition={{ duration: 0.55, delay: 0.06 }}
            className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl"
          >
            {t('heroTitle')}
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="show"
            variants={rise}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-base text-mist-300 sm:text-lg"
          >
            {t('heroSubtitle')}
          </motion.p>

          <motion.div
            initial="hidden"
            animate="show"
            variants={rise}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3"
          >
            {platforms.map(({ icon: Icon, label, note }) => (
              <Link
                key={label}
                to="/app/destinations"
                className="group glass flex items-center gap-3 rounded-2xl p-4 text-left transition-all duration-300 hover:border-cyan-500/30 hover:bg-white/[0.07]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300 transition-colors group-hover:bg-cyan-500/20">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-mist-100">{t(label)}</span>
                  <span className="block truncate text-2xs text-mist-500">{t(note)}</span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-mist-700 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-300" />
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ======================================================== explore */}
      <section id="explore" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            label={t('exploreLabel')}
            title={t('exploreTitle')}
            body={t('exploreSubtitle')}
          />
          <Link
            to="/app/destinations"
            className="inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:text-cyan-200"
          >
            {t('exploreCta')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="no-scrollbar -mx-5 mt-10 flex gap-4 overflow-x-auto px-5 pb-2 lg:mx-0 lg:px-0">
          {showcase.map((destination, index) => (
            <motion.div
              key={destination.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.05 }}
              className="group relative aspect-[3/4] w-[240px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] sm:w-[260px]"
            >
              <Link to={`/app/destinations/${destination.slug}`} className="block h-full">
                <SafeImage
                  src={destination.image}
                  alt={destination.name}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-4">
                  <span className="block text-[0.95rem] font-semibold leading-tight text-white">
                    {destination.name}
                  </span>
                  <span className="mt-1 block text-2xs text-mist-300">{destination.quarter}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ======================================================= features */}
      <section id="features" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <SectionHeading title={t('featuresTitle')} className="mx-auto text-center" />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }, index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: index * 0.07 }}
              className="surface group p-6 transition-colors hover:border-white/[0.16]"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-mist-100">{t(title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist-500">{t(body)}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ==================================================== brand / stats */}
      <section id="stats" className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <SafeImage
            src="/images/destinations/yaounde-hotel-de-ville.jpg"
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-ink-950/88" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950" />
        </div>

        <div className="mx-auto max-w-5xl px-5 py-28 text-center lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Wordmark size="xl" />
          </motion.div>

          <p className="mx-auto mt-6 max-w-2xl text-base text-mist-300 sm:text-lg">
            {t('brandBlurb')}
          </p>

          <div className="mt-14 grid grid-cols-3 gap-4 border-t border-white/[0.08] pt-10">
            {[
              { value: String(DESTINATIONS.length), label: t('statSpots') },
              { value: '3', label: t('statPlatforms') },
              { value: 'EN / FR', label: t('statBilingual') },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
              >
                <div className="font-display text-3xl font-extrabold tabular-nums text-white sm:text-5xl">
                  {stat.value}
                </div>
                <div className="mt-2 text-2xs uppercase tracking-[0.14em] text-mist-500 sm:text-xs">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ qr */}
      <section id="qr" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <QrPanel />
      </section>

      {/* ======================================================== footer */}
      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <Wordmark />
            <p className="mt-2 max-w-sm text-xs text-mist-500">{t('tagline')}</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-mist-500">
            <Link to="/app/destinations" className="hover:text-mist-100">
              {t('navExplore')}
            </Link>
            <Link to="/app/community" className="hover:text-mist-100">
              {t('navCommunity')}
            </Link>
            <Link to="/api" className="hover:text-mist-100">
              {t('navApi')}
            </Link>
            <Link to="/stats" className="hover:text-mist-100">
              {t('navStats')}
            </Link>
          </nav>
          <p className="flex items-center gap-1.5 text-2xs text-mist-700">
            <Globe2 className="h-3.5 w-3.5" />
            Yaoundé, Cameroon
          </p>
        </div>
      </footer>
    </div>
  )
}
