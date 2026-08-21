import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Map as MapIcon,
  Compass,
  Users,
  Images,
  Building2,
  ShieldCheck,
  Lightbulb,
  Settings,
  Bookmark,
  ClipboardCheck,
} from 'lucide-react';
import TravelMap from './TravelMap';
import { CAMEROON_CENTER, getItemCoordinates } from './mapCoordinates';

const API_BASE = '/api';
const DEFAULT_CURRENCY = 'XAF';
const OPENSTREETMAP_CAMEROON_URL = 'https://www.openstreetmap.org/search?query=Cameroon';
const CURRENCY_OPTIONS = [
  { code: 'XAF', label: 'FCFA', rateFromXaf: 1, fractionDigits: 0 },
  { code: 'EUR', label: 'EUR', rateFromXaf: 1 / 655.957, fractionDigits: 2 },
  { code: 'USD', label: 'USD', rateFromXaf: 1 / 600, fractionDigits: 2 },
  { code: 'GBP', label: 'GBP', rateFromXaf: 1 / 760, fractionDigits: 2 },
  { code: 'NGN', label: 'NGN', rateFromXaf: 2.45, fractionDigits: 2 },
];
const DEFAULT_LANGUAGE = 'en';
const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Francais' },
];
const PREDEFINED_INTERESTS = [
  'beach',
  'nature',
  'waterfall',
  'mountain',
  'hiking',
  'wildlife',
  'national parks',
  'culture',
  'history',
  'museum',
  'monuments',
  'chiefdoms',
  'food',
  'markets',
  'nightlife',
  'business',
  'family',
  'photography',
];

const GOOGLE_IDENTITY_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
let googleIdentityLoadPromise;

function getGoogleIdentityClientId(runtimeClientId = '') {
  return GOOGLE_IDENTITY_CLIENT_ID || runtimeClientId || '';
}

function loadGoogleIdentity(clientId) {
  if (!clientId) {
    return Promise.reject(new Error('Google Identity client id is missing.'));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (!googleIdentityLoadPromise) {
    googleIdentityLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-globetrotter-google-identity]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google.accounts.id));
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.globetrotterGoogleIdentity = 'true';
      script.onload = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google.accounts.id);
        } else {
          reject(new Error('Google Identity script loaded without accounts.id.'));
        }
      };
      script.onerror = () => reject(new Error('Unable to load Google Identity Services.'));
      document.head.appendChild(script);
    });
  }
  return googleIdentityLoadPromise;
}

function GoogleSignInButton({ clientId, onSuccess, onError }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!clientId || !buttonRef.current) {
      return undefined;
    }
    let cancelled = false;
    loadGoogleIdentity(clientId)
      .then((accounts) => {
        if (cancelled || !buttonRef.current) {
          return;
        }
        accounts.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response?.credential) {
              onError?.('Google authentication failed.');
              return;
            }
            onSuccess(response.credential);
          },
          ux_mode: 'popup',
        });
        accounts.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
        });
      })
      .catch((error) => {
        onError?.(error.message || 'Unable to load Google sign-in.');
      });
    return () => {
      cancelled = true;
    };
  }, [onSuccess, onError]);

  return <div ref={buttonRef} className="google-signin-button" />;
}

function AdminLeafletMapPicker({ place, onChange }) {
  const [searchText, setSearchText] = useState(place.mapQuery || place.location || 'Cameroon');
  const selectedPosition = getItemCoordinates({
    ...place,
    latitude: place.latitude,
    longitude: place.longitude,
    map_query: place.mapQuery,
  });

  useEffect(() => {
    setSearchText(place.mapQuery || place.location || 'Cameroon');
  }, [place.mapQuery, place.location]);

  const handleSearch = () => {
    const query = searchText.trim() || place.mapQuery || place.location || 'Cameroon';
    onChange({ mapQuery: query, location: query });
  };

  return (
    <div className="map-info map-panel">
      <strong>{place.mapQuery || place.location || 'Cameroon'}</strong>
      <div className="map-search-row">
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search or name a Cameroon place"
        />
        <button type="button" className="button button-secondary" onClick={handleSearch}>Search map</button>
      </div>
      <p className="small-text">Click the OpenStreetMap map to set exact coordinates for this place.</p>
      <TravelMap
        selectedPosition={selectedPosition}
        center={selectedPosition || CAMEROON_CENTER}
        zoom={selectedPosition ? 12 : 6}
        className="map-embed-large"
        ariaLabel="Interactive OpenStreetMap place picker"
        onMapClick={({ latitude, longitude }) => onChange({
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
        })}
      />
      <div className="map-links">
        <a href={OPENSTREETMAP_CAMEROON_URL} target="_blank" rel="noreferrer">Open Cameroon in OpenStreetMap</a>
        {place.latitude && place.longitude && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(place.latitude)}&mlon=${encodeURIComponent(place.longitude)}#map=14/${encodeURIComponent(place.latitude)}/${encodeURIComponent(place.longitude)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open coordinates
          </a>
        )}
      </div>
    </div>
  );
}

function LiveLocationMap({ apiKey, position, status, error }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapStatus, setMapStatus] = useState(apiKey ? 'loading' : 'fallback');

  useEffect(() => {
    if (!apiKey) {
      setMapStatus('fallback');
      return undefined;
    }

    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !mapElementRef.current) {
          return;
        }
        const initialPosition = position
          ? { lat: Number(position.latitude), lng: Number(position.longitude) }
          : { lat: 5.9631, lng: 12.5029 };
        mapRef.current = new google.maps.Map(mapElementRef.current, {
          center: initialPosition,
          zoom: position ? 12 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        markerRef.current = new google.maps.Marker({
          position: initialPosition,
          map: mapRef.current,
          title: 'Your live location',
        });
        setMapStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setMapStatus('fallback');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, position?.latitude, position?.longitude]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !position) {
      return;
    }
    const nextPosition = {
      lat: Number(position.latitude),
      lng: Number(position.longitude),
    };
    markerRef.current.setPosition(nextPosition);
    mapRef.current.panTo(nextPosition);
  }, [position]);

  return (
    <div className="map-info map-panel">
      {mapStatus === 'fallback' ? (
        <p className="small-text">Add a Google Maps API key to render the live tracker.</p>
      ) : (
        <div ref={mapElementRef} className="google-map-canvas" aria-label="Live Google map tracker" />
      )}
      {status === 'requesting' && <p className="small-text">Requesting your location...</p>}
      {error && <p className="small-text alert-text">{error}</p>}
    </div>
  );
}

const FR_TEXT = {
  Home: 'Accueil',
  Login: 'Connexion',
  Register: 'Inscription',
  Dashboard: 'Tableau de bord',
  Logout: 'Deconnexion',
  Currency: 'Devise',
  Language: 'Langue',
  English: 'Anglais',
  Francais: 'Francais',
  'Travel meets community': 'Le voyage rencontre la communaute',
  'Plan trips, sell event tickets, and connect with travelers.': 'Planifiez des voyages, vendez des billets et connectez-vous avec des voyageurs.',
  'GlobeTrotter brings itineraries, payments, groups, and media sharing into one polished React experience.': 'GlobeTrotter reunit itineraires, paiements, groupes et partage de medias dans une experience React soignee.',
  'Get Started': 'Commencer',
  'Sign In': 'Se connecter',
  'Shared travel plans': 'Plans de voyage partages',
  'Build itineraries together, invite friends, and track every booking.': 'Creez des itineraires ensemble, invitez des amis et suivez chaque reservation.',
  'Ticket monetization': 'Monetisation des billets',
  'Sell event tickets with receipts, commission tracking, and secure payment records.': 'Vendez des billets avec recus, suivi des commissions et paiements securises.',
  'Community feed': 'Fil communautaire',
  'Post photos, comment, like, and reach travel groups with media sharing.': 'Publiez des photos, commentez, aimez et rejoignez des groupes de voyage.',
  'Sign in': 'Connexion',
  'Create account': 'Creer un compte',
  Username: "Nom d'utilisateur",
  Password: 'Mot de passe',
  Interests: 'Centres d interet',
  'Already have an account?': 'Vous avez deja un compte ?',
  'New here?': 'Nouveau ici ?',
  'Create an account': 'Creer un compte',
  'Welcome back': 'Bon retour',
  'Access your itineraries, event receipts, and community groups in one place.': 'Accedez a vos itineraires, recus et groupes communautaires au meme endroit.',
  'Create itinerary': 'Creer un itineraire',
  'Join a group': 'Rejoindre un groupe',
  'Quick links': 'Liens rapides',
  Menu: 'Menu',
  Overview: 'Vue d ensemble',
  Itineraries: 'Itineraires',
  Discovery: 'Decouverte',
  Community: 'Communaute',
  Media: 'Medias',
  Resources: 'Ressources',
  Settings: 'Parametres',
  'My itineraries': 'Mes itineraires',
  'Destination recommendations': 'Recommandations de destinations',
  'Profile preferences': 'Preferences du profil',
  Notifications: 'Notifications',
  'No notifications yet.': 'Aucune notification pour le moment.',
  'Place autocomplete': 'Autocompletion de lieux',
  'Search catalogue': 'Rechercher dans le catalogue',
  Suggest: 'Suggerer',
  'Save preferences': 'Enregistrer les preferences',
  'Recent itineraries': 'Itineraires recents',
  'No itineraries found yet.': 'Aucun itineraire trouve.',
  'Recommended destinations': 'Destinations recommandees',
  Budget: 'Budget',
  Location: 'Lieu',
  Filter: 'Filtrer',
  Loading: 'Chargement',
  'Loading...': 'Chargement...',
  'No recommendations available yet.': 'Aucune recommandation disponible.',
  Title: 'Titre',
  'Hotel name': 'Nom de l hotel',
  'Hotel cost': 'Cout de l hotel',
  'Activity name': 'Nom de l activite',
  'Activity cost': 'Cout de l activite',
  'Place to visit': 'Lieu a visiter',
  'Place cost': 'Cout du lieu',
  'Start date': 'Date de debut',
  'End date': 'Date de fin',
  'Generate itinerary draft': 'Generer un brouillon d itineraire',
  Days: 'Jours',
  'Generate draft': 'Generer le brouillon',
  'Save draft': 'Enregistrer le brouillon',
  'Destination search': 'Recherche de destination',
  Search: 'Rechercher',
  Tag: 'Etiquette',
  Region: 'Region',
  Division: 'Departement',
  Subdivision: 'Arrondissement',
  City: 'Ville',
  Quarter: 'Quartier',
  'All regions': 'Toutes les regions',
  'All divisions': 'Tous les departements',
  'All subdivisions': 'Tous les arrondissements',
  'All cities': 'Toutes les villes',
  'All quarters': 'Tous les quartiers',
  'Max daily cost': 'Cout journalier maximal',
  Results: 'Resultats',
  Groups: 'Groupes',
  'Group name': 'Nom du groupe',
  Description: 'Description',
  'Create group': 'Creer un groupe',
  Join: 'Rejoindre',
  View: 'Voir',
  'No groups available yet.': 'Aucun groupe disponible.',
  'Trip suggestions': 'Suggestions de voyage',
  'Find matches': 'Trouver des correspondances',
  hotels: 'hotels',
  activities: 'activites',
  places: 'lieux',
  'No matches yet.': 'Aucune correspondance.',
  'Shared media feed': 'Fil de medias partages',
  'No media posts yet.': 'Aucune publication media.',
  Like: 'Aimer',
  Comment: 'Commenter',
  Share: 'Partager',
  'Resource management': 'Gestion des ressources',
  Type: 'Type',
  Hotel: 'Hotel',
  Activity: 'Activite',
  Place: 'Lieu',
  Name: 'Nom',
  Cost: 'Cout',
  'Add resource': 'Ajouter une ressource',
  'No entries.': 'Aucune entree.',
  Remove: 'Supprimer',
  'Review type': 'Type d avis',
  'Resource ID': 'ID de la ressource',
  Rating: 'Note',
  'Add review': 'Ajouter un avis',
  'Admin users': 'Utilisateurs admin',
  'Please log in to view your dashboard.': 'Veuillez vous connecter pour voir votre tableau de bord.',
  'Back to dashboard': 'Retour au tableau de bord',
  Owner: 'Proprietaire',
  Participants: 'Participants',
  'Shared with': 'Partage avec',
  Nobody: 'Personne',
  'Nobody yet': 'Personne pour le moment',
  'Total budget': 'Budget total',
  Duration: 'Duree',
  Progress: 'Progression',
  'not started': 'non demarre',
  Activities: 'Activites',
  'Places to visit': 'Lieux a visiter',
  'Event tickets': 'Billets evenementiels',
  'Payment receipt': 'Recu de paiement',
  Amount: 'Montant',
  Commission: 'Commission',
  Net: 'Net',
  'No payments recorded yet.': 'Aucun paiement enregistre.',
  'Trip stages': 'Etapes du voyage',
  'No stages calculated yet.': 'Aucune etape calculee.',
  'Open map': 'Ouvrir la carte',
  'Open in Google Maps': 'Ouvrir dans Google Maps',
  Directions: 'Itineraire',
  'Checklist item': 'Element de checklist',
  Add: 'Ajouter',
  'Update progress': 'Mettre a jour la progression',
  Status: 'Statut',
  'Not started': 'Non demarre',
  'In progress': 'En cours',
  Completed: 'Termine',
  Delayed: 'Retarde',
  'Current stage': 'Etape actuelle',
  Auto: 'Auto',
  'Completed stage IDs': 'IDs des etapes terminees',
  'Current location': 'Position actuelle',
  Percent: 'Pourcentage',
  'Share itinerary': 'Partager l itineraire',
  Permission: 'Permission',
  'View only': 'Lecture seule',
  'Can edit': 'Peut modifier',
  'Join itinerary': 'Rejoindre l itineraire',
  'Optional payment': 'Paiement optionnel',
  'Join trip': 'Rejoindre le voyage',
  'Map metadata': 'Donnees cartographiques',
  Provider: 'Fournisseur',
  'Invite link': 'Lien d invitation',
  Uses: 'Utilisations',
  'Create invite': 'Creer une invitation',
  'Budget and exports': 'Budget et exports',
  'Load budget': 'Charger le budget',
  Calendar: 'Calendrier',
  PDF: 'PDF',
  Planned: 'Planifie',
  Paid: 'Paye',
  Remaining: 'Restant',
  'Audit log': 'Journal d audit',
  'Load audit': 'Charger l audit',
  'Make a payment': 'Effectuer un paiement',
  'Payment method': 'Methode de paiement',
  Mobile: 'Mobile',
  Card: 'Carte',
  'Target type': 'Type de cible',
  Total: 'Total',
  'Event ticket': 'Billet evenementiel',
  'Submit payment': 'Soumettre le paiement',
  'Trip feedback': 'Avis sur le voyage',
  Tags: 'Etiquettes',
  'Save feedback': 'Enregistrer l avis',
  Members: 'Membres',
  'Group discussions': 'Discussions du groupe',
  'New topic': 'Nouveau sujet',
  Message: 'Message',
  'Start discussion': 'Demarrer la discussion',
  Reply: 'Repondre',
  'Post reply': 'Publier la reponse',
  'Share media with this group': 'Partager un media avec ce groupe',
  Caption: 'Legende',
  'Media type': 'Type de media',
  Photo: 'Photo',
  Video: 'Video',
  'Media URL': 'URL du media',
  'Upload file': 'Importer un fichier',
  'Share media': 'Partager le media',
  'Account created. You can now login.': 'Compte cree. Vous pouvez maintenant vous connecter.',
  'Login successful.': 'Connexion reussie.',
  'Logged out successfully.': 'Deconnexion reussie.',
  'Itinerary created successfully.': 'Itineraire cree avec succes.',
  'Generated itinerary saved.': 'Itineraire genere enregistre.',
  'Draft itinerary generated.': 'Brouillon d itineraire genere.',
  'Profile preferences updated.': 'Preferences du profil mises a jour.',
  'Payment complete. Receipt generated.': 'Paiement effectue. Recu genere.',
  'Invite link created.': 'Lien d invitation cree.',
  'Trip progress updated.': 'Progression du voyage mise a jour.',
  'Feedback recorded.': 'Avis enregistre.',
  'Please login to create an itinerary.': 'Veuillez vous connecter pour creer un itineraire.',
  'Title and location are required.': 'Le titre et le lieu sont requis.',
};

const FR_PLACEHOLDERS = {
  'Douala, beach, hotel': 'Douala, plage, hotel',
  'Beach Escape': 'Escapade a Kribi',
  'Seaside Hotel': 'Hotel a Akwa',
  'Surf Lesson': 'Visite culinaire',
  Uluwatu: 'Musee national',
  food: 'cuisine',
  'Cameroon Travelers': 'Voyageurs du Cameroun',
  'Share tips and meet other travellers': 'Partager des conseils et rencontrer d autres voyageurs',
  'Add comment': 'Ajouter un commentaire',
  'Share with username': 'Partager avec un utilisateur',
  'hotel id': 'id hotel',
  bob: 'paul',
  Airport: 'Aeroport',
  'hotel, activity-1': 'hotel, activite-1',
  'Best local guides': 'Meilleurs guides locaux',
  'Share a question or tip': 'Partager une question ou un conseil',
  'Write a reply': 'Ecrire une reponse',
  'Sunset in Kribi': 'Coucher de soleil a Kribi',
  'https://example.com/photo.jpg': 'https://exemple.com/photo.jpg',
  'What worked well?': 'Qu est-ce qui a bien fonctionne ?',
};

function getCurrencyOption(currencyCode) {
  return CURRENCY_OPTIONS.find((option) => option.code === currencyCode) || CURRENCY_OPTIONS[0];
}

function translateWithWhitespace(text, translator) {
  const leading = text.match(/^\s*/)?.[0] || '';
  const trailing = text.match(/\s*$/)?.[0] || '';
  const core = text.trim();
  if (!core) return text;
  return `${leading}${translator(core)}${trailing}`;
}

function translateDynamicText(text, language) {
  if (language !== 'fr') return text;
  return translateWithWhitespace(text, (core) => {
    if (FR_TEXT[core]) return FR_TEXT[core];

    const currencyLabel = core.match(/^(Budget|Hotel cost|Activity cost|Place cost|Max daily cost|Cost|Optional payment|Amount) \((.+)\)$/);
    if (currencyLabel) {
      return `${FR_TEXT[currencyLabel[1]] || currencyLabel[1]} (${currencyLabel[2]})`;
    }

    const strongLabel = core.match(/^(.+):$/);
    if (strongLabel && FR_TEXT[strongLabel[1]]) return `${FR_TEXT[strongLabel[1]]}:`;

    const matchScore = core.match(/^Match score: (.+)$/);
    if (matchScore) return `Score de correspondance : ${matchScore[1]}`;

    const feedbackMatch = core.match(/^Feedback match: (.+)$/);
    if (feedbackMatch) return `Correspondance d avis : ${feedbackMatch[1]}`;

    const byLine = core.match(/^By (.+) · (\d+) likes · (\d+) comments$/);
    if (byLine) return `Par ${byLine[1]} · ${byLine[2]} mentions J'aime · ${byLine[3]} commentaires`;

    const ticketLine = core.match(/^(.+) per ticket · (.+) seats left$/);
    if (ticketLine) return `${ticketLine[1]} par billet · ${ticketLine[2]} places restantes`;

    const amountLine = core.match(/^(Amount|Commission|Net|Planned|Paid|Remaining): (.+)$/);
    if (amountLine) return `${FR_TEXT[amountLine[1]] || amountLine[1]} : ${amountLine[2]}`;

    const providerLine = core.match(/^Google Maps · (.+)$/);
    if (providerLine) return `Google Maps · ${providerLine[1]}`;

    const durationLine = core.replace(/\bdays\b/g, 'jours').replace(/\bhours\b/g, 'heures');
    if (durationLine !== core) return durationLine;

    return core;
  });
}

function translatePage(root, language) {
  if (!root || language !== 'fr') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    node.nodeValue = translateDynamicText(node.nodeValue, language);
  });

  root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((element) => {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      element.setAttribute('placeholder', FR_PLACEHOLDERS[placeholder] || translateDynamicText(placeholder, language));
    }
  });
}

