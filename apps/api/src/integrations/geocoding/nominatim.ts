import { env } from '../../config/env.js';
import { AURANGABAD_LANDMARKS, Landmark } from '@aurangabad-ambulance/shared';
import { isPointInAurangabad } from '../maps/boundary.js';

export interface GeocodingResult {
  displayName: string;
  latitude: number;
  longitude: number;
  isWithinBoundary: boolean;
  type: 'landmark' | 'osm_address';
  landmarkId?: string;
}

// Comprehensive local Aurangabad locations for instantaneous testing & zero-latency queries
const COMPREHENSIVE_AURANGABAD_LOCATIONS: Landmark[] = [
  ...AURANGABAD_LANDMARKS,
  {
    id: 'united-ciigma-hospital',
    name: 'United CIIGMA Hospital',
    locality: 'Shahnoorwadi / Jalna Road',
    latitude: 19.8722,
    longitude: 75.3385,
    category: 'hospital',
  },
  {
    id: 'hedgewar-hospital',
    name: 'Dr. Hedgewar Rugnalaya',
    locality: 'Garkheda Parisar',
    latitude: 19.8654,
    longitude: 75.3521,
    category: 'hospital',
  },
  {
    id: 'bajaj-hospital',
    name: 'Kamalnayan Bajaj Hospital',
    locality: 'Beed Bypass Road',
    latitude: 19.8450,
    longitude: 75.3410,
    category: 'hospital',
  },
  {
    id: 'manik-hospital',
    name: 'Manik Hospital & ICU',
    locality: 'Samarth Nagar',
    latitude: 19.8810,
    longitude: 75.3320,
    category: 'hospital',
  },
  {
    id: 'cidco-n1-n2',
    name: 'CIDCO Sector N-1 / N-2',
    locality: 'CIDCO Town Centre',
    latitude: 19.8890,
    longitude: 75.3520,
    category: 'commercial',
  },
  {
    id: 'cidco-n5',
    name: 'CIDCO Sector N-5',
    locality: 'CIDCO Colony',
    latitude: 19.8840,
    longitude: 75.3680,
    category: 'commercial',
  },
  {
    id: 'cidco-n6',
    name: 'CIDCO Sector N-6',
    locality: 'MGM Campus Area',
    latitude: 19.8810,
    longitude: 75.3660,
    category: 'commercial',
  },
  {
    id: 'cidco-bus-stand',
    name: 'CIDCO Bus Stand',
    locality: 'Jalna Road, CIDCO',
    latitude: 19.8785,
    longitude: 75.3605,
    category: 'transit',
  },
  {
    id: 'akashwani-chowk',
    name: 'Akashwani Chowk',
    locality: 'Jalna Road',
    latitude: 19.8768,
    longitude: 75.3585,
    category: 'landmark',
  },
  {
    id: 'sutgirni-chowk',
    name: 'Sutgirni Chowk',
    locality: 'Garkheda Parisar',
    latitude: 19.8620,
    longitude: 75.3480,
    category: 'landmark',
  },
  {
    id: 'ulkanagari',
    name: 'Ulkanagari',
    locality: 'Garkheda',
    latitude: 19.8580,
    longitude: 75.3420,
    category: 'landmark',
  },
  {
    id: 'deolai-chowk',
    name: 'Deolai Chowk',
    locality: 'Beed Bypass',
    latitude: 19.8420,
    longitude: 75.3550,
    category: 'transit',
  },
  {
    id: 'gulmandi',
    name: 'Gulmandi',
    locality: 'Old City Center',
    latitude: 19.8850,
    longitude: 75.3265,
    category: 'commercial',
  },
  {
    id: 'paithan-gate',
    name: 'Paithan Gate',
    locality: 'Khadkeshwar',
    latitude: 19.8790,
    longitude: 75.3245,
    category: 'landmark',
  },
  {
    id: 'shahgunj',
    name: 'Shahgunj Clock Tower',
    locality: 'Shahgunj',
    latitude: 19.8870,
    longitude: 75.3310,
    category: 'landmark',
  },
  {
    id: 'osmanpura',
    name: 'Osmanpura',
    locality: 'Station Road Area',
    latitude: 19.8680,
    longitude: 75.3310,
    category: 'commercial',
  },
  {
    id: 'airport-chikalthana',
    name: 'Chhatrapati Sambhajinagar Airport',
    locality: 'MIDC Chikalthana / Airport Rd',
    latitude: 19.8630,
    longitude: 75.3980,
    category: 'transit',
  },
  {
    id: 'mukundwadi',
    name: 'Mukundwadi Railway Crossing',
    locality: 'Mukundwadi, Jalna Road',
    latitude: 19.8740,
    longitude: 75.3720,
    category: 'transit',
  },
  {
    id: 'shendra-midc',
    name: 'Shendra MIDC / DMIC',
    locality: 'Shendra Industrial Area',
    latitude: 19.8710,
    longitude: 75.4850,
    category: 'industrial',
  },
  {
    id: 'padegaon',
    name: 'Padegaon Junction',
    locality: 'Cantonment Area',
    latitude: 19.8920,
    longitude: 75.2750,
    category: 'transit',
  },
  {
    id: 'mitmita',
    name: 'Mitmita',
    locality: 'Daulatabad Road',
    latitude: 19.9120,
    longitude: 75.2650,
    category: 'transit',
  },
  {
    id: 'bamu-university',
    name: 'Dr. BAMU University Main Campus',
    locality: 'University Road',
    latitude: 19.9010,
    longitude: 75.3120,
    category: 'landmark',
  },
  {
    id: 'harsul',
    name: 'Harsul T-Point',
    locality: 'Jalgaon Road, Harsul',
    latitude: 19.9250,
    longitude: 75.3550,
    category: 'transit',
  },
  {
    id: 'mondha-market',
    name: 'Jadhavwadi / New Mondha',
    locality: 'Jadhavwadi',
    latitude: 19.9080,
    longitude: 75.3420,
    category: 'commercial',
  },
];

