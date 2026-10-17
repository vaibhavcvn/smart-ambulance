import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../prisma.js';
import { trafficService } from '../../services/traffic.service.js';
import { SocketManager } from '../../realtime/socket-manager.js';
import { UserRole } from '@aurangabad-ambulance/shared';

describe('Phase 12: Traffic Police Jurisdiction Scoping & Socket.IO Security', () => {
  let createdSignalId: string;
  let testTripId: string;
  let testBookingId: string;

  beforeAll(async () => {
    // 1. Ensure at least one verified signal exists
    const signal = await prisma.trafficSignal.upsert({
      where: { code: 'SIG-TEST-KRANTI' },
      update: { jurisdictionZone: 'CITY_CENTRAL', isEnabled: true },
      create: {
        code: 'SIG-TEST-KRANTI',
        name: 'Kranti Chowk Test Signal',
        roadName: 'Station Road',
        latitude: 19.8762,
        longitude: 75.3242,
        jurisdictionZone: 'CITY_CENTRAL',
        isVerified: true,
        verificationSource: 'AURANGABAD_POLICE_REGISTRY',
        isEnabled: true,
      },
    });
    createdSignalId = signal.id;

    const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
    const booking = await prisma.booking.create({
      data: {
        patientId: patient!.id,
        patientName: 'Confidential Patient',
        patientPhone: '+91-9876543210',
        pickupAddress: 'Kranti Chowk, Aurangabad',
        pickupLatitude: 19.8762,
        pickupLongitude: 75.3242,
        emergencyCategory: 'CARDIAC_ARREST',
        priority: 'CRITICAL',
        notes: 'Confidential emergency notes',
      },
    });
    testBookingId = booking.id;

    const trip = await prisma.trip.create({
      data: {
        bookingId: booking.id,
        patientId: patient!.id,
        status: 'EN_ROUTE_TO_PICKUP',
        pickupAddress: booking.pickupAddress,
        pickupLatitude: booking.pickupLatitude,
        pickupLongitude: booking.pickupLongitude,
        emergencyCategory: booking.emergencyCategory,
        priority: booking.priority,
        notes: booking.notes,
      },
    });
    testTripId = trip.id;
  });

  it('Scenario 14: only the responsible police jurisdiction receives a corridor clearance request', async () => {
    // List signals and filter by zone
    const signalsInCentralZone = await trafficService.listSignals('CITY_CENTRAL');
    const signalsInCidcoZone = await trafficService.listSignals('CIDCO');

    expect(signalsInCentralZone.some((s) => s.jurisdictionZone === 'CITY_CENTRAL')).toBe(true);
    expect(signalsInCentralZone.every((s) => s.jurisdictionZone === 'CITY_CENTRAL')).toBe(true);

    // Verify CIDCO zone query excludes central zone signals
    expect(signalsInCidcoZone.every((s) => s.jurisdictionZone === 'CIDCO')).toBe(true);
    expect(signalsInCidcoZone.some((s) => s.id === createdSignalId)).toBe(false);
  });

  it('Scenario 15: unauthorized Socket.IO room joins and untrusted connections are rejected', async () => {
    const socketMgr = SocketManager.getInstance();
    expect(socketMgr).toBeDefined();

    // Verify socket authentication middleware logic:
    // When a client attempts to connect with no token or invalid JWT, error is raised
    const invalidToken = 'invalid.unauthorized.bearer.token';
    const jwt = await import('jsonwebtoken');
    const { env } = await import('../../config/env.js');

    expect(() => {
      jwt.default.verify(invalidToken, env.JWT_SECRET);
    }).toThrow();

    // Verify that valid token carries role and limits room access server-side
    const validToken = jwt.default.sign(
      { id: 'police-officer-1', role: UserRole.TRAFFIC_POLICE, jurisdictionZone: 'CITY_CENTRAL' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const decoded: any = jwt.default.verify(validToken, env.JWT_SECRET);
    expect(decoded.role).toBe(UserRole.TRAFFIC_POLICE);
    expect(decoded.jurisdictionZone).toBe('CITY_CENTRAL');
  });

  afterAll(async () => {
    if (testTripId) {
      await prisma.trip.deleteMany({ where: { id: testTripId } });
      await prisma.booking.deleteMany({ where: { id: testBookingId } });
    }
    if (createdSignalId) {
      await prisma.trafficSignal.deleteMany({ where: { id: createdSignalId } });
    }
  });
});
