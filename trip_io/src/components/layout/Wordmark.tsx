import { cn } from '@/lib/utils'

/**
 * The trip_io wordmark.
 *
 * The underscore is the identity, so it is set in the mono face and given the
 * accent colour rather than being left as an ordinary character.
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
    xl: 'text-5xl sm:text-7xl',
  }

  return (
    <span
      className={cn(
        'inline-flex select-none items-baseline font-display font-extrabold tracking-tight text-white',
        sizes[size],
        className,
      )}
    >
      trip
      <span className="font-mono font-medium text-cyan-400">_</span>
      io
    </span>
  )
}