const geocodeCache = new Map<string, { data: GeocodingResult[]; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return [];

  const results: GeocodingResult[] = [];

  // 1. Search expanded local Aurangabad locations first (instant 0ms response)
  const matchingLandmarks = COMPREHENSIVE_AURANGABAD_LOCATIONS.filter(
    (l) =>
      l.name.toLowerCase().includes(trimmed) ||
      l.locality.toLowerCase().includes(trimmed) ||
      l.id.toLowerCase().includes(trimmed)
  );

  for (const lm of matchingLandmarks) {
    results.push({
      displayName: `${lm.name}, ${lm.locality}, Chhatrapati Sambhajinagar (Aurangabad)`,
      latitude: lm.latitude,
      longitude: lm.longitude,
      isWithinBoundary: true,
      type: 'landmark',
      landmarkId: lm.id,
    });
  }

  // Fast path: if 2 or more local locations match, return immediately without network overhead
  if (results.length >= 2) {
    return results.slice(0, 8);
  }

  // 2. Check local memory cache
  const cacheKey = `geo:${trimmed}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const merged = [...results];
    for (const item of cached.data) {
      if (!merged.some((m) => Math.abs(m.latitude - item.latitude) < 0.001 && Math.abs(m.longitude - item.longitude) < 0.001)) {
        merged.push(item);
      }
    }
    return merged.slice(0, 8);
  }

  // 3. Fallback to Nominatim OpenStreetMap with a snappy 600ms timeout
  try {
    const encoded = encodeURIComponent(`${trimmed}, Aurangabad, Maharashtra, India`);
    const url = `${env.NOMINATIM_GEOCODING_URL}/search?q=${encoded}&format=json&addressdetails=1&limit=5&countrycodes=in`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600); // Snappy 600ms timeout for testing responsiveness

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': env.GEOCODING_USER_AGENT,
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const items = (await res.json()) as any[];
      const osmResults: GeocodingResult[] = [];

      for (const item of items) {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        const inBoundary = isPointInAurangabad(lat, lng);

        osmResults.push({
          displayName: item.display_name,
          latitude: lat,
          longitude: lng,
          isWithinBoundary: inBoundary,
          type: 'osm_address',
        });
      }

      geocodeCache.set(cacheKey, {
        data: osmResults,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      for (const item of osmResults) {
        if (!results.some((m) => Math.abs(m.latitude - item.latitude) < 0.001 && Math.abs(m.longitude - item.longitude) < 0.001)) {
          results.push(item);
        }
      }
    }
  } catch {
    // Nominatim timeout or rate-limit: local results continue to provide instant responsiveness
  }

  return results.slice(0, 8);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  // 1. Instant spatial nearest-neighbor search across Aurangabad landmarks (< 0.01ms)
  let bestLandmark: Landmark | null = null;
  let minDistanceKm = Infinity;

  for (const lm of COMPREHENSIVE_AURANGABAD_LOCATIONS) {
    const dLat = (lm.latitude - latitude) * 111.0;
    const dLng = (lm.longitude - longitude) * 111.0 * Math.cos((latitude * Math.PI) / 180);
    const distKm = Math.sqrt(dLat * dLat + dLng * dLng);

    if (distKm < minDistanceKm) {
      minDistanceKm = distKm;
      bestLandmark = lm;
    }
  }

  if (bestLandmark) {
    if (minDistanceKm < 0.4) {
      return `Near ${bestLandmark.name}, ${bestLandmark.locality}, Chhatrapati Sambhajinagar`;
    }
    if (minDistanceKm < 2.5) {
      return `${bestLandmark.name} Area (~${minDistanceKm.toFixed(1)} km), ${bestLandmark.locality}, Chhatrapati Sambhajinagar`;
    }
    if (minDistanceKm < 8.0) {
      return `${bestLandmark.locality} Sector (near ${bestLandmark.name}), Chhatrapati Sambhajinagar`;
    }
  }

  // 2. Optional fast Nominatim enrichment with snappy 500ms timeout
  try {
    const url = `${env.NOMINATIM_GEOCODING_URL}/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': env.GEOCODING_USER_AGENT,
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.display_name) return data.display_name;
    }
  } catch {
    // Fallback to formatted coordinates
  }

  return `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}, Chhatrapati Sambhajinagar`;
}

