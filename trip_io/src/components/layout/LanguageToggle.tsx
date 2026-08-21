import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import type { Language } from '@/types'

/**
 * EN / FR switch.
 *
 * Rendered as a two-option segmented control rather than a dropdown: there are
 * exactly two official languages here, and both should be visible at a glance
 * rather than hidden behind a menu.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useApp()

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        'inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-0.5',
        className,
      )}
    >
      {(['en', 'fr'] as Language[]).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          aria-pressed={language === code}
          className={cn(
            'rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors',
            language === code
              ? 'bg-cyan-500 text-ink-950'
              : 'text-mist-500 hover:text-mist-100',
          )}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
