import { describe, it, expect } from 'vitest';
import { tripService } from '../../services/trip.service.js';
import { UserRole } from '@aurangabad-ambulance/shared';
import { prisma } from '../../prisma.js';

describe('Traffic Police Zero-PII Compliance', () => {
  it('strips all patient PII from traffic police responses while preserving operational fields', async () => {
    // 1. Fetch an active or seeded patient
    const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
    if (!patient) return;

    // 2. Create a test emergency booking with explicit sensitive patient data
    const booking = await prisma.booking.create({
      data: {
        patientId: patient.id,
        patientName: 'Confidential Patient VIP',
        patientPhone: '+91-9988776655',
        pickupAddress: 'Kranti Chowk, Aurangabad',
        pickupLatitude: 19.8762,
        pickupLongitude: 75.3242,
        emergencyCategory: 'CARDIAC_ARREST',
        priority: 'CRITICAL',
        notes: 'Sensitive medical history: Prior bypass surgery in 2021',
      },
    });

    const trip = await prisma.trip.create({
      data: {
        bookingId: booking.id,
        patientId: patient.id,
        status: 'REQUESTED',
        pickupAddress: booking.pickupAddress,
        pickupLatitude: booking.pickupLatitude,
        pickupLongitude: booking.pickupLongitude,
        emergencyCategory: booking.emergencyCategory,
        priority: booking.priority,
        notes: booking.notes,
      },
    });

    // 3. Query as ADMIN: PII is accessible for emergency administration
    const adminTrip = await tripService.getTripById(trip.id, UserRole.ADMIN);
    expect(adminTrip.patientName).toBe('Confidential Patient VIP');
    expect(adminTrip.patientPhone).toBe('+91-9988776655');
    expect(adminTrip.notes).toContain('Prior bypass surgery');

    // 4. Query as TRAFFIC_POLICE: Patient PII MUST be completely redacted
    const policeTrip = await tripService.getTripById(trip.id, UserRole.TRAFFIC_POLICE);
    expect(policeTrip.patientName).toBeUndefined();
    expect(policeTrip.patientPhone).toBeUndefined();
    expect(policeTrip.notes).toBeUndefined();

    // Verify operational transit information is preserved for green corridor management
    expect(policeTrip.id).toBe(trip.id);
    expect(policeTrip.priority).toBe('CRITICAL');
    expect(policeTrip.pickupLatitude).toBe(19.8762);
    expect(policeTrip.pickupLongitude).toBe(75.3242);

    // Clean up test records
    await prisma.trip.delete({ where: { id: trip.id } });
    await prisma.booking.delete({ where: { id: booking.id } });
  });
});
