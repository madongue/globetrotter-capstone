import { useEffect, useState } from 'react'
import type { GalleryImage } from '@/components/Gallery'

/**
 * Extra photographs for a destination.
 *
 * The manifest is written by tools/fetch, not by hand, and is loaded at runtime
 * rather than imported so that adding photographs is a matter of dropping files
 * and updating one JSON file -- no rebuild of the bundle required.
 *
 * Fetched once and shared: every destination page would otherwise request the
 * same file again.
 */
type Manifest = Record<string, GalleryImage[]>

let cache: Manifest | null = null
let inflight: Promise<Manifest> | null = null

function load(): Promise<Manifest> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight

  inflight = fetch('/images/destinations/_galleries.json')
    .then((response) => (response.ok ? response.json() : {}))
    .then((data: Manifest) => {
      cache = data
      return data
    })
    .catch(() => {
      // The manifest is optional; a destination simply shows its primary image.
      cache = {}
      return cache
    })

  return inflight
}

/** Returns the gallery for a slug, primary image first. */
export function useGallery(
  slug: string,
  primaryImage: string,
  imageIsContextual = false,
): GalleryImage[] {
  const [extra, setExtra] = useState<GalleryImage[]>([])

  useEffect(() => {
    let cancelled = false
    load().then((manifest) => {
      if (cancelled) return
      // A borrowed city photograph does not bring its subject's gallery
      // with it; that would show one place under another's name.
      if (imageIsContextual) return
      // Keys are image slugs, which are the filename stem of the primary
      // image rather than the destination slug.
      const key = primaryImage.split('/').pop()?.replace(/\.[^.]+$/, '') ?? slug
      const entries = manifest[key] ?? manifest[slug] ?? []
      // Defensive: the tool that writes this manifest shares a download helper
      // with another app, which returns an /images/places/ path. A stale entry
      // would otherwise render as a black tile.
      setExtra(
        entries.map((entry) => ({
          ...entry,
          url: entry.url.replace('/images/places/', '/images/destinations/'),
        })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [slug, primaryImage])

  return [{ url: primaryImage }, ...extra]
}
