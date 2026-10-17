import { describe, it, expect } from 'vitest';
import {
  TripStatus,
  UserRole,
  isValidTripTransition,
  isTerminalTripStatus,
  isEnRouteStatus,
} from '@aurangabad-ambulance/shared';

describe('Trip Centralized State Machine', () => {
  it('allows valid sequential mission transitions', () => {
    // 1. DISPATCHING -> DRIVER_REQUESTED
    let res = isValidTripTransition(TripStatus.DISPATCHING, TripStatus.DRIVER_REQUESTED, UserRole.ADMIN);
    expect(res.valid).toBe(true);

    // 2. DRIVER_REQUESTED -> ACCEPTED (Driver)
    res = isValidTripTransition(TripStatus.DRIVER_REQUESTED, TripStatus.ACCEPTED, UserRole.DRIVER);
    expect(res.valid).toBe(true);

    // 3. ACCEPTED -> EN_ROUTE_TO_PICKUP (Driver)
    res = isValidTripTransition(TripStatus.ACCEPTED, TripStatus.EN_ROUTE_TO_PICKUP, UserRole.DRIVER);
    expect(res.valid).toBe(true);

    // 4. EN_ROUTE_TO_PICKUP -> ARRIVED_AT_PICKUP (Driver)
    res = isValidTripTransition(TripStatus.EN_ROUTE_TO_PICKUP, TripStatus.ARRIVED_AT_PICKUP, UserRole.DRIVER);
    expect(res.valid).toBe(true);

    // 5. ARRIVED_AT_PICKUP -> PATIENT_PICKED_UP (Driver)
    res = isValidTripTransition(TripStatus.ARRIVED_AT_PICKUP, TripStatus.PATIENT_PICKED_UP, UserRole.DRIVER);
    expect(res.valid).toBe(true);

    // 6. PATIENT_PICKED_UP -> EN_ROUTE_TO_HOSPITAL (Driver)
    res = isValidTripTransition(TripStatus.PATIENT_PICKED_UP, TripStatus.EN_ROUTE_TO_HOSPITAL, UserRole.DRIVER);
    expect(res.valid).toBe(true);

    // 7. EN_ROUTE_TO_HOSPITAL -> ARRIVED_AT_HOSPITAL (Driver)
    res = isValidTripTransition(TripStatus.EN_ROUTE_TO_HOSPITAL, TripStatus.ARRIVED_AT_HOSPITAL, UserRole.DRIVER);
    expect(res.valid).toBe(true);

    // 8. ARRIVED_AT_HOSPITAL -> COMPLETED (Driver or Hospital Staff)
    res = isValidTripTransition(TripStatus.ARRIVED_AT_HOSPITAL, TripStatus.COMPLETED, UserRole.HOSPITAL_STAFF);
    expect(res.valid).toBe(true);
  });

  it('rejects out-of-order and illegal state transitions', () => {
    // Driver cannot jump directly from REQUESTED to COMPLETED
    let res = isValidTripTransition(TripStatus.REQUESTED, TripStatus.COMPLETED, UserRole.DRIVER);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Illegal state transition');

    // Driver cannot mark ARRIVED_AT_HOSPITAL before picking up patient
    res = isValidTripTransition(TripStatus.EN_ROUTE_TO_PICKUP, TripStatus.ARRIVED_AT_HOSPITAL, UserRole.DRIVER);
    expect(res.valid).toBe(false);

    // Completed trip cannot be cancelled
    res = isValidTripTransition(TripStatus.COMPLETED, TripStatus.CANCELLED, UserRole.PATIENT);
    expect(res.valid).toBe(false);
  });

  it('enforces strict role-based transition authorization', () => {
    // Patient cannot mark themselves as PATIENT_PICKED_UP
    const res = isValidTripTransition(TripStatus.ARRIVED_AT_PICKUP, TripStatus.PATIENT_PICKED_UP, UserRole.PATIENT);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('not authorized');
  });

  it('identifies terminal and en-route statuses accurately', () => {
    expect(isTerminalTripStatus(TripStatus.COMPLETED)).toBe(true);
    expect(isTerminalTripStatus(TripStatus.CANCELLED)).toBe(true);
    expect(isTerminalTripStatus(TripStatus.EXPIRED)).toBe(true);
    expect(isTerminalTripStatus(TripStatus.EN_ROUTE_TO_PICKUP)).toBe(false);

    expect(isEnRouteStatus(TripStatus.EN_ROUTE_TO_PICKUP)).toBe(true);
    expect(isEnRouteStatus(TripStatus.EN_ROUTE_TO_HOSPITAL)).toBe(true);
    expect(isEnRouteStatus(TripStatus.ARRIVED_AT_PICKUP)).toBe(false);
  });
});
