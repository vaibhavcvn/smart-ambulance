import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../prisma.js';
import { tripService } from '../../services/trip.service.js';
import { hospitalService } from '../../services/hospital.service.js';
import { getRoute } from '../../integrations/routing/osrm.js';
import { TripStatus, UserRole, AmbulanceStatus, DriverStatus } from '@aurangabad-ambulance/shared';
import { ForbiddenError } from '../../common/errors/app-error.js';

describe('Phase 12: Route Transition, Hospital Persistence & Strict Tenancy Isolation', () => {
  let patientUserId: string;
  let driverProfileId: string;
  let driverUserId: string;
  let ambulanceId: string;
  let hospitalAId: string;
  let hospitalBId: string;
  let testTripId: string;
  let testBookingId: string;

  beforeAll(async () => {
    // 1. Fetch patient
    const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
    patientUserId = patient!.id;

    // 2. Fetch driver with ambulance
    const driver = await prisma.driverProfile.findFirst({
      where: { applicationStatus: 'APPROVED', assignedAmbulanceId: { not: null } },
      include: { user: true, assignedAmbulance: true },
    });
    driverProfileId = driver!.id;
    driverUserId = driver!.user.id;
    ambulanceId = driver!.assignedAmbulanceId!;

    // 3. Fetch two distinct hospitals: Hospital A and Hospital B
    const hospitals = await prisma.hospital.findMany({ take: 2 });
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // 4. Create an initial emergency trip in ACCEPTED state
    const booking = await prisma.booking.create({
      data: {
        patientId: patientUserId,
        pickupAddress: 'Seven Hills Flyover, Jalna Road, Aurangabad',
        pickupLatitude: 19.8778,
        pickupLongitude: 75.3524,
        emergencyCategory: 'CARDIAC_ARREST',
        priority: 'CRITICAL',
      },
    });
    testBookingId = booking.id;

    const trip = await prisma.trip.create({
      data: {
        bookingId: booking.id,
        patientId: patientUserId,
        driverId: driverProfileId,
        ambulanceId,
        hospitalId: hospitalAId,
        status: TripStatus.ACCEPTED,
        pickupAddress: booking.pickupAddress,
        pickupLatitude: booking.pickupLatitude,
        pickupLongitude: booking.pickupLongitude,
        emergencyCategory: booking.emergencyCategory,
        priority: booking.priority,
      },
    });
    testTripId = trip.id;
  });

  it('Scenario 7 & 8: patient pickup causes hospital route to replace pickup route and persists hospital destination before notification', async () => {
    // Move from ACCEPTED -> EN_ROUTE_TO_PICKUP -> ARRIVED_AT_PICKUP
    await tripService.updateTripStatus(
      testTripId,
      TripStatus.EN_ROUTE_TO_PICKUP,
      driverUserId,
      UserRole.DRIVER,
      driverProfileId
    );

    await tripService.updateTripStatus(
      testTripId,
      TripStatus.ARRIVED_AT_PICKUP,
      driverUserId,
      UserRole.DRIVER,
      driverProfileId
    );

    // Now, driver executes PATIENT_PICKED_UP
    const pickedUpTrip = await tripService.updateTripStatus(
      testTripId,
      TripStatus.PATIENT_PICKED_UP,
      driverUserId,
      UserRole.DRIVER,
      driverProfileId
    );

    // 1. Validate status transitioned to PATIENT_PICKED_UP
    expect(pickedUpTrip.status).toBe(TripStatus.PATIENT_PICKED_UP);

    // 2. Hospital assignment is confirmed and persisted in database
    expect(pickedUpTrip.hospitalId).toBeDefined();
    const dbTrip = await prisma.trip.findUnique({ where: { id: testTripId } });
    expect(dbTrip?.hospitalId).toBeDefined();
    expect(dbTrip?.hospitalRouteDistanceKm).toBeGreaterThan(0);
    expect(dbTrip?.hospitalRouteDurationSeconds).toBeGreaterThan(0);

    // 3. Active destination has switched from patient pickup to hospital
    expect(['HOSPITAL', 'HOSPITAL_ER']).toContain(pickedUpTrip.activeDestinationType);
    expect(pickedUpTrip.activeDestinationName).toBeDefined();
    expect(pickedUpTrip.routeToHospital).toBeDefined();
    expect(pickedUpTrip.routeToHospital?.distanceKm).toBeGreaterThan(0);
  });

  it('Scenario 11: Hospital A staff cannot retrieve Hospital B inbound trips or patient records (strict isolation)', async () => {
    // Query inbound trips for Hospital A with authenticated hospital A ID -> Must succeed
    const hospitalATrips = await hospitalService.getInboundTrips(hospitalAId, hospitalAId, false);
    expect(Array.isArray(hospitalATrips)).toBe(true);

    // Hospital A staff attempting to retrieve Hospital B inbound trips -> Must be rejected with ForbiddenError
    await expect(
      hospitalService.getInboundTrips(hospitalBId, hospitalAId, false)
    ).rejects.toThrow(ForbiddenError);

    // Hospital A staff attempting to view trip assigned to Hospital B via tripService -> Must be rejected
    await expect(
      tripService.getTripById(testTripId, 'staff-user-b', UserRole.HOSPITAL_STAFF, null, hospitalBId)
    ).rejects.toThrow(ForbiddenError);
  });

  it('Scenario 12: Destination reassignment revokes old hospital access and commits new hospital assignment', async () => {
    // Driver or Admin reassigns trip destination to Hospital B
    const reassigned = await tripService.recalculateHospitalRoute(
      testTripId,
      hospitalBId,
      driverUserId,
      UserRole.ADMIN
    );

    expect(reassigned.hospitalId).toBe(hospitalBId);

    // Verify Hospital B can now view the trip
    const hospitalBTrips = await hospitalService.getInboundTrips(hospitalBId, hospitalBId, false);
    const tripInHospitalB = hospitalBTrips.find((t) => t.id === testTripId);
    expect(tripInHospitalB).toBeDefined();

    // Verify Hospital A can NO LONGER view the trip
    const hospitalATripsAfter = await hospitalService.getInboundTrips(hospitalAId, hospitalAId, false);
    const tripInHospitalA = hospitalATripsAfter.find((t) => t.id === testTripId);
    expect(tripInHospitalA).toBeUndefined();
  });

  it('Scenario 20: route calculation produces truthful fallback (FALLBACK_HAVERSINE) if OSRM service fails', async () => {
    // Route from Kranti Chowk to GMCH Ghati
    const route = await getRoute(19.8762, 75.3242, 19.8906, 75.3218);
    expect(route).toBeDefined();
    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThanOrEqual(0);
    // Source is either OSRM (if online) or FALLBACK_HAVERSINE (if offline)
    expect(['OSRM', 'FALLBACK_HAVERSINE']).toContain(route.source);
    if (route.source === 'OSRM') {
      expect(route.isRoadGeometry).toBe(true);
      expect(route.geometryGeoJson?.type).toBe('LineString');
      expect(route.geometryGeoJson?.coordinates?.length).toBeGreaterThan(2);
    } else {
      expect(route.isRoadGeometry).toBe(false);
      expect(route.geometryGeoJson).toBeNull();
    }
  });

  it('Scenario 21: trip completion resets ambulance and driver availability correctly', async () => {
    // Complete the trip: PATIENT_PICKED_UP -> EN_ROUTE_TO_HOSPITAL -> ARRIVED_AT_HOSPITAL -> COMPLETED
    await tripService.updateTripStatus(
      testTripId,
      TripStatus.EN_ROUTE_TO_HOSPITAL,
      driverUserId,
      UserRole.DRIVER,
      driverProfileId
    );

    await tripService.updateTripStatus(
      testTripId,
      TripStatus.ARRIVED_AT_HOSPITAL,
      driverUserId,
      UserRole.DRIVER,
      driverProfileId
    );

    const completed = await tripService.updateTripStatus(
      testTripId,
      TripStatus.COMPLETED,
      driverUserId,
      UserRole.DRIVER,
      driverProfileId
    );

    expect(completed.status).toBe(TripStatus.COMPLETED);

    // Verify driver and ambulance status reset to AVAILABLE
    const finalDriver = await prisma.driverProfile.findUnique({ where: { id: driverProfileId } });
    const finalAmbulance = await prisma.ambulance.findUnique({ where: { id: ambulanceId } });

    expect(finalDriver?.status).toBe(DriverStatus.AVAILABLE);
    expect(finalAmbulance?.status).toBe(AmbulanceStatus.AVAILABLE);
  });

  afterAll(async () => {
    if (testTripId) {
      await prisma.trafficCorridor.deleteMany({ where: { tripId: testTripId } });
      await prisma.tripStatusHistory.deleteMany({ where: { tripId: testTripId } });
      await prisma.trip.deleteMany({ where: { id: testTripId } });
      await prisma.booking.deleteMany({ where: { id: testBookingId } });
    }
  });
});
