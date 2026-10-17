import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../prisma.js';
import { bookingService } from '../../services/booking.service.js';
import { dispatchService } from '../../services/dispatch.service.js';
import { EmergencyCategory, TripStatus, DispatchRequestStatus } from '@aurangabad-ambulance/shared';
import { ConflictError } from '../../common/errors/app-error.js';

describe('Dispatch Concurrency, Race Condition & Duplicate Prevention', () => {
  let testPatientId: string;
  let driver1ProfileId: string;
  let driver2ProfileId: string;
  let createdTripId: string;

  beforeAll(async () => {
    // Create isolated test patient
    const patient = await prisma.user.create({
      data: {
        email: `dispatch.concurrency.${Date.now()}@test.local`,
        passwordHash: 'dummy',
        name: 'Concurrency Test Patient',
        role: 'PATIENT',
      },
    });
    testPatientId = patient.id;

    const drivers = await prisma.driverProfile.findMany({
      where: { applicationStatus: 'APPROVED' },
      take: 2,
      include: { user: true, assignedAmbulance: true },
    });
    driver1ProfileId = drivers[0].id;
    driver2ProfileId = drivers[1].id;
  });

  it('prevents duplicate active emergency booking submissions for the same patient', async () => {
    // 1. First booking succeeds
    const trip1 = await bookingService.createBooking(testPatientId, {
      pickupAddress: 'Kranti Chowk, Aurangabad',
      pickupLatitude: 19.8762,
      pickupLongitude: 75.3242,
      emergencyCategory: EmergencyCategory.CARDIAC_ARREST,
    });
    createdTripId = trip1.id;
    expect(trip1.status).toBe(TripStatus.REQUESTED);

    // 2. Second concurrent booking by the same patient must be rejected with ConflictError
    await expect(
      bookingService.createBooking(testPatientId, {
        pickupAddress: 'CIDCO Cannaught Place, Aurangabad',
        pickupLatitude: 19.8885,
        pickupLongitude: 75.3582,
        emergencyCategory: EmergencyCategory.TRAUMA_ACCIDENT,
      })
    ).rejects.toThrow(ConflictError);
  });

  it('protects against race condition: two drivers attempting to accept the same trip', async () => {
    // Create two dispatch requests for the same trip to simulate concurrent offers
    const expiresAt = new Date(Date.now() + 45000);

    const req1 = await prisma.dispatchRequest.create({
      data: {
        tripId: createdTripId,
        driverId: driver1ProfileId,
        status: DispatchRequestStatus.PENDING,
        expiresAt,
      },
    });

    const req2 = await prisma.dispatchRequest.create({
      data: {
        tripId: createdTripId,
        driverId: driver2ProfileId,
        status: DispatchRequestStatus.PENDING,
        expiresAt,
      },
    });

    // Update trip to DRIVER_REQUESTED so it is ready for acceptance
    await prisma.trip.update({
      where: { id: createdTripId },
      data: { status: TripStatus.DRIVER_REQUESTED },
    });

    // Driver 1 accepts the offer -> Must succeed atomically
    const accept1 = await dispatchService.respondToOffer(req1.id, driver1ProfileId, 'ACCEPT');
    expect(accept1.success).toBe(true);
    expect(accept1.action).toBe('ACCEPTED');

    // Driver 2 attempts to accept the SAME trip -> MUST be rejected with ConflictError
    await expect(
      dispatchService.respondToOffer(req2.id, driver2ProfileId, 'ACCEPT')
    ).rejects.toThrow(ConflictError);

    // Verify trip is only assigned to Driver 1
    const finalTrip = await prisma.trip.findUnique({ where: { id: createdTripId } });
    expect(finalTrip?.driverId).toBe(driver1ProfileId);
    expect(finalTrip?.status).toBe(TripStatus.ACCEPTED);
  });

  it('rejects offer acceptance if the 45-second dispatch window has expired', async () => {
    // Create an expired request in the past
    const pastExpiry = new Date(Date.now() - 5000);
    const expiredReq = await prisma.dispatchRequest.create({
      data: {
        tripId: createdTripId,
        driverId: driver2ProfileId,
        status: DispatchRequestStatus.PENDING,
        expiresAt: pastExpiry,
      },
    });

    await expect(
      dispatchService.respondToOffer(expiredReq.id, driver2ProfileId, 'ACCEPT')
    ).rejects.toThrow(ConflictError);
  });

  afterAll(async () => {
    // Clean up created test trip
    if (createdTripId) {
      await prisma.trafficCorridor.deleteMany({ where: { tripId: createdTripId } });
      await prisma.tripStatusHistory.deleteMany({ where: { tripId: createdTripId } });
      await prisma.dispatchRequest.deleteMany({ where: { tripId: createdTripId } });
      await prisma.trip.deleteMany({ where: { id: createdTripId } });
      await prisma.booking.deleteMany({ where: { patientId: testPatientId } });
      await prisma.user.deleteMany({ where: { id: testPatientId } });
    }
  });
});
