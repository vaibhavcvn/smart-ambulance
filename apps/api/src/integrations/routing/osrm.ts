import { env } from '../../config/env.js';
import { TripRouteInfo } from '@aurangabad-ambulance/shared';

interface RoutingCacheEntry {
  data: TripRouteInfo;
  expiresAt: number;
}

const routingCache = new Map<string, RoutingCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export async function getRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<TripRouteInfo> {
  const cacheKey = `${originLat.toFixed(4)},${originLng.toFixed(4)}->${destLat.toFixed(4)},${destLng.toFixed(4)}`;
  const cached = routingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const directDistanceKm = calculateHaversineDistanceKm(originLat, originLng, destLat, destLng);
  let failureReason: string | null = null;

  try {
    // Standard OSRM coordinate format: {longitude},{latitude};{longitude},{latitude}
    const url = `${env.OSRM_ROUTING_URL}/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // Bounded 8s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': env.GEOCODING_USER_AGENT,
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as any;
      if (
        data.code === 'Ok' &&
        Array.isArray(data.routes) &&
        data.routes.length > 0
      ) {
        const primary = data.routes[0];
        const coordinates = primary.geometry?.coordinates;

        // Verify valid road geometry coordinates returned
        if (
          primary.geometry &&
          primary.geometry.type === 'LineString' &&
          Array.isArray(coordinates) &&
          coordinates.length >= 2 &&
          typeof primary.distance === 'number' &&
          typeof primary.duration === 'number'
        ) {
          const routeInfo: TripRouteInfo = {
            distanceKm: Math.round((primary.distance / 1000) * 100) / 100,
            durationSeconds: Math.round(primary.duration),
            geometryGeoJson: primary.geometry,
            source: 'OSRM',
            isRoadGeometry: true,
            pointCount: coordinates.length,
            failureReason: null,
            haversineDistanceKm: directDistanceKm,
            createdAt: new Date().toISOString(),
          };

          routingCache.set(cacheKey, {
            data: routeInfo,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          return routeInfo;
        } else {
          failureReason = 'OSRM returned malformed route geometry or empty coordinates';
        }
      } else {
        failureReason = `OSRM returned code: ${data.code || 'UNKNOWN'}`;
      }
    } else {
      failureReason = `OSRM HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      failureReason = 'OSRM routing request timed out after 8 seconds';
    } else {
      failureReason = err?.message || 'Network error reaching OSRM service';
    }
  }

  // Honest fallback: Do not synthesize fake straight lines as road geometry.
  // Preserve useful Haversine diagnostic distance, duration 0 (no invented ETA), null geometry.
  const fallbackInfo: TripRouteInfo = {
    distanceKm: directDistanceKm,
    durationSeconds: 0,
    geometryGeoJson: null,
    source: 'FALLBACK_HAVERSINE',
    isRoadGeometry: false,
    pointCount: 0,
    failureReason,
    haversineDistanceKm: directDistanceKm,
    createdAt: new Date().toISOString(),
  };

  // Only cache fallbacks for a very brief window (15s) so transient network glitches recover promptly
  routingCache.set(cacheKey, {
    data: fallbackInfo,
    expiresAt: Date.now() + 15000,
  });

  return fallbackInfo;
}

