import { useState } from 'react'
import { Check, Copy, KeyRound, Terminal } from 'lucide-react'
import { DESTINATIONS } from '@/data/destinations'
import { CATEGORIES } from '@/data/categories'
import { useApp } from '@/store/AppContext'
import { Badge, Button } from '@/components/ui'
import { Navbar } from '@/components/layout/Navbar'
import { cn } from '@/lib/utils'

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/destinations',
    en: 'Every Yaoundé destination, with filtering by category and tag.',
    fr: 'Toutes les destinations de Yaoundé, filtrables par catégorie et par tag.',
  },
  {
    method: 'GET',
    path: '/api/destinations/:id',
    en: 'A single destination, including hours, price and coordinates.',
    fr: 'Une destination, avec horaires, tarif et coordonnées.',
  },
  {
    method: 'GET',
    path: '/api/categories',
    en: 'The category vocabulary, in English and French.',
    fr: 'Le vocabulaire des catégories, en anglais et en français.',
  },
  {
    method: 'GET',
    path: '/api/itineraries',
    en: 'Saved itineraries for the authenticated user.',
    fr: 'Les itinéraires enregistrés de l’utilisateur authentifié.',
  },
]

const SAMPLE = `curl https://api.mgtrip.app/v1/destinations?category=museum \\
  -H "Authorization: Bearer $MGTRIP_KEY"`

const RESPONSE = `{
  "count": ${DESTINATIONS.length},
  "results": [
    {
      "id": "d-national-museum",
      "name": "National Museum of Cameroon",
      "quarter": "Centre administratif",
      "categories": ["museum", "culture", "history"],
      "rating": 4.5,
      "price_from": 2000,
      "currency": "XAF",
      "lat": 3.8656,
      "lng": 11.5183
    }
  ]
}`

export function ApiPage() {
  const { t, language } = useApp()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked; the snippet is selectable either way.
    }
  }

  return (
    <div className="min-h-dvh">
      <Navbar />

      <div className="mx-auto max-w-5xl px-5 pb-24 pt-32 lg:px-8">
        <p className="label-eyebrow">{t('navApi')}</p>
        <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">{t('apiTitle')}</h1>
        <p className="mt-4 max-w-xl text-mist-300">{t('apiSubtitle')}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button>
            <KeyRound className="h-4 w-4" />
            {t('apiGetKey')}
          </Button>
          <Badge tone="accent">v1 · REST · JSON</Badge>
        </div>

        {/* ---------------------------------------------------- endpoints */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">
            {language === 'fr' ? 'Points d’entrée' : 'Endpoints'}
          </h2>
          <ul className="mt-4 space-y-2">
            {ENDPOINTS.map((endpoint) => (
              <li
                key={endpoint.path}
                className="surface flex flex-wrap items-center gap-x-4 gap-y-1.5 p-4"
              >
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-2xs font-semibold text-emerald-300">
                  {endpoint.method}
                </span>
                <code className="font-mono text-sm text-mist-100">{endpoint.path}</code>
                <span className="w-full text-xs text-mist-500 sm:ml-auto sm:w-auto sm:max-w-sm sm:text-right">
                  {endpoint[language]}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------ example */}
        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <div className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2.5">
              <span className="inline-flex items-center gap-2 text-xs text-mist-500">
                <Terminal className="h-3.5 w-3.5" />
                {language === 'fr' ? 'Requête' : 'Request'}
              </span>
              <button
                type="button"
                onClick={copy}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs transition-colors',
                  copied ? 'text-emerald-400' : 'text-mist-500 hover:text-mist-100',
                )}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? t('linkCopied') : 'Copy'}
              </button>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-cyan-200">
              {SAMPLE}
            </pre>
          </div>

          <div className="surface overflow-hidden">
            <div className="border-b border-white/[0.08] px-4 py-2.5 text-xs text-mist-500">
              {language === 'fr' ? 'Réponse' : 'Response'}
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-mist-300">
              {RESPONSE}
            </pre>
          </div>
        </section>

        {/* --------------------------------------------------- categories */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold">
            {language === 'fr' ? 'Catégories disponibles' : 'Available categories'}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <code
                key={category.id}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-2xs text-mist-300"
              >
                {category.id}
              </code>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
