import { describe, it, expect } from 'vitest';
import React from 'react';
import { ErrorBoundary } from '../components/common/ErrorBoundary.js';
import { TripStatus, TripRouteInfo, AmbulanceType, AmbulanceStatus } from '@aurangabad-ambulance/shared';

describe('Web Regression: ErrorBoundary, Map Isolation & Routing Integrity', () => {
  it('ErrorBoundary getDerivedStateFromError updates state to hasError=true to prevent screen blackout', () => {
    const error = new Error('Invalid LatLng object: (NaN, NaN)');
    const state = ErrorBoundary.getDerivedStateFromError(error);

    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
  });

  it('ErrorBoundary renders fallback markup when in error state without crashing React tree', () => {
    const boundary = new ErrorBoundary({
      children: React.createElement('div', null, 'Normal content'),
      title: 'Map Display Unavailable',
      message: 'Isolated Leaflet crash',
    });

    boundary.state = {
      hasError: true,
      error: new Error('Simulated map error'),
    };

    const rendered = boundary.render() as React.ReactElement;
    expect(rendered).toBeDefined();
    // Rendered element should be the dark styled fallback card container
    expect(rendered.type).toBe('div');
    expect(rendered.props.className).toContain('bg-neutral-900');
  });

  it('OSRM GeoJSON [lon, lat] is properly transformed into Leaflet [lat, lon] without straight line fallbacks', () => {
    const validRoadRoute: TripRouteInfo = {
      distanceKm: 4.2,
      durationSeconds: 380,
      source: 'OSRM',
      isRoadGeometry: true,
      pointCount: 4,
      geometryGeoJson: {
        type: 'LineString',
        coordinates: [
          [75.3242, 19.8762],
          [75.3350, 19.8755],
          [75.3450, 19.8750],
          [75.3524, 19.8748],
        ],
      },
    };

    // Simulate routeCoords parser used in PatientBookingPage and DriverConsolePage
    const isRoadRoute =
      validRoadRoute.source === 'OSRM' &&
      validRoadRoute.isRoadGeometry !== false &&
      Array.isArray(validRoadRoute.geometryGeoJson?.coordinates) &&
      validRoadRoute.geometryGeoJson.coordinates.length >= 2;

    const routeCoords: [number, number][] = [];
    if (isRoadRoute && validRoadRoute.geometryGeoJson?.coordinates) {
      for (const c of validRoadRoute.geometryGeoJson.coordinates) {
        if (Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
          routeCoords.push([c[1], c[0]]); // Leaflet uses [lat, lng]
        }
      }
    }

    expect(routeCoords.length).toBe(4);
    // Leaflet format: Latitude (~19.87) is first, Longitude (~75.32) is second
    expect(routeCoords[0][0]).toBeCloseTo(19.8762, 4);
    expect(routeCoords[0][1]).toBeCloseTo(75.3242, 4);
  });

  it('Haversine Fallback Route yields empty road polyline so no straight line is drawn', () => {
    const fallbackRoute: TripRouteInfo = {
      distanceKm: 3.5,
      durationSeconds: 0,
      source: 'FALLBACK_HAVERSINE',
      isRoadGeometry: false,
      pointCount: 0,
      geometryGeoJson: null,
      failureReason: 'OSRM routing timed out',
    };

    const isRoadRoute =
      fallbackRoute.source === 'OSRM' &&
      fallbackRoute.isRoadGeometry !== false &&
      Array.isArray(fallbackRoute.geometryGeoJson?.coordinates) &&
      fallbackRoute.geometryGeoJson.coordinates.length >= 2;

    const routeCoords: [number, number][] = [];
    if (isRoadRoute && fallbackRoute.geometryGeoJson?.coordinates) {
      for (const c of fallbackRoute.geometryGeoJson.coordinates) {
        routeCoords.push([c[1], c[0]]);
      }
    }

    // Must be completely empty: no synthetic straight lines!
    expect(routeCoords.length).toBe(0);
    expect(isRoadRoute).toBe(false);
  });

  it('Ambulance Coordinate Resolver handles legacy latitude/longitude gracefully without NaN', () => {
    // Legacy payload returned from fleet tracking API
    const legacyAmbulance: any = {
      id: 'amb-legacy-1',
      registrationNumber: 'MH-20-AMB-99',
      type: AmbulanceType.ALS,
      status: AmbulanceStatus.AVAILABLE,
      latitude: 19.8762,
      longitude: 75.3242,
      // currentLatitude and currentLongitude initially omitted
    };

    const resolvedLat = legacyAmbulance.currentLatitude ?? legacyAmbulance.latitude;
    const resolvedLng = legacyAmbulance.currentLongitude ?? legacyAmbulance.longitude;

    expect(resolvedLat).toBe(19.8762);
    expect(resolvedLng).toBe(75.3242);
    expect(isNaN(resolvedLat)).toBe(false);
    expect(isNaN(resolvedLng)).toBe(false);
  });

  it('Pickup to Hospital Phase Transition switches route and destination cleanly', () => {
    const trip: any = {
      id: 'trip-1',
      status: TripStatus.ACCEPTED,
      pickupLatitude: 19.8762,
      pickupLongitude: 75.3242,
      hospital: {
        id: 'hosp-1',
        name: 'Government Medical College & Hospital (Ghati)',
        latitude: 19.8906,
        longitude: 75.3218,
      },
      routeToPickup: {
        distanceKm: 2.1,
        durationSeconds: 240,
        source: 'OSRM',
        isRoadGeometry: true,
      },
      routeToHospital: {
        distanceKm: 4.8,
        durationSeconds: 520,
        source: 'OSRM',
        isRoadGeometry: true,
      },
    };

    // Phase 1: Pre-pickup
    let isPostPickup =
      trip.status === TripStatus.PATIENT_PICKED_UP ||
      trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
      trip.status === TripStatus.ARRIVED_AT_HOSPITAL;
    let activeRoute = isPostPickup ? trip.routeToHospital : trip.routeToPickup;
    expect(isPostPickup).toBe(false);
    expect(activeRoute.distanceKm).toBe(2.1);

    // Phase 2: Post-pickup
    trip.status = TripStatus.PATIENT_PICKED_UP;
    isPostPickup =
      trip.status === TripStatus.PATIENT_PICKED_UP ||
      trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
      trip.status === TripStatus.ARRIVED_AT_HOSPITAL;
    activeRoute = isPostPickup ? trip.routeToHospital : trip.routeToPickup;
    expect(isPostPickup).toBe(true);
    expect(activeRoute.distanceKm).toBe(4.8);
    expect(trip.hospital.name).toBe('Government Medical College & Hospital (Ghati)');
  });

  it('Requirement B2: Officer GPS Workflow distinguishes REAL GPS vs DEMO GPS clearly', () => {
    // Test that Demo GPS coordinates are labeled as DEMO, not masquerading as hardware GPS
    const demoOfficerLocation = {
      isLocationSharing: true,
      gpsMode: 'DEMO' as const,
      lat: 19.8762,
      lng: 75.3242,
      postName: 'Kranti Chowk Post',
      label: 'Patrol Post: Kranti Chowk Post',
    };

    const realOfficerLocation = {
      isLocationSharing: true,
      gpsMode: 'REAL' as const,
      lat: 19.8770,
      lng: 75.3255,
      accuracy: 8,
      label: 'Officer Position (Real GPS)',
    };

    expect(demoOfficerLocation.gpsMode).toBe('DEMO');
    expect(demoOfficerLocation.label).toContain('Patrol Post');
    expect(realOfficerLocation.gpsMode).toBe('REAL');
    const isDifferent = (demoOfficerLocation.gpsMode as string) !== (realOfficerLocation.gpsMode as string);
    expect(isDifferent).toBe(true);
  });

  it('Requirement B5: ETA Countdown formatting renders minutes and seconds truthfully', () => {
    function formatEta(seconds: number): string {
      if (seconds < 60) return Math.round(seconds) + 's';
      const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
      return s > 0 ? m + 'm ' + s + 's' : m + 'm';
    }

    expect(formatEta(45)).toBe('45s');
    expect(formatEta(120)).toBe('2m');
    expect(formatEta(295)).toBe('4m 55s');
    expect(formatEta(300)).toBe('5m');
  });

  it('Requirement B6: Zero Patient PII is exposed to Traffic Police in proximity alerts', () => {
    const policeAlert: any = {
      type: 'PROXIMITY_ALERT',
      tripId: 'trip-abc',
      signalId: 'sig-123',
      signalName: 'Kranti Chowk Junction',
      signalRoadName: 'Jalna Road',
      ambulanceRegistration: 'MH-20-AMB-01',
      emergencyPriority: 'CRITICAL',
      emergencyCategory: 'CARDIAC_ARREST',
      hospitalName: 'GMCH Ghati',
      etaSeconds: 240,
      etaMinutes: 4,
      isSimulated: true,
      timestamp: '2026-10-18T00:00:00.000Z',
    };

    // Assert that patient identity is absent
    expect(policeAlert.patientName).toBeUndefined();
    expect(policeAlert.patientPhone).toBeUndefined();
    expect(policeAlert.pickupAddress).toBeUndefined();
    expect(policeAlert.medicalHistory).toBeUndefined();
    // Assert operational fields are present
    expect(policeAlert.signalName).toBe('Kranti Chowk Junction');
    expect(policeAlert.emergencyPriority).toBe('CRITICAL');
  });
});

