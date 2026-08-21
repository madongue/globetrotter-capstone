/**
 * Domain types for trip_io.
 *
 * These mirror the Supabase schema in `src/lib/schema.sql`, so the local data
 * layer can be swapped for live queries without the UI changing shape.
 */

export type CategoryId =
  | 'architecture'
  | 'art'
  | 'bar'
  | 'cafe'
  | 'culture'
  | 'entertainment'
  | 'events'
  | 'family'
  | 'fitness'
  | 'food'
  | 'history'
  | 'hotel'
  | 'museum'
  | 'nature'
  | 'nightlife'
  | 'shopping'
  | 'sports'
  | 'tourism'

export interface Category {
  id: CategoryId
  /** Lucide icon name, resolved at render time. */
  icon: string
  en: string
  fr: string
}

export interface OpeningHours {
  /** 0 = Sunday, matching Date.getDay(). */
  day: number
  /** 24h "HH:MM", or null when closed that day. */
  opens: string | null
  closes: string | null
}

export interface Destination {
  id: string
  slug: string
  name: string
  /** Real Yaounde quarter, e.g. "Bastos", "Mvolye", "Biyem-Assi". */
  quarter: string
  city: 'Yaoundé'
  categories: CategoryId[]
  tags: string[]
  summary: { en: string; fr: string }
  description: { en: string; fr: string }
  image: string
  /**
   * True when `image` shows the city rather than this exact place. Commons has
   * no photograph of most hotels and cafés here, and letting a stand-in pass
   * as the real thing is worse than admitting it, so the UI labels these.
   */
  imageIsContextual?: boolean
  gallery?: string[]
  lat: number
  lng: number
  rating: number
  reviewCount: number
  /** In FCFA. 0 means free entry. null means it varies or is unpublished. */
  priceFrom: number | null
  priceNote?: { en: string; fr: string }
  hours?: OpeningHours[]
  website?: string
  phone?: string
  /** Roughly how long a visit takes, in minutes. Drives itinerary building. */
  visitMinutes: number
  featured?: boolean
  hiddenGem?: boolean
}

export interface Review {
  id: string
  destinationId: string
  author: string
  avatarColor: string
  rating: number
  body: string
  createdAt: string
}

export interface ItineraryItem {
  id: string
  destinationId: string
  /** Minutes from midnight, so ordering and rendering share one unit. */
  startMinutes: number
  durationMinutes: number
  note?: string
}

export interface Itinerary {
  id: string
  title: string
  date: string
  durationHours: number
  interests: CategoryId[]
  items: ItineraryItem[]
  createdAt: string
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface Submission {
  id: string
  name: string
  category: CategoryId | ''
  description: string
  address: string
  website?: string
  hours?: string
  price?: string
  contact?: string
  photos: string[]
  status: SubmissionStatus
  submittedAt: string
  /** Set by a moderator when a submission is rejected. */
  reviewNote?: string
}

export interface CommunityPost {
  id: string
  author: string
  avatarColor: string
  destinationId?: string
  body: string
  images: string[]
  likes: number
  comments: CommunityComment[]
  createdAt: string
  liked?: boolean
}

export interface CommunityComment {
  id: string
  author: string
  avatarColor: string
  body: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  avatarColor: string
  joinedAt: string
}

export type Language = 'en' | 'fr'

/** A string that exists in both site languages. */
export type Localised = { en: string; fr: string }
