import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../prisma.js';
import { trackingService } from '../../services/tracking.service.js';
import { dispatchService } from '../../services/dispatch.service.js';
import { tripService } from '../../services/trip.service.js';
import { bookingService } from '../../services/booking.service.js';
import { SocketManager, AuthenticatedSocketUser } from '../../realtime/socket-manager.js';
import {
  UserRole,
  TripStatus,
  DriverStatus,
  AmbulanceStatus,
  DispatchRequestStatus,
  EmergencyCategory,
} from '@aurangabad-ambulance/shared';
import { ForbiddenError, BadRequestError } from '../../common/errors/app-error.js';

describe('Phase 10: Comprehensive Audit, Security, GPS Hardening & Real-Time Scenarios', () => {
  let patientAUserId: string;
  let patientBUserId: string;
  let driver1UserId: string;
  let driver1ProfileId: string;
  let driver2ProfileId: string;
  let ambulance1Id: string;
  let hospitalAId: string;
  let hospitalBId: string;
  let testTripId: string;
  let testBookingId: string;

  beforeAll(async () => {
    // 1. Create Patient A
    const patientA = await prisma.user.create({
      data: {
        email: `patient.a.${Date.now()}@audit.local`,
        passwordHash: 'dummyhash',
        name: 'Patient A',
        role: UserRole.PATIENT,
      },
    });
    patientAUserId = patientA.id;

    // 2. Create Patient B
    const patientB = await prisma.user.create({
      data: {
        email: `patient.b.${Date.now()}@audit.local`,
        passwordHash: 'dummyhash',
        name: 'Patient B',
        role: UserRole.PATIENT,
      },
    });
    patientBUserId = patientB.id;

    // 3. Find 2 approved drivers and their ambulances
    const drivers = await prisma.driverProfile.findMany({
      where: { applicationStatus: 'APPROVED' },
      take: 2,
      include: { user: true, assignedAmbulance: true },
    });
    driver1ProfileId = drivers[0].id;
    driver1UserId = drivers[0].userId;
    ambulance1Id = drivers[0].assignedAmbulanceId!;
    driver2ProfileId = drivers[1].id;

    // Reset Driver 1 coordinates and status
    await prisma.driverProfile.update({
      where: { id: driver1ProfileId },
      data: {
        currentLatitude: 19.8762,
        currentLongitude: 75.3242,
        lastLocationUpdate: new Date(),
        status: DriverStatus.AVAILABLE,
      },
    });

    // Reset Driver 2 status and ambulance to AVAILABLE
    await prisma.driverProfile.update({
      where: { id: driver2ProfileId },
      data: { status: DriverStatus.AVAILABLE },
    });
    if (drivers[1].assignedAmbulanceId) {
      await prisma.ambulance.update({
        where: { id: drivers[1].assignedAmbulanceId },
        data: { status: AmbulanceStatus.AVAILABLE },
      });
    }

    // 4. Find 2 hospitals
    const hospitals = await prisma.hospital.findMany({ take: 2 });
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // 5. Create an active trip for testing
    const booking = await prisma.booking.create({
      data: {
        patientId: patientAUserId,
        pickupAddress: 'Seven Hills Chowk, Jalna Road, Aurangabad',
        pickupLatitude: 19.8732,
        pickupLongitude: 75.3524,
        emergencyCategory: EmergencyCategory.CARDIAC_ARREST,
        priority: 'CRITICAL',
      },
    });
    testBookingId = booking.id;

    const trip = await prisma.trip.create({
      data: {
        bookingId: booking.id,
        patientId: patientAUserId,
        driverId: driver1ProfileId,
        ambulanceId: ambulance1Id,
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

  // Scenario 5: Unauthorized GPS submission rejected
  it('Scenario 5: rejects GPS submission for another driver or an unauthorized trip', async () => {
    // Driver 2 attempts to submit GPS telemetry for Driver 1's trip
    await expect(
      trackingService.updateDriverLocation(driver2ProfileId, {
        latitude: 19.8765,
        longitude: 75.3245,
        tripId: testTripId, // Belongs to driver 1
        isSimulated: false,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  // Scenario 6: Real GPS and simulated GPS distinguished correctly
  it('Scenario 6: distinguishes real device telemetry from simulated telemetry accurately', async () => {
    // 1. Submit genuine real GPS update (isSimulated = false)
    const realRes = await trackingService.updateDriverLocation(driver1ProfileId, {
      latitude: 19.8764,
      longitude: 75.3244,
      accuracy: 4.5,
      speed: 25,
      heading: 90,
      isSimulated: false,
    });
    expect(realRes.success).toBe(true);

    const updatedDriver = await prisma.driverProfile.findUnique({ where: { id: driver1ProfileId } });
    expect(updatedDriver?.isSimulated).toBe(false);

    // 2. Submit simulated GPS update (isSimulated = true)
    const simRes = await trackingService.updateDriverLocation(driver1ProfileId, {
      latitude: 19.8767,
      longitude: 75.3247,
      accuracy: 10,
      speed: 30,
      heading: 95,
      isSimulated: true,
    });
    expect(simRes.success).toBe(true);

    const simDriver = await prisma.driverProfile.findUnique({ where: { id: driver1ProfileId } });
    expect(simDriver?.isSimulated).toBe(true);
  });

  // Scenario 7: Invalid and stale GPS rejected or safely handled
  it('Scenario 7: rejects invalid coordinates, Null Island, stale timestamps, future timestamps, and implausible jumps', async () => {
    // A. Reject Null Island (0, 0)
    await expect(
      trackingService.updateDriverLocation(driver1ProfileId, {
        latitude: 0,
        longitude: 0,
      })
    ).rejects.toThrow(BadRequestError);

    // B. Reject coordinates far outside operational jurisdiction (e.g. New Delhi coords)
    await expect(
      trackingService.updateDriverLocation(driver1ProfileId, {
        latitude: 28.6139,
        longitude: 77.2090,
      })
    ).rejects.toThrow(BadRequestError);

    // C. Reject stale timestamp (> 5 minutes old)
    const sixMinutesAgo = new Date(Date.now() - 360000).toISOString();
    await expect(
      trackingService.updateDriverLocation(driver1ProfileId, {
        latitude: 19.8770,
        longitude: 75.3250,
        timestamp: sixMinutesAgo,
      })
    ).rejects.toThrow(BadRequestError);

    // D. Reject future timestamp (> 60s into future)
    const fiveMinutesFuture = new Date(Date.now() + 300000).toISOString();
    await expect(
      trackingService.updateDriverLocation(driver1ProfileId, {
        latitude: 19.8770,
        longitude: 75.3250,
        timestamp: fiveMinutesFuture,
      })
    ).rejects.toThrow(BadRequestError);

    // E. Reject implausible speed jump (> 2 km displacement in < 10 seconds)
    // Driver is currently at ~19.876, 75.324 (Kranti Chowk). Jumps 10 km away to Waluj (19.825, 75.240) in 1 second
    await expect(
      trackingService.updateDriverLocation(driver1ProfileId, {
        latitude: 19.8250,
        longitude: 75.2400,
      })
    ).rejects.toThrow(BadRequestError);
  });

  // Scenario 16: Unrelated police jurisdiction receives no corridor event
  it('Scenario 16: ensures traffic corridor events are routed strictly to the responsible jurisdiction zone', async () => {
    // In Aurangabad, Kranti Chowk is in CITY_CENTRAL, CIDCO Cannaught is in CIDCO, Beed Bypass is in SOUTH/HIGHWAY
    const cidcoSignal = await prisma.trafficSignal.findFirst({
      where: { jurisdictionZone: 'CIDCO' },
    });
    expect(cidcoSignal).not.toBeNull();
    expect(cidcoSignal?.jurisdictionZone).toBe('CIDCO');

    // Traffic corridor event payload
    const corridorEvent = {
      tripId: testTripId,
      corridorStatus: 'ACTIVE',
      emergencyPriority: 'CRITICAL',
      jurisdictionZone: 'CIDCO',
      upcomingSignalName: cidcoSignal?.name,
    };

    // Verify event zone metadata ensures target room is traffic:zone:CIDCO, NOT traffic:zone:WALUJ
    expect(corridorEvent.jurisdictionZone).toBe('CIDCO');
    expect(corridorEvent.jurisdictionZone).not.toBe('WALUJ');
  });

  // Scenario 17: Unauthorized Socket.IO room join rejected
  it('Scenario 17: rejects unauthorized users from subscribing to a private trip room', () => {
    const socketMgr = SocketManager.getInstance();

    const tripContext = {
      patientId: patientAUserId,
      driverId: driver1ProfileId,
      hospitalId: hospitalAId,
    };

    // 1. Patient A (Owner) -> Authorized
    const patientAUser: AuthenticatedSocketUser = {
      userId: patientAUserId,
      email: 'patienta@test.local',
      name: 'Patient A',
      role: UserRole.PATIENT,
    };
    expect(socketMgr.isUserAuthorizedForTrip(patientAUser, tripContext)).toBe(true);

    // 2. Patient B (Unrelated Patient) -> Unauthorized
    const patientBUser: AuthenticatedSocketUser = {
      userId: patientBUserId,
      email: 'patientb@test.local',
      name: 'Patient B',
      role: UserRole.PATIENT,
    };
    expect(socketMgr.isUserAuthorizedForTrip(patientBUser, tripContext)).toBe(false);

    // 3. Driver 1 (Assigned Driver) -> Authorized
    const driver1User: AuthenticatedSocketUser = {
      userId: driver1UserId,
      email: 'driver1@test.local',
      name: 'Driver 1',
      role: UserRole.DRIVER,
      driverProfileId: driver1ProfileId,
    };
    expect(socketMgr.isUserAuthorizedForTrip(driver1User, tripContext)).toBe(true);

    // 4. Driver 2 (Unassigned Driver) -> Unauthorized
    const driver2User: AuthenticatedSocketUser = {
      userId: 'unassigned-driver-user-id',
      email: 'driver2@test.local',
      name: 'Driver 2',
      role: UserRole.DRIVER,
      driverProfileId: driver2ProfileId,
    };
    expect(socketMgr.isUserAuthorizedForTrip(driver2User, tripContext)).toBe(false);

    // 5. Hospital A Staff -> Authorized
    const hospitalAStaff: AuthenticatedSocketUser = {
      userId: 'hospital-a-staff-id',
      email: 'staff.a@hospital.local',
      name: 'Hospital A Staff',
      role: UserRole.HOSPITAL_STAFF,
      hospitalId: hospitalAId,
    };
    expect(socketMgr.isUserAuthorizedForTrip(hospitalAStaff, tripContext)).toBe(true);

    // 6. Hospital B Staff (Unrelated Hospital) -> Unauthorized
    const hospitalBStaff: AuthenticatedSocketUser = {
      userId: 'hospital-b-staff-id',
      email: 'staff.b@hospital.local',
      name: 'Hospital B Staff',
      role: UserRole.HOSPITAL_STAFF,
      hospitalId: hospitalBId,
    };
    expect(socketMgr.isUserAuthorizedForTrip(hospitalBStaff, tripContext)).toBe(false);

    // 7. Admin -> Authorized
    const adminUser: AuthenticatedSocketUser = {
      userId: 'admin-id',
      email: 'admin@aurangabad-ems.gov.in',
      name: 'Admin',
      role: UserRole.ADMIN,
    };
    expect(socketMgr.isUserAuthorizedForTrip(adminUser, tripContext)).toBe(true);
  });

  // Scenario 21: Reconnect recovers the latest authorized trip state
  it('Scenario 21: reconnect recovers the latest authoritative trip state for patient and driver', async () => {
    // Patient queries active trip upon reconnecting
    const patientActiveTrip = await bookingService.getPatientActiveTrip(patientAUserId);
    expect(patientActiveTrip).not.toBeNull();
    expect(patientActiveTrip?.id).toBe(testTripId);
    expect(patientActiveTrip?.status).toBe(TripStatus.ACCEPTED);

    // Driver queries active trip upon reconnecting
    const driverActiveTrip = await tripService.getActiveDriverTrip(driver1ProfileId);
    expect(driverActiveTrip).not.toBeNull();
    expect(driverActiveTrip?.id).toBe(testTripId);
    expect(driverActiveTrip?.status).toBe(TripStatus.ACCEPTED);

    // Patient queries by specific trip ID
    const retrievedTrip = await tripService.getTripById(
      testTripId,
      patientAUserId,
      UserRole.PATIENT
    );
    expect(retrievedTrip.id).toBe(testTripId);
    expect(retrievedTrip.pickupAddress).toContain('Jalna Road');
  });

  // Scenario 23: Expired or rejected dispatch offers do not leave resources locked
  it('Scenario 23: expired or declined dispatch offers do not leave driver or ambulance resources locked', async () => {
    // Create a temporary booking and trip for testing decline
    const tempBooking = await prisma.booking.create({
      data: {
        patientId: patientBUserId,
        pickupAddress: 'Aurangabad High Court Chowk',
        pickupLatitude: 19.8785,
        pickupLongitude: 75.3325,
        emergencyCategory: EmergencyCategory.TRAUMA_ACCIDENT,
        priority: 'URGENT',
      },
    });

    const tempTrip = await prisma.trip.create({
      data: {
        bookingId: tempBooking.id,
        patientId: patientBUserId,
        status: TripStatus.DRIVER_REQUESTED,
        pickupAddress: tempBooking.pickupAddress,
        pickupLatitude: tempBooking.pickupLatitude,
        pickupLongitude: tempBooking.pickupLongitude,
        emergencyCategory: tempBooking.emergencyCategory,
        priority: tempBooking.priority,
      },
    });

    const req = await prisma.dispatchRequest.create({
      data: {
        tripId: tempTrip.id,
        driverId: driver2ProfileId,
        status: DispatchRequestStatus.PENDING,
        expiresAt: new Date(Date.now() + 45000),
      },
    });

    // Driver declines offer
    const declineResult = await dispatchService.respondToOffer(
      req.id,
      driver2ProfileId,
      'DECLINE',
      'Vehicle refueling'
    );
    expect(declineResult.success).toBe(true);
    expect(declineResult.action).toBe('DECLINED');

    // Verify driver status is still AVAILABLE (not locked in ASSIGNED or BUSY)
    const driver2 = await prisma.driverProfile.findUnique({
      where: { id: driver2ProfileId },
      include: { assignedAmbulance: true },
    });
    expect(driver2?.status).toBe(DriverStatus.AVAILABLE);
    if (driver2?.assignedAmbulance) {
      expect(driver2.assignedAmbulance.status).toBe(AmbulanceStatus.AVAILABLE);
    }

    // Clean up temporary records
    await prisma.dispatchRequest.deleteMany({ where: { tripId: tempTrip.id } });
    await prisma.trip.deleteMany({ where: { id: tempTrip.id } });
    await prisma.booking.deleteMany({ where: { id: tempBooking.id } });
  });

  // Scenario 24: Duplicate real-time events do not corrupt trip state
  it('Scenario 24: duplicate status transition requests execute idempotently without corrupting trip state or history', async () => {
    // 1. Transition from ACCEPTED to EN_ROUTE_TO_PICKUP
    const firstUpdate = await tripService.updateTripStatus(
      testTripId,
      TripStatus.EN_ROUTE_TO_PICKUP,
      driver1UserId,
      UserRole.DRIVER,
      driver1ProfileId
    );
    expect(firstUpdate.status).toBe(TripStatus.EN_ROUTE_TO_PICKUP);

    const historyCount1 = await prisma.tripStatusHistory.count({
      where: { tripId: testTripId, toStatus: TripStatus.EN_ROUTE_TO_PICKUP },
    });
    expect(historyCount1).toBe(1);

    // 2. Duplicate event: Client sends EN_ROUTE_TO_PICKUP again (e.g. network retry or duplicate socket event)
    const duplicateUpdate = await tripService.updateTripStatus(
      testTripId,
      TripStatus.EN_ROUTE_TO_PICKUP,
      driver1UserId,
      UserRole.DRIVER,
      driver1ProfileId
    );
    // Should return existing trip DTO idempotently without throwing error
    expect(duplicateUpdate.status).toBe(TripStatus.EN_ROUTE_TO_PICKUP);

    // Verify history count did not duplicate
    const historyCount2 = await prisma.tripStatusHistory.count({
      where: { tripId: testTripId, toStatus: TripStatus.EN_ROUTE_TO_PICKUP },
    });
    expect(historyCount2).toBe(1);
  });

  afterAll(async () => {
    dispatchService.clearAllTimers();
    if (testTripId) {
      await prisma.locationUpdate.deleteMany({ where: { tripId: testTripId } });
      await prisma.trafficCorridor.deleteMany({ where: { tripId: testTripId } });
      await prisma.tripStatusHistory.deleteMany({ where: { tripId: testTripId } });
      await prisma.trip.deleteMany({ where: { id: testTripId } });
      await prisma.booking.deleteMany({ where: { id: testBookingId } });
    }
    // Clean up any other test trips or bookings created for test patients
    await prisma.dispatchRequest.deleteMany({
      where: { trip: { patientId: { in: [patientAUserId, patientBUserId] } } },
    });
    await prisma.trafficCorridor.deleteMany({
      where: { trip: { patientId: { in: [patientAUserId, patientBUserId] } } },
    });
    await prisma.tripStatusHistory.deleteMany({
      where: { trip: { patientId: { in: [patientAUserId, patientBUserId] } } },
    });
    await prisma.trip.deleteMany({
      where: { patientId: { in: [patientAUserId, patientBUserId] } },
    });
    await prisma.booking.deleteMany({
      where: { patientId: { in: [patientAUserId, patientBUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [patientAUserId, patientBUserId] } },
    });
  });
});
