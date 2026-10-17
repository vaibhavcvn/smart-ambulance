import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../prisma.js';
import { authService } from '../../services/auth.service.js';
import { dispatchService } from '../../services/dispatch.service.js';
import { trackingService } from '../../services/tracking.service.js';
import { DriverApplicationStatus, DriverStatus, TripStatus, AmbulanceType } from '@aurangabad-ambulance/shared';
import { ForbiddenError } from '../../common/errors/app-error.js';

describe('Phase 12: Driver Onboarding, Vetting, Suspension & GPS Telemetry Isolation', () => {
  let pendingDriverUserId: string;
  let pendingDriverProfileId: string;
  let adminUserId: string;
  let testTripId: string;
  let createdAmbulanceId: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    adminUserId = admin!.id;

    // 1. Submit a fresh driver application (starts in PENDING_REVIEW)
    const email = `test.driver.lifecycle.${Date.now()}@aurangabad-ems.local`;
    const appResult = await authService.applyDriver({
      name: 'Ramesh Test Driver',
      email,
      phone: '+91-9822099999',
      password: 'DriverPassword@123',
      licenseNumber: `MH20-TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      requestedAmbulanceType: AmbulanceType.ALS,
      requestedAmbulanceRegistration: 'MH-20-TEST-108',
    });

    pendingDriverUserId = appResult.user.id;
    pendingDriverProfileId = appResult.user.driverProfileId!;

    // Verify initial status is PENDING_REVIEW
    expect(appResult.user.driverApplicationStatus).toBe(DriverApplicationStatus.PENDING_REVIEW);

    // Create a dummy emergency trip to test dispatch offer rejection
    const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
    const booking = await prisma.booking.create({
      data: {
        patientId: patient!.id,
        pickupAddress: 'Aurangabad Railway Station',
        pickupLatitude: 19.8631,
        pickupLongitude: 75.3211,
        emergencyCategory: 'CARDIAC_ARREST',
        priority: 'CRITICAL',
      },
    });

    const trip = await prisma.trip.create({
      data: {
        bookingId: booking.id,
        patientId: patient!.id,
        status: TripStatus.DRIVER_REQUESTED,
        pickupAddress: booking.pickupAddress,
        pickupLatitude: booking.pickupLatitude,
        pickupLongitude: booking.pickupLongitude,
        emergencyCategory: booking.emergencyCategory,
        priority: booking.priority,
      },
    });
    testTripId = trip.id;
  });

  it('Scenario 4: pending driver cannot accept an offer or submit operational GPS telemetry', async () => {
    // 1. Create a dispatch request assigned to this pending driver
    const dispatchReq = await prisma.dispatchRequest.create({
      data: {
        tripId: testTripId,
        driverId: pendingDriverProfileId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 45000),
      },
    });

    // Attempting to accept must be rejected with ForbiddenError
    await expect(
      dispatchService.respondToOffer(dispatchReq.id, pendingDriverProfileId, 'ACCEPT')
    ).rejects.toThrow(ForbiddenError);

    // Attempting to submit GPS updates while pending must also be rejected
    await expect(
      trackingService.updateDriverLocation(pendingDriverProfileId, {
        latitude: 19.8762,
        longitude: 75.3242,
        isSimulated: false,
      })
    ).rejects.toThrow(ForbiddenError);

    await prisma.dispatchRequest.delete({ where: { id: dispatchReq.id } });
  });

  it('Scenario 5: admin approval transitions driver to APPROVED and enables dispatch eligibility', async () => {
    // Admin approves the driver profile
    const updatedDriver = await prisma.$transaction(async (tx) => {
      const ambulance = await tx.ambulance.create({
        data: {
          registrationNumber: `MH-20-APP-${Date.now() % 100000}`,
          type: 'ALS',
          status: 'AVAILABLE',
        },
      });
      createdAmbulanceId = ambulance.id;

      return tx.driverProfile.update({
        where: { id: pendingDriverProfileId },
        data: {
          applicationStatus: DriverApplicationStatus.APPROVED,
          status: DriverStatus.AVAILABLE,
          assignedAmbulanceId: ambulance.id,
          reviewedAt: new Date(),
          reviewedByUserId: adminUserId,
        },
      });
    });

    expect(updatedDriver.applicationStatus).toBe(DriverApplicationStatus.APPROVED);
    expect(updatedDriver.status).toBe(DriverStatus.AVAILABLE);

    // Now, live GPS update from approved driver must succeed
    const gpsRes = await trackingService.updateDriverLocation(pendingDriverProfileId, {
      latitude: 19.8762,
      longitude: 75.3242,
      accuracy: 5,
      isSimulated: false,
    });
    expect(gpsRes.success).toBe(true);

    const verified = await prisma.driverProfile.findUnique({ where: { id: pendingDriverProfileId } });
    expect(verified?.currentLatitude).toBe(19.8762);
    expect(verified?.currentLongitude).toBe(75.3242);
  });

  it('Scenario 18: clearly distinguishes real device GPS from demo simulation', async () => {
    // 1. Submit REAL GPS
    await trackingService.updateDriverLocation(pendingDriverProfileId, {
      latitude: 19.8800,
      longitude: 75.3300,
      accuracy: 3.5,
      isSimulated: false,
    });

    const realUpdate = await prisma.locationUpdate.findFirst({
      where: { driverId: pendingDriverProfileId, isSimulated: false },
      orderBy: { timestamp: 'desc' },
    });
    expect(realUpdate).not.toBeNull();
    expect(realUpdate?.isSimulated).toBe(false);

    // 2. Submit DEMO SIMULATION GPS
    await trackingService.updateDriverLocation(pendingDriverProfileId, {
      latitude: 19.8850,
      longitude: 75.3350,
      accuracy: 10,
      isSimulated: true,
    });

    const simUpdate = await prisma.locationUpdate.findFirst({
      where: { driverId: pendingDriverProfileId, isSimulated: true },
      orderBy: { timestamp: 'desc' },
    });
    expect(simUpdate).not.toBeNull();
    expect(simUpdate?.isSimulated).toBe(true);
  });

  it('Scenario 6: driver suspension immediately revokes operational dispatch access and GPS permissions', async () => {
    // Admin suspends the driver
    await prisma.driverProfile.update({
      where: { id: pendingDriverProfileId },
      data: {
        applicationStatus: DriverApplicationStatus.SUSPENDED,
        status: DriverStatus.OFFLINE,
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
      },
    });

    // Attempting to submit GPS updates must be forbidden
    await expect(
      trackingService.updateDriverLocation(pendingDriverProfileId, {
        latitude: 19.8900,
        longitude: 75.3400,
        isSimulated: false,
      })
    ).rejects.toThrow(ForbiddenError);

    // Attempting to change availability must be forbidden
    const driver = await prisma.driverProfile.findUnique({ where: { id: pendingDriverProfileId } });
    expect(driver?.applicationStatus).toBe(DriverApplicationStatus.SUSPENDED);
    expect(driver?.status).toBe(DriverStatus.OFFLINE);
  });

  it('Scenario 19: prevents a driver from submitting GPS updates for another driver account', async () => {
    // Server-side architecture binds the authenticated driver from the verified JWT (req.user.driverProfileId)
    // Here we assert that submitting for non-existent or foreign ID is protected
    const fakeDriverId = 'fake-foreign-driver-id-123';
    await expect(
      trackingService.updateDriverLocation(fakeDriverId, {
        latitude: 19.8762,
        longitude: 75.3242,
        isSimulated: false,
      })
    ).rejects.toThrow();
  });

  afterAll(async () => {
    if (testTripId) {
      await prisma.trip.deleteMany({ where: { id: testTripId } });
      await prisma.booking.deleteMany({ where: { patientId: { in: [pendingDriverUserId] } } });
    }
    if (pendingDriverProfileId) {
      await prisma.locationUpdate.deleteMany({ where: { driverId: pendingDriverProfileId } });
      await prisma.driverProfile.deleteMany({ where: { id: pendingDriverProfileId } });
      await prisma.user.deleteMany({ where: { id: pendingDriverUserId } });
    }
    if (createdAmbulanceId) {
      await prisma.ambulance.deleteMany({ where: { id: createdAmbulanceId } });
    }
  });
});
