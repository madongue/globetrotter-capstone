import { useEffect, useRef, useState } from 'react';

const API_BASE = '/api';
const DEFAULT_CURRENCY = 'XAF';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const CAMEROON_MAP_EMBED = 'https://www.google.com/maps?q=Cameroon&output=embed';
const CAMEROON_MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Cameroon';
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

let googleMapsLoadPromise;

function loadGoogleMaps(apiKey) {
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key is missing.'));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }
  if (!googleMapsLoadPromise) {
    googleMapsLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-globetrotter-google-maps]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google));
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
      script.async = true;
      script.defer = true;
      script.dataset.globetrotterGoogleMaps = 'true';
      script.onload = () => resolve(window.google);
      script.onerror = () => reject(new Error('Unable to load Google Maps.'));
      document.head.appendChild(script);
    });
  }
  return googleMapsLoadPromise;
}

const GOOGLE_IDENTITY_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
let googleIdentityLoadPromise;

function loadGoogleIdentity() {
  if (!GOOGLE_IDENTITY_CLIENT_ID) {
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

function GoogleSignInButton({ onSuccess, onError }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_IDENTITY_CLIENT_ID || !buttonRef.current) {
      return undefined;
    }
    let cancelled = false;
    loadGoogleIdentity()
      .then((accounts) => {
        if (cancelled || !buttonRef.current) {
          return;
        }
        accounts.initialize({
          client_id: GOOGLE_IDENTITY_CLIENT_ID,
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

function AdminGoogleMapPicker({ place, onChange }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const [mapStatus, setMapStatus] = useState(GOOGLE_MAPS_API_KEY ? 'loading' : 'fallback');
  const [searchText, setSearchText] = useState(place.mapQuery || place.location || 'Cameroon');

  const fallbackQuery = place.latitude && place.longitude
    ? `${place.latitude},${place.longitude}`
    : (place.mapQuery || place.location || 'Cameroon');

  useEffect(() => {
    setSearchText(place.mapQuery || place.location || 'Cameroon');
  }, [place.mapQuery, place.location]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return undefined;
    let cancelled = false;
    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then((google) => {
        if (cancelled || !mapElementRef.current) return;
        const initialPosition = {
          lat: Number(place.latitude) || 5.9631,
          lng: Number(place.longitude) || 12.5029,
        };
        mapRef.current = new google.maps.Map(mapElementRef.current, {
          center: initialPosition,
          zoom: place.latitude && place.longitude ? 13 : 6,
          mapTypeControl: false,
          streetViewControl: true,
          fullscreenControl: true,
        });
        markerRef.current = new google.maps.Marker({
          position: initialPosition,
          map: mapRef.current,
          draggable: true,
          title: place.name || 'Selected place',
        });
        geocoderRef.current = new google.maps.Geocoder();
        markerRef.current.addListener('dragend', (event) => {
          onChange({
            latitude: event.latLng.lat().toFixed(6),
            longitude: event.latLng.lng().toFixed(6),
          });
        });
        mapRef.current.addListener('click', (event) => {
          markerRef.current.setPosition(event.latLng);
          onChange({
            latitude: event.latLng.lat().toFixed(6),
            longitude: event.latLng.lng().toFixed(6),
          });
        });
        setMapStatus('ready');
      })
      .catch(() => setMapStatus('fallback'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !place.latitude || !place.longitude || !window.google?.maps) return;
    const position = {
      lat: Number(place.latitude),
      lng: Number(place.longitude),
    };
    markerRef.current.setPosition(position);
    mapRef.current.panTo(position);
  }, [place.latitude, place.longitude]);

  const handleSearch = () => {
    const query = searchText.trim() || place.mapQuery || place.location || 'Cameroon';
    if (!geocoderRef.current || !mapRef.current || !markerRef.current) {
      onChange({ mapQuery: query, location: query });
      return;
    }
    geocoderRef.current.geocode(
      {
        address: query,
        componentRestrictions: { country: 'CM' },
      },
      (results, status) => {
        if (status !== 'OK' || !results?.[0]) {
          setMapStatus('search-error');
          return;
        }
        const result = results[0];
        const position = result.geometry.location;
        markerRef.current.setPosition(position);
        mapRef.current.panTo(position);
        mapRef.current.setZoom(14);
        setMapStatus('ready');
        onChange({
          mapQuery: result.formatted_address || query,
          location: result.formatted_address || query,
          latitude: position.lat().toFixed(6),
          longitude: position.lng().toFixed(6),
        });
      },
    );
  };

  return (
    <div className="map-info map-panel">
      <strong>{place.mapQuery || place.location || 'Cameroon'}</strong>
      <div className="map-search-row">
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search a Cameroon place on Google Maps"
        />
        <button type="button" className="button button-secondary" onClick={handleSearch}>Search map</button>
      </div>
      {mapStatus === 'fallback' ? (
        <>
          <p className="small-text">Set VITE_GOOGLE_MAPS_API_KEY to enable click-to-select and draggable marker editing.</p>
          <iframe
            className="map-embed map-embed-large"
            title="Admin Google map picker"
            src={`https://www.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&output=embed`}
            loading="lazy"
          />
        </>
      ) : (
        <div ref={mapElementRef} className="google-map-canvas" aria-label="Interactive Google map picker" />
      )}
      {mapStatus === 'search-error' && (
        <p className="small-text alert-text">No Cameroon Google Maps result was found for that search.</p>
      )}
      <div className="map-links">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.mapQuery || place.location || 'Cameroon')}`}
          target="_blank"
          rel="noreferrer"
        >
          Search in Google Maps
        </a>
        {place.latitude && place.longitude && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`}
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
  const [mediaComments, setMediaComments] = useState({});
  const [mediaShareTargets, setMediaShareTargets] = useState({});
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [selectedPlaceGuide, setSelectedPlaceGuide] = useState(null);
  const [placeGuideItineraryId, setPlaceGuideItineraryId] = useState('');
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

  const dashboardMenuItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'itineraries', label: 'Itineraries' },
    { id: 'discovery', label: 'Discovery' },
    { id: 'community', label: 'Community' },
    { id: 'media', label: 'Media' },
    { id: 'resources', label: 'Resources' },
    ...(profile?.role === 'admin' ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'settings', label: 'Settings' },
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
  const getPartitionedPlaces = () => {
    const filteredPlaces = resources.places.filter((place) => matchesGeoFilters(place, searchFilters));
    return filteredPlaces.reduce((groupsByRegion, place) => {
      const region = place.region || 'Unassigned region';
      groupsByRegion[region] = groupsByRegion[region] || [];
      groupsByRegion[region].push(place);
      return groupsByRegion;
    }, {});
  };
  const getPlaceCountByRegion = () => resources.places.reduce((counts, place) => {
    const region = place.region || 'Unassigned region';
    counts[region] = (counts[region] || 0) + 1;
    return counts;
  }, {});
  const getFeaturedDiscoveryPlaces = () => {
    const filteredPlaces = resources.places.filter((place) => matchesGeoFilters(place, searchFilters));
    return filteredPlaces.slice(0, searchFilters.region ? 12 : 6);
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
      } else {
        setAdminUsers([]);
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
      });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create itinerary.' });
    } finally {
      setLoading(false);
    }
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

  const handleUpdateTracking = async (event) => {
    event.preventDefault();
    if (!selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/tracking`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        latitude: Number(trackingForm.latitude),
        longitude: Number(trackingForm.longitude),
        current_location: trackingForm.currentLocation,
        current_stage_id: progressForm.currentStageId || undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update live tracking.' });
      return;
    }
    setTrackingInfo(result.tracking);
    refreshSelectedItinerary(result.itinerary);
    setAlert({ type: 'success', message: 'Live tracking updated.' });
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
              {GOOGLE_IDENTITY_CLIENT_ID && (
                <div className="hero-google-signin">
                  <p>Or sign in directly with Google:</p>
                  <GoogleSignInButton onSuccess={handleGoogleCredential} onError={handleGoogleError} />
                </div>
              )}
            </div>
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
              {GOOGLE_IDENTITY_CLIENT_ID && (
                <div className="google-signin-section">
                  <p>Or continue with Google:</p>
                  <GoogleSignInButton onSuccess={handleGoogleCredential} onError={handleGoogleError} />
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
                  Password
                  <input name="password" type="password" autoComplete="new-password" required />
                </label>
                <label>
                  Interests
                  {renderInterestPicker(registrationPreferences, setRegistrationPreferences)}
                </label>
                <button type="submit" className="button button-primary">Register</button>
              </form>
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
                  {dashboardMenuItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={dashboardView === item.id ? 'active' : ''}
                      onClick={() => setDashboardView(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </aside>
              <div className="app-page">
            {dashboardView === 'overview' && (
            <>
            <div className="grid-2">
              <div className="panel panel-primary">
                <h2>Welcome back</h2>
                <p>Access your itineraries, event receipts, and community groups in one place.</p>
                <div className="dashboard-actions">
                  <button type="button" className="button button-secondary" onClick={() => setDashboardView('itineraries')}>
                    Create itinerary
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => setDashboardView('community')}>
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
            {selectedPlaceGuide && (
              <div className="panel mt-24">
                <div className="section-heading">
                  <div>
                    <h3>{selectedPlaceGuide.place.name} guide</h3>
                    <p className="small-text">{selectedPlaceGuide.place.region} • {selectedPlaceGuide.place.division} • {selectedPlaceGuide.place.city}</p>
                  </div>
                  <button type="button" className="link-button" onClick={() => setSelectedPlaceGuide(null)}>Close</button>
                </div>
                <div className="guide-layout">
                  <div>
                    {selectedPlaceGuide.place.image_url && (
                      <img className="guide-image" src={selectedPlaceGuide.place.image_url} alt={selectedPlaceGuide.place.name} />
                    )}
                    <p>{selectedPlaceGuide.place.description}</p>
                    <p><strong>Entry/activity budget:</strong> {formatMoney(selectedPlaceGuide.place.cost || 0)}</p>
                    {selectedPlaceGuide.place.difficulty && (
                      <p><strong>Outdoor info:</strong> {selectedPlaceGuide.place.difficulty} · Guide {selectedPlaceGuide.place.guide_required ? 'recommended' : 'optional'}</p>
                    )}
                    {selectedPlaceGuide.place.best_season && <p className="small-text">{selectedPlaceGuide.place.best_season}</p>}
                    {selectedPlaceGuide.place.transport_note && <p className="small-text">{selectedPlaceGuide.place.transport_note}</p>}
                    <div className="inline-actions wrap-actions">
                      {selectedPlaceGuide.place.map_info?.google_map_url && (
                        <a href={selectedPlaceGuide.place.map_info.google_map_url} target="_blank" rel="noreferrer">Open map</a>
                      )}
                      <button type="button" className="button button-secondary" onClick={handleDownloadPlaceGuide}>Download guide</button>
                    </div>
                  </div>
                  <div>
                    <h4>Add to itinerary</h4>
                    <div className="inline-form">
                      <select value={placeGuideItineraryId} onChange={(event) => setPlaceGuideItineraryId(event.target.value)}>
                        <option value="">Select itinerary</option>
                        {itineraries.map((itinerary) => (
                          <option key={itinerary.id} value={itinerary.id}>{itinerary.title}</option>
                        ))}
                      </select>
                      <button type="button" className="button button-primary" onClick={handleAddGuidePlaceToItinerary}>Add</button>
                    </div>
                    <h4 className="mt-16">Nearby hotels</h4>
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
                    </ul>
                    <h4 className="mt-16">Nearby activities</h4>
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
                    </ul>
                  </div>
                </div>
              </div>
            )}
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
                        <div>
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
                                      {item.image_url && <img className="resource-thumb" src={item.image_url} alt={item.name} />}
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
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Destination search</h3>
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
                  <h4>Places to visit by region</h4>
                  <div className="region-chip-grid">
                    {Object.entries(getPlaceCountByRegion()).map(([region, count]) => (
                      <button
                        key={region}
                        type="button"
                        className={`region-chip ${searchFilters.region === region ? 'active' : ''}`}
                        onClick={() => updateGeoFilter(setSearchFilters, 'region', searchFilters.region === region ? '' : region)}
                      >
                        <strong>{region}</strong>
                        <span>{count} places</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-16">
                  <h4>{searchFilters.region ? `${searchFilters.region} places to visit` : 'Featured places to visit'}</h4>
                  <p className="small-text">
                    {searchFilters.region
                      ? 'These suggestions are filtered to your selected Cameroon region.'
                      : 'A short preview is shown first. Select a region to see more focused places.'}
                  </p>
                  <ul className="list-card discovery-place-list">
                    {getFeaturedDiscoveryPlaces().map((place) => (
                      <li key={place.id}>
                        {place.image_url && <img className="resource-thumb" src={place.image_url} alt={place.name} />}
                        <strong>{place.name}</strong>
                        <p>{place.region} • {place.division} • {place.city}</p>
                        <p className="small-text">{place.description}</p>
                        {place.difficulty && (
                          <p className="small-text">
                            Difficulty: {place.difficulty} · Guide {place.guide_required ? 'recommended' : 'optional'}
                          </p>
                        )}
                        <div className="inline-actions wrap-actions">
                          <button type="button" className="link-button" onClick={() => handleSavePlace(place)}>Save</button>
                          <button type="button" className="link-button" onClick={() => handleViewPlaceGuide(place.id)}>Guide</button>
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
                          {dest.image_url && <img className="resource-thumb" src={dest.image_url} alt={dest.name} />}
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
                <h3>Personalised city suggestions</h3>
                <div className="map-info map-panel">
                  <strong>Google Map of Cameroon</strong>
                  <p className="small-text">Use this map while filtering by region, city, subdivision, and quarter.</p>
                  <a href={CAMEROON_MAP_URL} target="_blank" rel="noreferrer">Open Cameroon in Google Maps</a>
                  <iframe
                    className="map-embed map-embed-large"
                    title="Google map of Cameroon"
                    src={CAMEROON_MAP_EMBED}
                    loading="lazy"
                  />
                </div>
                {cityRecommendations.length === 0 ? (
                  <p>No city suggestions yet. Browse or save places to train your suggestions.</p>
                ) : (
                  <ul className="list-card">
                    {cityRecommendations.map((city) => (
                      <li key={city.city}>
                        {city.image_url && <img className="resource-thumb" src={city.image_url} alt={city.city} />}
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
                        <div>
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
                                  {item.image_url && <img className="resource-thumb" src={item.image_url} alt={item.name} />}
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
                        {item.type === 'photo' && <img src={item.url} alt={item.caption || 'Shared travel media'} />}
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
            {dashboardView === 'admin' && (
            <div className="grid-2 mt-24">
              {profile?.role !== 'admin' ? (
                <div className="panel">
                  <h3>Admin dashboard</h3>
                  <p>Admin access is required.</p>
                </div>
              ) : (
                <>
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
                      Localisation / Google Maps search
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
                  <h3>Google Maps localisation</h3>
                  <p className="small-text">Search the place name or paste coordinates, then confirm the location before creating the place.</p>
                  <AdminGoogleMapPicker
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
                </>
              )}
            </div>
            )}
            {dashboardView === 'resources' && (
            <div className="panel mt-24">
              <h3>Resource management</h3>
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
              <div className="resource-columns mt-16">
                {Object.entries(resources).map(([type, items]) => (
                  <div key={type}>
                    <h4>{type}</h4>
                    {items.length === 0 ? (
                      <p className="small-text">No entries.</p>
                    ) : (
                      <ul className="plain-list">
                        {items.slice(0, 6).map((item) => (
                          <li key={item.id}>
                            <span>
                              {item.image_url && <img className="resource-thumb" src={item.image_url} alt={item.name} />}
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
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
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
                    <h3>Update progress</h3>
                    <form onSubmit={handleUpdateProgress} className="stacked-form">
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
                        Completed stage IDs
                        <input
                          value={progressForm.completedStageIds}
                          onChange={(event) => setProgressForm((prev) => ({ ...prev, completedStageIds: event.target.value }))}
                          placeholder="hotel, activity-1"
                        />
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
                        {(trackingInfo || selectedItinerary.live_tracking).google_maps_embed_url && (
                          <iframe
                            className="map-embed"
                            title="Live trip tracking map"
                            src={(trackingInfo || selectedItinerary.live_tracking).google_maps_embed_url}
                            loading="lazy"
                          />
                        )}
                      </div>
                    )}
                    {mapInfo && (
                      <div className="map-info">
                        <p><strong>Location:</strong> {mapInfo.location}</p>
                        <p><strong>Provider:</strong> Google Maps · {mapInfo.country_focus}</p>
                        {mapInfo.map_info?.google_map_url && (
                          <a href={mapInfo.map_info.google_map_url} target="_blank" rel="noreferrer">Open in Google Maps</a>
                        )}
                        {mapInfo.map_info?.google_maps_directions_url && (
                          <a href={mapInfo.map_info.google_maps_directions_url} target="_blank" rel="noreferrer">Directions</a>
                        )}
                        {mapInfo.map_info?.google_maps_embed_url && (
                          <iframe
                            className="map-embed"
                            title={`Google map for ${mapInfo.location}`}
                            src={mapInfo.map_info.google_maps_embed_url}
                            loading="lazy"
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
                    {selectedGroup.discussions?.length > 0 ? (
                      <ul className="list-card">
                        {selectedGroup.discussions.map((discussion) => (
                          <li key={discussion.id}>
                            <strong>{discussion.title}</strong>
                            <p>{discussion.posts[0]?.message}</p>
                            <div className="discussion-meta">
                              <span>{discussion.posts.length} posts</span>
                              <span>Started by {discussion.created_by}</span>
                            </div>
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


