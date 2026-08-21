import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes, letting later classes win conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format an FCFA amount the way prices are written in Cameroon. */
export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`
}

/** Minutes from midnight to a 24h clock label. */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function formatDuration(minutes: number, language: 'en' | 'fr'): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const unit = language === 'fr' ? 'h' : 'h'
  return rest ? `${hours}${unit}${String(rest).padStart(2, '0')}` : `${hours}${unit}`
}

/**
 * Great-circle distance in kilometres.
 *
 * Used for "near you" ordering and the nearby list. Yaoundé is small enough
 * that a flat approximation would do, but this costs nothing and is correct.
 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Strip accents so "Mvolyé" matches a search for "mvolye". */
export function normalise(value: string): string {
  return value
    .normalize('NFD')
    // Escaped rather than literal combining marks, which are invisible in
    // source and easily mangled by an editor or a copy-paste.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** A stable colour per name, for avatar initials. */
export function avatarColor(seed: string): string {
  const palette = ['#22D3EE', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981']
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Relative time, in whichever language is active. */
export function timeAgo(iso: string, language: 'en' | 'fr'): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const table: [number, string, string][] = [
    [60, 'just now', 'à l’instant'],
    [3600, 'm ago', ' min'],
    [86400, 'h ago', ' h'],
    [604800, 'd ago', ' j'],
  ]
  if (seconds < 60) return language === 'fr' ? table[0][2] : table[0][1]
  if (seconds < 3600)
    return language === 'fr'
      ? `il y a ${Math.floor(seconds / 60)} min`
      : `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400)
    return language === 'fr'
      ? `il y a ${Math.floor(seconds / 3600)} h`
      : `${Math.floor(seconds / 3600)}h ago`
  return language === 'fr'
    ? `il y a ${Math.floor(seconds / 86400)} j`
    : `${Math.floor(seconds / 86400)}d ago`
}

/** Read from localStorage without throwing in private-mode browsers. */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or blocked; losing a preference is not worth a crash.
  }
}
