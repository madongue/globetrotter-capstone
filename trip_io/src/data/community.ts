import type { CommunityPost, Review, Submission } from '@/types'

/** Hours ago, as an ISO string, so seeded content reads as recent. */
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString()

export const SEED_POSTS: CommunityPost[] = [
  {
    id: 'p-1',
    author: 'Aïcha Njoya',
    avatarColor: '#22D3EE',
    destinationId: 'd-mont-febe',
    body: 'Went up Fébé at six this morning. The whole city was under mist and it burned off while we watched. Take a jacket, it is genuinely cold up there before sunrise.',
    images: ['/images/destinations/mont-febe.jpg'],
    likes: 47,
    comments: [
      {
        id: 'c-1',
        author: 'Brice Tchoumi',
        avatarColor: '#3B82F6',
        body: 'Which side did you go up from? The Bastos road or the monastery?',
        createdAt: ago(4),
      },
    ],
    createdAt: ago(6),
  },
  {
    id: 'p-2',
    author: 'Serge Mbarga',
    avatarColor: '#F59E0B',
    destinationId: 'd-briqueterie',
    body: 'Briqueterie after eight on a Friday is the best street food in the city and it is not close. Soya, beignets, grilled fish. Bring cash, small notes.',
    images: ['/images/destinations/yaounde-street.jpg'],
    likes: 82,
    comments: [
      {
        id: 'c-2',
        author: 'Clarisse Fouda',
        avatarColor: '#EC4899',
        body: 'Agreed. Go hungry and do not eat before you arrive.',
        createdAt: ago(20),
      },
      {
        id: 'c-3',
        author: 'Aïcha Njoya',
        avatarColor: '#22D3EE',
        body: 'Is it walkable from Nlongkak or better to take a taxi?',
        createdAt: ago(16),
      },
    ],
    createdAt: ago(26),
  },
  {
    id: 'p-3',
    author: 'Clarisse Fouda',
    avatarColor: '#EC4899',
    destinationId: 'd-blackitude',
    body: 'Blackitude is small but the woman who showed us round knew every piece and where it came from. Give it a full hour, not the twenty minutes we planned.',
    images: [],
    likes: 34,
    comments: [],
    createdAt: ago(50),
  },
  {
    id: 'p-4',
    author: 'Yannick Etoa',
    avatarColor: '#10B981',
    destinationId: 'd-national-museum',
    body: 'The national museum is worth it just for the building. Free on the first Sunday of the month last time I checked, but confirm before you travel across town.',
    images: ['/images/destinations/national-museum.jpg'],
    likes: 61,
    comments: [
      {
        id: 'c-4',
        author: 'Serge Mbarga',
        avatarColor: '#F59E0B',
        body: 'Still true as of last month.',
        createdAt: ago(70),
      },
    ],
    createdAt: ago(74),
  },
]

export const SEED_SUBMISSIONS: Submission[] = [
  {
    id: 's-1',
    name: 'Galerie MAM',
    category: 'art',
    description:
      'Contemporary art gallery showing Cameroonian painters and photographers, near the centre.',
    address: 'Centre-ville, Yaoundé',
    status: 'approved',
    photos: [],
    submittedAt: ago(240),
  },
  {
    id: 's-2',
    name: 'Chutes de la Nachtigal',
    category: 'nature',
    description:
      'Falls on the Sanaga about two hours from Yaoundé. Worth listing as a day trip out of the city.',
    address: 'Batchenga, Centre Region',
    status: 'pending',
    photos: [],
    submittedAt: ago(30),
  },
  {
    id: 's-3',
    name: 'My friend’s bar',
    category: 'bar',
    description: 'Good place, nice people.',
    address: 'Yaoundé',
    status: 'rejected',
    photos: [],
    submittedAt: ago(120),
    reviewNote:
      'Not enough detail to verify the place, and the description does not say what a visitor would find there.',
  },
]

export const SEED_REVIEWS: Review[] = [
  {
    id: 'r-1',
    destinationId: 'd-reunification',
    author: 'Yannick Etoa',
    avatarColor: '#10B981',
    rating: 5,
    body: 'Climb the tower. Most people photograph it from the road and never go up, which is a shame.',
    createdAt: ago(96),
  },
  {
    id: 'r-2',
    destinationId: 'd-reunification',
    author: 'Aïcha Njoya',
    avatarColor: '#22D3EE',
    rating: 4,
    body: 'Impressive up close. Very exposed at midday, so go early or late.',
    createdAt: ago(180),
  },
  {
    id: 'r-3',
    destinationId: 'd-national-museum',
    author: 'Clarisse Fouda',
    avatarColor: '#EC4899',
    rating: 5,
    body: 'Two hours went quickly. The grassfields room is the strongest part of the collection.',
    createdAt: ago(140),
  },
  {
    id: 'r-4',
    destinationId: 'd-mvog-betsi-zoo',
    author: 'Brice Tchoumi',
    avatarColor: '#3B82F6',
    rating: 4,
    body: 'Modest, but the primate rescue work is real and the keepers explain it well. Good with children.',
    createdAt: ago(200),
  },
  {
    id: 'r-5',
    destinationId: 'd-mont-febe',
    author: 'Serge Mbarga',
    avatarColor: '#F59E0B',
    rating: 5,
    body: 'Best view in Yaoundé and it is not a competition.',
    createdAt: ago(60),
  },
  {
    id: 'r-6',
    destinationId: 'd-mfoundi-market',
    author: 'Clarisse Fouda',
    avatarColor: '#EC4899',
    rating: 4,
    body: 'Overwhelming the first time. Go with someone who knows it and it becomes brilliant.',
    createdAt: ago(300),
  },
]
