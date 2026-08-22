import { useEffect, useState } from 'react'

/**
 * Footage for a destination, loaded from a manifest at runtime.
 *
 * Same approach as the gallery: adding a clip means dropping the file and
 * updating one JSON file, with no rebuild. Fetched once and shared.
 */
export interface VideoEntry {
  url: string
  sourceUrl: string
  license: string
  author: string
  caption?: { en: string; fr: string }
}

type Manifest = Record<
  string,
  { url: string; source_url: string; license: string; author: string; title?: string }
>

let cache: Manifest | null = null
let inflight: Promise<Manifest> | null = null

function load(): Promise<Manifest> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight

  inflight = fetch('/videos/_videos.json')
    .then((response) => (response.ok ? response.json() : {}))
    .then((data: Manifest) => {
      cache = data
      return data
    })
    .catch(() => {
      // Optional: a destination simply shows no Watch section.
      cache = {}
      return cache
    })

  return inflight
}

/** Footage for a destination, keyed by the stem of its primary image. */
export function useVideos(primaryImage: string, imageIsContextual = false): VideoEntry[] {
  const [videos, setVideos] = useState<VideoEntry[]>([])

  useEffect(() => {
    let cancelled = false
    load().then((manifest) => {
      if (cancelled) return
      // Same rule as the gallery: footage belongs to the place in the
      // photograph, not to whoever borrowed it.
      if (imageIsContextual) return
      const key = primaryImage.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
      const entry = manifest[key]
      setVideos(
        entry
          ? [
              {
                url: entry.url,
                sourceUrl: entry.source_url,
                license: entry.license,
                author: entry.author,
              },
            ]
          : [],
      )
    })
    return () => {
      cancelled = true
    }
  }, [primaryImage])

  return videos
}
