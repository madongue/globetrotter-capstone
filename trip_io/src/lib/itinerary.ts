import { DESTINATIONS } from '@/data/destinations'
import { distanceKm } from '@/lib/utils'
import type { CategoryId, Itinerary, ItineraryItem } from '@/types'

/** Minutes from midnight. Days start at 09:00 and lunch is held at 13:00. */
const DAY_START = 9 * 60
const LUNCH_AT = 13 * 60
const LUNCH_MINUTES = 75
const TRAVEL_MINUTES = 30

const DURATION_MINUTES: Record<string, number> = {
  half: 4 * 60,
  full: 8 * 60,
  two: 16 * 60,
}

/**
 * Draft a day in Yaoundé from a duration and a set of interests.
 *
 * The route is greedy-nearest rather than optimal: start from the strongest
 * match, then repeatedly take the best-rated candidate that is closest to
 * where you already are. Yaoundé's traffic makes crossing the city expensive,
 * so keeping consecutive stops near each other matters more than squeezing in
 * one extra place.
 */
export function generateItinerary(
  duration: 'half' | 'full' | 'two',
  interests: CategoryId[],
  title: string,
): Itinerary {
  const budget = DURATION_MINUTES[duration]

  // Hotels are places to sleep, not stops on a day plan.
  const pool = DESTINATIONS.filter(
    (destination) =>
      destination.visitMinutes > 0 && !destination.categories.includes('hotel'),
  )

  const matches = (id: string) => {
    const destination = pool.find((d) => d.id === id)!
    if (interests.length === 0) return 1
    return destination.categories.filter((category) => interests.includes(category)).length
  }

  const candidates = pool
    .filter((destination) => interests.length === 0 || matches(destination.id) > 0)
    .sort((a, b) => matches(b.id) - matches(a.id) || b.rating - a.rating)

  const chosen: typeof candidates = []
  let spent = 0
  let cursor = candidates[0]

  while (cursor && spent + cursor.visitMinutes <= budget) {
    chosen.push(cursor)
    spent += cursor.visitMinutes + TRAVEL_MINUTES

    const remaining = candidates.filter((c) => !chosen.includes(c))
    if (remaining.length === 0) break

    // Nearest next stop, nudged by rating so a good place slightly further
    // away can still win over a mediocre one next door.
    cursor = remaining.sort((a, b) => {
      const da = distanceKm(chosen[chosen.length - 1], a) - a.rating * 0.35
      const db = distanceKm(chosen[chosen.length - 1], b) - b.rating * 0.35
      return da - db
    })[0]
  }

  const items: ItineraryItem[] = []
  let clock = DAY_START
  let lunchPlaced = false

  for (const destination of chosen) {
    if (!lunchPlaced && clock >= LUNCH_AT) {
      items.push({
        id: `lunch-${Date.now()}`,
        destinationId: 'lunch',
        startMinutes: clock,
        durationMinutes: LUNCH_MINUTES,
      })
      clock += LUNCH_MINUTES
      lunchPlaced = true
    }

    items.push({
      id: `item-${destination.id}-${clock}`,
      destinationId: destination.id,
      startMinutes: clock,
      durationMinutes: destination.visitMinutes,
    })
    clock += destination.visitMinutes + TRAVEL_MINUTES
  }

  return {
    id: `it-${Date.now()}`,
    title,
    date: new Date().toISOString().slice(0, 10),
    durationHours: budget / 60,
    interests,
    items,
    createdAt: new Date().toISOString(),
  }
}

/** Recompute start times after a reorder, keeping travel gaps intact. */
export function resequence(items: ItineraryItem[]): ItineraryItem[] {
  let clock = DAY_START
  return items.map((item) => {
    const next = { ...item, startMinutes: clock }
    clock += item.durationMinutes + TRAVEL_MINUTES
    return next
  })
}
