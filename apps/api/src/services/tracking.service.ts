import { prisma } from '../prisma.js';
import {
  DriverLocationUpdateInput,
  TripStatus,
  DriverApplicationStatus,
} from '@aurangabad-ambulance/shared';
import { NotFoundError, BadRequestError, ForbiddenError } from '../common/errors/app-error.js';
import { SocketManager } from '../realtime/socket-manager.js';
import { env } from '../config/env.js';
import { trafficService } from './traffic.service.js';
import { calculateHaversineDistanceKm } from '../integrations/routing/osrm.js';
import { evaluateProximityAlerts } from './proximity-alert.service.js';

export class TrackingService {
  public async updateDriverLocation(
    driverProfileId: string,
    input: DriverLocationUpdateInput
  ): Promise<{ success: boolean; timestamp: string }> {
    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: { assignedAmbulance: true },
    });

    if (!driver) {
      throw new NotFoundError('Driver profile not found.');
    }

    // Only approved drivers can submit live operational telemetry
    if (driver.applicationStatus !== DriverApplicationStatus.APPROVED) {
      throw new ForbiddenError(
        `Driver application status is "${driver.applicationStatus}". Only approved drivers may broadcast operational GPS telemetry.`
      );
    }

    if (driver.status === 'SUSPENDED') {
      throw new ForbiddenError('Suspended drivers are prohibited from submitting operational GPS telemetry.');
    }

    // Simulation policy check: prevent simulated telemetry if simulator is disabled in production
    if (input.isSimulated && !env.ENABLE_DEMO_GPS_SIMULATOR) {
      throw new ForbiddenError('Demo GPS simulation is disabled in this environment.');
    }

    // Coordinate validation
    if (
      typeof input.latitude !== 'number' ||
      typeof input.longitude !== 'number' ||
      isNaN(input.latitude) ||
      isNaN(input.longitude) ||
      input.latitude < -90 ||
      input.latitude > 90 ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new BadRequestError('Invalid coordinates supplied.');
    }

    // Obviously invalid coordinates (0, 0)
    if (Math.abs(input.latitude) < 0.0001 && Math.abs(input.longitude) < 0.0001) {
      throw new BadRequestError('Coordinates (0, 0) are invalid.');
    }

    // Regional boundary check: Aurangabad and surrounding operational zone (19.0 to 20.5 Lat, 74.5 to 76.5 Lng)
    if (
      input.latitude < 19.0 ||
      input.latitude > 20.5 ||
      input.longitude < 74.5 ||
      input.longitude > 76.5
    ) {
      throw new BadRequestError('Coordinates lie outside operational jurisdiction.');
    }

    const now = new Date();
    let telemetryTimestamp = now;

    // Stale or future timestamp validation
    if (input.timestamp) {
      const parsedTime = new Date(input.timestamp);
      if (isNaN(parsedTime.getTime())) {
        throw new BadRequestError('Invalid timestamp format provided.');
      }
      const ageSeconds = (now.getTime() - parsedTime.getTime()) / 1000;
      if (ageSeconds > 300) {
        throw new BadRequestError(`Stale GPS telemetry rejected: timestamp is ${Math.round(ageSeconds)}s old (max 300s).`);
      }
      if (ageSeconds < -60) {
        throw new BadRequestError('Future GPS timestamp rejected.');
      }
      telemetryTimestamp = parsedTime;
    }

    // Unauthorized trip check: If client sends tripId, verify it belongs to this driver
    if (input.tripId) {
      const specifiedTrip = await prisma.trip.findUnique({
        where: { id: input.tripId },
      });
      if (!specifiedTrip || specifiedTrip.driverId !== driverProfileId) {
        throw new ForbiddenError('You are not authorized to submit telemetry for another driver\'s trip.');
      }
    }

    // Detect excessive jumps / implausible speed (> 720 km/h jump in < 10s)
    let shouldThrottleDbLog = false;
    if (
      driver.lastLocationUpdate &&
      driver.currentLatitude !== null &&
      driver.currentLongitude !== null
    ) {
      const distKm = calculateHaversineDistanceKm(
        driver.currentLatitude,
        driver.currentLongitude,
        input.latitude,
        input.longitude
      );
      const timeDiffSeconds = Math.max(
        0.1,
        (now.getTime() - driver.lastLocationUpdate.getTime()) / 1000
      );

      if (timeDiffSeconds < 10 && distKm > 2.0) {
        throw new BadRequestError(
          `Implausible GPS jump detected: position jumped ${distKm.toFixed(1)} km in ${timeDiffSeconds.toFixed(1)}s.`
        );
      }

      // Throttle DB table inserts if updates arrive faster than 1.5s with minimal displacement (< 5 meters)
      if (timeDiffSeconds < 1.5 && distKm < 0.005) {
        shouldThrottleDbLog = true;
      }
    }

    // 1. Find currently active trip if any
    const activeTrip = await prisma.trip.findFirst({
      where: {
        driverId: driverProfileId,
        status: {
          in: [
            TripStatus.ACCEPTED,
            TripStatus.EN_ROUTE_TO_PICKUP,
            TripStatus.ARRIVED_AT_PICKUP,
            TripStatus.PATIENT_PICKED_UP,
            TripStatus.EN_ROUTE_TO_HOSPITAL,
            TripStatus.ARRIVED_AT_HOSPITAL,
          ],
        },
      },
    });

    // 2. Persist location updates in transaction
    await prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { id: driverProfileId },
        data: {
          currentLatitude: input.latitude,
          currentLongitude: input.longitude,
          lastLocationUpdate: now,
          isSimulated: input.isSimulated || false,
        },
      });

      if (driver.assignedAmbulanceId) {
        await tx.ambulance.update({
          where: { id: driver.assignedAmbulanceId },
          data: {
            currentLatitude: input.latitude,
            currentLongitude: input.longitude,
            lastLocationUpdate: now,
            isSimulated: input.isSimulated || false,
          },
        });
      }

      // Avoid database bloat: insert row only if not throttled
      if (!shouldThrottleDbLog) {
        await tx.locationUpdate.create({
          data: {
            driverId: driverProfileId,
            ambulanceId: driver.assignedAmbulanceId,
            tripId: activeTrip?.id || null,
            latitude: input.latitude,
            longitude: input.longitude,
            speed: input.speed,
            heading: input.heading,
            accuracy: input.accuracy,
            isSimulated: input.isSimulated || false,
            timestamp: telemetryTimestamp,
          },
        });
      }
    });

    // 3. Emit real-time telemetry to authorized subscribers
    SocketManager.getInstance().emitDriverLocation(driverProfileId, activeTrip?.id || null, {
      driverId: driverProfileId,
      ambulanceId: driver.assignedAmbulanceId,
      tripId: activeTrip?.id || null,
      latitude: input.latitude,
      longitude: input.longitude,
      speed: input.speed,
      heading: input.heading,
      accuracy: input.accuracy,
      isSimulated: input.isSimulated || false,
      timestamp: now.toISOString(),
    });

    // 4. Update upcoming traffic signal and evaluate proximity-based police alerts
    if (activeTrip) {
      trafficService
        .updateUpcomingSignalForTrip(activeTrip.id, input.latitude, input.longitude)
        .catch(console.warn);

      // Proximity-based route-aware traffic police alerting (5-min lead time, jurisdiction-filtered)
      evaluateProximityAlerts(activeTrip.id, input.latitude, input.longitude).catch(console.warn);
    }

    return { success: true, timestamp: now.toISOString() };
  }

  public async getFleetPositions(): Promise<any[]> {
    const ambulances = await prisma.ambulance.findMany({
      include: {
        driverProfile: {
          include: { user: true },
        },
      },
    });

    const now = Date.now();
    return ambulances.map((amb) => {
      const lastUpdateMs = amb.lastLocationUpdate ? amb.lastLocationUpdate.getTime() : 0;
      const isStale = now - lastUpdateMs > 120000; // Stale if no update in > 2 minutes

      return {
        id: amb.id,
        registrationNumber: amb.registrationNumber,
        type: amb.type,
        status: amb.status,
        latitude: amb.currentLatitude,
        longitude: amb.currentLongitude,
        currentLatitude: amb.currentLatitude,
        currentLongitude: amb.currentLongitude,
        lastLocationUpdate: amb.lastLocationUpdate ? amb.lastLocationUpdate.toISOString() : new Date().toISOString(),
        isSimulated: amb.isSimulated || false,
        isStale,
        driverName: amb.driverProfile?.user?.name || 'Unassigned',
      };
    });
  }
}

export const trackingService = new TrackingService();
