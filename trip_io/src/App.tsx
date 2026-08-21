import { Suspense, lazy, useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { Link } from 'react-router-dom'
import { AppProvider, useApp } from '@/store/AppContext'
import { AppShell } from '@/components/layout/AppShell'
import { Button, Modal, Skeleton } from '@/components/ui'
import { Landing } from '@/pages/Landing'

// The dashboard is a separate concern from the marketing page, so it is split
// out of the initial bundle: a first-time visitor should not download the
// itinerary builder before they have decided to sign up.
const Destinations = lazy(() =>
  import('@/pages/Destinations').then((m) => ({ default: m.Destinations })),
)
const DestinationDetail = lazy(() =>
  import('@/pages/DestinationDetail').then((m) => ({ default: m.DestinationDetail })),
)
const ForYou = lazy(() => import('@/pages/ForYou').then((m) => ({ default: m.ForYou })))
const Favorites = lazy(() => import('@/pages/Favorites').then((m) => ({ default: m.Favorites })))
const MapPage = lazy(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })))
const Itineraries = lazy(() =>
  import('@/pages/Itineraries').then((m) => ({ default: m.Itineraries })),
)
const Profile = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.Profile })))
const Submit = lazy(() => import('@/pages/Submit').then((m) => ({ default: m.Submit })))
const Submissions = lazy(() => import('@/pages/Submit').then((m) => ({ default: m.Submissions })))
const Community = lazy(() => import('@/pages/Community').then((m) => ({ default: m.Community })))
const ApiPage = lazy(() => import('@/pages/ApiPage').then((m) => ({ default: m.ApiPage })))
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const Auth = lazy(() => import('@/pages/Auth').then((m) => ({ default: m.Auth })))

function RouteFallback() {
  return (
    <div className="space-y-4 px-5 py-8 lg:px-10">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-64 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

/** Browsers restore scroll on navigation; for an SPA that lands you mid-page. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Shown when a guest tries to save something that needs an account. */
function AuthPrompt() {
  const { authPrompt, closeAuthPrompt, t } = useApp()
  return (
    <Modal open={authPrompt} onClose={closeAuthPrompt} labelledBy="auth-prompt-title">
      <h2 id="auth-prompt-title" className="text-lg font-semibold">
        {t('authSignIn')}
      </h2>
      <p className="mt-2 text-sm text-mist-300">{t('authGuestNote')}</p>
      <div className="mt-6 flex gap-2">
        <Link to="/signin" onClick={closeAuthPrompt} className="flex-1">
          <Button className="w-full">{t('authSignIn')}</Button>
        </Link>
        <Link to="/signup" onClick={closeAuthPrompt} className="flex-1">
          <Button variant="secondary" className="w-full">
            {t('authSignUp')}
          </Button>
        </Link>
      </div>
    </Modal>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AuthPrompt />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/api" element={<ApiPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/signin" element={<Auth mode="signin" />} />
            <Route path="/signup" element={<Auth mode="signup" />} />
            <Route path="/forgot" element={<Auth mode="forgot" />} />

            <Route path="/app" element={<AppShell />}>
              <Route index element={<Navigate to="/app/destinations" replace />} />
              <Route path="destinations" element={<Destinations />} />
              <Route path="destinations/:slug" element={<DestinationDetail />} />
              <Route path="for-you" element={<ForYou />} />
              <Route path="favorites" element={<Favorites />} />
              <Route path="map" element={<MapPage />} />
              <Route path="itineraries" element={<Itineraries />} />
              <Route path="profile" element={<Profile />} />
              <Route path="submit" element={<Submit />} />
              <Route path="submissions" element={<Submissions />} />
              <Route path="community" element={<Community />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  )
}
