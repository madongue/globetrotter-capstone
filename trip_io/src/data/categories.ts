import type { Category } from '@/types'

/**
 * The filter vocabulary. Order is the order they appear in the chip rail, and
 * it is deliberate rather than alphabetical: the categories a first-time
 * visitor to Yaoundé reaches for come first.
 */
export const CATEGORIES: Category[] = [
  { id: 'tourism', icon: 'Compass', en: 'Tourism', fr: 'Tourisme' },
  { id: 'culture', icon: 'Drama', en: 'Culture', fr: 'Culture' },
  { id: 'museum', icon: 'Landmark', en: 'Museum', fr: 'Musée' },
  { id: 'history', icon: 'ScrollText', en: 'History', fr: 'Histoire' },
  { id: 'architecture', icon: 'Building2', en: 'Architecture', fr: 'Architecture' },
  { id: 'nature', icon: 'Trees', en: 'Nature', fr: 'Nature' },
  { id: 'food', icon: 'UtensilsCrossed', en: 'Food', fr: 'Restauration' },
  { id: 'cafe', icon: 'Coffee', en: 'Cafe', fr: 'Café' },
  { id: 'bar', icon: 'Beer', en: 'Bar', fr: 'Bar' },
  { id: 'nightlife', icon: 'Moon', en: 'Nightlife', fr: 'Vie nocturne' },
  { id: 'shopping', icon: 'ShoppingBag', en: 'Shopping', fr: 'Shopping' },
  { id: 'hotel', icon: 'BedDouble', en: 'Hotel', fr: 'Hôtel' },
  { id: 'art', icon: 'Palette', en: 'Art', fr: 'Art' },
  { id: 'family', icon: 'Baby', en: 'Family', fr: 'Famille' },
  { id: 'entertainment', icon: 'Clapperboard', en: 'Entertainment', fr: 'Loisirs' },
  { id: 'events', icon: 'CalendarDays', en: 'Events', fr: 'Événements' },
  { id: 'sports', icon: 'Trophy', en: 'Sports', fr: 'Sport' },
  { id: 'fitness', icon: 'Dumbbell', en: 'Fitness', fr: 'Fitness' },
]

export const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<Category['id'], Category>
