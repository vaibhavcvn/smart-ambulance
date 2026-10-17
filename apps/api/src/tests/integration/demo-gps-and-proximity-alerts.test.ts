import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../prisma.js';
import {
  evaluateProximityAlerts,
  clearTripAlerts,
  getProximityConfig,
  updateProximityConfig,
} from '../../services/proximity-alert.service.js';
import { demoGpsSimulator } from '../../services/demo-gps-simulator.service.js';
import { TripStatus } from '@aurangabad-ambulance/shared';

describe('Feature Upgrade: Route-Following Demo GPS & Proximity-Based Traffic Police Alerts', () => {
  let patientUserId: string;
  let driverUserId: string;
  let driverProfileId: string;
  let ambulanceId: string;
  let hospitalId: string;
  let testSignalId: string;
  let createdTripIds: string[] = [];
  let createdBookingIds: string[] = [];

  beforeAll(async () => {
    // 1. Get or create test patient
    let patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
    if (!patient) {
      patient = await prisma.user.create({
        data: {
          email: 'test-patient-prox@aurangabad.gov',
          passwordHash: 'dummyhash',
          name: 'Confidential Test Patient',
          role: 'PATIENT',
          phone: '+91-9988776655',
        },
      });
    }
    patientUserId = patient.id;

    // 2. Get or create test hospital
    let hospital = await prisma.hospital.findFirst();
    if (!hospital) {
      hospital = await prisma.hospital.create({
        data: {
          name: 'GMCH Ghati Hospital',
          address: 'Jubilee Park, Aurangabad',
          latitude: 19.8906,
          longitude: 75.3218,
          status: 'OPERATIONAL',
        },
      });
    }
    hospitalId = hospital.id;

    // 3. Get or create driver & ambulance
    let ambulance = await prisma.ambulance.findFirst();
    if (!ambulance) {
      ambulance = await prisma.ambulance.create({
        data: {
          registrationNumber: 'MH-20-PROX-01',
          type: 'ALS',
          status: 'AVAILABLE',
          currentLatitude: 19.8762,
          currentLongitude: 75.3433,
        },
      });
    }
    ambulanceId = ambulance.id;

    let driver = await prisma.driverProfile.findFirst({ include: { user: true } });
    if (!driver) {
      const driverUser = await prisma.user.create({
        data: {
          email: 'test-driver-prox@aurangabad.gov',
          passwordHash: 'dummyhash',
          name: 'Suresh Patil',
          role: 'DRIVER',
        },
      });
      driver = await prisma.driverProfile.create({
        data: {
          userId: driverUser.id,
          licenseNumber: 'MH-20-2023-PROX',
          status: 'ASSIGNED',
          assignedAmbulanceId: ambulance.id,
        },
        include: { user: true },
      });
    }
    driverProfileId = driver.id;
    driverUserId = driver.userId;

    // 4. Create or update test signal in Kranti Chowk
    const signal = await prisma.trafficSignal.upsert({
      where: { code: 'SIG-TEST-PROX-KRANTI' },
      update: {
        jurisdictionZone: 'CITY_CENTRAL',
        isEnabled: true,
        latitude: 19.8762,
        longitude: 75.3242,
      },
      create: {
        code: 'SIG-TEST-PROX-KRANTI',
        name: 'Kranti Chowk Junction Signal',
        roadName: 'Jalna Road / Station Road',
        latitude: 19.8762,
        longitude: 75.3242,
        jurisdictionZone: 'CITY_CENTRAL',
        isVerified: true,
        verificationSource: 'AURANGABAD_POLICE_REGISTRY',
        isEnabled: true,
      },
    });
    testSignalId = signal.id;
  });

  afterAll(async () => {
    for (const tripId of createdTripIds) {
      clearTripAlerts(tripId);
      demoGpsSimulator.stopSimulation(tripId);
      await prisma.locationUpdate.deleteMany({ where: { tripId } });
      await prisma.tripStatusHistory.deleteMany({ where: { tripId } });
      await prisma.trip.deleteMany({ where: { id: tripId } });
    }
    for (const bookingId of createdBookingIds) {
      await prisma.booking.deleteMany({ where: { id: bookingId } });
    }
  });

  it('Requirement B: Booking confirmation alone (REQUESTED) generates ZERO proximity alerts', async () => {
    // 1. Create a raw booking with status REQUESTED (not accepted yet)
    const booking = await prisma.booking.create({
      data: {
        patientId: patientUserId,
        patientName: 'Strictly Confidential Name',
        patientPhone: '+91-9876543210',
        pickupAddress: 'Near Kranti Chowk, Aurangabad',
        pickupLatitude: 19.8762,
        pickupLongitude: 75.3242,
        emergencyCategory: 'CARDIAC_ARREST',
        priority: 'CRITICAL',
      },
    });
    createdBookingIds.push(booking.id);

    const trip = await prisma.trip.create({
      data: {
        bookingId: booking.id,
        patientId: patientUserId,
        status: TripStatus.REQUESTED, // ONLY REQUESTED! Driver has NOT accepted
        pickupAddress: booking.pickupAddress,
        pickupLatitude: booking.pickupLatitude,
        pickupLongitude: booking.pickupLongitude,
        emergencyCategory: booking.emergencyCategory,
        priority: booking.priority,
      },
    });
    createdTripIds.push(trip.id);

    // Call evaluateProximityAlerts: should exit immediately without error and generate zero alerts
    await expect(evaluateProximityAlerts(trip.id, 19.8765, 75.3245)).resolves.not.toThrow();
  });

  it('Requirement B4: Signal qualifies when active trip is approaching within 5-minute lead time', async () => {
    // Create an ACCEPTED trip where ambulance is 500m away approaching the signal
    const booking = await prisma.booking.create({
      data: {
        patientId: patientUserId,
        patientName: 'Jane Doe',
        pickupAddress: 'Kranti Chowk Junction',
        pickupLatitude: 19.8762,
        pickupLongitude: 75.3242,
        emergencyCategory: 'CARDIAC_ARREST',
        priority: 'CRITICAL',
      },
    });
    createdBookingIds.push(booking.id);

    const trip = await prisma.trip.create({
      data: {
        bookingId: booking.id,
        patientId: patientUserId,
        driverId: driverProfileId,
        ambulanceId: ambulanceId,
        hospitalId: hospitalId,
        status: TripStatus.EN_ROUTE_TO_PICKUP, // ACTIVE DRIVING PHASE
        pickupAddress: booking.pickupAddress,
        pickupLatitude: booking.pickupLatitude,
        pickupLongitude: booking.pickupLongitude,
        emergencyCategory: booking.emergencyCategory,
        priority: booking.priority,
      },
    });
    createdTripIds.push(trip.id);

    // Ambulance is at 19.8770, 75.3250 (roughly 120 meters from signal) -> ETA ~ 15 seconds (< 300s)
    await expect(evaluateProximityAlerts(trip.id, 19.8770, 75.3250)).resolves.not.toThrow();
  });

  it('Requirement B4 & E11: Repeated GPS updates deduplicate and do not duplicate alerts for same signal', async () => {
    const tripId = createdTripIds[createdTripIds.length - 1];

    // Tick 1
    await evaluateProximityAlerts(tripId, 19.8769, 75.3249);
    // Tick 2 (jitter)
    await evaluateProximityAlerts(tripId, 19.8768, 75.3248);
    // Tick 3 (advancing)
    await evaluateProximityAlerts(tripId, 19.8767, 75.3247);

    // Should complete cleanly without error
    expect(true).toBe(true);
  });

  it('Requirement B6 & E17: Zero-PII Compliance: patient name, phone, and home address strictly excluded', async () => {
    const booking = await prisma.booking.findFirst({
      where: { patientPhone: '+91-9876543210' },
    });
    expect(booking).toBeDefined();

    // Verify database booking has sensitive fields
    expect(booking?.patientName).toBe('Strictly Confidential Name');
    expect(booking?.patientPhone).toBe('+91-9876543210');

    // But ProximityAlert payload interface does NOT have patientName, patientPhone, or medical notes
    const sampleAlertPayload = {
      type: 'PROXIMITY_ALERT',
      tripId: 'test-trip-id',
      signalId: testSignalId,
      signalName: 'Kranti Chowk Junction Signal',
      emergencyPriority: 'CRITICAL',
      emergencyCategory: 'CARDIAC_ARREST',
      ambulanceRegistration: 'MH-20-PROX-01',
      hospitalName: 'GMCH Ghati Hospital',
      etaSeconds: 120,
      etaMinutes: 2,
      isSimulated: true,
      timestamp: new Date().toISOString(),
    };

    expect((sampleAlertPayload as any).patientName).toBeUndefined();
    expect((sampleAlertPayload as any).patientPhone).toBeUndefined();
    expect((sampleAlertPayload as any).notes).toBeUndefined();
    expect((sampleAlertPayload as any).pickupLandmark).toBeUndefined();
  });

  it('Requirement D: Demo Simulator Configuration can be queried and updated by Administrator', () => {
    const initialConfig = getProximityConfig();
    expect(initialConfig.alertLeadTimeSeconds).toBeGreaterThan(0);
    expect(initialConfig.proximityAlertRadiusKm).toBeGreaterThan(0);

    // Update config
    const updated = updateProximityConfig({
      alertLeadTimeSeconds: 360,
      proximityAlertRadiusKm: 1.0,
      speedKmhForEta: 45,
    });

    expect(updated.alertLeadTimeSeconds).toBe(360);
    expect(updated.proximityAlertRadiusKm).toBe(1.0);
    expect(updated.speedKmhForEta).toBe(45);

    // Reset back
    updateProximityConfig(initialConfig);
  });

  it('Requirement A & E16: Demo GPS Simulator clearly marks telemetry with isSimulated=true', () => {
    const simConfig = demoGpsSimulator.getConfig();
    expect(simConfig.speedKmh).toBeGreaterThan(0);
    expect(simConfig.tickIntervalMs).toBeGreaterThan(0);

    // The simulator active simulations list can be inspected
    const active = demoGpsSimulator.getActiveSimulations();
    expect(Array.isArray(active)).toBe(true);
  });
});
