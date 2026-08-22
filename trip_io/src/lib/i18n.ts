import type { Language } from '@/types'

/**
 * Translation table.
 *
 * Cameroon is officially bilingual and Yaoundé is genuinely so, so French is a
 * first-class language here rather than an afterthought. Keys are grouped by
 * where they appear; anything user-visible belongs in here rather than inline
 * in a component.
 */
export const STRINGS = {
  // ---------------------------------------------------------------- brand
  tagline: {
    en: 'Plan faster. Travel smarter. Discover Yaoundé.',
    fr: 'Planifiez vite. Voyagez mieux. Découvrez Yaoundé.',
  },

  // ------------------------------------------------------------------- nav
  navGetApp: { en: 'Get the app', fr: 'Obtenir l’app' },
  navExplore: { en: 'Explore Yaoundé', fr: 'Explorer Yaoundé' },
  navFeatures: { en: 'Features', fr: 'Fonctions' },
  navStats: { en: 'Stats', fr: 'Chiffres' },
  navQr: { en: 'QR Code', fr: 'QR Code' },
  navApi: { en: 'API', fr: 'API' },
  navCommunity: { en: 'Community', fr: 'Communauté' },
  navSignIn: { en: 'Sign in', fr: 'Connexion' },
  navOpenApp: { en: 'Open app', fr: 'Ouvrir l’app' },

  // ----------------------------------------------------------------- hero
  heroLabel: { en: 'Get the app', fr: 'Obtenir l’app' },
  heroTitle: { en: 'Available on your device', fr: 'Disponible sur votre appareil' },
  heroSubtitle: {
    en: 'Download the app, explore Yaoundé and discover places worth visiting.',
    fr: 'Téléchargez l’app, explorez Yaoundé et découvrez des lieux qui valent le détour.',
  },
  heroAndroid: { en: 'Android', fr: 'Android' },
  heroIos: { en: 'iOS', fr: 'iOS' },
  heroWeb: { en: 'Web App', fr: 'App Web' },
  heroAndroidNote: { en: 'APK · 12 MB', fr: 'APK · 12 Mo' },
  heroIosNote: { en: 'TestFlight beta', fr: 'Bêta TestFlight' },
  heroWebNote: { en: 'No install needed', fr: 'Sans installation' },

  // -------------------------------------------------------------- explore
  exploreLabel: { en: 'Explore', fr: 'Explorer' },
  exploreTitle: { en: 'Built around Yaoundé', fr: 'Conçu autour de Yaoundé' },
  exploreSubtitle: {
    en: 'Every destination in the app is a real, hand-picked spot in Cameroon’s capital.',
    fr: 'Chaque destination de l’app est un lieu réel, choisi à la main dans la capitale camerounaise.',
  },
  exploreCta: { en: 'Browse all destinations', fr: 'Voir toutes les destinations' },

  // ------------------------------------------------------------- features
  featuresTitle: {
    en: 'Everything you need for a day in Yaoundé',
    fr: 'Tout ce qu’il faut pour une journée à Yaoundé',
  },
  feature1Title: { en: 'Curated Yaoundé spots', fr: 'Lieux choisis à Yaoundé' },
  feature1Body: {
    en: 'Landmarks, culture, markets and nightlife, carefully selected for you.',
    fr: 'Monuments, culture, marchés et vie nocturne, sélectionnés avec soin.',
  },
  feature2Title: { en: 'Auto-generated itineraries', fr: 'Itinéraires générés' },
  feature2Body: {
    en: 'Build a personalized itinerary based on your available time and interests.',
    fr: 'Composez un itinéraire personnalisé selon votre temps et vos centres d’intérêt.',
  },
  feature3Title: { en: 'English & French', fr: 'Anglais et français' },
  feature3Body: {
    en: 'Fully localized for Cameroon’s bilingual community.',
    fr: 'Entièrement localisé pour la communauté bilingue du Cameroun.',
  },
  feature4Title: { en: 'Fast & free', fr: 'Rapide et gratuit' },
  feature4Body: {
    en: 'Open-source, easy to browse and designed for fast discovery.',
    fr: 'Open source, simple à parcourir et pensé pour une découverte rapide.',
  },

  // ---------------------------------------------------------------- brand
  brandBlurb: {
    en: 'Plan faster. Travel smarter. Discover the landmarks, culture and nature of Yaoundé.',
    fr: 'Planifiez vite. Voyagez mieux. Découvrez les monuments, la culture et la nature de Yaoundé.',
  },
  statSpots: { en: 'Yaoundé spots', fr: 'Lieux à Yaoundé' },
  statPlatforms: { en: 'Platforms', fr: 'Plateformes' },
  statBilingual: { en: 'Bilingual', fr: 'Bilingue' },

  // ------------------------------------------------------------------- qr
  qrTitle: { en: 'Scan to explore Yaoundé', fr: 'Scannez pour explorer Yaoundé' },
  qrBody: {
    en: 'Point your camera at the code to open mg trip on your phone.',
    fr: 'Visez le code avec votre appareil photo pour ouvrir mg trip sur votre téléphone.',
  },

  // ---------------------------------------------------------------- sidebar
  sideDestinations: { en: 'Destinations', fr: 'Destinations' },
  sideForYou: { en: 'For You', fr: 'Pour vous' },
  sideFavorites: { en: 'Favorites', fr: 'Favoris' },
  sideMap: { en: 'Map', fr: 'Carte' },
  sideItineraries: { en: 'Itineraries', fr: 'Itinéraires' },
  sideProfile: { en: 'Profile', fr: 'Profil' },
  sideSettings: { en: 'Settings', fr: 'Réglages' },

  // ----------------------------------------------------------- destinations
  destTitle: { en: 'Destinations', fr: 'Destinations' },
  destSubtitle: { en: 'Yaoundé Destinations', fr: 'Destinations de Yaoundé' },
  destDescription: {
    en: 'Search Yaoundé’s landmarks, culture and favorite spots.',
    fr: 'Recherchez les monuments, la culture et les lieux préférés de Yaoundé.',
  },
  destSuggest: { en: 'Suggest a destination', fr: 'Proposer un lieu' },
  destSubmissions: { en: 'My submissions', fr: 'Mes propositions' },
  searchPlaceholder: {
    en: 'Search destinations by name or tag',
    fr: 'Rechercher par nom ou par tag',
  },
  searchButton: { en: 'Search', fr: 'Rechercher' },
  filterAll: { en: 'All', fr: 'Tout' },
  resultsCount: { en: 'destinations', fr: 'destinations' },
  clearFilters: { en: 'Clear filters', fr: 'Réinitialiser' },

  // ------------------------------------------------------------------ card
  viewDetails: { en: 'Details', fr: 'Détails' },
  showOnMap: { en: 'Map', fr: 'Carte' },
  addFavorite: { en: 'Save to favorites', fr: 'Ajouter aux favoris' },
  removeFavorite: { en: 'Remove from favorites', fr: 'Retirer des favoris' },
  free: { en: 'Free', fr: 'Gratuit' },
  from: { en: 'from', fr: 'à partir de' },

  // ---------------------------------------------------------------- detail
  overview: { en: 'Overview', fr: 'Présentation' },
  openingHours: { en: 'Opening hours', fr: 'Horaires' },
  priceInfo: { en: 'Price', fr: 'Tarif' },
  photos: { en: 'Photos', fr: 'Photos' },
  location: { en: 'Location', fr: 'Emplacement' },
  nearby: { en: 'Nearby places', fr: 'À proximité' },
  addToItinerary: { en: 'Add to itinerary', fr: 'Ajouter à l’itinéraire' },
  share: { en: 'Share', fr: 'Partager' },
  linkCopied: { en: 'Link copied', fr: 'Lien copié' },
  closedToday: { en: 'Closed today', fr: 'Fermé aujourd’hui' },
  openNow: { en: 'Open now', fr: 'Ouvert' },
  closedNow: { en: 'Closed', fr: 'Fermé' },
  minutes: { en: 'visit', fr: 'de visite' },

  // --------------------------------------------------------------- for you
  forYouTitle: { en: 'For You', fr: 'Pour vous' },
  forYouSubtitle: {
    en: 'Picked from what you have saved and what Yaoundé is enjoying now.',
    fr: 'À partir de vos favoris et de ce que Yaoundé apprécie en ce moment.',
  },
  recommended: { en: 'Recommended for you', fr: 'Recommandé pour vous' },
  popular: { en: 'Popular in Yaoundé', fr: 'Populaire à Yaoundé' },
  nearYou: { en: 'Near you', fr: 'Près de vous' },
  perfectToday: { en: 'Perfect for today', fr: 'Parfait pour aujourd’hui' },
  hiddenGems: { en: 'Hidden gems', fr: 'Trésors cachés' },

  // ------------------------------------------------------------- favorites
  favTitle: { en: 'Favorites', fr: 'Favoris' },
  favEmptyTitle: { en: 'Nothing saved yet', fr: 'Aucun favori pour l’instant' },
  favEmptyBody: {
    en: 'Tap the heart on any destination and it will appear here.',
    fr: 'Touchez le cœur sur une destination et elle apparaîtra ici.',
  },
  favEmptyCta: { en: 'Browse destinations', fr: 'Parcourir les destinations' },

  // ------------------------------------------------------------------- map
  mapTitle: { en: 'Map', fr: 'Carte' },
  mapSubtitle: { en: 'Yaoundé, by location', fr: 'Yaoundé, par emplacement' },
  mapSearch: { en: 'Find on the map', fr: 'Trouver sur la carte' },

  // ----------------------------------------------------------- itineraries
  itinTitle: { en: 'Itineraries', fr: 'Itinéraires' },
  itinSubtitle: {
    en: 'Plan a day, or let mg trip draft one for you.',
    fr: 'Planifiez une journée, ou laissez mg trip la composer.',
  },
  itinNew: { en: 'New itinerary', fr: 'Nouvel itinéraire' },
  itinGenerate: { en: 'Auto-generate itinerary', fr: 'Générer l’itinéraire' },
  itinDuration: { en: 'Duration', fr: 'Durée' },
  itinInterests: { en: 'Interests', fr: 'Centres d’intérêt' },
  itinHalfDay: { en: 'Half day', fr: 'Demi-journée' },
  itinFullDay: { en: 'Full day', fr: 'Journée' },
  itinTwoDays: { en: 'Two days', fr: 'Deux jours' },
  itinSave: { en: 'Save itinerary', fr: 'Enregistrer' },
  itinEmpty: { en: 'No itineraries yet', fr: 'Aucun itinéraire' },
  itinEmptyBody: {
    en: 'Generate one from your interests, or start from an empty day.',
    fr: 'Générez-en un depuis vos centres d’intérêt, ou partez d’une journée vide.',
  },
  itinRemove: { en: 'Remove stop', fr: 'Retirer l’étape' },
  itinMoveUp: { en: 'Move earlier', fr: 'Avancer' },
  itinMoveDown: { en: 'Move later', fr: 'Retarder' },

  // --------------------------------------------------------------- profile
  profileTitle: { en: 'Profile', fr: 'Profil' },
  profileFavorites: { en: 'Favorites', fr: 'Favoris' },
  profileItineraries: { en: 'Itineraries', fr: 'Itinéraires' },
  profileSubmissions: { en: 'Submissions', fr: 'Propositions' },
  profileLanguage: { en: 'Language preference', fr: 'Langue préférée' },
  profileSignOut: { en: 'Sign out', fr: 'Se déconnecter' },

  // ------------------------------------------------------------ submission
  submitTitle: { en: 'Suggest a destination', fr: 'Proposer un lieu' },
  submitBody: {
    en: 'Know somewhere in Yaoundé worth adding? Tell us about it.',
    fr: 'Vous connaissez un lieu à Yaoundé qui mérite d’être ajouté ? Parlez-nous-en.',
  },
  fieldName: { en: 'Destination name', fr: 'Nom du lieu' },
  fieldCategory: { en: 'Category', fr: 'Catégorie' },
  fieldDescription: { en: 'Description', fr: 'Description' },
  fieldAddress: { en: 'Address or quarter', fr: 'Adresse ou quartier' },
  fieldPhotos: { en: 'Photos', fr: 'Photos' },
  fieldWebsite: { en: 'Website or social media', fr: 'Site web ou réseaux sociaux' },
  fieldHours: { en: 'Opening hours', fr: 'Horaires' },
  fieldPrice: { en: 'Price', fr: 'Tarif' },
  fieldContact: { en: 'Contact', fr: 'Contact' },
  submitSend: { en: 'Submit for review', fr: 'Envoyer pour validation' },
  statusPending: { en: 'Pending', fr: 'En attente' },
  statusApproved: { en: 'Approved', fr: 'Approuvé' },
  statusRejected: { en: 'Rejected', fr: 'Refusé' },

  // ------------------------------------------------------------- community
  communityTitle: { en: 'Community', fr: 'Communauté' },
  communitySubtitle: {
    en: 'What people are finding around the city.',
    fr: 'Ce que l’on découvre en ce moment dans la ville.',
  },
  communityPost: { en: 'Share a discovery', fr: 'Partager une découverte' },
  communityPlaceholder: {
    en: 'Where have you been in Yaoundé?',
    fr: 'Où êtes-vous allé à Yaoundé ?',
  },
  communityPublish: { en: 'Post', fr: 'Publier' },
  communityComment: { en: 'Comment', fr: 'Commenter' },

  // ------------------------------------------------------------------- api
  apiTitle: { en: 'mg trip API', fr: 'API mg trip' },
  apiSubtitle: {
    en: 'Yaoundé destination data, available to build on.',
    fr: 'Les données des destinations de Yaoundé, ouvertes aux développeurs.',
  },
  apiGetKey: { en: 'Get API key', fr: 'Obtenir une clé API' },

  // ----------------------------------------------------------------- stats
  statsTitle: { en: 'Statistics', fr: 'Statistiques' },
  statsSubtitle: {
    en: 'How mg trip is being used.',
    fr: 'Comment mg trip est utilisé.',
  },

  // ------------------------------------------------------------------ auth
  authSignIn: { en: 'Sign in', fr: 'Connexion' },
  authSignUp: { en: 'Create account', fr: 'Créer un compte' },
  authEmail: { en: 'Email', fr: 'E-mail' },
  authPassword: { en: 'Password', fr: 'Mot de passe' },
  authName: { en: 'Full name', fr: 'Nom complet' },
  authForgot: { en: 'Forgot password?', fr: 'Mot de passe oublié ?' },
  authGoogle: { en: 'Continue with Google', fr: 'Continuer avec Google' },
  authOr: { en: 'or', fr: 'ou' },
  authNoAccount: { en: 'No account yet?', fr: 'Pas encore de compte ?' },
  authHaveAccount: { en: 'Already registered?', fr: 'Déjà inscrit ?' },
  authResetSent: {
    en: 'If that address exists, a reset link is on its way.',
    fr: 'Si cette adresse existe, un lien de réinitialisation vient d’être envoyé.',
  },
  authGuestNote: {
    en: 'You can browse destinations without an account. Saving favorites and itineraries needs one.',
    fr: 'Vous pouvez parcourir les destinations sans compte. Les favoris et itinéraires en demandent un.',
  },

  // ----------------------------------------------------------------- misc
  loading: { en: 'Loading', fr: 'Chargement' },
  noResultsTitle: { en: 'Nothing matched', fr: 'Aucun résultat' },
  noResultsBody: {
    en: 'Try a different search, or clear the category filters.',
    fr: 'Essayez une autre recherche, ou retirez les filtres de catégorie.',
  },
  errorTitle: { en: 'Something went wrong', fr: 'Une erreur est survenue' },
  errorBody: {
    en: 'That did not load. Try again in a moment.',
    fr: 'Le chargement a échoué. Réessayez dans un instant.',
  },
  retry: { en: 'Try again', fr: 'Réessayer' },
  back: { en: 'Back', fr: 'Retour' },
  contextualPhoto: {
    en: 'Photo of Yaoundé — no photograph of this exact place yet',
    fr: 'Photo de Yaoundé — pas encore de photo de ce lieu précis',
  },
} as const

export type StringKey = keyof typeof STRINGS

export function translate(key: StringKey, language: Language): string {
  return STRINGS[key][language]
}
