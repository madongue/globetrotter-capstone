import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  // The accent is reserved for the single most important action on a view.
  primary:
    'bg-cyan-500 text-ink-950 hover:bg-cyan-400 font-semibold shadow-[0_8px_30px_-10px_rgba(34,211,238,0.6)]',
  secondary: 'glass text-mist-100 hover:bg-white/[0.09]',
  ghost: 'text-mist-300 hover:text-mist-100 hover:bg-white/[0.06]',
  danger: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-13 px-7 text-base rounded-xl gap-2.5 py-3.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

/* -------------------------------------------------------------------- Card */

export function Card({
  className,
  children,
  ...props
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('surface overflow-hidden', className)} {...props}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------- Badge */

export function Badge({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode
  className?: string
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
}) {
  const tones = {
    default: 'bg-white/[0.06] text-mist-300 border-white/10',
    accent: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    warning: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    danger: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-2xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------- Input */

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-mist-100 placeholder:text-mist-500 transition-colors focus:border-cyan-500/50 focus:bg-white/[0.06]',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-mist-100 placeholder:text-mist-500 transition-colors focus:border-cyan-500/50 focus:bg-white/[0.06]',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-mist-100 transition-colors focus:border-cyan-500/50 [&>option]:bg-ink-850',
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'

/* ------------------------------------------------------------------- Field */

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-mist-300">
        {label}
        {required && <span className="text-cyan-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-mist-500">{hint}</span>}
    </label>
  )
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />
}

/** Placeholder matching the destination card, so loading does not jump. */
export function CardSkeleton() {
  return (
    <div className="surface overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-white/[0.05] text-mist-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-mist-100">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-mist-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ Rating */

export function Rating({
  value,
  count,
  className,
}: {
  value: number
  count?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            viewBox="0 0 20 20"
            className={cn(
              'h-3.5 w-3.5',
              star <= Math.round(value) ? 'fill-amber-400' : 'fill-white/15',
            )}
          >
            <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z" />
          </svg>
        ))}
      </span>
      <span className="font-medium tabular-nums text-mist-100">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-mist-500">({count})</span>}
      <span className="sr-only">{`${value.toFixed(1)} out of 5`}</span>
    </span>
  )
}

/* ------------------------------------------------------------------- Image */

/**
 * Image with a graceful failure.
 *
 * Several catalogue entries have no photograph of their own yet, and a broken
 * image icon looks worse than an honest placeholder.
 */
export function SafeImage({
  src,
  alt,
  className,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false)

  if (failed || !src) {
    return (
      <div
        className={cn(
          'grid place-items-center bg-gradient-to-br from-ink-800 to-ink-700',
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8 stroke-mist-700" fill="none" strokeWidth="1.5">
          <path d="M3 16l5-5 4 4 3-3 6 6M3 5h18v14H3z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 0.8, 0.3, 1] }}
        className="glass-raised relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ink-900/95 p-6 sm:rounded-3xl"
      >
        {children}
      </motion.div>
    </div>
  )
}

/* -------------------------------------------------------------- Section */

export function SectionHeading({
  label,
  title,
  body,
  className,
}: {
  label?: string
  title: string
  body?: string
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      {label && <p className="label-eyebrow mb-3">{label}</p>}
      <h2 className="text-3xl font-bold leading-[1.1] sm:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-mist-300">{body}</p>}
    </div>
  )
}
