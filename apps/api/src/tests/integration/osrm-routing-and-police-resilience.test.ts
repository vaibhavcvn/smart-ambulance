import { describe, it, expect, vi } from 'vitest';
import { getRoute, calculateHaversineDistanceKm } from '../../integrations/routing/osrm.js';
import { bookingService } from '../../services/booking.service.js';
import { trackingService } from '../../services/tracking.service.js';
import { trafficService } from '../../services/traffic.service.js';
import { TripStatus, EmergencyCategory, EmergencyPriority } from '@aurangabad-ambulance/shared';

describe('Regression Tests: OSRM Road Routing & Traffic Police Resilience', () => {
  it('OSRM Route Verification: returns road geometry with coordinates in [longitude, latitude] format', async () => {
    // Kranti Chowk (19.8762, 75.3242) to Seven Hills (19.8748, 75.3524)
    const route = await getRoute(19.8762, 75.3242, 19.8748, 75.3524);

    expect(route).toBeDefined();
    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.haversineDistanceKm).toBeGreaterThan(0);

    if (route.source === 'OSRM') {
      // Must follow actual roads
      expect(route.isRoadGeometry).toBe(true);
      expect(route.geometryGeoJson).toBeDefined();
      expect(route.geometryGeoJson.type).toBe('LineString');
      expect(Array.isArray(route.geometryGeoJson.coordinates)).toBe(true);
      expect(route.pointCount).toBeGreaterThan(5); // Genuine road following has dozens of vertices

      // Verify coordinate order: OSRM GeoJSON format is [longitude, latitude]
      // In Aurangabad, longitude is ~75.3x and latitude is ~19.8x
      const firstCoord = route.geometryGeoJson.coordinates[0];
      expect(firstCoord[0]).toBeGreaterThan(70); // Longitude first
      expect(firstCoord[0]).toBeLessThan(80);
      expect(firstCoord[1]).toBeGreaterThan(15); // Latitude second
      expect(firstCoord[1]).toBeLessThan(25);

      // Verify conversion to Leaflet format [latitude, longitude]
      const leafletCoords = route.geometryGeoJson.coordinates.map((c: [number, number]) => [c[1], c[0]]);
      expect(leafletCoords[0][0]).toBeCloseTo(19.876, 2); // Latitude first in Leaflet
      expect(leafletCoords[0][1]).toBeCloseTo(75.324, 2); // Longitude second in Leaflet
    }
  });

  it('Honest Fallback: when OSRM fails, does not synthesize fake straight-line road polyline', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Simulate network / service downtime for uncached coordinates
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('OSRM service connection refused'));

      const fallbackRoute = await getRoute(19.9123, 75.9123, 19.9456, 75.9456);

      expect(fallbackRoute).toBeDefined();
      expect(fallbackRoute.source).toBe('FALLBACK_HAVERSINE');
      expect(fallbackRoute.isRoadGeometry).toBe(false);
      // CRITICAL REQUIREMENT: Geometry must be null, NOT a synthesized 5-point straight line
      expect(fallbackRoute.geometryGeoJson).toBeNull();
      expect(fallbackRoute.pointCount).toBe(0);
      expect(fallbackRoute.failureReason).toContain('OSRM service connection refused');
      expect(fallbackRoute.durationSeconds).toBe(0); // No invented ETA
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('BookingService.mapToDTO: truthfully reports OSRM vs Haversine fallback and road geometry flag', () => {
    // 1. Mock trip with genuine OSRM polyline
    const mockTripWithRoad: any = {
      id: 'trip-osrm-1',
      bookingId: 'book-1',
      status: TripStatus.ACCEPTED,
      patientId: 'patient-1',
      pickupAddress: 'Seven Hills, Jalna Road',
      pickupLatitude: 19.8748,
      pickupLongitude: 75.3524,
      emergencyCategory: EmergencyCategory.TRAUMA_ACCIDENT,
      priority: EmergencyPriority.CRITICAL,
      routeDistanceKm: 3.8,
      routeDurationSeconds: 420,
      routePolyline: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [75.3242, 19.8762],
          [75.3350, 19.8755],
          [75.3450, 19.8750],
          [75.3524, 19.8748],
        ],
      }),
      requestedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dtoWithRoad = bookingService.mapToDTO(mockTripWithRoad);
    expect(dtoWithRoad.routeToPickup?.source).toBe('OSRM');
    expect(dtoWithRoad.routeToPickup?.isRoadGeometry).toBe(true);
    expect(dtoWithRoad.routeToPickup?.pointCount).toBe(4);
    expect(dtoWithRoad.routeToPickup?.geometryGeoJson).toBeDefined();

    // 2. Mock trip with NO polyline (Haversine fallback)
    const mockTripWithFallback: any = {
      id: 'trip-fallback-2',
      bookingId: 'book-2',
      status: TripStatus.ACCEPTED,
      patientId: 'patient-2',
      pickupAddress: 'Kranti Chowk',
      pickupLatitude: 19.8762,
      pickupLongitude: 75.3242,
      emergencyCategory: EmergencyCategory.CARDIAC_ARREST,
      priority: EmergencyPriority.CRITICAL,
      routeDistanceKm: 2.5,
      routeDurationSeconds: null,
      routePolyline: null, // No road polyline
      requestedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dtoWithFallback = bookingService.mapToDTO(mockTripWithFallback);
    expect(dtoWithFallback.routeToPickup?.source).toBe('FALLBACK_HAVERSINE');
    expect(dtoWithFallback.routeToPickup?.isRoadGeometry).toBe(false);
    expect(dtoWithFallback.routeToPickup?.geometryGeoJson).toBeNull();
    expect(dtoWithFallback.routeToPickup?.pointCount).toBe(0);
  });

  it('TrackingService.getFleetPositions: returns both currentLatitude/Longitude and latitude/longitude without throwing on null dates', async () => {
    const fleet = await trackingService.getFleetPositions();
    expect(Array.isArray(fleet)).toBe(true);

    if (fleet.length > 0) {
      const amb = fleet[0];
      // Must contain BOTH properties to satisfy Leaflet markers and map layers
      expect(amb.latitude).toBeDefined();
      expect(amb.longitude).toBeDefined();
      expect(amb.currentLatitude).toBeDefined();
      expect(amb.currentLongitude).toBeDefined();
      expect(typeof amb.currentLatitude).toBe('number');
      expect(typeof amb.currentLongitude).toBe('number');
      expect(isNaN(amb.currentLatitude)).toBe(false);
      expect(isNaN(amb.currentLongitude)).toBe(false);
      expect(amb.lastLocationUpdate).toBeDefined();
    }
  });

  it('Traffic Police Zero-PII: active corridors strictly exclude patient identification details', async () => {
    const corridors = await trafficService.getActiveCorridors('ALL');
    expect(Array.isArray(corridors)).toBe(true);

    for (const c of corridors) {
      // Must NOT contain patient personal information
      expect((c as any).patientName).toBeUndefined();
      expect((c as any).patientPhone).toBeUndefined();
      expect((c as any).patientEmail).toBeUndefined();
      expect((c as any).notes).toBeUndefined();

      // Must contain operational coordination data
      expect(c.corridorId).toBeDefined();
      expect(c.emergencyPriority).toBeDefined();
      expect(c.corridorStatus).toBeDefined();
    }
  });
});