function App() {
  const [page, setPage] = useState('home');
  const [dashboardView, setDashboardView] = useState('overview');
  const [token, setToken] = useState(localStorage.getItem('gt_token') || '');
  const [currency, setCurrency] = useState(localStorage.getItem('gt_currency') || DEFAULT_CURRENCY);
  const [language, setLanguage] = useState(localStorage.getItem('gt_language') || DEFAULT_LANGUAGE);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profilePreferences, setProfilePreferences] = useState([]);
  const [registrationPreferences, setRegistrationPreferences] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [cameroonLocations, setCameroonLocations] = useState({ country: 'Cameroon', regions: [] });
  const [recommendations, setRecommendations] = useState([]);
  const [cityRecommendations, setCityRecommendations] = useState([]);
  const [recommendationFilters, setRecommendationFilters] = useState({ budget: '', location: '', region: '', division: '', subdivision: '', city: '', quarter: '' });
  const [itineraries, setItineraries] = useState([]);
  const [searchFilters, setSearchFilters] = useState({
    q: '',
    tag: '',
    category: '',
    region: '',
    division: '',
    subdivision: '',
    city: '',
    quarter: '',
    maxCost: '',
  });
  const [searchResults, setSearchResults] = useState([]);
  const [suggestionFilters, setSuggestionFilters] = useState({ location: '', budget: '', region: '', division: '', subdivision: '', city: '', quarter: '' });
  const [tripSuggestions, setTripSuggestions] = useState(null);
  const [itineraryAreaSuggestions, setItineraryAreaSuggestions] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedItinerary, setSelectedItinerary] = useState(null);
  const [shareUsername, setShareUsername] = useState('');
  const [sharePermission, setSharePermission] = useState('view');
  const [joinPaymentAmount, setJoinPaymentAmount] = useState('');
  const [mapInfo, setMapInfo] = useState(null);
  const [trackingInfo, setTrackingInfo] = useState(null);
  const [budgetInfo, setBudgetInfo] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [routePlan, setRoutePlan] = useState(null);
  const [inviteForm, setInviteForm] = useState({ permission: 'view', maxUses: '1' });
  const [inviteResult, setInviteResult] = useState(null);
  const [checklistText, setChecklistText] = useState({});
  const [packingForm, setPackingForm] = useState({ category: 'General', text: '', assignedTo: '' });
  const [expenseForm, setExpenseForm] = useState({ title: '', category: 'General', amount: '', paidBy: '', splitWith: '' });
  const [documentForm, setDocumentForm] = useState({ title: '', type: 'confirmation', url: '' });
  const [generatedItinerary, setGeneratedItinerary] = useState(null);
  const [generateForm, setGenerateForm] = useState({ location: '', budget: '', durationDays: '3', startDate: '' });
  const [progressForm, setProgressForm] = useState({
    status: 'in_progress',
    currentStageId: '',
    completedStageIds: '',
    currentLocation: '',
    progressPercent: '',
  });
  const [feedbackForm, setFeedbackForm] = useState({ rating: '5', comment: '', tags: '' });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mobile');
  const [paymentTargetType, setPaymentTargetType] = useState('total');
  const [runtimeGoogleClientId, setRuntimeGoogleClientId] = useState('');
  const [runtimeGoogleMapsApiKey, setRuntimeGoogleMapsApiKey] = useState('');
  const [googleClientIdLoadingError, setGoogleClientIdLoadingError] = useState(null);
  const [platformStats, setPlatformStats] = useState(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState('idle');
  const [liveLocationError, setLiveLocationError] = useState('');
  const [liveLocationPosition, setLiveLocationPosition] = useState(null);
  const [liveLocationWatchId, setLiveLocationWatchId] = useState(null);
  const [reservationForm, setReservationForm] = useState({
    type: 'hotel',
    stageId: '',
    itemName: '',
    amount: '',
    provider: '',
    quantity: '1',
    notes: '',
  });
  const [trackingForm, setTrackingForm] = useState({
    latitude: '',
    longitude: '',
    currentLocation: '',
  });
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const googleClientId = getGoogleIdentityClientId(runtimeGoogleClientId);
  const effectiveGoogleMapsApiKey = runtimeGoogleMapsApiKey || GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/config`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load runtime configuration.');
        }
        return response.json();
      })
      .then((config) => {
        if (cancelled) {
          return;
        }
        if (typeof config.googleClientId === 'string') {
          setRuntimeGoogleClientId(config.googleClientId);
        }
        if (typeof config.googleMapsApiKey === 'string') {
          setRuntimeGoogleMapsApiKey(config.googleMapsApiKey);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGoogleClientIdLoadingError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [newDiscussionTitle, setNewDiscussionTitle] = useState('');
  const [newDiscussionMessage, setNewDiscussionMessage] = useState('');
  const [discussionReplies, setDiscussionReplies] = useState({});
  const [media, setMedia] = useState([]);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaFile, setNewMediaFile] = useState(null);
  const [newMediaCaption, setNewMediaCaption] = useState('');
  const [newMediaType, setNewMediaType] = useState('photo');
  const [mediaGroupId, setMediaGroupId] = useState('');
  const [newMediaPlaceId, setNewMediaPlaceId] = useState('');
  const [newMediaItineraryId, setNewMediaItineraryId] = useState('');
  const [mediaComments, setMediaComments] = useState({});
  const [mediaShareTargets, setMediaShareTargets] = useState({});
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [selectedPlaceGuide, setSelectedPlaceGuide] = useState(null);
  const [placeGuideItineraryId, setPlaceGuideItineraryId] = useState('');
  const [placeComments, setPlaceComments] = useState([]);
  const [newPlaceComment, setNewPlaceComment] = useState('');
  const [requestFiles, setRequestFiles] = useState([]);
  const [editingPlaceId, setEditingPlaceId] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [editPlaceForm, setEditPlaceForm] = useState({ name: '', description: '', cost: '', location: '', latitude: '', longitude: '' });
  const [userLocation, setUserLocation] = useState(null);
  const [nearMeActive, setNearMeActive] = useState(false);
  const [nearMeError, setNearMeError] = useState(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [resources, setResources] = useState({ hotels: [], activities: [], places: [] });
  const [hotelCompareFilters, setHotelCompareFilters] = useState({ location: '', city: '', maxPrice: '' });
  const [hotelComparison, setHotelComparison] = useState(null);
  const [newResource, setNewResource] = useState({
    type: 'hotels',
    name: '',
    location: '',
    mapQuery: '',
    latitude: '',
    longitude: '',
    region: '',
    division: '',
    subdivision: '',
    city: '',
    quarter: '',
    cost: '',
    costNote: '',
    description: '',
    imageUrls: '',
    videoUrls: '',
    tags: '',
    relatedServices: '',
    sourceUrls: '',
  });
  const [newResourceFiles, setNewResourceFiles] = useState([]);
  const [placeRequests, setPlaceRequests] = useState([]);
  const [resourcesTab, setResourcesTab] = useState('catalogue');
  const [adminTab, setAdminTab] = useState('overview');
  const [catalogueQuery, setCatalogueQuery] = useState('');
  const [catalogueVisibleCount, setCatalogueVisibleCount] = useState({ hotels: 20, activities: 20, places: 20 });
  const [communityItineraries, setCommunityItineraries] = useState([]);
  const [itinerariesTab, setItinerariesTab] = useState('mine');
  const [requestForm, setRequestForm] = useState({
    type: 'places',
    name: '',
    location: '',
    region: '',
    division: '',
    subdivision: '',
    city: '',
    quarter: '',
    cost: '',
    costNote: '',
    description: '',
    tags: '',
    mapQuery: '',
    imageUrls: '',
  });
  const [resourceReview, setResourceReview] = useState({ type: 'hotels', id: '', rating: '5', comment: '' });
  const [newItinerary, setNewItinerary] = useState({
    title: '',
    location: '',
    region: '',
    division: '',
    subdivision: '',
    city: '',
    quarter: '',
    hotelName: '',
    hotelCost: '',
    activityName: '',
    activityCost: '',
    placeName: '',
    placeCost: '',
    startDate: '',
    endDate: '',
    visibility: 'private',
  });

  const currencyOption = getCurrencyOption(currency);
  const currencyLabel = currencyOption.label;
  const formatMoney = (amount) => {
    const numericAmount = Number(amount || 0);
    const convertedAmount = numericAmount * currencyOption.rateFromXaf;
    if (currencyOption.code === 'XAF') {
      return `${Math.round(convertedAmount).toLocaleString('fr-CM')} FCFA`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyOption.code,
      minimumFractionDigits: currencyOption.fractionDigits,
      maximumFractionDigits: currencyOption.fractionDigits,
    }).format(convertedAmount);
  };
  const toBaseMoney = (amount) => {
    if (amount === '' || amount === null || amount === undefined) return 0;
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount)) return Number.NaN;
    if (!numericAmount) return 0;
    return Number((numericAmount / currencyOption.rateFromXaf).toFixed(2));
  };

  useEffect(() => {
    localStorage.setItem('gt_currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem('gt_language', language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    window.requestAnimationFrame(() => translatePage(document.querySelector('.app-shell'), language));
  });

  useEffect(() => {
    const fetchCameroonLocations = async () => {
      try {
        const response = await fetch(`${API_BASE}/cameroon-locations`);
        if (response.ok) {
          setCameroonLocations(await response.json());
        }
      } catch (error) {
        setCameroonLocations({ country: 'Cameroon', regions: [] });
      }
    };
    fetchCameroonLocations();
  }, []);

  const isAdmin = profile?.role === 'admin';
  const dashboardMenuItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'itineraries', label: 'Itineraries', icon: MapIcon },
    { id: 'discovery', label: 'Discovery', icon: Compass },
    { id: 'community', label: 'Community', icon: Users },
    { id: 'media', label: 'Media', icon: Images },
    ...(isAdmin
      ? [
          { id: 'resources', label: 'Resources', icon: Building2 },
          { id: 'admin', label: 'Admin', icon: ShieldCheck },
        ]
      : [{ id: 'suggest', label: 'Suggest a place', icon: Lightbulb }]),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const navigate = (target) => {
    setAlert(null);
    setPage(target);
    if (target === 'dashboard') {
      setDashboardView('overview');
    }
  };

  const getRegionOptions = () => cameroonLocations.regions || [];
  const getDivisionOptions = (regionName) => (
    getRegionOptions().find((region) => region.region === regionName)?.divisions || []
  );
  const getSubdivisionOptions = (filters) => (
    getDivisionOptions(filters.region).find((division) => division.name === filters.division)?.subdivisions || []
  );
  const getCityOptions = (filters) => (
    getSubdivisionOptions(filters).find((subdivision) => subdivision.name === filters.subdivision)?.cities || []
  );
  const getQuarterOptions = (filters) => (
    getCityOptions(filters).find((city) => city.name === filters.city)?.quarters || []
  );
  const buildCameroonLocation = (filters) => (
    [filters.quarter, filters.city, filters.subdivision, filters.division, filters.region, 'Cameroon']
      .filter(Boolean)
      .join(', ')
  );
  const addCameroonGeoParams = (params, filters) => {
    ['region', 'division', 'subdivision', 'city', 'quarter'].forEach((field) => {
      if (filters[field]?.trim()) params.set(field, filters[field].trim());
    });
  };
  const matchesGeoFilters = (item, filters) => (
    ['region', 'division', 'subdivision', 'city', 'quarter'].every((field) => (
      !filters[field]?.trim() || item[field]?.toLowerCase() === filters[field].trim().toLowerCase()
    ))
  );
  const getDiscoveryCatalogue = () => [
    ...resources.places,
    ...resources.hotels.map((hotel) => ({
      ...hotel,
      category: hotel.category || 'hotel',
      cost: hotel.cost_per_night,
    })),
  ];
  const matchesDiscoveryFilters = (item) => {
    if (!matchesGeoFilters(item, searchFilters)) return false;
    if (searchFilters.category && (item.category || '').toLowerCase() !== searchFilters.category) return false;
    const searchable = [
      item.name,
      item.location,
      item.category,
      item.description,
      item.region,
      item.city,
      ...(item.tags || []),
    ].filter(Boolean).join(' ').toLowerCase();
    if (searchFilters.q.trim() && !searchable.includes(searchFilters.q.trim().toLowerCase())) return false;
    if (searchFilters.tag.trim() && !(item.tags || []).some((tag) => tag.toLowerCase().includes(searchFilters.tag.trim().toLowerCase()))) return false;
    if (searchFilters.maxCost.trim()) {
      const maxCost = toBaseMoney(searchFilters.maxCost);
      const itemCost = Number(item.cost ?? item.cost_per_night ?? 0);
      if (Number.isFinite(maxCost) && itemCost > maxCost) return false;
    }
    return true;
  };
  const getFilteredDiscoveryCatalogue = () => getDiscoveryCatalogue().filter(matchesDiscoveryFilters);
  const getPartitionedPlaces = () => {
    const filteredPlaces = getFilteredDiscoveryCatalogue();
    return filteredPlaces.reduce((groupsByRegion, place) => {
      const region = place.region || 'Unassigned region';
      groupsByRegion[region] = groupsByRegion[region] || [];
      groupsByRegion[region].push(place);
      return groupsByRegion;
    }, {});
  };
  const getPlaceCountByRegion = () => getDiscoveryCatalogue().reduce((counts, place) => {
    const region = place.region || 'Unassigned region';
    counts[region] = (counts[region] || 0) + 1;
    return counts;
  }, {});
  const DISCOVERY_PAGE_SIZE = 60;
  const DISCOVERY_MAP_MAX_MARKERS = 150;
  const EARTH_RADIUS_KM = 6371;
  const getDistanceKm = (from, to) => {
    if (!from || !to) return null;
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(to[0] - from[0]);
    const dLng = toRad(to[1] - from[1]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  };
  const getItemDistanceFromUser = (item) => {
    if (!userLocation) return null;
    const position = getItemCoordinates(item);
    if (!position) return null;
    return getDistanceKm([userLocation.latitude, userLocation.longitude], position);
  };
  const handleUseMyLocationDiscovery = () => {
    if (!navigator.geolocation) {
      setNearMeError('Geolocation is not supported on this device.');
      return;
    }
    setLocatingUser(true);
    setNearMeError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setNearMeActive(true);
        setLocatingUser(false);
      },
      (error) => {
        setNearMeError(error.message || 'Unable to get your location.');
        setLocatingUser(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };
  const getSortedDiscoveryCatalogue = () => {
    const filteredPlaces = getFilteredDiscoveryCatalogue();
    if (nearMeActive && userLocation) {
      return filteredPlaces
        .map((item) => ({ item, distance: getItemDistanceFromUser(item) }))
        .filter((entry) => entry.distance !== null)
        .sort((a, b) => a.distance - b.distance)
        .map((entry) => ({ ...entry.item, distance_km: entry.distance }));
    }
    return filteredPlaces.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };
  const getFeaturedDiscoveryPlaces = () => getSortedDiscoveryCatalogue().slice(0, DISCOVERY_PAGE_SIZE);
  const buildMapMarker = (item, type = 'place') => {
    const position = getItemCoordinates(item);
    if (!position) return null;
    return {
      id: item.id || `${type}-${item.name}`,
      name: item.name || item.location || 'Cameroon stop',
      location: item.location || buildCameroonLocation(item),
      description: item.description || item.notes || '',
      position,
    };
  };
  const buildMapMarkers = (items = [], type = 'place') => items
    .map((item) => buildMapMarker(item, type))
    .filter(Boolean);
  const getDiscoveryMapMarkers = () => buildMapMarkers(getSortedDiscoveryCatalogue().slice(0, DISCOVERY_MAP_MAX_MARKERS), 'place');
  const getItineraryMapMarkers = () => buildMapMarkers([
    ...(selectedItinerary?.stages || []),
    ...(selectedItinerary?.places_to_visit || []),
    selectedItinerary?.hotel,
  ].filter(Boolean), 'itinerary');
  const getTrackingPosition = () => {
    const tracking = trackingInfo || selectedItinerary?.live_tracking;
    const latitude = Number(tracking?.latitude);
    const longitude = Number(tracking?.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return [latitude, longitude];
    }
    return null;
  };
  const getMapInfoPosition = () => {
    const latitude = Number(mapInfo?.map_info?.latitude);
    const longitude = Number(mapInfo?.map_info?.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return [latitude, longitude];
    }
    return getItemCoordinates({
      name: mapInfo?.location,
      location: mapInfo?.location,
      map_info: mapInfo?.map_info,
    });
  };
  const updateGeoFilter = (setter, field, value) => {
    setter((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'region') {
        next.division = '';
        next.subdivision = '';
        next.city = '';
        next.quarter = '';
      }
      if (field === 'division') {
        next.subdivision = '';
        next.city = '';
        next.quarter = '';
      }
      if (field === 'subdivision') {
        next.city = '';
        next.quarter = '';
      }
      if (field === 'city') {
        next.quarter = '';
      }
      if (['region', 'division', 'subdivision', 'city', 'quarter'].includes(field)) {
        next.location = buildCameroonLocation(next);
      }
      return next;
    });
  };
  const renderCameroonFilters = (filters, setter) => (
    <>
      <label>
        Region
        <select value={filters.region} onChange={(event) => updateGeoFilter(setter, 'region', event.target.value)}>
          <option value="">All regions</option>
          {getRegionOptions().map((region) => (
            <option key={region.region} value={region.region}>{region.region}</option>
          ))}
        </select>
      </label>
      <label>
        Division
        <select value={filters.division} onChange={(event) => updateGeoFilter(setter, 'division', event.target.value)}>
          <option value="">All divisions</option>
          {getDivisionOptions(filters.region).map((division) => (
            <option key={division.name} value={division.name}>{division.name}</option>
          ))}
        </select>
      </label>
      <label>
        Subdivision
        <select value={filters.subdivision} onChange={(event) => updateGeoFilter(setter, 'subdivision', event.target.value)}>
          <option value="">All subdivisions</option>
          {getSubdivisionOptions(filters).map((subdivision) => (
            <option key={subdivision.name} value={subdivision.name}>{subdivision.name}</option>
          ))}
        </select>
      </label>
      <label>
        City
        <select value={filters.city} onChange={(event) => updateGeoFilter(setter, 'city', event.target.value)}>
          <option value="">All cities</option>
          {getCityOptions(filters).map((city) => (
            <option key={city.name} value={city.name}>{city.name}</option>
          ))}
        </select>
      </label>
      <label>
        Quarter
        <select value={filters.quarter} onChange={(event) => updateGeoFilter(setter, 'quarter', event.target.value)}>
          <option value="">All quarters</option>
          {getQuarterOptions(filters).map((quarter) => (
            <option key={quarter} value={quarter}>{quarter}</option>
          ))}
        </select>
      </label>
    </>
  );
  const toggleInterest = (setter, interest) => {
    setter((current) => (
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest]
    ));
  };
  const renderInterestPicker = (selectedInterests, setter) => (
    <div className="interest-grid" role="group" aria-label="Interests">
      {PREDEFINED_INTERESTS.map((interest) => (
        <label key={interest} className="interest-chip">
          <input
            type="checkbox"
            checked={selectedInterests.includes(interest)}
            onChange={() => toggleInterest(setter, interest)}
          />
          <span>{interest}</span>
        </label>
      ))}
    </div>
  );

  const fetchDashboardData = async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const [recoRes, cityRecoRes, wishlistRes, itinRes, groupsRes, profileRes, notificationsRes] = await Promise.all([
        fetch(`${API_BASE}/recommendations?limit=4`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/recommendations/cities?limit=6`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/wishlist`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/itineraries`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (recoRes.ok) {
        setRecommendations(await recoRes.json());
      } else {
        setRecommendations([]);
      }

      if (cityRecoRes.ok) {
        setCityRecommendations(await cityRecoRes.json());
      } else {
        setCityRecommendations([]);
      }

      if (wishlistRes.ok) {
        setSavedPlaces(await wishlistRes.json());
      } else {
        setSavedPlaces([]);
      }

      if (itinRes.ok) {
        setItineraries(await itinRes.json());
      } else {
        setItineraries([]);
      }

      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        setGroups(groupsData);
      } else {
        setGroups([]);
      }

      let currentProfile = null;
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        currentProfile = profileData;
        setProfile(profileData);
        setProfilePreferences(profileData.preferences || []);
      }

      if (notificationsRes.ok) {
        setNotifications(await notificationsRes.json());
      } else {
        setNotifications([]);
      }

      if (currentProfile?.role === 'admin') {
        const adminUsersRes = await fetch(`${API_BASE}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (adminUsersRes.ok) {
          setAdminUsers(await adminUsersRes.json());
        } else {
          setAdminUsers([]);
        }
        const statsRes = await fetch(`${API_BASE}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAdminStats(statsRes.ok ? await statsRes.json() : null);
      } else {
        setAdminUsers([]);
      }

      try {
        const requestsRes = await fetch(`${API_BASE}/resources/requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPlaceRequests(requestsRes.ok ? await requestsRes.json() : []);
      } catch (error) {
        setPlaceRequests([]);
      }

      const mediaRes = await fetch(`${API_BASE}/media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mediaRes.ok) {
        setMedia(await mediaRes.json());
      } else {
        setMedia([]);
      }

      const [hotelsRes, activitiesRes, placesRes] = await Promise.all([
        fetch(`${API_BASE}/resources/hotels`),
        fetch(`${API_BASE}/resources/activities`),
        fetch(`${API_BASE}/resources/places`),
      ]);
      setResources({
        hotels: hotelsRes.ok ? await hotelsRes.json() : [],
        activities: activitiesRes.ok ? await activitiesRes.json() : [],
        places: placesRes.ok ? await placesRes.json() : [],
      });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to load dashboard data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (page === 'dashboard' && token) {
      fetchDashboardData();
    }
  }, [page, token]);

  useEffect(() => {
    if (page === 'itinerary' && selectedItinerary && token && !mapInfo) {
      handleLoadMapInfo();
    }
  }, [page, selectedItinerary?.id, token]);

  useEffect(() => {
    if (page !== 'dashboard' || dashboardView !== 'itineraries' || !token) {
      return undefined;
    }
    const location = newItinerary.location.trim();
    if (location.length < 2) {
      setItineraryAreaSuggestions(null);
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      fetchItineraryAreaSuggestions(location, newItinerary);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [
    newItinerary.location,
    newItinerary.region,
    newItinerary.division,
    newItinerary.subdivision,
    newItinerary.city,
    newItinerary.quarter,
    page,
    dashboardView,
    token,
  ]);

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = event.target;
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        phone: form.phone ? form.phone.value : undefined,
        password: form.password.value,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Login failed' });
      return;
    }
    localStorage.setItem('gt_token', result.token);
    setToken(result.token);
    setAlert({ type: 'success', message: 'Login successful.' });
    setPage('dashboard');
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    const form = event.target;
    const preferences = registrationPreferences;

    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        phone: form.phone ? form.phone.value : undefined,
        password: form.password.value,
        preferences,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Registration failed' });
      return;
    }
    setAlert({ type: 'success', message: 'Account created. You can now login.' });
    setRegistrationPreferences([]);
    setPage('login');
  };

  const handleGoogleCredential = async (credential) => {
    try {
      const response = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: credential }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Google authentication failed.');
      }
      localStorage.setItem('gt_token', result.token);
      setToken(result.token);
      setAlert({ type: 'success', message: 'Signed in with Google.' });
      setPage('dashboard');
    } catch (error) {
      setAlert({ type: 'error', message: error.message || 'Google login failed.' });
    }
  };

  const handleGoogleError = (message) => {
    setAlert({ type: 'error', message: message || 'Google login failed.' });
  };

  const handleLogout = () => {
    localStorage.removeItem('gt_token');
    setToken('');
    setPage('home');
    setRecommendations([]);
    setItineraries([]);
    setAlert({ type: 'success', message: 'Logged out successfully.' });
  };

  const handleDestinationSearch = async (event) => {
    event.preventDefault();

    const params = new URLSearchParams();
    if (searchFilters.q.trim()) params.set('q', searchFilters.q.trim());
    if (searchFilters.tag.trim()) params.set('tag', searchFilters.tag.trim());
    addCameroonGeoParams(params, searchFilters);
    if (searchFilters.maxCost) params.set('max_cost', toBaseMoney(searchFilters.maxCost));

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/destinations?${params.toString()}`);
      if (!response.ok) {
        const result = await response.json();
        setAlert({ type: 'error', message: result.error || 'Destination search failed.' });
        setSearchResults([]);
        return;
      }
      setSearchResults(await response.json());
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to search destinations.' });
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAutocomplete = async (event) => {
    event.preventDefault();
    if (!autocompleteQuery.trim()) {
      setAutocompleteResults([]);
      return;
    }

    const response = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(autocompleteQuery.trim())}`);
    if (response.ok) {
      setAutocompleteResults(await response.json());
    } else {
      setAutocompleteResults([]);
    }
  };

  const handleUpdateProfile = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to update your profile.' });
      return;
    }

    const preferences = profilePreferences;

    const response = await fetch(`${API_BASE}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ preferences }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update profile.' });
      return;
    }
    setProfile(result.profile);
    setAlert({ type: 'success', message: 'Profile preferences updated.' });
    await fetchRecommendations();
  };

  const handleMarkNotificationRead = async (notificationId) => {
    const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update notification.' });
      return;
    }
    setNotifications((current) => current.map((item) => (item.id === notificationId ? result.notification : item)));
  };

  const fetchRecommendations = async (filters = recommendationFilters) => {
    if (!token) {
      return;
    }

    const params = new URLSearchParams({ limit: '4' });
    if (filters.budget) params.set('budget', toBaseMoney(filters.budget));
    if (filters.location.trim()) params.set('location', filters.location.trim());
    addCameroonGeoParams(params, filters);

    const response = await fetch(`${API_BASE}/recommendations?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setRecommendations(await response.json());
    } else {
      setRecommendations([]);
    }
  };

  const fetchCityRecommendations = async () => {
    if (!token) return;
    const response = await fetch(`${API_BASE}/recommendations/cities?limit=6`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setCityRecommendations(await response.json());
    } else {
      setCityRecommendations([]);
    }
  };

  const recordBrowsingEvent = async (place, eventType = 'view') => {
    if (!token || !place?.id) return;
    try {
      await fetch(`${API_BASE}/browsing-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          event_type: eventType,
          place_id: place.id,
          resource_type: 'place',
          city: place.city,
          region: place.region,
          tags: place.tags || [],
        }),
      });
    } catch (error) {
      // Browsing signals are helpful but should never block the main action.
    }
  };

  const handleSavePlace = async (place) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to save places.' });
      return;
    }
    if (!place?.id) {
      setAlert({ type: 'error', message: 'This place cannot be saved yet.' });
      return;
    }
    const response = await fetch(`${API_BASE}/wishlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ place_id: place.id }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to save place.' });
      return;
    }
    setSavedPlaces(result.saved_places || []);
    await Promise.all([fetchRecommendations(), fetchCityRecommendations()]);
    setAlert({ type: 'success', message: result.message || 'Place saved.' });
  };

  const handleViewPlaceGuide = async (placeId) => {
    const response = await fetch(`${API_BASE}/resources/places/${placeId}`);
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to load place guide.' });
      return;
    }
    setSelectedPlaceGuide(result);
    setPlaceGuideItineraryId(itineraries[0]?.id || '');
    try {
      const commentsRes = await fetch(`${API_BASE}/resources/places/${placeId}/comment`);
      setPlaceComments(commentsRes.ok ? await commentsRes.json() : []);
    } catch (error) {
      setPlaceComments([]);
    }
  };

  const handleAddPlaceComment = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to comment.' });
      return;
    }
    const commentText = newPlaceComment.trim();
    if (!commentText || !selectedPlaceGuide?.place?.id) return;
    const response = await fetch(`${API_BASE}/resources/places/${selectedPlaceGuide.place.id}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ comment: commentText }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to add comment.' });
      return;
    }
    setPlaceComments((current) => [...current, result.comment]);
    setNewPlaceComment('');
  };

  const handleDownloadPlaceGuide = async () => {
    if (!selectedPlaceGuide?.place?.id) return;
    const response = await fetch(`${API_BASE}/resources/places/${selectedPlaceGuide.place.id}/guide`);
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to download guide.' });
      return;
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedPlaceGuide.place.id}-guide.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleAddGuidePlaceToItinerary = async () => {
    if (!token || !selectedPlaceGuide?.place?.id || !placeGuideItineraryId) {
      setAlert({ type: 'error', message: 'Select an itinerary first.' });
      return;
    }
    const response = await fetch(`${API_BASE}/trips/${placeGuideItineraryId}/places`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ place_id: selectedPlaceGuide.place.id }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to add place to itinerary.' });
      return;
    }
    setItineraries((current) => current.map((item) => (item.id === result.itinerary.id ? result.itinerary : item)));
    if (selectedItinerary?.id === result.itinerary.id) {
      refreshSelectedItinerary(result.itinerary);
    }
    setAlert({ type: 'success', message: result.message || 'Place added to itinerary.' });
  };

  const handleRemoveSavedPlace = async (placeId) => {
    const response = await fetch(`${API_BASE}/wishlist/${placeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to remove saved place.' });
      return;
    }
    setSavedPlaces(result.saved_places || []);
    await Promise.all([fetchRecommendations(), fetchCityRecommendations()]);
    setAlert({ type: 'success', message: result.message || 'Place removed.' });
  };

  const handleFindTripSuggestions = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to get trip suggestions.' });
      return;
    }
    if (!suggestionFilters.location.trim() && !buildCameroonLocation(suggestionFilters).trim()) {
      setAlert({ type: 'error', message: 'Location is required for suggestions.' });
      return;
    }

    const params = new URLSearchParams({
      location: suggestionFilters.location.trim() || buildCameroonLocation(suggestionFilters),
      budget: toBaseMoney(suggestionFilters.budget || '0'),
    });
    addCameroonGeoParams(params, suggestionFilters);

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/suggestions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to load trip suggestions.' });
        return;
      }
      setTripSuggestions(result);
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to load trip suggestions.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterRecommendations = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await fetchRecommendations();
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to filter recommendations.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateItinerary = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to generate an itinerary.' });
      return;
    }
    if (!generateForm.location.trim()) {
      setAlert({ type: 'error', message: 'Location is required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location: generateForm.location.trim(),
          budget: toBaseMoney(generateForm.budget) || 500,
          currency: DEFAULT_CURRENCY,
          currency_label: 'FCFA',
          duration_days: Number(generateForm.durationDays) || 3,
          start_date: generateForm.startDate,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to generate itinerary.' });
        return;
      }
      setGeneratedItinerary(result.generated_itinerary);
      setAlert({ type: 'success', message: 'Draft itinerary generated.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to generate itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneratedItinerary = async () => {
    if (!generatedItinerary) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(generatedItinerary),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to save generated itinerary.' });
        return;
      }
      setItineraries((current) => [result, ...current]);
      setGeneratedItinerary(null);
      setAlert({ type: 'success', message: 'Generated itinerary saved.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to save generated itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItinerary = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to create an itinerary.' });
      return;
    }

    const title = newItinerary.title.trim();
    const location = newItinerary.location.trim();
    if (!title || !location) {
      setAlert({ type: 'error', message: 'Title and location are required.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title,
        location,
        hotel: newItinerary.hotelName.trim()
          ? {
              name: newItinerary.hotelName.trim(),
              cost_per_night: toBaseMoney(newItinerary.hotelCost),
            }
          : {},
        activities: newItinerary.activityName.trim()
          ? [{ name: newItinerary.activityName.trim(), cost: toBaseMoney(newItinerary.activityCost) }]
          : [],
        places_to_visit: newItinerary.placeName.trim()
          ? [{ name: newItinerary.placeName.trim(), cost: toBaseMoney(newItinerary.placeCost) }]
          : [],
        currency: DEFAULT_CURRENCY,
        currency_label: 'FCFA',
        start_date: newItinerary.startDate,
        end_date: newItinerary.endDate,
        visibility: newItinerary.visibility === 'public' ? 'public' : 'private',
      };

      const response = await fetch(`${API_BASE}/itineraries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create itinerary.' });
        return;
      }

      setItineraries((current) => [result, ...current]);
      setAlert({ type: 'success', message: 'Itinerary created successfully.' });
      setNewItinerary({
        title: '',
        location: '',
        hotelName: '',
        hotelCost: '',
        activityName: '',
        activityCost: '',
        placeName: '',
        placeCost: '',
        startDate: '',
        endDate: '',
        visibility: 'private',
      });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunityItineraries = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/itineraries/community`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCommunityItineraries(response.ok ? await response.json() : []);
    } catch (error) {
      setCommunityItineraries([]);
    }
  };

  const handleCopyItinerary = async (itineraryId) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to copy this itinerary.' });
      return;
    }
    const response = await fetch(`${API_BASE}/itineraries/${itineraryId}/copy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to copy itinerary.' });
      return;
    }
    setItineraries((current) => [result, ...current]);
    setItinerariesTab('mine');
    setAlert({ type: 'success', message: 'Trip copied to your itineraries. You can edit it freely.' });
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to create a group.' });
      return;
    }

    const name = newGroupName.trim();
    if (!name) {
      setAlert({ type: 'error', message: 'Group name is required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description: newGroupDescription.trim() }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create group.' });
        return;
      }

      setGroups((current) => [result, ...current]);
      setAlert({ type: 'success', message: 'Group created successfully.' });
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create group.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDiscussion = async (event) => {
    event.preventDefault();
    if (!token || !selectedGroup) {
      setAlert({ type: 'error', message: 'Please login and select a group first.' });
      return;
    }

    const title = newDiscussionTitle.trim();
    const message = newDiscussionMessage.trim();
    if (!title || !message) {
      setAlert({ type: 'error', message: 'Both title and message are required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups/${selectedGroup.id}/discussions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, message }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create discussion.' });
        return;
      }

      setSelectedGroup(result.group);
      setNewDiscussionTitle('');
      setNewDiscussionMessage('');
      setAlert({ type: 'success', message: 'Discussion thread created.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create discussion.' });
    } finally {
      setLoading(false);
    }
  };

  const handleReplyToDiscussion = async (groupId, discussionId, replyText) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to reply.' });
      return;
    }

    if (!replyText.trim()) {
      setAlert({ type: 'error', message: 'Reply text is required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups/${groupId}/discussions/${discussionId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: replyText }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to post reply.' });
        return;
      }

      setSelectedGroup((current) => {
        if (!current) return current;
        return { ...current, discussions: current.discussions.map((discussion) => (
          discussion.id === discussionId ? result.discussion : discussion
        )) };
      });
      setDiscussionReplies((prev) => ({ ...prev, [discussionId]: '' }));
      setAlert({ type: 'success', message: 'Reply posted.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to post reply.' });
    } finally {
      setLoading(false);
    }
  };

  const handleShareMedia = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to share media.' });
      return;
    }

    const url = newMediaUrl.trim();
    if (!url && !newMediaFile) {
      setAlert({ type: 'error', message: 'Media URL or file is required.' });
      return;
    }

    setLoading(true);
    try {
      let response;
      if (newMediaFile) {
        const formData = new FormData();
        formData.append('file', newMediaFile);
        formData.append('type', newMediaType);
        formData.append('caption', newMediaCaption.trim());
        if (mediaGroupId) formData.append('group_id', mediaGroupId);
        if (newMediaPlaceId.trim()) formData.append('place_id', newMediaPlaceId.trim());
        if (newMediaItineraryId) formData.append('itinerary_id', newMediaItineraryId);
        response = await fetch(`${API_BASE}/media/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        response = await fetch(`${API_BASE}/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: newMediaType,
            url,
            caption: newMediaCaption.trim(),
            group_id: mediaGroupId || undefined,
            place_id: newMediaPlaceId.trim() || undefined,
            itinerary_id: newMediaItineraryId || undefined,
          }),
        });
      }

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to share media.' });
        return;
      }

      setMedia((current) => [result, ...current]);
      setNewMediaUrl('');
      setNewMediaFile(null);
      setNewMediaCaption('');
      setNewMediaType('photo');
      setMediaGroupId('');
      setNewMediaPlaceId('');
      await fetchCityRecommendations();
      setAlert({ type: 'success', message: 'Media shared successfully.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to share media.' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (groupId) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to join a group.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups/${groupId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to join group.' });
        return;
      }

      setAlert({ type: 'success', message: result.message || 'Joined group successfully.' });
      await fetchDashboardData();
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to join group.' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewGroup = (group) => {
    setSelectedGroup(group);
    setPage('group');
  };

  const handleSelectItinerary = (itinerary) => {
    setSelectedItinerary(itinerary);
    setPaymentAmount('');
    setPaymentMethod('mobile');
    setPaymentTargetType('total');
    setShareUsername('');
    setJoinPaymentAmount('');
    setMapInfo(null);
    setTrackingInfo(null);
    setBudgetInfo(null);
    setAuditEntries([]);
    setRoutePlan(itinerary.route_plan || null);
    setInviteResult(null);
    setPackingForm({ category: 'General', text: '', assignedTo: '' });
    setExpenseForm({ title: '', category: 'General', amount: '', paidBy: '', splitWith: '' });
    setDocumentForm({ title: '', type: 'confirmation', url: '' });
    setProgressForm({
      status: itinerary.progress?.status || 'in_progress',
      currentStageId: itinerary.progress?.current_stage_id || '',
      completedStageIds: itinerary.progress?.completed_stage_ids?.join(', ') || '',
      currentLocation: itinerary.progress?.current_location || itinerary.location || '',
      progressPercent: itinerary.progress?.progress_percent?.toString() || '',
    });
    setReservationForm({
      type: 'hotel',
      stageId: '',
      itemName: itinerary.hotel?.name || '',
      amount: itinerary.hotel?.cost_per_night ? String(itinerary.hotel.cost_per_night) : '',
      provider: itinerary.hotel?.name || '',
      quantity: '1',
      notes: '',
    });
    setTrackingForm({
      latitude: itinerary.live_tracking?.latitude?.toString() || '',
      longitude: itinerary.live_tracking?.longitude?.toString() || '',
      currentLocation: itinerary.progress?.current_location || itinerary.location || '',
    });
    setPage('itinerary');
  };

  const fetchItineraryAreaSuggestions = async (location, filters = newItinerary) => {
    if (!token || !location.trim()) {
      setItineraryAreaSuggestions(null);
      return;
    }

    const params = new URLSearchParams({ location: location.trim() });
    addCameroonGeoParams(params, filters);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/suggestions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to load area suggestions.' });
        setItineraryAreaSuggestions(null);
        return;
      }
      setItineraryAreaSuggestions(result);
    } catch (error) {
      setItineraryAreaSuggestions(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUseItinerarySuggestion = (type, item) => {
    if (type === 'hotels') {
      setNewItinerary((prev) => ({
        ...prev,
        hotelName: item.name || '',
        hotelCost: item.cost_per_night !== undefined ? String(item.cost_per_night) : prev.hotelCost,
      }));
    }
    if (type === 'activities') {
      setNewItinerary((prev) => ({
        ...prev,
        activityName: item.name || '',
        activityCost: item.cost !== undefined ? String(item.cost) : prev.activityCost,
      }));
    }
    if (type === 'places') {
      setNewItinerary((prev) => ({
        ...prev,
        placeName: item.name || '',
        placeCost: item.cost !== undefined ? String(item.cost) : prev.placeCost,
      }));
    }
  };

  const refreshSelectedItinerary = (itinerary) => {
    setSelectedItinerary(itinerary);
    setItineraries((current) => current.map((item) => (item.id === itinerary.id ? itinerary : item)));
  };

  const handleShareItinerary = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login and select an itinerary first.' });
      return;
    }
    if (!shareUsername.trim()) {
      setAlert({ type: 'error', message: 'Enter a username to share with.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: shareUsername.trim(), permission: sharePermission }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to share itinerary.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setShareUsername('');
      setSharePermission('view');
      setAlert({ type: 'success', message: result.message || 'Itinerary shared.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to share itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinItinerary = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login and select an itinerary first.' });
      return;
    }

    setLoading(true);
    try {
      const payload = joinPaymentAmount ? { payment_amount: toBaseMoney(joinPaymentAmount), payment_method: paymentMethod } : {};
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to join itinerary.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setJoinPaymentAmount('');
      setAlert({ type: 'success', message: result.message || 'Joined itinerary.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to join itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  // Public community counters shown on the landing page. Refreshed on an
  // interval so "active today" stays current without a reload.
  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const response = await fetch(`${API_BASE}/stats`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setPlatformStats(data);
      } catch (error) {
        // Counters are decorative; a failure here must not disturb the page.
      }
    };

    loadStats();
    const timer = setInterval(loadStats, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const handleLoadMapInfo = async () => {
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login and select an itinerary first.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/map`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to load map metadata.' });
        return;
      }
      setMapInfo(result);
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to load map metadata.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCompareHotels = async (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (hotelCompareFilters.location.trim()) params.set('location', hotelCompareFilters.location.trim());
    if (hotelCompareFilters.city.trim()) params.set('city', hotelCompareFilters.city.trim());
    if (hotelCompareFilters.maxPrice) params.set('max_price', toBaseMoney(hotelCompareFilters.maxPrice));
    const response = await fetch(`${API_BASE}/resources/hotels/compare?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to compare hotel prices.' });
      return;
    }
    setHotelComparison(result);
  };

  const handleCreateReservation = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) return;
    const amount = toBaseMoney(reservationForm.amount);
    if (!amount || amount <= 0) {
      setAlert({ type: 'error', message: 'Enter a valid booking amount.' });
      return;
    }
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: reservationForm.type,
        stage_id: reservationForm.stageId || undefined,
        item_name: reservationForm.itemName,
        amount,
        provider: reservationForm.provider,
        quantity: Number(reservationForm.quantity) || 1,
        notes: reservationForm.notes,
        payment_method: paymentMethod,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to confirm booking.' });
      return;
    }
    refreshSelectedItinerary(result.itinerary);
    await handleLoadBudget();
    setReservationForm((current) => ({ ...current, notes: '' }));
    setAlert({ type: 'success', message: `${result.message}: ${result.reservation.confirmation_code}` });
  };

  const handleModifyReservation = async (reservationId, changes) => {
    if (!selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/reservations/${reservationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(changes),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to modify reservation.' });
      return;
    }
    refreshSelectedItinerary(result.itinerary);
    setAlert({ type: 'success', message: 'Reservation modified.' });
  };

  const handleCancelReservation = async (reservationId) => {
    if (!selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/reservations/${reservationId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Cancelled by traveller' }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to cancel reservation.' });
      return;
    }
    refreshSelectedItinerary(result.itinerary);
    setAlert({ type: 'success', message: 'Reservation cancelled.' });
  };

  const syncTrackingToBackend = async (latitude, longitude, currentLocation) => {
    if (!selectedItinerary) {
      return null;
    }
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/tracking`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        latitude,
        longitude,
        current_location: currentLocation,
        current_stage_id: progressForm.currentStageId || undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to update live tracking.');
    }
    setTrackingInfo(result.tracking);
    refreshSelectedItinerary(result.itinerary);
    return result;
  };

  const handleUpdateTracking = async (event) => {
    event.preventDefault();
    if (!selectedItinerary) return;
    try {
      await syncTrackingToBackend(Number(trackingForm.latitude), Number(trackingForm.longitude), trackingForm.currentLocation);
      setAlert({ type: 'success', message: 'Live tracking updated.' });
    } catch (error) {
      setAlert({ type: 'error', message: error.message || 'Unable to update live tracking.' });
    }
  };

  const handleStartLiveTracking = () => {
    if (!navigator.geolocation) {
      setLiveLocationError('Geolocation is not supported in this browser.');
      return;
    }
    if (liveLocationWatchId !== null) {
      return;
    }
    setLiveLocationStatus('requesting');
    setLiveLocationError('');
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const nextLocation = { latitude, longitude };
        setLiveLocationPosition(nextLocation);
        const locationLabel = `Live position ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setTrackingForm((prev) => ({
          ...prev,
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
          currentLocation: prev.currentLocation || locationLabel,
        }));
        setLiveLocationStatus('tracking');
        if (selectedItinerary && token) {
          syncTrackingToBackend(latitude, longitude, locationLabel)
            .catch((error) => {
              setLiveLocationError(error.message || 'Unable to share live location.');
            });
        }
      },
      (error) => {
        setLiveLocationStatus('error');
        setLiveLocationError(error.message || 'Unable to read your location.');
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    setLiveLocationWatchId(watchId);
  };

  const handleStopLiveTracking = () => {
    if (liveLocationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(liveLocationWatchId);
    }
    setLiveLocationWatchId(null);
    setLiveLocationStatus('stopped');
  };

  const handleLoadBudget = async () => {
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/budget`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setBudgetInfo(await response.json());
    }
  };

  const handleLoadAudit = async () => {
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/audit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setAuditEntries(await response.json());
    }
  };

  const handleCreateInvite = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        permission: inviteForm.permission,
        max_uses: Number(inviteForm.maxUses) || 1,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to create invite.' });
      return;
    }
    setInviteResult(result);
    setAlert({ type: 'success', message: 'Invite link created.' });
  };

  const handleDownloadItineraryFile = async (kind) => {
    if (!selectedItinerary) return;
    const path = kind === 'pdf' ? 'export.pdf' : 'calendar.ics';
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setAlert({ type: 'error', message: 'Unable to download export.' });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `itinerary-${selectedItinerary.id}.${kind === 'pdf' ? 'pdf' : 'ics'}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadDayPlans = async () => {
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/day-plans`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to load day plans.' });
      return;
    }
    setRoutePlan(result.route_plan);
    setSelectedItinerary((current) => ({ ...current, day_plans: result.day_plans, route_plan: result.route_plan }));
  };

  const handleOptimizeRoute = async () => {
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stage_ids: (selectedItinerary.stages || []).map((stage) => stage.id) }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to optimize route.' });
      return;
    }
    setRoutePlan(result.route_plan);
    refreshSelectedItinerary(result.itinerary);
    setAlert({ type: 'success', message: 'Route ready for Google Maps.' });
  };

  const handleAddPackingItem = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary || !packingForm.text.trim()) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/packing-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        category: packingForm.category,
        text: packingForm.text,
        assigned_to: packingForm.assignedTo,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update packing list.' });
      return;
    }
    refreshSelectedItinerary(result.itinerary);
    setPackingForm({ category: 'General', text: '', assignedTo: '' });
  };

  const handleTogglePackingItem = async (item) => {
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/packing-list`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: item.id, packed: !item.packed }),
    });
    const result = await response.json();
    if (response.ok) {
      refreshSelectedItinerary(result.itinerary);
    }
  };

  const handleAddExpense = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) return;
    const amount = toBaseMoney(expenseForm.amount);
    if (!amount || amount <= 0) {
      setAlert({ type: 'error', message: 'Enter a valid expense amount.' });
      return;
    }
    const splitWith = expenseForm.splitWith
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: expenseForm.title,
        category: expenseForm.category,
        amount,
        paid_by: expenseForm.paidBy || profile?.username || '',
        split_with: splitWith.length ? splitWith : selectedItinerary.participants,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to add expense.' });
      return;
    }
    refreshSelectedItinerary(result.itinerary);
    setBudgetInfo((current) => current);
    setExpenseForm({ title: '', category: 'General', amount: '', paidBy: '', splitWith: '' });
  };

  const handleAttachDocument = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary || !documentForm.url.trim()) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: documentForm.title,
        type: documentForm.type,
        url: documentForm.url,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to attach document.' });
      return;
    }
    refreshSelectedItinerary(result.itinerary);
    setDocumentForm({ title: '', type: 'confirmation', url: '' });
  };

  const handleAddChecklistItem = async (stageId) => {
    const text = (checklistText[stageId] || '').trim();
    if (!text || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/stages/${stageId}/checklist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update checklist.' });
      return;
    }
    setSelectedItinerary((current) => ({
      ...current,
      stages: current.stages.map((stage) => (stage.id === stageId ? result.stage : stage)),
    }));
    setChecklistText((current) => ({ ...current, [stageId]: '' }));
  };

  const handleToggleChecklistItem = async (stageId, item) => {
    if (!selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/stages/${stageId}/checklist`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: item.id, done: !item.done }),
    });
    const result = await response.json();
    if (response.ok) {
      setSelectedItinerary((current) => ({
        ...current,
        stages: current.stages.map((stage) => (stage.id === stageId ? result.stage : stage)),
      }));
    }
  };

  const handleUpdateProgress = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please select an itinerary first.' });
      return;
    }

    const completedStageIds = progressForm.completedStageIds
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/progress`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: progressForm.status,
          current_stage_id: progressForm.currentStageId || undefined,
          completed_stage_ids: completedStageIds,
          current_location: progressForm.currentLocation,
          progress_percent: progressForm.progressPercent ? Number(progressForm.progressPercent) : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to update progress.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setAlert({ type: 'success', message: 'Trip progress updated.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to update progress.' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStageComplete = async (stageId, checked) => {
    if (!token || !selectedItinerary) return;
    const current = progressForm.completedStageIds
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const nextCompleted = checked
      ? Array.from(new Set([...current, stageId]))
      : current.filter((id) => id !== stageId);
    setProgressForm((prev) => ({ ...prev, completedStageIds: nextCompleted.join(', ') }));
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/progress`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: progressForm.status,
        completed_stage_ids: nextCompleted,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      refreshSelectedItinerary(result.itinerary);
    } else {
      setAlert({ type: 'error', message: result.error || 'Unable to update stage.' });
    }
  };

  const handleSubmitFeedback = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please select an itinerary first.' });
      return;
    }

    const tags = feedbackForm.tags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: Number(feedbackForm.rating),
          comment: feedbackForm.comment,
          tags,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to submit feedback.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setFeedbackForm({ rating: '5', comment: '', tags: '' });
      setAlert({ type: 'success', message: 'Feedback recorded.' });
      await fetchRecommendations();
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to submit feedback.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePayItinerary = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login to complete payment.' });
      return;
    }

    const amount = toBaseMoney(paymentAmount);
    if (!amount || amount <= 0) {
      setAlert({ type: 'error', message: 'Enter a valid payment amount.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          currency: DEFAULT_CURRENCY,
          currency_label: 'FCFA',
          payment_method: paymentMethod,
          target_type: paymentTargetType,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Payment failed.' });
        return;
      }

      refreshSelectedItinerary(result.itinerary);
      await handleLoadBudget();
      setAlert({ type: 'success', message: 'Payment complete. Receipt generated.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to process payment.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLikeMedia = async (mediaId) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to like media.' });
      return;
    }
    const response = await fetch(`${API_BASE}/media/${mediaId}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to like media.' });
      return;
    }
    setMedia((current) => current.map((item) => (item.id === mediaId ? result.media : item)));
  };

  const handleCommentMedia = async (mediaId) => {
    const comment = (mediaComments[mediaId] || '').trim();
    if (!comment) {
      setAlert({ type: 'error', message: 'Comment text is required.' });
      return;
    }

    const response = await fetch(`${API_BASE}/media/${mediaId}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ comment }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to comment on media.' });
      return;
    }
    setMedia((current) => current.map((item) => (item.id === mediaId ? result.media : item)));
    setMediaComments((current) => ({ ...current, [mediaId]: '' }));
  };

  const handleShareExistingMedia = async (mediaId) => {
    const username = (mediaShareTargets[mediaId] || '').trim();
    if (!username) {
      setAlert({ type: 'error', message: 'Enter a username to share media with.' });
      return;
    }

    const response = await fetch(`${API_BASE}/media/${mediaId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to share media.' });
      return;
    }
    setMedia((current) => current.map((item) => (item.id === mediaId ? result.media : item)));
    setMediaShareTargets((current) => ({ ...current, [mediaId]: '' }));
    setAlert({ type: 'success', message: result.message || 'Media shared.' });
  };

  const handleCreateResource = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login as an admin to manage resources.' });
      return;
    }

    const name = newResource.name.trim();
    const location = newResource.location.trim() || buildCameroonLocation(newResource);
    const cost = toBaseMoney(newResource.cost);
    if (!name || !location || Number.isNaN(cost)) {
      setAlert({ type: 'error', message: 'Name, location, and cost are required.' });
      return;
    }

    const isHotel = newResource.type === 'hotels';
    const payload = {
      name,
      location,
      region: newResource.region,
      division: newResource.division,
      subdivision: newResource.subdivision,
      city: newResource.city,
      quarter: newResource.quarter,
      description: newResource.description.trim(),
      tags: newResource.tags,
      cost_note: newResource.costNote,
      [isHotel ? 'cost_per_night' : 'cost']: cost,
    };

    let response;
    if (newResource.type === 'places') {
      const formData = new FormData();
      Object.entries({
        ...payload,
        map_query: newResource.mapQuery || location,
        latitude: newResource.latitude,
        longitude: newResource.longitude,
        image_urls: newResource.imageUrls,
        video_urls: newResource.videoUrls,
        related_services: newResource.relatedServices,
        source_urls: newResource.sourceUrls,
      }).forEach(([key, value]) => {
        if (value !== undefined && value !== null) formData.append(key, value);
      });
      newResourceFiles.forEach((file) => formData.append('media_files', file));
      response = await fetch(`${API_BASE}/resources/${newResource.type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } else {
      response = await fetch(`${API_BASE}/resources/${newResource.type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    }
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to create resource.' });
      return;
    }
    setResources((current) => ({
      ...current,
      [newResource.type]: [result, ...current[newResource.type]],
    }));
    setNewResource({
      type: newResource.type,
      name: '',
      location: '',
      mapQuery: '',
      latitude: '',
      longitude: '',
      region: '',
      division: '',
      subdivision: '',
      city: '',
      quarter: '',
      cost: '',
      costNote: '',
      description: '',
      imageUrls: '',
      videoUrls: '',
      tags: '',
      relatedServices: '',
      sourceUrls: '',
    });
    setNewResourceFiles([]);
    setAlert({ type: 'success', message: 'Resource created.' });
  };

  const handleDeleteResource = async (type, id) => {
    const response = await fetch(`${API_BASE}/resources/${type}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to delete resource.' });
      return;
    }
    setResources((current) => ({
      ...current,
      [type]: current[type].filter((item) => item.id !== id),
    }));
    setAlert({ type: 'success', message: result.message || 'Resource removed.' });
  };

  const startEditPlace = (place) => {
    setEditingPlaceId(place.id);
    setEditPlaceForm({
      name: place.name || '',
      description: place.description || '',
      cost: place.cost !== undefined ? String(place.cost) : '',
      location: place.location || '',
      latitude: place.latitude !== undefined ? String(place.latitude) : '',
      longitude: place.longitude !== undefined ? String(place.longitude) : '',
    });
  };

  const cancelEditPlace = () => {
    setEditingPlaceId(null);
  };

  const handleSaveEditPlace = async (placeId) => {
    if (!token) return;
    const payload = {
      name: editPlaceForm.name,
      description: editPlaceForm.description,
      cost: editPlaceForm.cost,
      location: editPlaceForm.location,
    };
    if (editPlaceForm.latitude !== '' && editPlaceForm.longitude !== '') {
      payload.latitude = editPlaceForm.latitude;
      payload.longitude = editPlaceForm.longitude;
    }
    const response = await fetch(`${API_BASE}/resources/places/${placeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update place.' });
      return;
    }
    setResources((current) => ({
      ...current,
      places: (current.places || []).map((item) => (item.id === placeId ? result.place : item)),
    }));
    setEditingPlaceId(null);
    setAlert({ type: 'success', message: 'Place updated.' });
  };

  const handleSubmitPlaceRequest = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to suggest a place.' });
      return;
    }
    const name = requestForm.name.trim();
    const location = requestForm.location.trim() || buildCameroonLocation(requestForm);
    const cost = toBaseMoney(requestForm.cost);
    if (!name || !location || Number.isNaN(cost)) {
      setAlert({ type: 'error', message: 'Name, location, and cost are required.' });
      return;
    }
    const isHotel = requestForm.type === 'hotels';
    const payload = {
      type: requestForm.type,
      name,
      location,
      region: requestForm.region,
      division: requestForm.division,
      subdivision: requestForm.subdivision,
      city: requestForm.city,
      quarter: requestForm.quarter,
      description: requestForm.description.trim(),
      tags: requestForm.tags,
      cost_note: requestForm.costNote,
      map_query: requestForm.mapQuery || location,
      image_urls: requestForm.imageUrls,
      [isHotel ? 'cost_per_night' : 'cost']: cost,
    };
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) formData.append(key, value);
    });
    requestFiles.forEach((file) => formData.append('media_files', file));
    const response = await fetch(`${API_BASE}/resources/requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to submit suggestion.' });
      return;
    }
    setPlaceRequests((current) => [result, ...current]);
    setRequestForm((prev) => ({
      type: prev.type,
      name: '',
      location: '',
      region: '',
      division: '',
      subdivision: '',
      city: '',
      quarter: '',
      cost: '',
      costNote: '',
      description: '',
      tags: '',
      mapQuery: '',
      imageUrls: '',
    }));
    setRequestFiles([]);
    setAlert({ type: 'success', message: 'Suggestion submitted. An admin will review it soon.' });
  };

  const handleReviewPlaceRequest = async (requestId, approve) => {
    if (!token) return;
    const response = await fetch(`${API_BASE}/resources/requests/${requestId}/${approve ? 'approve' : 'reject'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to review request.' });
      return;
    }
    setPlaceRequests((current) => current.map((item) => (item.id === requestId ? result.request : item)));
    if (approve && result.request?.resource_id) {
      const resourceType = result.request.type || 'places';
      fetch(`${API_BASE}/resources/${resourceType}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((items) => {
          if (items) setResources((current) => ({ ...current, [resourceType]: items }));
        });
    }
    setAlert({ type: 'success', message: approve ? 'Request approved and published.' : 'Request rejected.' });
  };

  const handleUpdateUserRole = async (username, role) => {
    const response = await fetch(`${API_BASE}/admin/users/${username}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update role.' });
      return;
    }
    setAdminUsers((current) => current.map((user) => (user.username === username ? { ...user, role } : user)));
  };

  const handleAddResourceReview = async (event) => {
    event.preventDefault();
    if (!resourceReview.id.trim()) {
      setAlert({ type: 'error', message: 'Resource ID is required for review.' });
      return;
    }
    const response = await fetch(`${API_BASE}/resources/${resourceReview.type}/${resourceReview.id.trim()}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rating: Number(resourceReview.rating), comment: resourceReview.comment }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to add review.' });
      return;
    }
    setResources((current) => ({
      ...current,
      [resourceReview.type]: current[resourceReview.type].map((item) => (item.id === result.resource.id ? result.resource : item)),
    }));
    setResourceReview((current) => ({ ...current, id: '', comment: '', rating: '5' }));
    setAlert({ type: 'success', message: 'Review added.' });
  };

  return (
    <div className="app-shell" key={language}>
      <header className="app-header">
        <div className="container header-inner">
          <div className="brand">GlobeTrotter</div>
          <nav className="nav-bar">
            <button type="button" onClick={() => navigate('home')}>Home</button>
            {!token && <button type="button" onClick={() => navigate('login')}>Login</button>}
            {!token && <button type="button" onClick={() => navigate('register')}>Register</button>}
            {token && <button type="button" onClick={() => navigate('dashboard')}>Dashboard</button>}
            {token && <button type="button" onClick={handleLogout}>Logout</button>}
            <label className="language-picker">
              <span>Language</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="currency-picker">
              <span>Currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
            </label>
          </nav>
        </div>
      </header>

      <main className="container main-content">
        {alert && (
          <div className={`alert ${alert.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {alert.message}
          </div>
        )}

        {page === 'home' && (
          <section className="hero-section">
            <div className="hero-copy">
              <p className="eyebrow">Travel meets community</p>
              <h1>Plan trips, sell event tickets, and connect with travelers.</h1>
              <p>GlobeTrotter brings itineraries, payments, groups, and media sharing into one polished React experience.</p>
              <div className="hero-actions">
                <button type="button" className="button button-primary" onClick={() => navigate('register')}>Get Started</button>
                <button type="button" className="button button-secondary" onClick={() => navigate('login')}>Sign In</button>
              </div>
              {googleClientId ? (
                <div className="hero-google-signin">
                  <p>Or sign in directly with Google:</p>
                  <GoogleSignInButton clientId={googleClientId} onSuccess={handleGoogleCredential} onError={handleGoogleError} />
                </div>
              ) : (
                <div className="hero-google-signin">
                  <p className="muted-note">Google sign-in is unavailable until the app is configured.</p>
                </div>
              )}
            </div>
            {platformStats && (
              <div className="stats-strip" aria-label="Community activity">
                <div className="stat-tile">
                  <span className="stat-value">{platformStats.total_travellers.toLocaleString()}</span>
                  <span className="stat-label">Travellers on GlobeTrotter</span>
                </div>
                <div className="stat-tile stat-live">
                  <span className="stat-value">
                    <span className="live-dot" aria-hidden="true"></span>
                    {platformStats.active_today.toLocaleString()}
                  </span>
                  <span className="stat-label">Active today</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-value">{platformStats.total_trips.toLocaleString()}</span>
                  <span className="stat-label">Trips planned</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-value">{platformStats.total_places.toLocaleString()}</span>
                  <span className="stat-label">Places to discover</span>
                </div>
              </div>
            )}
            <div className="hero-cards">
              <article className="feature-card">
                <h3>Shared travel plans</h3>
                <p>Build itineraries together, invite friends, and track every booking.</p>
              </article>
              <article className="feature-card">
                <h3>Ticket monetization</h3>
                <p>Sell event tickets with receipts, commission tracking, and secure payment records.</p>
              </article>
              <article className="feature-card">
                <h3>Community feed</h3>
                <p>Post photos, comment, like, and reach travel groups with media sharing.</p>
              </article>
            </div>
          </section>
        )}

        {page === 'login' && (
          <section className="form-section">
            <div className="form-card">
              <h2>Sign in</h2>
              <form onSubmit={handleLogin}>
                <label>
                  Username
                  <input name="username" type="text" autoComplete="username" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" autoComplete="current-password" required />
                </label>
                <button type="submit" className="button button-primary">Login</button>
              </form>
              {googleClientId ? (
                <div className="google-signin-section">
                  <p>Or continue with Google:</p>
                  <GoogleSignInButton clientId={googleClientId} onSuccess={handleGoogleCredential} onError={handleGoogleError} />
                </div>
              ) : (
                <div className="google-signin-section">
                  <p className="muted-note">Google sign-in is unavailable until the app is configured.</p>
                </div>
              )}
              <p className="form-footnote">
                New here? <button type="button" className="link-button" onClick={() => navigate('register')}>Create an account</button>
              </p>
            </div>
          </section>
        )}

        {page === 'register' && (
          <section className="form-section">
            <div className="form-card">
              <h2>Create account</h2>
              <form onSubmit={handleRegister}>
                <label>
                  Username
                  <input name="username" type="text" autoComplete="username" required />
                </label>
                <label>
                  Phone
                  <input name="phone" type="tel" autoComplete="tel" placeholder="+237 6XX XXX XXX" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" autoComplete="new-password" required />
                </label>
                <label>
                  Interests
                  {renderInterestPicker(registrationPreferences, setRegistrationPreferences)}
                </label>
                <button type="submit" className="button button-primary">Register</button>
              </form>
              {googleClientId ? (
                <div className="google-signin-section">
                  <p>Or sign up with Google:</p>
                  <GoogleSignInButton clientId={googleClientId} onSuccess={handleGoogleCredential} onError={handleGoogleError} />
                </div>
              ) : (
                <div className="google-signin-section">
                  <p className="muted-note">Google sign-in is unavailable until the app is configured.</p>
                </div>
              )}
              <p className="form-footnote">
                Already have an account? <button type="button" className="link-button" onClick={() => navigate('login')}>Login</button>
              </p>
            </div>
          </section>
        )}

        {page === 'dashboard' && token && (
          <section className="dashboard-section">
            <div className="app-layout">
              <aside className="app-menu">
                <h3>Menu</h3>
                <div className="app-menu-list">
                  {dashboardMenuItems.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                    <button
                      key={item.id}
                      type="button"
                      className={dashboardView === item.id ? 'active' : ''}
                      onClick={() => { setAlert(null); setDashboardView(item.id); }}
                    >
                      {ItemIcon && <ItemIcon size={18} strokeWidth={2} aria-hidden="true" />}
                      <span>{item.label}</span>
                    </button>
                    );
                  })}
                </div>
              </aside>
              <div className="app-page">
            {dashboardView === 'overview' && (
            <>
            <div className="stats-grid">
              <div className="stat-card">
                <MapIcon size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{itineraries.length}</span>
                <span className="stat-label">Itineraries planned</span>
              </div>
              <div className="stat-card">
                <Bookmark size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{savedPlaces.length}</span>
                <span className="stat-label">Saved places</span>
              </div>
              <div className="stat-card">
                <Users size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{groups.length}</span>
                <span className="stat-label">Community groups</span>
              </div>
              <div className="stat-card">
                <ClipboardCheck size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{isAdmin ? placeRequests.filter((item) => item.status === 'pending').length : placeRequests.length}</span>
                <span className="stat-label">{isAdmin ? 'Pending requests' : 'My suggestions'}</span>
              </div>
            </div>
            <div className="grid-2 mt-24">
              <div className="panel panel-primary">
                <h2>Welcome back</h2>
                <p>Access your itineraries, event receipts, and community groups in one place.</p>
                <div className="dashboard-actions">
                  <button type="button" className="button button-secondary" onClick={() => { setAlert(null); setDashboardView('itineraries'); }}>
                    Create itinerary
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => { setAlert(null); setDashboardView('community'); }}>
                    Join a group
                  </button>
                </div>
              </div>
              <div className="panel">
                <h3>Quick links</h3>
                <ul>
                  <li>My itineraries</li>
                  <li>Destination recommendations</li>
                  <li>Group discussions</li>
                </ul>
              </div>
            </div>
            {selectedPlaceGuide && (() => {
              const place = selectedPlaceGuide.place;
              const heroImage = place.image_url || '';
              const photos = [
                ...(place.images || []),
                ...(selectedPlaceGuide.photos || []),
              ].filter((photo) => photo && photo.url && photo.url !== heroImage);
              const videos = [
                ...(place.videos || []),
                ...(selectedPlaceGuide.videos || []),
              ].filter((video) => video && video.url);
              const rating = Number(place.rating || 0);
              const reviewCount = (place.reviews || []).length;
              const tags = (place.tags || []).filter((tag) => tag && tag !== 'cameroon').slice(0, 4);
              const area = [place.quarter, place.city || place.location, place.region]
                .filter(Boolean)
                .join(', ');

              return (
                <article className="place-view">
                  <div
                    className="place-backdrop"
                    style={heroImage ? { backgroundImage: 'url(' + heroImage + ')' } : undefined}
                    aria-hidden="true"
                  />

                  <div className="place-hero">
                    {heroImage ? (
                      <img src={heroImage} alt={place.name} loading="lazy" decoding="async" />
                    ) : (
                      <div className="place-hero-empty">
                        <span>{(place.category || 'place').replace(/_/g, ' ')}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="place-back"
                      onClick={() => setSelectedPlaceGuide(null)}
                      aria-label="Back to places"
                    >
                      &#8592;
                    </button>
                    {place.image_is_contextual && (
                      <span className="place-photo-note">
                        Photo of {place.city || place.location} &mdash; no photograph of this place yet
                      </span>
                    )}
                  </div>

                  <div className="place-sheet">
                    <div className="place-sheet-top">
                      <h2>{place.name}</h2>
                      <div className="place-actions" role="group" aria-label="Place actions">
                        {place.map_info?.google_map_url && (
                          <a
                            className="place-action"
                            href={place.map_info.google_map_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Directions"
                            aria-label="Open directions"
                          >
                            &#10148;
                          </a>
                        )}
                        <button
                          type="button"
                          className="place-action"
                          onClick={handleDownloadPlaceGuide}
                          title="Save this guide offline"
                          aria-label="Save this guide for offline use"
                        >
                          &#8681;
                        </button>
                      </div>
                    </div>

                    {rating > 0 && (
                      <div className="place-rating">
                        <span className="stars" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} className={n <= Math.round(rating) ? 'star on' : 'star'}>&#9733;</span>
                          ))}
                        </span>
                        <span className="rating-value">
                          {rating.toFixed(1)}{reviewCount > 0 ? ' (' + reviewCount + ')' : ''}
                        </span>
                      </div>
                    )}

                    {area && (
                      <p className="place-where">
                        <span className="pin" aria-hidden="true">&#9679;</span>{area}
                      </p>
                    )}

                    {tags.length > 0 && (
                      <div className="place-tags">
                        {tags.map((tag) => (
                          <span className="place-tag" key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}

                    {place.description && <p className="place-desc">{place.description}</p>}

                    <div className="place-facts">
                      <div>
                        <span className="fact-label">Entry / activity</span>
                        <span className="fact-value">{formatMoney(place.cost || 0)}</span>
                      </div>
                      {place.difficulty && (
                        <div>
                          <span className="fact-label">Difficulty</span>
                          <span className="fact-value">{place.difficulty}</span>
                        </div>
                      )}
                      {place.best_season && (
                        <div>
                          <span className="fact-label">Best season</span>
                          <span className="fact-value">{place.best_season}</span>
                        </div>
                      )}
                    </div>

                    <div className="place-add">
                      <select
                        value={placeGuideItineraryId}
                        onChange={(event) => setPlaceGuideItineraryId(event.target.value)}
                        aria-label="Choose a trip"
                      >
                        <option value="">Add to a trip...</option>
                        {itineraries.map((itinerary) => (
                          <option key={itinerary.id} value={itinerary.id}>{itinerary.title}</option>
                        ))}
                      </select>
                      <button type="button" className="button button-primary" onClick={handleAddGuidePlaceToItinerary}>Add</button>
                    </div>
                  </div>

                  {videos.length > 0 && (
                    <section className="place-block">
                      <h3>Watch</h3>
                      <div className="place-videos">
                        {videos.map((video, index) => (
                          <figure className="place-video" key={video.id || index}>
                            <video
                              src={video.url}
                              controls
                              preload="metadata"
                              playsInline
                              poster={video.poster || heroImage || undefined}
                            />
                            {video.caption && <figcaption>{video.caption}</figcaption>}
                          </figure>
                        ))}
                      </div>
                    </section>
                  )}

                  {photos.length > 0 && (
                    <section className="place-block">
                      <h3>Photos</h3>
                      <div className="place-photos">
                        {photos.map((photo, index) => (
                          <img
                            key={photo.id || index}
                            src={photo.url}
                            alt={photo.caption || place.name}
                            loading="lazy"
                            decoding="async"
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="place-block">
                    <h3>On the map</h3>
                    <TravelMap
                      markers={[buildMapMarker(place, 'place')].filter(Boolean)}
                      className="map-embed"
                      ariaLabel={'Map showing ' + place.name}
                    />
                    {place.transport_note && <p className="small-text mt-16">{place.transport_note}</p>}
                  </section>

                  <div className="place-columns">
                    <section className="place-block">
                      <h3>Nearby stays</h3>
                      <ul className="plain-list">
                        {selectedPlaceGuide.nearby.hotels.slice(0, 3).map((hotel) => (
                          <li key={hotel.id}>
                            <span>
                              <strong>{hotel.name}</strong>
                              <small>{formatMoney(hotel.cost_per_night || 0)} / night</small>
                            </span>
                            {hotel.map_info?.google_map_url && <a href={hotel.map_info.google_map_url} target="_blank" rel="noreferrer">Map</a>}
                          </li>
                        ))}
                        {selectedPlaceGuide.nearby.hotels.length === 0 && (
                          <li><span className="small-text">Nothing listed nearby yet.</span></li>
                        )}
                      </ul>
                    </section>

                    <section className="place-block">
                      <h3>Things to do</h3>
                      <ul className="plain-list">
                        {selectedPlaceGuide.nearby.activities.slice(0, 3).map((activity) => (
                          <li key={activity.id}>
                            <span>
                              <strong>{activity.name}</strong>
                              <small>{formatMoney(activity.cost || 0)}</small>
                            </span>
                            {activity.map_info?.google_map_url && <a href={activity.map_info.google_map_url} target="_blank" rel="noreferrer">Map</a>}
                          </li>
                        ))}
                        {selectedPlaceGuide.nearby.activities.length === 0 && (
                          <li><span className="small-text">Nothing listed nearby yet.</span></li>
                        )}
                      </ul>
                    </section>
                  </div>

                  <section className="place-block">
                    <h3>Traveller tips</h3>
                    {placeComments.length === 0 ? (
                      <p className="small-text">No tips yet. Be the first to share one.</p>
                    ) : (
                      <ul className="discussion-posts">
                        {placeComments.map((comment) => (
                          <li key={comment.id} className="discussion-post">
                            <span className="discussion-post-author">{comment.username}</span>
                            <p>{comment.text}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form onSubmit={handleAddPlaceComment} className="reply-box mt-16">
                      <input
                        value={newPlaceComment}
                        onChange={(event) => setNewPlaceComment(event.target.value)}
                        placeholder="Share a tip about this place"
                      />
                      <button type="submit" className="button button-secondary">Post</button>
                    </form>
                  </section>
                </article>
              );
            })()}
            </>
            )}

            {dashboardView === 'settings' && (
            <div className="grid-3 mt-24">
              <div className="panel">
                <h3>Profile preferences</h3>
                <p className="small-text">{profile?.username || 'Signed in'} · {profile?.role || 'user'}</p>
                <form onSubmit={handleUpdateProfile} className="stacked-form">
                  <label>
                    Interests
                    {renderInterestPicker(profilePreferences, setProfilePreferences)}
                  </label>
                  <button type="submit" className="button button-secondary">Save preferences</button>
                </form>
              </div>
              <div className="panel">
                <h3>Notifications</h3>
                {notifications.length === 0 ? (
                  <p>No notifications yet.</p>
                ) : (
                  <ul className="list-card">
                    {notifications.slice(0, 4).map((notification) => (
                      <li key={notification.id}>
                        <strong>{notification.type}</strong>
                        <p>{notification.message}</p>
                        <p className="small-text">{notification.read ? 'Read' : 'Unread'}</p>
                        {!notification.read && (
                          <button type="button" className="button button-secondary" onClick={() => handleMarkNotificationRead(notification.id)}>
                            Mark read
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel">
                <h3>Place autocomplete</h3>
                <form onSubmit={handleAutocomplete} className="stacked-form">
                  <label>
                    Search catalogue
                    <input
                      value={autocompleteQuery}
                      onChange={(event) => setAutocompleteQuery(event.target.value)}
                      placeholder="Douala, beach, hotel"
                    />
                  </label>
                  <button type="submit" className="button button-secondary">Suggest</button>
                </form>
                {autocompleteResults.length > 0 && (
                  <ul className="list-card mt-16">
                    {autocompleteResults.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <strong>{item.name}</strong>
                        <p>{item.type} · {item.location}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            )}

            {dashboardView === 'itineraries' && (
            <>
            <div className="tab-nav mt-24">
              <button type="button" className={itinerariesTab === 'mine' ? 'active' : ''} onClick={() => setItinerariesTab('mine')}>My trips</button>
              <button
                type="button"
                className={itinerariesTab === 'community' ? 'active' : ''}
                onClick={() => {
                  setItinerariesTab('community');
                  fetchCommunityItineraries();
                }}
              >
                Community trips
              </button>
            </div>
            {itinerariesTab === 'community' ? (
            <div className="panel">
              <h3>Public trips from the community</h3>
              <p className="small-text">Browse trips other travellers made public. Copy one to start planning your own version.</p>
              {communityItineraries.length === 0 ? (
                <p className="small-text">No public trips shared yet.</p>
              ) : (
                <ul className="list-card">
                  {communityItineraries.map((itinerary) => (
                    <li key={itinerary.id} className="itinerary-card">
                      <div className="itinerary-card-icon">
                        <MapIcon size={18} strokeWidth={2} aria-hidden="true" />
                      </div>
                      <div className="itinerary-card-info">
                        <strong>{itinerary.title}</strong>
                        <p>{itinerary.location} 
·
 by {itinerary.owner_username || itinerary.username}</p>
                      </div>
                      <button type="button" className="button button-secondary" onClick={() => handleCopyItinerary(itinerary.id)}>
                        Copy
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            ) : (
            <>
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Recent itineraries</h3>
                {loading ? (
                  <p>Loading...</p>
                ) : itineraries.length === 0 ? (
                  <p>No itineraries found yet.</p>
                ) : (
                  <ul className="list-card">
                    {itineraries.map((itinerary) => (
                      <li key={itinerary.id} className="itinerary-card">
                        <div className="itinerary-card-icon">
                          <MapIcon size={18} strokeWidth={2} aria-hidden="true" />
                        </div>
                        <div className="itinerary-card-info">
                          <strong>{itinerary.title}</strong>
                          <p>{itinerary.location}</p>
                        </div>
                        <button type="button" className="button button-secondary" onClick={() => handleSelectItinerary(itinerary)}>
                          View
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel">
                <h3>Recommended destinations</h3>
                <form onSubmit={handleFilterRecommendations} className="stacked-form compact-form">
                  <label>
                    Budget ({currencyLabel})
                    <input
                      type="number"
                      value={recommendationFilters.budget}
                      onChange={(event) => setRecommendationFilters((prev) => ({ ...prev, budget: event.target.value }))}
                      placeholder="100"
                    />
                  </label>
                  <label>
                    Location
                    <input
                      value={recommendationFilters.location}
                      onChange={(event) => setRecommendationFilters((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Douala, Kribi, Bastos"
                    />
                  </label>
                  {renderCameroonFilters(recommendationFilters, setRecommendationFilters)}
                  <button type="submit" className="button button-secondary">Filter</button>
                </form>
                {loading ? (
                  <p>Loading...</p>
                ) : recommendations.length === 0 ? (
                  <p>No recommendations available yet.</p>
                ) : (
                  <ul className="list-card">
                    {recommendations.map((item) => (
                      <li key={item.name}>
                        <strong>{item.name}</strong>
                        <p>{item.country}</p>
                        <p className="small-text">Match score: {item.match_score}</p>
                        {item.signals?.feedback_matches?.length > 0 && (
                          <p className="small-text">Feedback match: {item.signals.feedback_matches.join(', ')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel" id="create-itinerary">
                <h3>Create itinerary</h3>
                <form onSubmit={handleCreateItinerary} className="stacked-form">
                  <label>
                    Title
                    <input
                      value={newItinerary.title}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Beach Escape"
                      required
                    />
                  </label>
                  <label>
                    Location
                    <input
                      value={newItinerary.location}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Choose a region below or type a Cameroon city"
                      required
                    />
                  </label>
                  <div className="form-section">
                    <strong>Area in Cameroon</strong>
                    <p className="small-text">Choose the region first. Hotels and places will be proposed from this area.</p>
                    <div className="search-form compact-form">
                      {renderCameroonFilters(newItinerary, setNewItinerary)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => fetchItineraryAreaSuggestions(newItinerary.location, newItinerary)}
                    disabled={!newItinerary.location.trim()}
                  >
                    Propose hotels and places
                  </button>
                  {itineraryAreaSuggestions && (
                    <div className="callout">
                      <strong>Suggested for {buildCameroonLocation(newItinerary) || itineraryAreaSuggestions.location}</strong>
                      <div className="resource-columns mt-16">
                        {Object.entries(itineraryAreaSuggestions.suggestions).map(([type, items]) => (
                          <div key={type}>
                            <h4>{type}</h4>
                            {items.length === 0 ? (
                              <p className="small-text">No matches yet.</p>
                            ) : (
                              <ul className="plain-list">
                                {items.slice(0, 3).map((item) => (
                                  <li key={item.id || item.name}>
                                    <span>
                                      {item.image_url && <img className="resource-thumb" src={item.image_url} alt={item.name} loading="lazy" decoding="async" />}
                                      <strong>{item.name}</strong>
                                      {item.location && <small>{item.location}</small>}
                                      {item.cost_per_night !== undefined && <small>{formatMoney(item.cost_per_night)} / night</small>}
                                      {item.cost !== undefined && <small>{formatMoney(item.cost)}</small>}
                                    </span>
                                    <button type="button" className="link-button" onClick={() => handleUseItinerarySuggestion(type, item)}>
                                      Use
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <label>
                    Hotel name
                    <input
                      value={newItinerary.hotelName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, hotelName: event.target.value }))}
                      placeholder="Seaside Hotel"
                    />
                  </label>
                  <label>
                    Hotel cost ({currencyLabel})
                    <input
                      type="number"
                      value={newItinerary.hotelCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, hotelCost: event.target.value }))}
                      placeholder={currency === 'XAF' ? '75000' : '120'}
                    />
                  </label>
                  <label>
                    Activity name
                    <input
                      value={newItinerary.activityName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, activityName: event.target.value }))}
                      placeholder="Surf Lesson"
                    />
                  </label>
                  <label>
                    Activity cost ({currencyLabel})
                    <input
                      type="number"
                      value={newItinerary.activityCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, activityCost: event.target.value }))}
                      placeholder={currency === 'XAF' ? '30000' : '50'}
                    />
                  </label>
                  <label>
                    Place to visit
                    <input
                      value={newItinerary.placeName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, placeName: event.target.value }))}
                      placeholder="Uluwatu"
                    />
                  </label>
                  <label>
                    Place cost ({currencyLabel})
                    <input
                      type="number"
                      value={newItinerary.placeCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, placeCost: event.target.value }))}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Start date
                    <input
                      type="date"
                      value={newItinerary.startDate}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, startDate: event.target.value }))}
                    />
                  </label>
                  <label>
                    End date
                    <input
                      type="date"
                      value={newItinerary.endDate}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, endDate: event.target.value }))}
                    />
                  </label>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={newItinerary.visibility === 'public'}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, visibility: event.target.checked ? 'public' : 'private' }))}
                    />
                    Share this trip publicly so other travellers can view and copy it
                  </label>
                  <button type="submit" className="button button-primary">Create itinerary</button>
                </form>
              </div>
            </div>
            <div className="panel mt-24">
              <h3>Generate itinerary draft</h3>
              <form onSubmit={handleGenerateItinerary} className="resource-form">
                <label>
                  Location
                  <input
                    value={generateForm.location}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, location: event.target.value }))}
                    placeholder="Kribi"
                    required
                  />
                </label>
                <label>
                  Budget ({currencyLabel})
                  <input
                    type="number"
                    value={generateForm.budget}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, budget: event.target.value }))}
                    placeholder="500"
                  />
                </label>
                <label>
                  Days
                  <input
                    type="number"
                    value={generateForm.durationDays}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, durationDays: event.target.value }))}
                    min="1"
                    max="21"
                  />
                </label>
                <label>
                  Start date
                  <input
                    type="date"
                    value={generateForm.startDate}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  />
                </label>
                <button type="submit" className="button button-primary">Generate draft</button>
              </form>
              {generatedItinerary && (
                <div className="callout">
                  <strong>{generatedItinerary.title}</strong>
                  <p>{generatedItinerary.location} · {generatedItinerary.duration_days} days · {formatMoney(generatedItinerary.cost_breakdown.total_budget)}</p>
                  <p className="small-text">
                    {generatedItinerary.stages.map((stage) => stage.name).join(' · ')}
                  </p>
                  <button type="button" className="button button-secondary" onClick={handleSaveGeneratedItinerary}>
                    Save draft
                  </button>
                </div>
              )}
            </div>
            </>
            )}

            {dashboardView === 'discovery' && (
            <>
            <div className="grid-2 discovery-layout mt-24">
              <div className="panel">
                <h3>Destination search</h3>
                <div className="inline-actions wrap-actions">
                  <button
                    type="button"
                    className={nearMeActive ? 'button button-primary' : 'button button-secondary'}
                    onClick={() => {
                      if (nearMeActive) {
                        setNearMeActive(false);
                      } else if (userLocation) {
                        setNearMeActive(true);
                      } else {
                        handleUseMyLocationDiscovery();
                      }
                    }}
                    disabled={locatingUser}
                  >
                    {locatingUser ? 'Locating...' : nearMeActive ? 'Near me: on' : 'Show places near me'}
                  </button>
                  {nearMeActive && <span className="small-text">Sorted by distance from your location</span>}
                </div>
                {nearMeError && <p className="alert-text small-text">{nearMeError}</p>}
                <form onSubmit={handleDestinationSearch} className="search-form">
                  <label>
                    Search
                    <input
                      value={searchFilters.q}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, q: event.target.value }))}
                      placeholder="Douala, Kribi, beach"
                    />
                  </label>
                  <label>
                    Tag
                    <input
                      value={searchFilters.tag}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, tag: event.target.value }))}
                      placeholder="food"
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={searchFilters.category}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, category: event.target.value }))}
                    >
                      <option value="">All categories</option>
                      <option value="hotel">Hotels</option>
                      <option value="restaurant">Restaurants</option>
                      <option value="natural_site">Natural sites</option>
                      <option value="man_made_site">Man-made sites</option>
                      <option value="monument">Monuments and heritage</option>
                      <option value="museum">Museums</option>
                    </select>
                  </label>
                  {renderCameroonFilters(searchFilters, setSearchFilters)}
                  <label>
                    Max daily cost ({currencyLabel})
                    <input
                      type="number"
                      value={searchFilters.maxCost}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, maxCost: event.target.value }))}
                      placeholder={currency === 'XAF' ? '75000' : '120'}
                    />
                  </label>
                  <button type="submit" className="button button-primary">Search</button>
                </form>
                <div className="mt-16">
                  <h4>Tourism catalogue by region</h4>
                  <div className="region-chip-grid">
                    {Object.entries(getPlaceCountByRegion()).map(([region, count]) => (
                      <button
                        key={region}
                        type="button"
                        className={`region-chip ${searchFilters.region === region ? 'active' : ''}`}
                        onClick={() => updateGeoFilter(setSearchFilters, 'region', searchFilters.region === region ? '' : region)}
                      >
                        <strong>{region}</strong>
                        <span>{count} entries</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-16">
                  <h4>{searchFilters.region ? `${searchFilters.region} tourism catalogue` : 'Cameroon tourism catalogue'}</h4>
                  <p className="small-text">
                    {searchFilters.region
                      ? 'These entries are filtered to your selected Cameroon region.'
                      : 'Hotels, restaurants, natural sites, monuments, museums, and other attractions imported from open data.'}
                  </p>
                  <ul className="list-card discovery-place-list">
                    {getFeaturedDiscoveryPlaces().map((place) => (
                      <li key={place.id} className="discovery-card">
                        <div className="discovery-card-media">
                          {place.image_url ? (
                            <img src={place.image_url} alt={place.name} loading="lazy" decoding="async" />
                          ) : (
                            <div className="discovery-card-media-fallback">{(place.category || 'place').replace('_', ' ')}</div>
                          )}
                          <span className="discovery-card-badge">{(place.category || 'place').replace('_', ' ')}</span>
                          {place.distance_km !== undefined && (
                            <span className="discovery-card-distance">{place.distance_km < 1 ? '<1 km' : `${place.distance_km.toFixed(1)} km`} away</span>
                          )}
                        </div>
                        <div className="discovery-card-body">
                        <strong>{place.name}</strong>
                        <p className="small-text">{place.region || 'Cameroon'} • {place.city || place.location}</p>
                        <p className="small-text discovery-card-desc">{place.description}</p>
                        {(place.cost !== undefined || place.cost_per_night !== undefined) && (
                          <p className="small-text">
                            Estimated cost: {formatMoney(place.cost ?? place.cost_per_night)}
                            {place.category === 'hotel' ? ' / night' : ''}
                          </p>
                        )}
                        {place.difficulty && (
                          <p className="small-text">
                            Difficulty: {place.difficulty} 
·
 Guide {place.guide_required ? 'recommended' : 'optional'}
                          </p>
                        )}
                        <div className="inline-actions wrap-actions">
                          {place.category !== 'hotel' && <button type="button" className="link-button" onClick={() => handleSavePlace(place)}>Save</button>}
                          {place.category !== 'hotel' && <button type="button" className="link-button" onClick={() => handleViewPlaceGuide(place.id)}>Guide</button>}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setDashboardView('itineraries');
                              setNewItinerary((prev) => ({
                                ...prev,
                                location: buildCameroonLocation(place),
                                region: place.region || '',
                                division: place.division || '',
                                subdivision: place.subdivision || '',
                                city: place.city || '',
                                quarter: place.quarter || '',
                                placeName: place.name || '',
                                placeCost: place.cost !== undefined ? String(place.cost) : prev.placeCost,
                              }));
                            }}
                          >
                            Plan here
                          </button>
                        </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {searchResults.length > 0 && (
                  <div className="search-results">
                    <h4>Results</h4>
                    <ul className="list-card">
                      {searchResults.map((dest) => (
                        <li key={dest.name}>
                          {dest.image_url && <img className="resource-thumb" src={dest.image_url} alt={dest.name} loading="lazy" decoding="async" />}
                          <strong>{dest.name}</strong>
                          <p>{dest.region} • {dest.division} • {dest.city}</p>
                          {dest.quarter && <p className="small-text">{dest.quarter}</p>}
                          <p>{dest.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="panel">
                <h3>Explore on the map</h3>
                <div className="map-info map-panel">
                  <TravelMap
                    markers={getDiscoveryMapMarkers()}
                    className="map-embed-large"
                    ariaLabel="OpenStreetMap map of Cameroon places"
                  />
                  <p className="small-text">Pins update as you filter by region, city, subdivision, and quarter.</p>
                  <a href={OPENSTREETMAP_CAMEROON_URL} target="_blank" rel="noreferrer">Open Cameroon in OpenStreetMap</a>
                </div>
                <h4 className="mt-16">Personalised city suggestions</h4>
                {cityRecommendations.length === 0 ? (
                  <p>No city suggestions yet. Browse or save places to train your suggestions.</p>
                ) : (
                  <ul className="list-card">
                    {cityRecommendations.map((city) => (
                      <li key={city.city}>
                        {city.image_url && <img className="resource-thumb" src={city.image_url} alt={city.city} loading="lazy" decoding="async" />}
                        <strong>{city.city}</strong>
                        <p>{city.region} • {city.division}</p>
                        <p className="small-text">Match score: {city.match_score} · {city.places_count} places</p>
                        {city.signals?.preference_matches?.length > 0 && (
                          <p className="small-text">Interests: {city.signals.preference_matches.join(', ')}</p>
                        )}
                        {city.top_places?.length > 0 && (
                          <div className="inline-actions wrap-actions">
                            {city.top_places.map((place) => (
                              <button
                                key={place.id}
                                type="button"
                                className="button button-secondary"
                                onClick={() => handleSavePlace(place)}
                              >
                                Save {place.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            </>
            )}
            </>
            )}

            {dashboardView === 'community' && (
            <div className="grid-2 mt-24">
              <div className="panel" id="groups-panel">
                <h3>Groups</h3>
                <form onSubmit={handleCreateGroup} className="stacked-form">
                  <label>
                    Group name
                    <input
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      placeholder="Cameroon Travelers"
                      required
                    />
                  </label>
                  <label>
                    Description
                    <input
                      value={newGroupDescription}
                      onChange={(event) => setNewGroupDescription(event.target.value)}
                      placeholder="Share tips and meet other travellers"
                    />
                  </label>
                  <button type="submit" className="button button-primary">Create group</button>
                </form>
                {groups.length > 0 ? (
                  <ul className="list-card mt-16">
                    {groups.slice(0, 4).map((group) => (
                      <li key={group.id} className="group-card">
                        <div className="group-card-icon">
                          <Users size={18} strokeWidth={2} aria-hidden="true" />
                        </div>
                        <div className="group-card-info">
                          <strong>{group.name}</strong>
                          <p>{group.description}</p>
                        </div>
                        <div className="group-card-actions">
                          <button type="button" className="button button-secondary" onClick={() => handleJoinGroup(group.id)}>
                            Join
                          </button>
                          <button type="button" className="button button-tertiary" onClick={() => handleViewGroup(group)}>
                            View
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No groups available yet.</p>
                )}
              </div>
            </div>
            )}
            {dashboardView === 'discovery' && (
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Trip suggestions</h3>
                <form onSubmit={handleFindTripSuggestions} className="search-form">
                  <label>
                    Location
                    <input
                      value={suggestionFilters.location}
                      onChange={(event) => setSuggestionFilters((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Douala, Akwa"
                    />
                  </label>
                  {renderCameroonFilters(suggestionFilters, setSuggestionFilters)}
                  <label>
                    Budget ({currencyLabel})
                    <input
                      type="number"
                      value={suggestionFilters.budget}
                      onChange={(event) => setSuggestionFilters((prev) => ({ ...prev, budget: event.target.value }))}
                      placeholder="300"
                    />
                  </label>
                  <button type="submit" className="button button-primary">Find matches</button>
                </form>
                {tripSuggestions && (
                  <div className="resource-columns mt-16">
                    {Object.entries(tripSuggestions.suggestions).map(([type, items]) => (
                      <div key={type}>
                        <h4>{type}</h4>
                        {items.length === 0 ? (
                          <p className="small-text">No matches yet.</p>
                        ) : (
                          <ul className="plain-list">
                            {items.map((item) => (
                              <li key={item.id || item.name}>
                                <span>
                                  {item.image_url && <img className="resource-thumb" src={item.image_url} alt={item.name} loading="lazy" decoding="async" />}
                                  <strong>{item.name}</strong>
                                  {item.location && <small>{item.location}</small>}
                                  {item.cost_per_night && <small>{formatMoney(item.cost_per_night)} / night</small>}
                                  {item.cost && <small>{formatMoney(item.cost)}</small>}
                                  {item.difficulty && <small>Difficulty: {item.difficulty} · Guide {item.guide_required ? 'recommended' : 'optional'}</small>}
                                </span>
                                {item.map_info?.google_map_url && (
                                  <a href={item.map_info.google_map_url} target="_blank" rel="noreferrer" onClick={() => recordBrowsingEvent(item, 'map_open')}>Map</a>
                                )}
                                {type === 'places' && (
                                  <button type="button" className="link-button" onClick={() => handleSavePlace(item)}>Save</button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}
            {dashboardView === 'media' && (
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Shared media feed</h3>
                {media.length === 0 ? (
                  <p>No media posts yet.</p>
                ) : (
                  <ul className="list-card media-feed">
                    {media.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <strong>{item.caption || item.url}</strong>
                        <p className="small-text">
                          By {item.username} · {item.likes?.length || 0} likes · {item.comments?.length || 0} comments
                          {item.place_name ? ` · ${item.place_name}` : ''}
                          {item.city ? `, ${item.city}` : ''}
                        </p>
                        {item.type === 'photo' && <img src={item.url} alt={item.caption || 'Shared travel media'} loading="lazy" decoding="async" />}
                        <div className="inline-actions">
                          <button type="button" className="button button-secondary" onClick={() => handleLikeMedia(item.id)}>Like</button>
                        </div>
                        <div className="inline-form">
                          <input
                            value={mediaComments[item.id] || ''}
                            onChange={(event) => setMediaComments((prev) => ({ ...prev, [item.id]: event.target.value }))}
                            placeholder="Add comment"
                          />
                          <button type="button" className="button button-secondary" onClick={() => handleCommentMedia(item.id)}>Comment</button>
                        </div>
                        <div className="inline-form">
                          <input
                            value={mediaShareTargets[item.id] || ''}
                            onChange={(event) => setMediaShareTargets((prev) => ({ ...prev, [item.id]: event.target.value }))}
                            placeholder="Share with username"
                          />
                          <button type="button" className="button button-secondary" onClick={() => handleShareExistingMedia(item.id)}>Share</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel">
                <h3>Upload traveller photo</h3>
                <form onSubmit={handleShareMedia} className="stacked-form">
                  <label>
                    Photo URL
                    <input
                      value={newMediaUrl}
                      onChange={(event) => setNewMediaUrl(event.target.value)}
                      placeholder="https://example.com/photo.jpg"
                    />
                  </label>
                  <label>
                    Upload file
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(event) => setNewMediaFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  <label>
                    Caption
                    <input
                      value={newMediaCaption}
                      onChange={(event) => setNewMediaCaption(event.target.value)}
                      placeholder="Lobe Falls from the beach"
                    />
                  </label>
                  <label>
                    Place
                    <select value={newMediaPlaceId} onChange={(event) => setNewMediaPlaceId(event.target.value)}>
                      <option value="">No linked place</option>
                      {resources.places.map((place) => (
                        <option key={place.id} value={place.id}>{place.name} · {place.city || place.region}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Trip
                    <select value={newMediaItineraryId} onChange={(event) => setNewMediaItineraryId(event.target.value)}>
                      <option value="">No linked trip</option>
                      {itineraries.map((itinerary) => (
                        <option key={itinerary.id} value={itinerary.id}>{itinerary.title}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Type
                    <select value={newMediaType} onChange={(event) => setNewMediaType(event.target.value)}>
                      <option value="photo">Photo</option>
                      <option value="video">Video</option>
                    </select>
                  </label>
                  <label>
                    Group
                    <select value={mediaGroupId} onChange={(event) => setMediaGroupId(event.target.value)}>
                      <option value="">Public</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="button button-primary">Share media</button>
                </form>
              </div>
            </div>
            )}
{dashboardView === 'admin' && isAdmin && (
            <>
            <div className="tab-nav mt-24">
              <button type="button" className={adminTab === 'overview' ? 'active' : ''} onClick={() => setAdminTab('overview')}>Overview</button>
              <button type="button" className={adminTab === 'add-place' ? 'active' : ''} onClick={() => setAdminTab('add-place')}>Add a place</button>
            </div>
            {adminTab === 'overview' && (
            <>
            {adminStats && (
            <div className="stats-grid">
              <div className="stat-card">
                <Users size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{adminStats.total_users}</span>
                <span className="stat-label">Total users ({adminStats.total_admins} admin{adminStats.total_admins === 1 ? '' : 's'})</span>
              </div>
              <div className="stat-card">
                <MapIcon size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{adminStats.total_itineraries}</span>
                <span className="stat-label">Itineraries ({adminStats.public_itineraries} public)</span>
              </div>
              <div className="stat-card">
                <Compass size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{adminStats.total_places}</span>
                <span className="stat-label">Places in catalogue</span>
              </div>
              <div className="stat-card">
                <Building2 size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{adminStats.total_hotels}</span>
                <span className="stat-label">Hotels listed</span>
              </div>
              <div className="stat-card">
                <ClipboardCheck size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{adminStats.pending_place_requests}</span>
                <span className="stat-label">Pending requests (of {adminStats.total_place_requests})</span>
              </div>
              <div className="stat-card">
                <Images size={20} strokeWidth={2} aria-hidden="true" />
                <span className="stat-value">{adminStats.total_media}</span>
                <span className="stat-label">Media posts ({adminStats.total_groups} groups)</span>
              </div>
            </div>
            )}
            <div className="panel mt-24">
              <h3>Pending place requests</h3>
              {placeRequests.filter((item) => item.status === 'pending').length === 0 ? (
                <p className="small-text">No pending requests right now.</p>
              ) : (
                <ul className="list-card">
                  {placeRequests.filter((item) => item.status === 'pending').map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.name}</strong> <small>({item.type})</small>
                        <small>{item.city || item.location} · {item.region}</small>
                        {item.description && <small>{item.description}</small>}
                        <small>Submitted by {item.submitted_by}</small>
                      </span>
                      <div className="inline-actions">
                        <button type="button" className="button button-primary" onClick={() => handleReviewPlaceRequest(item.id, true)}>Approve</button>
                        <button type="button" className="button button-secondary" onClick={() => handleReviewPlaceRequest(item.id, false)}>Reject</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-16">
                <h4>Recently reviewed</h4>
                <ul className="plain-list">
                  {placeRequests.filter((item) => item.status !== 'pending').slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.status} • by {item.submitted_by}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </>
            )}
            {adminTab === 'add-place' && (
            <div className="grid-2 mt-24">
              <div className="panel">
                  <h3>Add place to visit</h3>
                  <form onSubmit={handleCreateResource} className="stacked-form">
                    <label>
                      Place name
                      <input
                        value={newResource.name}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', name: event.target.value }))}
                        placeholder="Lobe Falls"
                        required
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        value={newResource.description}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', description: event.target.value }))}
                        placeholder="Describe why travellers should visit this place."
                        rows="4"
                        required
                      />
                    </label>
                    <label>
                      Entry/activity cost ({currencyLabel})
                      <input
                        type="number"
                        value={newResource.cost}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', cost: event.target.value }))}
                        placeholder="5000"
                        required
                      />
                    </label>
                    <label>
                      Cost note
                      <input
                        value={newResource.costNote}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', costNote: event.target.value }))}
                        placeholder="Confirm guide and entry prices locally."
                      />
                    </label>
                    <label>
                      Tags
                      <input
                        value={newResource.tags}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', tags: event.target.value }))}
                        placeholder="waterfall, nature, family"
                      />
                    </label>
                    {renderCameroonFilters(newResource, setNewResource)}
                    <label>
                      Localisation / map search
                      <input
                        value={newResource.mapQuery}
                        onChange={(event) => setNewResource((prev) => ({
                          ...prev,
                          type: 'places',
                          mapQuery: event.target.value,
                          location: event.target.value || prev.location,
                        }))}
                        placeholder="Search e.g. Lobe Falls Kribi Cameroon"
                      />
                    </label>
                    <div className="inline-actions wrap-actions">
                      <label>
                        Latitude
                        <input
                          type="number"
                          step="0.000001"
                          value={newResource.latitude}
                          onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', latitude: event.target.value }))}
                          placeholder="2.940600"
                        />
                      </label>
                      <label>
                        Longitude
                        <input
                          type="number"
                          step="0.000001"
                          value={newResource.longitude}
                          onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', longitude: event.target.value }))}
                          placeholder="9.910200"
                        />
                      </label>
                    </div>
                    <label>
                      Pictures
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        onChange={(event) => setNewResourceFiles(Array.from(event.target.files || []))}
                      />
                    </label>
                    <label>
                      Image URLs
                      <textarea
                        value={newResource.imageUrls}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', imageUrls: event.target.value }))}
                        placeholder="One image URL per line"
                        rows="3"
                      />
                    </label>
                    <label>
                      Video URLs
                      <textarea
                        value={newResource.videoUrls}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', videoUrls: event.target.value }))}
                        placeholder="One video URL per line"
                        rows="3"
                      />
                    </label>
                    <label>
                      Related services
                      <textarea
                        value={newResource.relatedServices}
                        onChange={(event) => setNewResource((prev) => ({ ...prev, type: 'places', relatedServices: event.target.value }))}
                        placeholder={"local guides\ncanoe rides\nnearby hotels"}
                        rows="3"
                      />
                    </label>
                    <button type="submit" className="button button-primary">Create place</button>
                  </form>
                </div>
                <div className="panel">
                  <h3>OpenStreetMap localisation</h3>
                  <p className="small-text">Search the place name or paste coordinates, then confirm the location before creating the place.</p>
                  <AdminLeafletMapPicker
                    place={newResource}
                    onChange={(changes) => setNewResource((prev) => ({ ...prev, type: 'places', ...changes }))}
                  />
                  <div className="mt-16">
                    <h4>Recently added places</h4>
                    <ul className="plain-list">
                      {resources.places.slice(0, 6).map((place) => (
                        <li key={place.id}>
                          <span>
                            <strong>{place.name}</strong>
                            <small>{place.city || place.location} · {place.region}</small>
                          </span>
                          <button type="button" className="link-button" onClick={() => handleViewPlaceGuide(place.id)}>Preview</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                
            </div>
            )}
            </>
            )}
            {dashboardView === 'suggest' && (
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Suggest a place to visit</h3>
                <p className="small-text">Propose a hotel, activity, or place. An admin will review it before it appears in the catalogue.</p>
                <form onSubmit={handleSubmitPlaceRequest} className="stacked-form">
                  <label>
                    Type
                    <select value={requestForm.type} onChange={(event) => setRequestForm((prev) => ({ ...prev, type: event.target.value }))}>
                      <option value="places">Place</option>
                      <option value="hotels">Hotel</option>
                      <option value="activities">Activity</option>
                    </select>
                  </label>
                  <label>
                    Name
                    <input value={requestForm.name} onChange={(event) => setRequestForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Lobe Falls" required />
                  </label>
                  <label>
                    Description
                    <textarea value={requestForm.description} onChange={(event) => setRequestForm((prev) => ({ ...prev, description: event.target.value }))} rows="3" />
                  </label>
                  <label>
                    Cost ({currencyLabel})
                    <input type="number" value={requestForm.cost} onChange={(event) => setRequestForm((prev) => ({ ...prev, cost: event.target.value }))} required />
                  </label>
                  <label>
                    Cost note
                    <input value={requestForm.costNote} onChange={(event) => setRequestForm((prev) => ({ ...prev, costNote: event.target.value }))} />
                  </label>
                  <label>
                    Tags
                    <input value={requestForm.tags} onChange={(event) => setRequestForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="waterfall, nature" />
                  </label>
                  {renderCameroonFilters(requestForm, setRequestForm)}
                  <label>
                    Localisation / map search
                    <input value={requestForm.mapQuery} onChange={(event) => setRequestForm((prev) => ({ ...prev, mapQuery: event.target.value }))} placeholder="Search e.g. Lobe Falls Kribi Cameroon" />
                  </label>
                  <label>
                    Photos & videos
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={(event) => setRequestFiles(Array.from(event.target.files || []))}
                    />
                  </label>
                  {requestFiles.length > 0 && (
                    <p className="small-text">{requestFiles.length} file{requestFiles.length === 1 ? '' : 's'} selected</p>
                  )}
                  <label>
                    Image URLs (optional, if you don't have files to upload)
                    <textarea value={requestForm.imageUrls} onChange={(event) => setRequestForm((prev) => ({ ...prev, imageUrls: event.target.value }))} rows="2" placeholder="One image URL per line" />
                  </label>
                  <button type="submit" className="button button-primary">Submit suggestion</button>
                </form>
              </div>
              <div className="panel">
                <h3>My submissions</h3>
                {placeRequests.length === 0 ? (
                  <p className="small-text">You have not suggested any places yet.</p>
                ) : (
                  <ul className="plain-list">
                    {placeRequests.map((item) => (
                      <li key={item.id}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.city || item.location} · {item.region}</small>
                        </span>
                        <small className={`request-status request-status-${item.status}`}>{item.status}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            )}
            {dashboardView === 'resources' && (
            <div className="panel mt-24">
              <h3>Resource management</h3>
              <div className="tab-nav">
                <button type="button" className={resourcesTab === 'catalogue' ? 'active' : ''} onClick={() => setResourcesTab('catalogue')}>Catalogue</button>
                <button type="button" className={resourcesTab === 'hotels-compare' ? 'active' : ''} onClick={() => setResourcesTab('hotels-compare')}>Compare hotels</button>
                <button type="button" className={resourcesTab === 'reviews' ? 'active' : ''} onClick={() => setResourcesTab('reviews')}>Reviews</button>
                <button type="button" className={resourcesTab === 'admin' ? 'active' : ''} onClick={() => setResourcesTab('admin')}>Admin & waitlist</button>
              </div>
              {resourcesTab === 'catalogue' && (
              <form onSubmit={handleCreateResource} className="resource-form">
                <label>
                  Type
                  <select value={newResource.type} onChange={(event) => setNewResource((prev) => ({ ...prev, type: event.target.value }))}>
                    <option value="hotels">Hotel</option>
                    <option value="activities">Activity</option>
                    <option value="places">Place</option>
                  </select>
                </label>
                <label>
                  Name
                  <input value={newResource.name} onChange={(event) => setNewResource((prev) => ({ ...prev, name: event.target.value }))} required />
                </label>
                <label>
                  Location
                  <input value={newResource.location} onChange={(event) => setNewResource((prev) => ({ ...prev, location: event.target.value }))} placeholder="Akwa, Douala" />
                </label>
                {renderCameroonFilters(newResource, setNewResource)}
                <label>
                  Cost ({currencyLabel})
                  <input type="number" value={newResource.cost} onChange={(event) => setNewResource((prev) => ({ ...prev, cost: event.target.value }))} required />
                </label>
                <label>
                  Description
                  <input value={newResource.description} onChange={(event) => setNewResource((prev) => ({ ...prev, description: event.target.value }))} />
                </label>
                <button type="submit" className="button button-primary">Add resource</button>
              </form>
              )}
              {resourcesTab === 'hotels-compare' && (
              <div className="panel panel-nested mt-16">
                <h4>Compare hotel prices</h4>
                <form onSubmit={handleCompareHotels} className="resource-form">
                  <label>
                    Location
                    <input
                      value={hotelCompareFilters.location}
                      onChange={(event) => setHotelCompareFilters((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Kribi"
                    />
                  </label>
                  <label>
                    City
                    <input
                      value={hotelCompareFilters.city}
                      onChange={(event) => setHotelCompareFilters((prev) => ({ ...prev, city: event.target.value }))}
                      placeholder="Kribi"
                    />
                  </label>
                  <label>
                    Max price ({currencyLabel})
                    <input
                      type="number"
                      value={hotelCompareFilters.maxPrice}
                      onChange={(event) => setHotelCompareFilters((prev) => ({ ...prev, maxPrice: event.target.value }))}
                      placeholder="60000"
                    />
                  </label>
                  <button type="submit" className="button button-secondary">Compare</button>
                </form>
                {hotelComparison && (
                  <ul className="plain-list mt-16">
                    {hotelComparison.hotels.map((hotel) => (
                      <li key={hotel.id}>
                        <span>
                          <strong>#{hotel.price_rank} {hotel.name}</strong>
                          <small>{hotel.location}</small>
                          <small>{formatMoney(hotel.cost_per_night)} / night</small>
                        </span>
                        {hotel.map_info?.google_map_url && <a href={hotel.map_info.google_map_url} target="_blank" rel="noreferrer">Map</a>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              )}
              {resourcesTab === 'catalogue' && (
              <>
              <div className="compact-form mt-16">
                <label>
                  Search catalogue
                  <input value={catalogueQuery} onChange={(event) => setCatalogueQuery(event.target.value)} placeholder="Search by name or location" />
                </label>
              </div>
              <div className="resource-columns">
                {Object.entries(resources).map(([type, allItems]) => {
                  const q = catalogueQuery.trim().toLowerCase();
                  const items = q
                    ? allItems.filter((item) => (item.name || '').toLowerCase().includes(q) || (item.location || '').toLowerCase().includes(q))
                    : allItems;
                  const visibleCount = catalogueVisibleCount[type] || 20;
                  const visibleItems = items.slice(0, visibleCount);
                  return (
                  <div key={type}>
                    <h4>{type} <span className="small-text">({items.length})</span></h4>
                    {visibleItems.length === 0 ? (
                      <p className="small-text">No entries.</p>
                    ) : (
                      <ul className="plain-list">
                        {visibleItems.map((item) => (
                          <li key={item.id}>
                          {type === 'places' && editingPlaceId === item.id ? (
                            <div className="place-edit-form">
                              <label>
                                Name
                                <input value={editPlaceForm.name} onChange={(event) => setEditPlaceForm((prev) => ({ ...prev, name: event.target.value }))} />
                              </label>
                              <label>
                                Description
                                <textarea rows="2" value={editPlaceForm.description} onChange={(event) => setEditPlaceForm((prev) => ({ ...prev, description: event.target.value }))} />
                              </label>
                              <label>
                                Cost
                                <input type="number" value={editPlaceForm.cost} onChange={(event) => setEditPlaceForm((prev) => ({ ...prev, cost: event.target.value }))} />
                              </label>
                              <label>
                                Location
                                <input value={editPlaceForm.location} onChange={(event) => setEditPlaceForm((prev) => ({ ...prev, location: event.target.value }))} />
                              </label>
                              <label>
                                Latitude
                                <input value={editPlaceForm.latitude} onChange={(event) => setEditPlaceForm((prev) => ({ ...prev, latitude: event.target.value }))} />
                              </label>
                              <label>
                                Longitude
                                <input value={editPlaceForm.longitude} onChange={(event) => setEditPlaceForm((prev) => ({ ...prev, longitude: event.target.value }))} />
                              </label>
                              <div className="inline-actions">
                                <button type="button" className="button button-primary" onClick={() => handleSaveEditPlace(item.id)}>Save</button>
                                <button type="button" className="button button-secondary" onClick={cancelEditPlace}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                            <span>
                              {item.image_url && <img className="resource-thumb" src={item.image_url} alt={item.name} loading="lazy" decoding="async" />}
                              <strong>{item.name}</strong>
                              {item.location && <small>{item.location}</small>}
                              {item.id && <small>ID: {item.id}</small>}
                              {item.cost_per_night && <small>{formatMoney(item.cost_per_night)} / night</small>}
                              {item.cost !== undefined && <small>{formatMoney(item.cost)}</small>}
                              {item.related_services?.length > 0 && <small>{item.related_services.join(' • ')}</small>}
                            </span>
                            {item.map_info?.google_map_url && <a href={item.map_info.google_map_url} target="_blank" rel="noreferrer" onClick={() => type === 'places' && recordBrowsingEvent(item, 'map_open')}>Map</a>}
                            {type === 'places' && (
                              <>
                                <button type="button" className="link-button" onClick={() => handleSavePlace(item)}>Save</button>
                                <button type="button" className="link-button" onClick={() => handleViewPlaceGuide(item.id)}>Guide</button>
                                <button type="button" className="link-button" onClick={() => startEditPlace(item)}>Edit</button>
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => {
                                    setNewMediaPlaceId(item.id);
                                    setDashboardView('media');
                                  }}
                                >
                                  Add photo
                                </button>
                              </>
                            )}
                            <button type="button" className="link-button" onClick={() => handleDeleteResource(type, item.id)}>Remove</button>
                            </>
                          )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {items.length > visibleItems.length && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setCatalogueVisibleCount((prev) => ({ ...prev, [type]: (prev[type] || 20) + 20 }))}
                      >
                        Show more ({items.length - visibleItems.length} remaining)
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
              </>
              )}
              {resourcesTab === 'reviews' && (
              <form onSubmit={handleAddResourceReview} className="resource-form mt-16">
                <label>
                  Review type
                  <select value={resourceReview.type} onChange={(event) => setResourceReview((prev) => ({ ...prev, type: event.target.value }))}>
                    <option value="hotels">Hotel</option>
                    <option value="activities">Activity</option>
                    <option value="places">Place</option>
                  </select>
                </label>
                <label>
                  Resource ID
                  <input value={resourceReview.id} onChange={(event) => setResourceReview((prev) => ({ ...prev, id: event.target.value }))} placeholder="hotel id" />
                </label>
                <label>
                  Rating
                  <select value={resourceReview.rating} onChange={(event) => setResourceReview((prev) => ({ ...prev, rating: event.target.value }))}>
                    <option value="5">5</option>
                    <option value="4">4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
                  </select>
                </label>
                <label>
                  Comment
                  <input value={resourceReview.comment} onChange={(event) => setResourceReview((prev) => ({ ...prev, comment: event.target.value }))} />
                </label>
                <button type="submit" className="button button-secondary">Add review</button>
              </form>
              )}
              {resourcesTab === 'admin' && (
              <>
              {adminUsers.length > 0 && (
                <div className="mt-16">
                  <h4>Admin users</h4>
                  <ul className="plain-list">
                    {adminUsers.map((user) => (
                      <li key={user.username}>
                        <span>{user.username} · {user.role}</span>
                        <select value={user.role} onChange={(event) => handleUpdateUserRole(user.username, event.target.value)}>
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-16">
                <h4>Saved places waitlist</h4>
                {savedPlaces.length === 0 ? (
                  <p className="small-text">No saved places yet.</p>
                ) : (
                  <ul className="plain-list">
                    {savedPlaces.map((place) => (
                      <li key={place.place_id}>
                        <span>
                          <strong>{place.name}</strong>
                          <small>{place.city || place.location} · {place.region}</small>
                          {place.cost !== undefined && <small>{formatMoney(place.cost)}</small>}
                        </span>
                        {place.map_info?.google_map_url && <a href={place.map_info.google_map_url} target="_blank" rel="noreferrer">Map</a>}
                        <button type="button" className="link-button" onClick={() => handleRemoveSavedPlace(place.place_id)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              </>
              )}
            </div>
            )}
              </div>
            </div>
          </section>
        )}

        {page === 'dashboard' && !token && (
          <div className="form-card">
            <h2>Please log in to view your dashboard.</h2>
          </div>
        )}

        {(page === 'itinerary' && selectedItinerary) || (page === 'group' && selectedGroup) ? (
          <section className="dashboard-section">
            <div className="panel panel-primary">
              <button type="button" className="link-button" onClick={() => setPage('dashboard')}>
                ← Back to dashboard
              </button>
              {page === 'itinerary' && selectedItinerary && (
                <>
                  <h2>{selectedItinerary.title}</h2>
                  <p>{selectedItinerary.location}</p>
                  <p>{selectedItinerary.notes}</p>
                </>
              )}
              {page === 'group' && selectedGroup && (
                <>
                  <h2>{selectedGroup.name}</h2>
                  <p>{selectedGroup.description}</p>
                  <p>
                    <strong>Members:</strong> {selectedGroup.members?.join(', ') || 'None'}
                  </p>
                </>
              )}
            </div>

            {page === 'itinerary' && selectedItinerary && (
              <>
                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Trip details</h3>
                    <p><strong>Owner:</strong> {selectedItinerary.username}</p>
                    <p><strong>Participants:</strong> {selectedItinerary.participants?.join(', ') || 'None'}</p>
                    <p><strong>Shared with:</strong> {selectedItinerary.shared_with?.join(', ') || 'Nobody yet'}</p>
                    <p><strong>Total budget:</strong> {formatMoney(selectedItinerary.cost_breakdown?.total_budget || 0)}</p>
                    <p><strong>Duration:</strong> {selectedItinerary.duration_days || 0} days · {selectedItinerary.duration_hours || 0} hours</p>
                    <p><strong>Progress:</strong> {selectedItinerary.progress?.progress_percent || 0}% · {selectedItinerary.progress?.status || 'not started'}</p>
                    <p><strong>Hotel:</strong> {selectedItinerary.hotel?.name || 'None'}</p>
                    <p><strong>Activities:</strong></p>
                    <ul>
                      {(selectedItinerary.activities || []).map((activity) => (
                        <li key={activity.name}>{activity.name} - {formatMoney(activity.cost)}</li>
                      ))}
                    </ul>
                    <p><strong>Places to visit:</strong></p>
                    <ul>
                      {(selectedItinerary.places_to_visit || []).map((place) => (
                        <li key={place.name}>{place.name} - {formatMoney(place.cost)}</li>
                      ))}
                    </ul>
                    {selectedItinerary.event_listing?.for_sale && (
                      <div className="callout">
                        <strong>Event tickets</strong>
                        <p>{formatMoney(selectedItinerary.event_listing.price_per_ticket)} per ticket · {selectedItinerary.event_listing.seats_available ?? 'Unlimited'} seats left</p>
                      </div>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Payment receipt</h3>
                    {selectedItinerary.receipts?.length > 0 ? (
                      <ul className="list-card">
                        {selectedItinerary.receipts.map((receipt) => (
                          <li key={receipt.id}>
                            <strong>{receipt.note || receipt.target_type}</strong>
                            <p>Amount: {formatMoney(receipt.amount)}</p>
                            <p>Commission: {formatMoney(receipt.commission_amount)}</p>
                            <p>Net: {formatMoney(receipt.net_amount)}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No payments recorded yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Booking confirmation</h3>
                    <form onSubmit={handleCreateReservation} className="stacked-form">
                      <label>
                        Type
                        <select value={reservationForm.type} onChange={(event) => setReservationForm((prev) => ({ ...prev, type: event.target.value }))}>
                          <option value="hotel">Hotel</option>
                          <option value="activity">Activity</option>
                          <option value="place">Place</option>
                          <option value="transport">Transport</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label>
                        Trip stage
                        <select
                          value={reservationForm.stageId}
                          onChange={(event) => {
                            const stage = selectedItinerary.stages?.find((item) => item.id === event.target.value);
                            setReservationForm((prev) => ({
                              ...prev,
                              stageId: event.target.value,
                              itemName: stage?.name || prev.itemName,
                              amount: stage?.cost !== undefined ? String(stage.cost) : prev.amount,
                              type: stage?.type || prev.type,
                            }));
                          }}
                        >
                          <option value="">Manual booking</option>
                          {(selectedItinerary.stages || []).map((stage) => (
                            <option key={stage.id} value={stage.id}>{stage.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Name
                        <input value={reservationForm.itemName} onChange={(event) => setReservationForm((prev) => ({ ...prev, itemName: event.target.value }))} required />
                      </label>
                      <label>
                        Provider
                        <input value={reservationForm.provider} onChange={(event) => setReservationForm((prev) => ({ ...prev, provider: event.target.value }))} placeholder="Hotel, guide, agency" />
                      </label>
                      <label>
                        Amount ({currencyLabel})
                        <input type="number" value={reservationForm.amount} onChange={(event) => setReservationForm((prev) => ({ ...prev, amount: event.target.value }))} required />
                      </label>
                      <label>
                        Quantity
                        <input type="number" min="1" value={reservationForm.quantity} onChange={(event) => setReservationForm((prev) => ({ ...prev, quantity: event.target.value }))} />
                      </label>
                      <label>
                        Notes
                        <input value={reservationForm.notes} onChange={(event) => setReservationForm((prev) => ({ ...prev, notes: event.target.value }))} />
                      </label>
                      <button type="submit" className="button button-primary">Confirm booking</button>
                    </form>
                  </div>
                  <div className="panel">
                    <h3>Reserved places</h3>
                    {selectedItinerary.reservations?.length > 0 ? (
                      <ul className="list-card">
                        {selectedItinerary.reservations.map((reservation) => (
                          <li key={reservation.id}>
                            <strong>{reservation.item_name}</strong>
                            <p>{reservation.type} · {reservation.status} · {formatMoney(reservation.amount)}</p>
                            <p className="small-text">{reservation.confirmation_code} · Receipt {reservation.receipt_id}</p>
                            <div className="inline-actions">
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => handleModifyReservation(reservation.id, { quantity: Number(reservation.quantity || 1) + 1 })}
                                disabled={reservation.status === 'cancelled'}
                              >
                                Add one
                              </button>
                              <button
                                type="button"
                                className="button button-tertiary"
                                onClick={() => handleCancelReservation(reservation.id)}
                                disabled={reservation.status === 'cancelled'}
                              >
                                Cancel
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No reservations confirmed yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Trip stages</h3>
                    {getItineraryMapMarkers().length > 0 && (
                      <TravelMap
                        markers={getItineraryMapMarkers()}
                        className="map-embed-large"
                        ariaLabel="OpenStreetMap map of itinerary stages"
                      />
                    )}
                    {selectedItinerary.stages?.length > 0 ? (
                      <ul className="list-card">
                        {selectedItinerary.stages.map((stage) => (
                          <li key={stage.id}>
                            <strong>{stage.name}</strong>
                            <p>{stage.type} · {stage.duration_hours} hours · {formatMoney(stage.cost)}</p>
                            <p className="small-text">{stage.id} · {stage.status}</p>
                            {stage.map_info?.google_map_url && (
                              <a href={stage.map_info.google_map_url} target="_blank" rel="noreferrer">Open map</a>
                            )}
                            {(stage.checklist || []).map((item) => (
                              <label key={item.id} className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  onChange={() => handleToggleChecklistItem(stage.id, item)}
                                />
                                {item.text}
                              </label>
                            ))}
                            <div className="inline-form">
                              <input
                                value={checklistText[stage.id] || ''}
                                onChange={(event) => setChecklistText((prev) => ({ ...prev, [stage.id]: event.target.value }))}
                                placeholder="Checklist item"
                              />
                              <button type="button" className="button button-secondary" onClick={() => handleAddChecklistItem(stage.id)}>Add</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No stages calculated yet.</p>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Trip progress</h3>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${selectedItinerary.progress?.progress_percent || 0}%` }} />
                    </div>
                    <p className="small-text">{Math.round(selectedItinerary.progress?.progress_percent || 0)}% complete</p>
                    {(selectedItinerary.stages || []).length > 0 && (
                      <ul className="stage-checklist">
                        {(selectedItinerary.stages || []).map((stage) => (
                          <li key={stage.id}>
                            <label className="inline-check">
                              <input
                                type="checkbox"
                                checked={stage.status === 'completed'}
                                onChange={(event) => handleToggleStageComplete(stage.id, event.target.checked)}
                              />
                              {stage.name}
                              {stage.status === 'active' && <span className="stage-active-badge">current</span>}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form onSubmit={handleUpdateProgress} className="stacked-form mt-16">
                      <label>
                        Status
                        <select value={progressForm.status} onChange={(event) => setProgressForm((prev) => ({ ...prev, status: event.target.value }))}>
                          <option value="not_started">Not started</option>
                          <option value="in_progress">In progress</option>
                          <option value="completed">Completed</option>
                          <option value="delayed">Delayed</option>
                        </select>
                      </label>
                      <label>
                        Current stage
                        <select value={progressForm.currentStageId} onChange={(event) => setProgressForm((prev) => ({ ...prev, currentStageId: event.target.value }))}>
                          <option value="">Auto</option>
                          {(selectedItinerary.stages || []).map((stage) => (
                            <option key={stage.id} value={stage.id}>{stage.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Current location
                        <input
                          value={progressForm.currentLocation}
                          onChange={(event) => setProgressForm((prev) => ({ ...prev, currentLocation: event.target.value }))}
                          placeholder="Airport"
                        />
                      </label>
                      <label>
                        Percent
                        <input
                          type="number"
                          value={progressForm.progressPercent}
                          onChange={(event) => setProgressForm((prev) => ({ ...prev, progressPercent: event.target.value }))}
                          min="0"
                          max="100"
                        />
                      </label>
                      <button type="submit" className="button button-primary">Update progress</button>
                    </form>
                  </div>
                </div>

                <div className="grid-3 mt-24">
                  <div className="panel">
                    <h3>Share itinerary</h3>
                    <form onSubmit={handleShareItinerary} className="stacked-form">
                      <label>
                        Username
                        <input
                          value={shareUsername}
                          onChange={(event) => setShareUsername(event.target.value)}
                          placeholder="bob"
                          required
                        />
                      </label>
                      <label>
                        Permission
                        <select value={sharePermission} onChange={(event) => setSharePermission(event.target.value)}>
                          <option value="view">View only</option>
                          <option value="edit">Can edit</option>
                        </select>
                      </label>
                      <button type="submit" className="button button-primary">Share</button>
                    </form>
                  </div>
                  <div className="panel">
                    <h3>Join itinerary</h3>
                    <form onSubmit={handleJoinItinerary} className="stacked-form">
                      <label>
                        Optional payment ({currencyLabel})
                        <input
                          type="number"
                          value={joinPaymentAmount}
                          onChange={(event) => setJoinPaymentAmount(event.target.value)}
                          placeholder="75"
                        />
                      </label>
                      <button type="submit" className="button button-primary">Join trip</button>
                    </form>
                  </div>
                  <div className="panel">
                    <h3>Map metadata</h3>
                    <button type="button" className="button button-secondary" onClick={handleLoadMapInfo}>Load map</button>
                    <div className="map-links mt-16">
                      <button type="button" className="button button-primary" onClick={handleStartLiveTracking}>Start live map</button>
                      <button type="button" className="button button-secondary" onClick={handleStopLiveTracking}>Stop</button>
                    </div>
                    <LiveLocationMap
                      apiKey={effectiveGoogleMapsApiKey}
                      position={liveLocationPosition}
                      status={liveLocationStatus}
                      error={liveLocationError}
                    />
                    <form onSubmit={handleUpdateTracking} className="stacked-form mt-16">
                      <label>
                        Latitude
                        <input
                          type="number"
                          step="0.000001"
                          value={trackingForm.latitude}
                          onChange={(event) => setTrackingForm((prev) => ({ ...prev, latitude: event.target.value }))}
                          placeholder="4.051100"
                        />
                      </label>
                      <label>
                        Longitude
                        <input
                          type="number"
                          step="0.000001"
                          value={trackingForm.longitude}
                          onChange={(event) => setTrackingForm((prev) => ({ ...prev, longitude: event.target.value }))}
                          placeholder="9.767900"
                        />
                      </label>
                      <label>
                        Current location
                        <input
                          value={trackingForm.currentLocation}
                          onChange={(event) => setTrackingForm((prev) => ({ ...prev, currentLocation: event.target.value }))}
                          placeholder="Akwa, Douala"
                        />
                      </label>
                      <button type="submit" className="button button-primary">Update live tracking</button>
                    </form>
                    {(trackingInfo || selectedItinerary.live_tracking) && (
                      <div className="map-info mt-16">
                        <p><strong>Live position:</strong> {(trackingInfo || selectedItinerary.live_tracking).current_location}</p>
                        <p>{(trackingInfo || selectedItinerary.live_tracking).latitude}, {(trackingInfo || selectedItinerary.live_tracking).longitude}</p>
                        {(trackingInfo || selectedItinerary.live_tracking).google_map_url && (
                          <a href={(trackingInfo || selectedItinerary.live_tracking).google_map_url} target="_blank" rel="noreferrer">Open live point</a>
                        )}
                        {getTrackingPosition() && (
                          <TravelMap
                            selectedPosition={getTrackingPosition()}
                            center={getTrackingPosition()}
                            zoom={13}
                            ariaLabel="OpenStreetMap live trip tracking map"
                          />
                        )}
                      </div>
                    )}
                    {mapInfo && (
                      <div className="map-info">
                        <p><strong>Location:</strong> {mapInfo.location}</p>
                        <p><strong>Provider:</strong> OpenStreetMap · {mapInfo.country_focus}</p>
                        {mapInfo.map_info?.google_map_url && (
                          <a href={mapInfo.map_info.google_map_url} target="_blank" rel="noreferrer">Open in Google Maps</a>
                        )}
                        {mapInfo.map_info?.google_maps_directions_url && (
                          <a href={mapInfo.map_info.google_maps_directions_url} target="_blank" rel="noreferrer">Directions</a>
                        )}
                        {getMapInfoPosition() && (
                          <TravelMap
                            selectedPosition={getMapInfoPosition()}
                            center={getMapInfoPosition()}
                            zoom={12}
                            ariaLabel={`OpenStreetMap map for ${mapInfo.location}`}
                          />
                        )}
                        {mapInfo.map_info?.latitude && (
                          <p>{mapInfo.map_info.latitude}, {mapInfo.map_info.longitude}</p>
                        )}
                        {mapInfo.map_info?.cameroon_searches && (
                          <div className="map-links">
                            {Object.entries(mapInfo.map_info.cameroon_searches).map(([label, url]) => (
                              <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid-3 mt-24">
                  <div className="panel">
                    <h3>Invite link</h3>
                    <form onSubmit={handleCreateInvite} className="stacked-form">
                      <label>
                        Permission
                        <select value={inviteForm.permission} onChange={(event) => setInviteForm((prev) => ({ ...prev, permission: event.target.value }))}>
                          <option value="view">View only</option>
                          <option value="edit">Can edit</option>
                        </select>
                      </label>
                      <label>
                        Uses
                        <input type="number" min="1" value={inviteForm.maxUses} onChange={(event) => setInviteForm((prev) => ({ ...prev, maxUses: event.target.value }))} />
                      </label>
                      <button type="submit" className="button button-primary">Create invite</button>
                    </form>
                    {inviteResult && (
                      <p className="small-text">Token: {inviteResult.invite.token}</p>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Budget and exports</h3>
                    <div className="inline-actions">
                      <button type="button" className="button button-secondary" onClick={handleLoadBudget}>Load budget</button>
                      <button type="button" className="button button-secondary" onClick={() => handleDownloadItineraryFile('ics')}>Calendar</button>
                      <button type="button" className="button button-secondary" onClick={() => handleDownloadItineraryFile('pdf')}>PDF</button>
                    </div>
                    {budgetInfo && (
                      <div className="map-info">
                        <p><strong>Planned:</strong> {formatMoney(budgetInfo.planned_total)}</p>
                        <p><strong>Paid:</strong> {formatMoney(budgetInfo.paid_total)}</p>
                        <p><strong>Remaining:</strong> {formatMoney(budgetInfo.remaining_total)}</p>
                      </div>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Audit log</h3>
                    <button type="button" className="button button-secondary" onClick={handleLoadAudit}>Load audit</button>
                    {auditEntries.length > 0 && (
                      <ul className="list-card mt-16">
                        {auditEntries.slice(0, 5).map((entry) => (
                          <li key={entry.id}>
                            <strong>{entry.action}</strong>
                            <p className="small-text">{entry.username} · {entry.created_at}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Day plan and route</h3>
                    <div className="inline-actions">
                      <button type="button" className="button button-secondary" onClick={handleLoadDayPlans}>Load day plan</button>
                      <button type="button" className="button button-secondary" onClick={handleOptimizeRoute}>Optimize route</button>
                    </div>
                    {(selectedItinerary.day_plans || []).length > 0 ? (
                      <ul className="list-card mt-16">
                        {selectedItinerary.day_plans.map((day) => (
                          <li key={day.id}>
                            <strong>{day.title}</strong>
                            <p className="small-text">{day.date || `Day ${day.day}`}</p>
                            <p>{day.notes}</p>
                            <p className="small-text">Stages: {day.stage_ids?.join(', ') || 'None'}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="small-text">Load the day plan to organize stages by travel day.</p>
                    )}
                    {(routePlan || selectedItinerary.route_plan)?.google_maps_directions_url && (
                      <div className="map-info mt-16">
                        <p><strong>Stops:</strong> {(routePlan || selectedItinerary.route_plan).estimated_stop_count}</p>
                        <a href={(routePlan || selectedItinerary.route_plan).google_maps_directions_url} target="_blank" rel="noreferrer">Open optimized route in Google Maps</a>
                      </div>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Packing list</h3>
                    <form onSubmit={handleAddPackingItem} className="stacked-form compact-form">
                      <label>
                        Category
                        <input value={packingForm.category} onChange={(event) => setPackingForm((prev) => ({ ...prev, category: event.target.value }))} />
                      </label>
                      <label>
                        Item
                        <input value={packingForm.text} onChange={(event) => setPackingForm((prev) => ({ ...prev, text: event.target.value }))} placeholder="Mosquito repellent" />
                      </label>
                      <label>
                        Assigned to
                        <input value={packingForm.assignedTo} onChange={(event) => setPackingForm((prev) => ({ ...prev, assignedTo: event.target.value }))} placeholder="alice" />
                      </label>
                      <button type="submit" className="button button-secondary">Add packing item</button>
                    </form>
                    {(selectedItinerary.packing_list || []).length > 0 ? (
                      <ul className="plain-list">
                        {selectedItinerary.packing_list.map((item) => (
                          <li key={item.id}>
                            <span>
                              <strong>{item.text}</strong>
                              <small>{item.category}{item.assigned_to ? ` · ${item.assigned_to}` : ''}</small>
                            </span>
                            <label className="inline-check">
                              <input type="checkbox" checked={item.packed} onChange={() => handleTogglePackingItem(item)} />
                              Packed
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="small-text">Packing suggestions will appear here.</p>
                    )}
                  </div>
                </div>

                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Expense splitting</h3>
                    <form onSubmit={handleAddExpense} className="stacked-form compact-form">
                      <label>
                        Title
                        <input value={expenseForm.title} onChange={(event) => setExpenseForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Guide fee" />
                      </label>
                      <label>
                        Amount ({currencyLabel})
                        <input type="number" value={expenseForm.amount} onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))} />
                      </label>
                      <label>
                        Paid by
                        <input value={expenseForm.paidBy} onChange={(event) => setExpenseForm((prev) => ({ ...prev, paidBy: event.target.value }))} placeholder="alice" />
                      </label>
                      <label>
                        Split with
                        <input value={expenseForm.splitWith} onChange={(event) => setExpenseForm((prev) => ({ ...prev, splitWith: event.target.value }))} placeholder="alice, bob" />
                      </label>
                      <button type="submit" className="button button-secondary">Add expense</button>
                    </form>
                    {(selectedItinerary.expenses || []).length > 0 ? (
                      <ul className="list-card">
                        {selectedItinerary.expenses.map((expense) => (
                          <li key={expense.id}>
                            <strong>{expense.title}</strong>
                            <p>{formatMoney(expense.amount)} · paid by {expense.paid_by}</p>
                            <p className="small-text">Split: {expense.split_with?.join(', ') || 'All participants'}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="small-text">No shared expenses yet.</p>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Trip documents</h3>
                    <form onSubmit={handleAttachDocument} className="stacked-form compact-form">
                      <label>
                        Title
                        <input value={documentForm.title} onChange={(event) => setDocumentForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Hotel confirmation" />
                      </label>
                      <label>
                        Type
                        <select value={documentForm.type} onChange={(event) => setDocumentForm((prev) => ({ ...prev, type: event.target.value }))}>
                          <option value="confirmation">Confirmation</option>
                          <option value="receipt">Receipt</option>
                          <option value="ticket">Ticket</option>
                          <option value="document">Document</option>
                        </select>
                      </label>
                      <label>
                        URL
                        <input value={documentForm.url} onChange={(event) => setDocumentForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="https://example.com/booking.pdf" />
                      </label>
                      <button type="submit" className="button button-secondary">Attach document</button>
                    </form>
                    {(selectedItinerary.documents || []).length > 0 ? (
                      <ul className="plain-list">
                        {selectedItinerary.documents.map((document) => (
                          <li key={document.id}>
                            <span>
                              <strong>{document.title}</strong>
                              <small>{document.type} · {document.uploaded_by}</small>
                            </span>
                            <a href={document.url} target="_blank" rel="noreferrer">Open</a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="small-text">Attach receipts, tickets, and hotel confirmations.</p>
                    )}
                  </div>
                </div>

                <div className="panel mt-24">
                  <h3>Make a payment</h3>
                  <form onSubmit={handlePayItinerary} className="stacked-form">
                    <label>
                      Amount ({currencyLabel})
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                        placeholder="150"
                        required
                      />
                    </label>
                    <label>
                      Payment method
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                        <option value="mobile">Mobile</option>
                        <option value="card">Card</option>
                      </select>
                    </label>
                    <label>
                      Target type
                      <select value={paymentTargetType} onChange={(event) => setPaymentTargetType(event.target.value)}>
                        <option value="total">Total</option>
                        <option value="share">Share</option>
                        <option value="event_ticket">Event ticket</option>
                      </select>
                    </label>
                    <button type="submit" className="button button-primary">Submit payment</button>
                  </form>
                </div>
                <div className="panel mt-24">
                  <h3>Trip feedback</h3>
                  <form onSubmit={handleSubmitFeedback} className="resource-form">
                    <label>
                      Rating
                      <select value={feedbackForm.rating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, rating: event.target.value }))}>
                        <option value="5">5</option>
                        <option value="4">4</option>
                        <option value="3">3</option>
                        <option value="2">2</option>
                        <option value="1">1</option>
                      </select>
                    </label>
                    <label>
                      Tags
                      <input
                        value={feedbackForm.tags}
                        onChange={(event) => setFeedbackForm((prev) => ({ ...prev, tags: event.target.value }))}
                        placeholder="beach, food"
                      />
                    </label>
                    <label>
                      Comment
                      <input
                        value={feedbackForm.comment}
                        onChange={(event) => setFeedbackForm((prev) => ({ ...prev, comment: event.target.value }))}
                        placeholder="What worked well?"
                      />
                    </label>
                    <button type="submit" className="button button-primary">Save feedback</button>
                  </form>
                  {selectedItinerary.feedback?.length > 0 && (
                    <ul className="list-card mt-16">
                      {selectedItinerary.feedback.map((feedback) => (
                        <li key={feedback.id}>
                          <strong>{feedback.rating}/5 by {feedback.username}</strong>
                          <p>{feedback.comment}</p>
                          <p className="small-text">{feedback.tags?.join(', ')}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <h4 className="mt-16">Trip stories</h4>
                  {media.filter((item) => item.itinerary_id === selectedItinerary.id).length === 0 ? (
                    <p className="small-text">No photos or videos shared for this trip yet.</p>
                  ) : (
                    <div className="media-feed">
                      {media.filter((item) => item.itinerary_id === selectedItinerary.id).map((item) => (
                        <div key={item.id}>
                          {item.type === 'video' ? (
                            <video src={item.url} controls preload="metadata" />
                          ) : (
                            <img src={item.url} alt={item.caption || 'Trip photo'} loading="lazy" decoding="async" />
                          )}
                          <p className="small-text">{item.caption} 
—
 by {item.username}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {page === 'group' && selectedGroup && (
              <>
                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Group discussions</h3>
                    <form onSubmit={handleCreateDiscussion} className="stacked-form compact-form">
                      <label>
                        New topic
                        <input
                          value={newDiscussionTitle}
                          onChange={(event) => setNewDiscussionTitle(event.target.value)}
                          placeholder="Best local guides"
                        />
                      </label>
                      <label>
                        Message
                        <input
                          value={newDiscussionMessage}
                          onChange={(event) => setNewDiscussionMessage(event.target.value)}
                          placeholder="Share a question or tip"
                        />
                      </label>
                      <button type="submit" className="button button-primary">Start discussion</button>
                    </form>
                    {media.filter((item) => item.group_id === selectedGroup.id && item.itinerary_id).length > 0 && (
                      <div className="mt-16">
                        <h4>Trip stories</h4>
                        <div className="media-feed">
                          {media.filter((item) => item.group_id === selectedGroup.id && item.itinerary_id).map((item) => (
                            <div key={item.id}>
                              {item.type === 'video' ? (
                                <video src={item.url} controls preload="metadata" />
                              ) : (
                                <img src={item.url} alt={item.caption || 'Trip story'} loading="lazy" decoding="async" />
                              )}
                              <p className="small-text">{item.caption} 
—
 by {item.username}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedGroup.discussions?.length > 0 ? (
                      <ul className="list-card discussion-thread-list">
                        {selectedGroup.discussions.map((discussion) => (
                          <li key={discussion.id} className="discussion-thread">
                            <strong>{discussion.title}</strong>
                            <div className="discussion-meta">
                              <span>{discussion.posts.length} post{discussion.posts.length === 1 ? '' : 's'}</span>
                              <span>Started by {discussion.created_by}</span>
                            </div>
                            <ul className="discussion-posts">
                              {discussion.posts.map((post, index) => (
                                <li key={post.id || index} className="discussion-post">
                                  <span className="discussion-post-author">{post.username || post.author || discussion.created_by}</span>
                                  <p>{post.message}</p>
                                </li>
                              ))}
                            </ul>
                            <div className="reply-box">
                              <input
                                type="text"
                                value={discussionReplies[discussion.id] || ''}
                                onChange={(event) => setDiscussionReplies((prev) => ({ ...prev, [discussion.id]: event.target.value }))}
                                placeholder="Write a reply"
                              />
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => handleReplyToDiscussion(selectedGroup.id, discussion.id, discussionReplies[discussion.id] || '')}
                              >
                                Reply
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No discussions yet. Start the conversation below.</p>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Share media with this group</h3>
                    <form onSubmit={handleShareMedia} className="stacked-form">
                      <label>
                        Media URL
                        <input
                          value={newMediaUrl}
                          onChange={(event) => setNewMediaUrl(event.target.value)}
                          placeholder="https://example.com/photo.jpg"
                        />
                      </label>
                      <label>
                        Upload file
                        <input
                          type="file"
                          accept="image/*,video/*"
                          onChange={(event) => setNewMediaFile(event.target.files?.[0] || null)}
                        />
                      </label>
                      <label>
                        Caption
                        <input
                          value={newMediaCaption}
                          onChange={(event) => setNewMediaCaption(event.target.value)}
                          placeholder="Sunset at the beach"
                        />
                      </label>
                      <label>
                        Type
                        <select value={newMediaType} onChange={(event) => setNewMediaType(event.target.value)}>
                          <option value="photo">Photo</option>
                          <option value="video">Video</option>
                        </select>
                      </label>
                      <label>
                        Group
                        <select value={mediaGroupId} onChange={(event) => setMediaGroupId(event.target.value)}>
                          <option value="">Public</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>{group.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Place
                        <select value={newMediaPlaceId} onChange={(event) => setNewMediaPlaceId(event.target.value)}>
                          <option value="">No linked place</option>
                          {resources.places.map((place) => (
                            <option key={place.id} value={place.id}>{place.name} · {place.city || place.region}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Trip
                        <select value={newMediaItineraryId} onChange={(event) => setNewMediaItineraryId(event.target.value)}>
                          <option value="">No linked trip</option>
                          {itineraries.map((itinerary) => (
                            <option key={itinerary.id} value={itinerary.id}>{itinerary.title}</option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="button button-primary">Share media</button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;


