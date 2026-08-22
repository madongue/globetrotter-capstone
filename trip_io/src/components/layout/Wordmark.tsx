import { cn } from '@/lib/utils'

/**
 * The mg trip wordmark.
 *
 * "mg" carries the accent colour and "trip" stays white, so the mark reads as
 * one name with a clear owner rather than two words of equal weight. Set tight
 * and heavy, because it is used very large in the brand section.
 */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-3xl sm:text-4xl',
    xl: 'text-6xl sm:text-8xl',
  }

  return (
    <span
      className={cn(
        'inline-flex select-none items-baseline gap-[0.18em] font-display font-extrabold tracking-tight text-white',
        sizes[size],
        className,
      )}
    >
      <span className="text-cyan-400">mg</span>
      <span>trip</span>
    </span>
  )
}
