import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import DesignSystem from './pages/DesignSystem';
import Home from './pages/Home';
import Explore from './pages/Explore';
import PlaceDetails from './pages/PlaceDetails';
import Trips from './pages/Trips';
import Itinerary from './pages/Itinerary';
import Community from './pages/Community';
import GroupDetail from './pages/GroupDetail';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import MapPage from './pages/MapPage';
import AssistantDock from './components/AssistantDock';
import Media from './pages/Media';
import Saved from './pages/Saved';
import Suggest from './pages/Suggest';
import Settings from './pages/Settings';
import 'leaflet/dist/leaflet.css';
import './styles.css';
// Loaded after styles.css so its overrides win. Removing this line returns the
// app to its original light appearance without touching anything else.
import './theme-dark.css';
// Loaded last: narrow-width corrections to the original App shell. Removing
// this line restores the previous mobile behaviour exactly.
import './app-mobile.css';
// The redesign's vocabulary. Additive: it declares --gt-* custom properties and
// .gt-* classes that the stylesheets above never use, so screens can migrate to
// it one at a time without disturbing the ones that have not.
import './design/tokens.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Gives every screen a URL. App's own navigation state is unchanged —
        useRouteSync mirrors the two together.

        /design is the style guide: a standalone page component mounted by the
        router, deliberately outside App so that the first page built the new
        way proves the structure without touching the old one. Phase B adds
        Home, Explore and Place Details beside it. */}
    <BrowserRouter>
      <AssistantDock />
      <Routes>
        {/* Phase B: the discovery experience, rebuilt as real pages.
            Everything else still renders App, whose own navigation state is
            mirrored into the URL by useRouteSync. */}
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        {/* The whole catalogue, your trips, your progress and your position
            on one map. */}
        <Route path="/map" element={<MapPage />} />
        <Route path="/places/:id" element={<PlaceDetails />} />

        {/* Phase C: planning. /trips/:id/manage is deliberately left to App,
            which still carries payments, reservations, packing, documents,
            sharing, progress and the audit log. */}
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/:id" element={<Itinerary />} />

        {/* Phase D: the community. A group and its threads share one screen,
            with the open thread carried as ?d=<id>. */}
        <Route path="/community" element={<Community />} />
        <Route path="/community/:id" element={<GroupDetail />} />

        {/* The profile, rebuilt. /settings still opens the original screen,
            which carries notifications, currency and the rest. */}
        <Route path="/profile" element={<Profile />} />

        {/* The account and administration screens. Until these existed, every
            one of these paths fell through to App, so moving between the home
            page and the dashboard crossed between two different designs. */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/media" element={<Media />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/suggest" element={<Suggest />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="/design" element={<DesignSystem />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app should remain fully usable if the browser blocks service workers.
    });
  });
}
