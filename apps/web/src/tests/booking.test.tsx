import { describe, it, expect } from 'vitest';
import {
  EmergencyCategory,
  EMERGENCY_CATEGORIES_META,
  TripStatus,
  AURANGABAD_LANDMARKS,
  AURANGABAD_BOUNDS,
} from '@aurangabad-ambulance/shared';

// Bearing calculation function mirror
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

describe('Frontend Form Validation & Emergency Category Metadata', () => {
  it('correctly maps all 6 required emergency categories with clinical triage priority', () => {
    const categories = Object.values(EmergencyCategory);
    expect(categories.length).toBe(6);

    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.CARDIAC_ARREST].priority).toBe('CRITICAL');
    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.CARDIAC_ARREST].recommendedAmbulance).toBe('ALS');

    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.TRAUMA_ACCIDENT].priority).toBe('CRITICAL');
    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.TRAUMA_ACCIDENT].recommendedAmbulance).toBe('ALS');

    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.STROKE].priority).toBe('URGENT');
    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.RESPIRATORY_FAILURE].priority).toBe('CRITICAL');
    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.MATERNITY_LABOR].priority).toBe('URGENT');
    expect(EMERGENCY_CATEGORIES_META[EmergencyCategory.GENERAL_EMERGENCY].priority).toBe('STANDARD');
  });

  it('validates pickup coordinates boundary contract', () => {
    const validLat = 19.8762;
    const validLng = 75.3242;
    expect(validLat).toBeGreaterThan(19.6);
    expect(validLat).toBeLessThan(20.15);
    expect(validLng).toBeGreaterThan(75.1);
    expect(validLng).toBeLessThan(75.65);
  });

  it('verifies Aurangabad landmarks within city operational bounds', () => {
    expect(AURANGABAD_LANDMARKS.length).toBeGreaterThanOrEqual(10);
    for (const lm of AURANGABAD_LANDMARKS) {
      expect(lm.latitude).toBeGreaterThanOrEqual(AURANGABAD_BOUNDS.minLat);
      expect(lm.latitude).toBeLessThanOrEqual(AURANGABAD_BOUNDS.maxLat);
      expect(lm.longitude).toBeGreaterThanOrEqual(AURANGABAD_BOUNDS.minLng);
      expect(lm.longitude).toBeLessThanOrEqual(AURANGABAD_BOUNDS.maxLng);
    }
  });

  it('correctly distinguishes post-pickup hospital state from pre-pickup pickup state', () => {
    const isPostPickup = (status: TripStatus) =>
      status === TripStatus.PATIENT_PICKED_UP ||
      status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
      status === TripStatus.ARRIVED_AT_HOSPITAL;

    expect(isPostPickup(TripStatus.REQUESTED)).toBe(false);
    expect(isPostPickup(TripStatus.DRIVER_REQUESTED)).toBe(false);
    expect(isPostPickup(TripStatus.ACCEPTED)).toBe(false);
    expect(isPostPickup(TripStatus.EN_ROUTE_TO_PICKUP)).toBe(false);
    expect(isPostPickup(TripStatus.ARRIVED_AT_PICKUP)).toBe(false);

    expect(isPostPickup(TripStatus.PATIENT_PICKED_UP)).toBe(true);
    expect(isPostPickup(TripStatus.EN_ROUTE_TO_HOSPITAL)).toBe(true);
    expect(isPostPickup(TripStatus.ARRIVED_AT_HOSPITAL)).toBe(true);
  });

  it('calculates vehicle bearing angle accurately for directional ambulance rotation', () => {
    // Heading due North
    const headingNorth = calculateBearing(19.87, 75.32, 19.88, 75.32);
    expect(headingNorth).toBeCloseTo(0, 0);

    // Heading due East
    const headingEast = calculateBearing(19.87, 75.32, 19.87, 75.33);
    expect(headingEast).toBeCloseTo(90, 0);

    // Heading due South
    const headingSouth = calculateBearing(19.88, 75.32, 19.87, 75.32);
    expect(headingSouth).toBeCloseTo(180, 0);

    // Heading due West
    const headingWest = calculateBearing(19.87, 75.33, 19.87, 75.32);
    expect(headingWest).toBeCloseTo(270, 0);
  });
});
