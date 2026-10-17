import { EmergencyCategory, EmergencyPriority, AmbulanceType } from './enums.js';

export interface EmergencyCategoryMeta {
  category: EmergencyCategory;
  label: string;
  priority: EmergencyPriority;
  recommendedAmbulance: AmbulanceType;
  description: string;
}

export const EMERGENCY_CATEGORIES_META: Record<EmergencyCategory, EmergencyCategoryMeta> = {
  [EmergencyCategory.CARDIAC_ARREST]: {
    category: EmergencyCategory.CARDIAC_ARREST,
    label: 'Cardiac Arrest',
    priority: EmergencyPriority.CRITICAL,
    recommendedAmbulance: AmbulanceType.ALS,
    description: 'Sudden loss of heart function, breathing, and consciousness. Immediate ALS response required.',
  },
  [EmergencyCategory.TRAUMA_ACCIDENT]: {
    category: EmergencyCategory.TRAUMA_ACCIDENT,
    label: 'Trauma / Accident',
    priority: EmergencyPriority.CRITICAL,
    recommendedAmbulance: AmbulanceType.ALS,
    description: 'Major collision, severe bleeding, or bodily injury requiring rapid stabilization and transport.',
  },
  [EmergencyCategory.STROKE]: {
    category: EmergencyCategory.STROKE,
    label: 'Stroke',
    priority: EmergencyPriority.URGENT,
    recommendedAmbulance: AmbulanceType.ALS,
    description: 'Face drooping, arm weakness, or speech difficulty. Time-critical neurological emergency.',
  },
  [EmergencyCategory.RESPIRATORY_FAILURE]: {
    category: EmergencyCategory.RESPIRATORY_FAILURE,
    label: 'Respiratory Failure',
    priority: EmergencyPriority.CRITICAL,
    recommendedAmbulance: AmbulanceType.ALS,
    description: 'Severe shortness of breath, acute asthma exacerbation, or hypoxia requiring oxygen support.',
  },
  [EmergencyCategory.MATERNITY_LABOR]: {
    category: EmergencyCategory.MATERNITY_LABOR,
    label: 'Maternity / Labor',
    priority: EmergencyPriority.URGENT,
    recommendedAmbulance: AmbulanceType.BLS,
    description: 'Active labor, complications in pregnancy, or emergent obstetrical assistance.',
  },
  [EmergencyCategory.GENERAL_EMERGENCY]: {
    category: EmergencyCategory.GENERAL_EMERGENCY,
    label: 'General Emergency',
    priority: EmergencyPriority.STANDARD,
    recommendedAmbulance: AmbulanceType.BLS,
    description: 'High fever, acute abdominal pain, non-critical fractures, or standard medical evaluation.',
  },
};

export interface Landmark {
  id: string;
  name: string;
  locality: string;
  latitude: number;
  longitude: number;
  category: 'landmark' | 'transit' | 'commercial' | 'hospital' | 'industrial';
}

