import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  CommunityPost,
  Itinerary,
  Language,
  Submission,
  User,
} from '@/types'
import { STRINGS, type StringKey } from '@/lib/i18n'
import { avatarColor, readStored, writeStored } from '@/lib/utils'
import { SEED_POSTS, SEED_SUBMISSIONS } from '@/data/community'

/**
 * Application state.
 *
 * Everything persists to localStorage so a reload does not wipe the user's
 * favourites or itineraries. The shape mirrors the Supabase tables in
 * `src/lib/schema.sql`, so swapping this for real queries is a change of
 * implementation rather than of interface.
 */

const KEYS = {
  language: 'mgtrip.language',
  favorites: 'mgtrip.favorites',
  itineraries: 'mgtrip.itineraries',
  submissions: 'mgtrip.submissions',
  posts: 'mgtrip.posts',
  user: 'mgtrip.user',
} as const

interface AppState {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: StringKey) => string

  user: User | null
  signIn: (email: string, name?: string) => void
  signOut: () => void

  favorites: string[]
  isFavorite: (destinationId: string) => boolean
  toggleFavorite: (destinationId: string) => void

  itineraries: Itinerary[]
  saveItinerary: (itinerary: Itinerary) => void
  deleteItinerary: (id: string) => void

  submissions: Submission[]
  addSubmission: (submission: Submission) => void

  posts: CommunityPost[]
  addPost: (post: CommunityPost) => void
  toggleLike: (postId: string) => void
  addComment: (postId: string, body: string) => void

  /** Set when a guest tries to use a feature that needs an account. */
  authPrompt: boolean
  requireAuth: () => boolean
  closeAuthPrompt: () => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() =>
    readStored<Language>(KEYS.language, 'en'),
  )
  const [user, setUser] = useState<User | null>(() => readStored<User | null>(KEYS.user, null))
  const [favorites, setFavorites] = useState<string[]>(() => readStored<string[]>(KEYS.favorites, []))
  const [itineraries, setItineraries] = useState<Itinerary[]>(() =>
    readStored<Itinerary[]>(KEYS.itineraries, []),
  )
  const [submissions, setSubmissions] = useState<Submission[]>(() =>
    readStored<Submission[]>(KEYS.submissions, SEED_SUBMISSIONS),
  )
  const [posts, setPosts] = useState<CommunityPost[]>(() =>
    readStored<CommunityPost[]>(KEYS.posts, SEED_POSTS),
  )
  const [authPrompt, setAuthPrompt] = useState(false)

  useEffect(() => writeStored(KEYS.language, language), [language])
  useEffect(() => writeStored(KEYS.favorites, favorites), [favorites])
  useEffect(() => writeStored(KEYS.itineraries, itineraries), [itineraries])
  useEffect(() => writeStored(KEYS.submissions, submissions), [submissions])
  useEffect(() => writeStored(KEYS.posts, posts), [posts])
  useEffect(() => writeStored(KEYS.user, user), [user])

  // Keep the document language in step, so screen readers announce correctly.
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((next: Language) => setLanguageState(next), [])

  const t = useCallback((key: StringKey) => STRINGS[key][language], [language])

  const signIn = useCallback((email: string, name?: string) => {
    const display = name?.trim() || email.split('@')[0].replace(/[._-]/g, ' ')
    setUser({
      id: `u-${Date.now()}`,
      name: display.replace(/\b\w/g, (c) => c.toUpperCase()),
      email,
      avatarColor: avatarColor(email),
      joinedAt: new Date().toISOString(),
    })
    setAuthPrompt(false)
  }, [])

  const signOut = useCallback(() => setUser(null), [])

  /** Returns true when the caller may proceed; opens the prompt when not. */
  const requireAuth = useCallback(() => {
    if (user) return true
    setAuthPrompt(true)
    return false
  }, [user])

  const toggleFavorite = useCallback(
    (destinationId: string) => {
      if (!user) {
        setAuthPrompt(true)
        return
      }
      setFavorites((current) =>
        current.includes(destinationId)
          ? current.filter((id) => id !== destinationId)
          : [destinationId, ...current],
      )
    },
    [user],
  )

  const isFavorite = useCallback(
    (destinationId: string) => favorites.includes(destinationId),
    [favorites],
  )

  const saveItinerary = useCallback((itinerary: Itinerary) => {
    setItineraries((current) => {
      const index = current.findIndex((item) => item.id === itinerary.id)
      if (index === -1) return [itinerary, ...current]
      const next = [...current]
      next[index] = itinerary
      return next
    })
  }, [])

  const deleteItinerary = useCallback((id: string) => {
    setItineraries((current) => current.filter((item) => item.id !== id))
  }, [])

  const addSubmission = useCallback((submission: Submission) => {
    setSubmissions((current) => [submission, ...current])
  }, [])

  const addPost = useCallback((post: CommunityPost) => {
    setPosts((current) => [post, ...current])
  }, [])

  const toggleLike = useCallback((postId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) }
          : post,
      ),
    )
  }, [])

  const addComment = useCallback(
    (postId: string, body: string) => {
      if (!user) return
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [
                  ...post.comments,
                  {
                    id: `c-${Date.now()}`,
                    author: user.name,
                    avatarColor: user.avatarColor,
                    body,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : post,
        ),
      )
    },
    [user],
  )

  const value = useMemo<AppState>(
    () => ({
      language,
      setLanguage,
      t,
      user,
      signIn,
      signOut,
      favorites,
      isFavorite,
      toggleFavorite,
      itineraries,
      saveItinerary,
      deleteItinerary,
      submissions,
      addSubmission,
      posts,
      addPost,
      toggleLike,
      addComment,
      authPrompt,
      requireAuth,
      closeAuthPrompt: () => setAuthPrompt(false),
    }),
    [
      language,
      setLanguage,
      t,
      user,
      signIn,
      signOut,
      favorites,
      isFavorite,
      toggleFavorite,
      itineraries,
      saveItinerary,
      deleteItinerary,
      submissions,
      addSubmission,
      posts,
      addPost,
      toggleLike,
      addComment,
      authPrompt,
      requireAuth,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
