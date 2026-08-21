import type { ReactNode } from 'react'

/** Consistent top-of-page block for every dashboard view. */
export function PageHeader({
  eyebrow,
  title,
  body,
  actions,
}: {
  eyebrow?: string
  title: string
  body?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="label-eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
        {body && <p className="mt-2 max-w-xl text-sm text-mist-500">{body}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
