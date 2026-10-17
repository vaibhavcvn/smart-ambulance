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

const geocodeCache = new Map<string, { data: GeocodingResult[]; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache for geocoded queries

export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return [];

  const results: GeocodingResult[] = [];

  // 1. Search local curated Aurangabad landmarks first (instant, reliable shortcuts)
  const matchingLandmarks = AURANGABAD_LANDMARKS.filter(
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

  // 2. Query Nominatim OpenStreetMap if query is longer and cached check
  const cacheKey = `geo:${trimmed}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    // Combine with landmarks avoiding duplicate lat/lng
    const merged = [...results];
    for (const item of cached.data) {
      if (!merged.some((m) => Math.abs(m.latitude - item.latitude) < 0.001 && Math.abs(m.longitude - item.longitude) < 0.001)) {
        merged.push(item);
      }
    }
    return merged.slice(0, 8);
  }

  try {
    const encoded = encodeURIComponent(`${trimmed}, Aurangabad, Maharashtra, India`);
    const url = `${env.NOMINATIM_GEOCODING_URL}/search?q=${encoded}&format=json&addressdetails=1&limit=5&countrycodes=in`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

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
  } catch (err) {
    // Nominatim rate-limit or network timeout: local landmarks continue to provide instant results
  }

  return results.slice(0, 8);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  // Check nearest landmark within 400m
  for (const lm of AURANGABAD_LANDMARKS) {
    const dLat = Math.abs(lm.latitude - latitude);
    const dLng = Math.abs(lm.longitude - longitude);
    if (dLat < 0.003 && dLng < 0.003) {
      return `Near ${lm.name}, ${lm.locality}, Chhatrapati Sambhajinagar`;
    }
  }

  try {
    const url = `${env.NOMINATIM_GEOCODING_URL}/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

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
  } catch (err) {
    // Ignore and fallback
  }

  return `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}, Chhatrapati Sambhajinagar`;
}
