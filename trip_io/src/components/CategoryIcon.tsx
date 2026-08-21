import {
  Baby,
  Beer,
  Building2,
  CalendarDays,
  Clapperboard,
  Coffee,
  Compass,
  Drama,
  Dumbbell,
  Landmark,
  Moon,
  Palette,
  ScrollText,
  ShoppingBag,
  Trees,
  Trophy,
  UtensilsCrossed,
  BedDouble,
  Circle,
} from 'lucide-react'

/**
 * Category icons, imported explicitly.
 *
 * A namespace import of lucide-react pulls every icon into the bundle -- it
 * added roughly 400 kB to the destinations chunk before this map replaced it.
 */
const ICONS = {
  Compass,
  Drama,
  Landmark,
  ScrollText,
  Building2,
  Trees,
  UtensilsCrossed,
  Coffee,
  Beer,
  Moon,
  ShoppingBag,
  BedDouble,
  Palette,
  Baby,
  Clapperboard,
  CalendarDays,
  Trophy,
  Dumbbell,
} as const

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? Circle
  return <Icon className={className} />
}