export const AURANGABAD_LANDMARKS: Landmark[] = [
  {
    id: 'kranti-chowk',
    name: 'Kranti Chowk',
    locality: 'Central Aurangabad',
    latitude: 19.8762,
    longitude: 75.3242,
    category: 'landmark',
  },
  {
    id: 'gmch-ghati',
    name: 'GMCH Ghati Hospital',
    locality: 'Juna Bazaar / Panchakki Rd',
    latitude: 19.8906,
    longitude: 75.3218,
    category: 'hospital',
  },
  {
    id: 'cidco-connaught',
    name: 'CIDCO Cannaught Place',
    locality: 'CIDCO N-4',
    latitude: 19.8885,
    longitude: 75.3582,
    category: 'commercial',
  },
  {
    id: 'nirala-bazaar',
    name: 'Nirala Bazaar',
    locality: 'Samarth Nagar',
    latitude: 19.8824,
    longitude: 75.3308,
    category: 'commercial',
  },
  {
    id: 'railway-station',
    name: 'Chhatrapati Sambhajinagar Railway Station',
    locality: 'Station Road',
    latitude: 19.8608,
    longitude: 75.3204,
    category: 'transit',
  },
  {
    id: 'central-bus-stand',
    name: 'Central Bus Stand (CBS)',
    locality: 'Mill Corner',
    latitude: 19.8837,
    longitude: 75.3189,
    category: 'transit',
  },
  {
    id: 'seven-hills',
    name: 'Seven Hills Flyover',
    locality: 'Jalna Road',
    latitude: 19.8778,
    longitude: 75.3524,
    category: 'landmark',
  },
  {
    id: 'waluj-midc',
    name: 'Waluj MIDC Industrial Area',
    locality: 'Waluj',
    latitude: 19.8398,
    longitude: 75.2285,
    category: 'industrial',
  },
  {
    id: 'prozone-mall',
    name: 'Prozone Mall',
    locality: 'MIDC Chikalthana',
    latitude: 19.8754,
    longitude: 75.3789,
    category: 'commercial',
  },
  {
    id: 'baba-petrol-pump',
    name: 'Baba Petrol Pump Chowk',
    locality: 'Railway Station Rd',
    latitude: 19.8698,
    longitude: 75.3256,
    category: 'landmark',
  },
  {
    id: 'beed-bypass',
    name: 'Mahanubhav Ashram Chowk, Beed Bypass',
    locality: 'Satara Parisar',
    latitude: 19.8465,
    longitude: 75.3341,
    category: 'transit',
  },
  {
    id: 'tv-centre',
    name: 'TV Centre Chowk',
    locality: 'CIDCO N-9',
    latitude: 19.9042,
    longitude: 75.3621,
    category: 'landmark',
  },
  {
    id: 'dhoot-hospital-area',
    name: 'Dhoot Hospital Junction',
    locality: 'Chikalthana, Jalna Road',
    latitude: 19.8732,
    longitude: 75.3942,
    category: 'hospital',
  },
  {
    id: 'mgm-hospital-area',
    name: 'MGM Hospital & Medical College',
    locality: 'N-6 CIDCO',
    latitude: 19.8791,
    longitude: 75.3644,
    category: 'hospital',
  },
];

export const AURANGABAD_BOUNDS = {
  center: {
    latitude: 19.8762,
    longitude: 75.3433,
  },
  defaultZoom: 13,
  minLat: 19.75,
  maxLat: 20.02,
  minLng: 75.18,
  maxLng: 75.52,
};

export const DISPATCH_CONFIG = {
  OFFER_EXPIRY_SECONDS: 45,
  MAX_CANDIDATE_SEARCH_RADIUS_KM: 25.0,
  MAX_ACTIVE_DISPATCH_ATTEMPTS: 5,
};

export const SOCKET_EVENTS = {
  // Client to Server
  SUBSCRIBE_TRIP: 'trip:subscribe',
  UNSUBSCRIBE_TRIP: 'trip:unsubscribe',
  UPDATE_LOCATION: 'driver:location:update',
  RESPOND_DISPATCH: 'dispatch:respond',

  // Server to Client
  DISPATCH_OFFER: 'dispatch:offer',
  DISPATCH_EXPIRED: 'dispatch:expired',
  DISPATCH_ACCEPTED: 'dispatch:accepted',
  DISPATCH_DECLINED: 'dispatch:declined',
  TRIP_UPDATED: 'trip:updated',
  DRIVER_LOCATION_CHANGED: 'driver:location:changed',
  HOSPITAL_CAPACITY_CHANGED: 'hospital:capacity:changed',
  HOSPITAL_ASSIGNED: 'hospital:assigned',
  AMBULANCE_STATUS_CHANGED: 'ambulance:status:changed',
  TRAFFIC_CORRIDOR_UPDATED: 'traffic:corridor:updated',
  TRAFFIC_BLOCKAGE_REPORTED: 'traffic:blockage:reported',
  TRAFFIC_SIGNAL_PROXIMITY_ALERT: 'traffic:signal:proximity_alert',
  SYSTEM_NOTIFICATION: 'system:notification',
} as const;
