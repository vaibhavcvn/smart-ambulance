import { prisma } from '../prisma.js';
import { env } from '../config/env.js';
import {
  TripStatus,
  DispatchRequestStatus,
  DriverStatus,
  AmbulanceStatus,
  EmergencyPriority,
  AmbulanceType,
  DispatchOfferDTO,
  CorridorStatus,
} from '@aurangabad-ambulance/shared';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../common/errors/app-error.js';
import { calculateHaversineDistanceKm, getRoute } from '../integrations/routing/osrm.js';
import { SocketManager } from '../realtime/socket-manager.js';

export class DispatchService {
  private activeTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Evaluates candidates, creates dispatch request, emits offer, and manages the 45s server countdown.
   */
  public async startDispatch(tripId: string): Promise<{ success: boolean; message: string }> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        dispatchRequests: true,
      },
    });

    if (!trip) {
      throw new NotFoundError(`Trip with ID "${tripId}" not found.`);
    }

    // Terminal or already accepted trip cannot be dispatched
    if (
      trip.status === TripStatus.ACCEPTED ||
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.CANCELLED
    ) {
      return { success: false, message: `Trip is already in status "${trip.status}".` };
    }

    // Find previous candidates who declined or expired for this trip
    const contactedDriverIds = trip.dispatchRequests.map((r) => r.driverId);

    // Query eligible drivers:
    // 1. ApplicationStatus APPROVED
    // 2. Status AVAILABLE
    // 3. Has an assigned ambulance with status AVAILABLE
    // 4. Has not already declined/expired this specific trip
    const eligibleDrivers = await prisma.driverProfile.findMany({
      where: {
        applicationStatus: 'APPROVED',
        status: DriverStatus.AVAILABLE,
        assignedAmbulanceId: { not: null },
        assignedAmbulance: {
          status: AmbulanceStatus.AVAILABLE,
        },
        id: { notIn: contactedDriverIds },
      },
      include: {
        user: true,
        assignedAmbulance: true,
      },
    });

    if (eligibleDrivers.length === 0) {
      // No more drivers available!
      await prisma.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.EXPIRED },
      });

      await prisma.tripStatusHistory.create({
        data: {
          tripId,
          fromStatus: trip.status,
          toStatus: TripStatus.EXPIRED,
          notes: 'Dispatch engine exhausted all candidate drivers without acceptance.',
        },
      });

      const updatedTrip = await prisma.trip.findUnique({
        where: { id: tripId },
        include: { driver: { include: { user: true } }, ambulance: true, hospital: true },
      });

      SocketManager.getInstance().emitTripUpdated(tripId, updatedTrip);

      return {
        success: false,
        message: 'No eligible ambulance drivers available in Aurangabad at this moment. You may retry.',
      };
    }

    // Rank candidates:
    // 1. Ambulance capability match (ALS prioritized for CRITICAL emergencies)
    // 2. Distance to patient pickup location
    const scoredCandidates = eligibleDrivers.map((driver) => {
      const distKm = calculateHaversineDistanceKm(
        driver.currentLatitude,
        driver.currentLongitude,
        trip.pickupLatitude,
        trip.pickupLongitude
      );

      let capabilityBonus = 0;
      if (
        trip.priority === EmergencyPriority.CRITICAL &&
        driver.assignedAmbulance?.type === AmbulanceType.ALS
      ) {
        capabilityBonus = 5; // Prioritize ALS
      }

      const score = distKm - capabilityBonus;
      return { driver, distKm, score };
    });

    scoredCandidates.sort((a, b) => a.score - b.score);
    const chosen = scoredCandidates[0];

    const expiryMs = env.DISPATCH_TIMEOUT_SECONDS * 1000;
    const expiresAt = new Date(Date.now() + expiryMs);

    // Re-verify trip is still active and atomically create offer and status history
    let dispatchRequest: any;
    try {
      dispatchRequest = await prisma.$transaction(async (tx) => {
        const liveTrip = await tx.trip.findUnique({
          where: { id: tripId },
          select: { status: true },
        });

        if (
          !liveTrip ||
          liveTrip.status === TripStatus.CANCELLED ||
          liveTrip.status === TripStatus.COMPLETED ||
          liveTrip.status === TripStatus.ACCEPTED
        ) {
          return null;
        }

        const req = await tx.dispatchRequest.create({
          data: {
            tripId,
            driverId: chosen.driver.id,
            status: DispatchRequestStatus.PENDING,
            expiresAt,
          },
        });

        await tx.trip.update({
          where: { id: tripId },
          data: { status: TripStatus.DRIVER_REQUESTED },
        });

        await tx.tripStatusHistory.create({
          data: {
            tripId,
            fromStatus: liveTrip.status,
            toStatus: TripStatus.DRIVER_REQUESTED,
            notes: `Dispatch offer emitted to driver ${chosen.driver.user.name} (${chosen.distKm} km away). Expiry: 45s.`,
          },
        });

        return req;
      }, { maxWait: 10000, timeout: 20000 });
    } catch {
      return { success: false, message: 'Trip was concurrently modified or cancelled.' };
    }

    if (!dispatchRequest) {
      return { success: false, message: 'Trip is no longer in a dispatchable state.' };
    }

    // Fetch routing info from driver to pickup
    let routeInfo: any = null;
    try {
      routeInfo = await getRoute(
        chosen.driver.currentLatitude,
        chosen.driver.currentLongitude,
        trip.pickupLatitude,
        trip.pickupLongitude
      );
    } catch {
      // Ignored, fallback to Haversine
    }

    if (routeInfo && routeInfo.source === 'OSRM' && routeInfo.geometryGeoJson && routeInfo.isRoadGeometry) {
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          routeDistanceKm: routeInfo.distanceKm,
          routeDurationSeconds: routeInfo.durationSeconds,
          routePolyline: JSON.stringify(routeInfo.geometryGeoJson),
        },
      }).catch(console.warn);
    } else {
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          routeDistanceKm: chosen.distKm,
          routeDurationSeconds: null,
          routePolyline: null,
        },
      }).catch(console.warn);
    }

    const offerDto: DispatchOfferDTO = {
      dispatchRequestId: dispatchRequest.id,
      tripId: trip.id,
      emergencyCategory: trip.emergencyCategory as any,
      priority: trip.priority as any,
      pickupAddress: trip.pickupAddress,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
      pickupLandmark: trip.pickupLandmark,
      notes: trip.notes,
      expiresAt: expiresAt.toISOString(),
      secondsRemaining: env.DISPATCH_TIMEOUT_SECONDS,
      estimatedDistanceKm: routeInfo?.distanceKm || chosen.distKm,
      estimatedDurationSeconds: routeInfo?.durationSeconds,
    };

    // Emit private offer to the candidate driver
    SocketManager.getInstance().emitDispatchOffer(chosen.driver.id, offerDto);

    // Schedule authoritative server-side expiry timer
    const timer = setTimeout(async () => {
      await this.handleDispatchExpiry(dispatchRequest.id);
    }, expiryMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    this.activeTimers.set(dispatchRequest.id, timer);

    return { success: true, message: `Dispatch offer sent to driver ${chosen.driver.user.name}.` };
  }

  /**
   * Authoritative server-side dispatch expiry handler
   */
  public async handleDispatchExpiry(dispatchRequestId: string): Promise<void> {
    const timer = this.activeTimers.get(dispatchRequestId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(dispatchRequestId);
    }

    try {
      const request = await prisma.dispatchRequest.findUnique({
        where: { id: dispatchRequestId },
        include: { trip: true },
      });

      if (!request || request.status !== DispatchRequestStatus.PENDING) {
        return; // Already responded or cancelled
      }

      // Mark request as EXPIRED
      await prisma.dispatchRequest.update({
        where: { id: dispatchRequestId },
        data: { status: DispatchRequestStatus.EXPIRED, respondedAt: new Date() },
      });

      // Notify driver client that offer expired
      SocketManager.getInstance().emitDispatchExpired(request.driverId, {
        dispatchRequestId,
        tripId: request.tripId,
        message: 'The 45-second dispatch window expired.',
      });

      // Advance dispatch engine to the next eligible candidate
      await this.startDispatch(request.tripId);
    } catch (err) {
      console.error('Error handling dispatch expiry:', err);
    }
  }

  /**
   * Driver response with atomic transaction and concurrency race-condition protection.
   */
  public async respondToOffer(
    dispatchRequestId: string,
    driverProfileId: string,
    action: 'ACCEPT' | 'DECLINE',
    reason?: string
  ): Promise<{ success: boolean; action: string; trip?: any }> {
    // Clear active timer immediately
    const timer = this.activeTimers.get(dispatchRequestId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(dispatchRequestId);
    }

    const request = await prisma.dispatchRequest.findUnique({
      where: { id: dispatchRequestId },
      include: { trip: true, driver: { include: { user: true, assignedAmbulance: true } } },
    });

    if (!request) {
      throw new NotFoundError('Dispatch request not found.');
    }

    if (request.driverId !== driverProfileId) {
      throw new BadRequestError('This dispatch request was not issued to your driver account.');
    }

    if (request.driver.applicationStatus !== 'APPROVED') {
      throw new ForbiddenError('Only approved drivers are permitted to accept emergency dispatch offers.');
    }

    if (request.status !== DispatchRequestStatus.PENDING) {
      if (request.status === DispatchRequestStatus.ACCEPTED && action === 'ACCEPT') {
        const existingTrip = await prisma.trip.findUnique({
          where: { id: request.tripId },
          include: {
            driver: { include: { user: true } },
            ambulance: true,
            hospital: true,
            booking: true,
          },
        });
        return { success: true, action: 'ACCEPTED', trip: existingTrip };
      }
      throw new ConflictError(`This dispatch offer has already been marked as ${request.status}.`);
    }

    // Check if server-side expiry has passed
    if (new Date() > request.expiresAt) {
      await prisma.dispatchRequest.update({
        where: { id: dispatchRequestId },
        data: { status: DispatchRequestStatus.EXPIRED, respondedAt: new Date() },
      });
      // Fallback to next candidate
      this.startDispatch(request.tripId).catch(console.error);
      throw new ConflictError('The 45-second acceptance window has elapsed.');
    }

    if (action === 'DECLINE') {
      await prisma.dispatchRequest.update({
        where: { id: dispatchRequestId },
        data: {
          status: DispatchRequestStatus.DECLINED,
          respondedAt: new Date(),
          declineReason: reason || 'Driver declined dispatch request.',
        },
      });

      // Immediately seek next candidate
      this.startDispatch(request.tripId).catch(console.error);

      return { success: true, action: 'DECLINED' };
    }

    // Precalculate route to pickup BEFORE entering database transaction
    // Check if trip already has precomputed route from dispatch generation (instant 0ms reuse)
    let routeDistanceKm: number | null = request.trip.routeDistanceKm;
    let routeDurationSeconds: number | null = request.trip.routeDurationSeconds;
    let routePolyline: string | null = request.trip.routePolyline;

    if (!routeDistanceKm && !routePolyline) {
      try {
        const route = await getRoute(
          request.driver.currentLatitude,
          request.driver.currentLongitude,
          request.trip.pickupLatitude,
          request.trip.pickupLongitude
        );
        if (route.source === 'OSRM' && route.geometryGeoJson && route.isRoadGeometry) {
          routeDistanceKm = route.distanceKm;
          routeDurationSeconds = route.durationSeconds;
          routePolyline = JSON.stringify(route.geometryGeoJson);
        } else {
          routeDistanceKm = route.haversineDistanceKm || route.distanceKm;
          routeDurationSeconds = null;
          routePolyline = null;
        }
      } catch {
        // Fallback calculation: honest direct distance, no fake polyline or invented road ETA
        routeDistanceKm = calculateHaversineDistanceKm(
          request.driver.currentLatitude,
          request.driver.currentLongitude,
          request.trip.pickupLatitude,
          request.trip.pickupLongitude
        );
        routeDurationSeconds = null;
        routePolyline = null;
      }
    }

    // ATOMIC TRANSACTION: Driver accepts offer
    // Guarantee that two drivers can NEVER accept the same trip simultaneously
    const updatedTrip = await prisma.$transaction(async (tx) => {
      // 1. Check trip status atomically inside transaction
      const currentTrip = await tx.trip.findUnique({
        where: { id: request.tripId },
      });

      if (!currentTrip) {
        throw new NotFoundError('Trip not found.');
      }

      if (
        currentTrip.status === TripStatus.ACCEPTED ||
        currentTrip.driverId !== null
      ) {
        if (currentTrip.driverId === driverProfileId) {
          // Idempotent acceptance retry by the same driver
          const existingAssignedTrip = await tx.trip.findUnique({
            where: { id: request.tripId },
            include: {
              driver: { include: { user: true } },
              ambulance: true,
              hospital: true,
              booking: true,
            },
          });
          return existingAssignedTrip!;
        }
        throw new ConflictError('Trip has already been assigned to another responder.');
      }

      if (currentTrip.status === TripStatus.CANCELLED) {
        throw new ConflictError('Trip has already been cancelled.');
      }

      // 2. Mark request as ACCEPTED
      await tx.dispatchRequest.update({
        where: { id: dispatchRequestId },
        data: { status: DispatchRequestStatus.ACCEPTED, respondedAt: new Date() },
      });

      // 3. Update driver status to ASSIGNED
      await tx.driverProfile.update({
        where: { id: driverProfileId },
        data: { status: DriverStatus.ASSIGNED },
      });

      // 4. Update ambulance status to DISPATCHED
      if (request.driver.assignedAmbulanceId) {
        await tx.ambulance.update({
          where: { id: request.driver.assignedAmbulanceId },
          data: { status: AmbulanceStatus.DISPATCHED },
        });
      }

      // 5. Assign Trip with precomputed route
      const committedTrip = await tx.trip.update({
        where: { id: request.tripId },
        data: {
          status: TripStatus.ACCEPTED,
          driverId: driverProfileId,
          ambulanceId: request.driver.assignedAmbulanceId,
          acceptedAt: new Date(),
          routeDistanceKm,
          routeDurationSeconds,
          routePolyline,
        },
        include: {
          driver: { include: { user: true } },
          ambulance: true,
          hospital: true,
          booking: true,
        },
      });

      // 7. Audit log transition
      await tx.tripStatusHistory.create({
        data: {
          tripId: committedTrip.id,
          fromStatus: currentTrip.status,
          toStatus: TripStatus.ACCEPTED,
          notes: `Trip accepted by driver ${request.driver.user.name}. Ambulance: ${request.driver.assignedAmbulance?.registrationNumber}.`,
        },
      });

      // 8. Create Traffic Corridor record for Traffic Police monitoring
      await tx.trafficCorridor.create({
        data: {
          tripId: committedTrip.id,
          status: CorridorStatus.ACTIVE,
          emergencyPriority: committedTrip.priority,
          originLat: request.driver.currentLatitude,
          originLng: request.driver.currentLongitude,
          destLat: committedTrip.pickupLatitude,
          destLng: committedTrip.pickupLongitude,
          routeSummary: `Emergency corridor towards ${committedTrip.pickupAddress}`,
          activatedAt: new Date(),
        },
      });

      return committedTrip;
    }, { maxWait: 10000, timeout: 20000 });

    // Notify all authorized subscribers of acceptance
    SocketManager.getInstance().emitTripUpdated(updatedTrip.id, updatedTrip);

    return { success: true, action: 'ACCEPTED', trip: updatedTrip };
  }

  public async getPendingOfferForDriver(driverProfileId: string): Promise<DispatchOfferDTO | null> {
    const pending = await prisma.dispatchRequest.findFirst({
      where: {
        driverId: driverProfileId,
        status: DispatchRequestStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: {
        trip: true,
        driver: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) return null;

    const secondsRemaining = Math.max(
      0,
      Math.round((pending.expiresAt.getTime() - Date.now()) / 1000)
    );

    return {
      dispatchRequestId: pending.id,
      tripId: pending.trip.id,
      emergencyCategory: pending.trip.emergencyCategory as any,
      priority: pending.trip.priority as any,
      pickupAddress: pending.trip.pickupAddress,
      pickupLatitude: pending.trip.pickupLatitude,
      pickupLongitude: pending.trip.pickupLongitude,
      pickupLandmark: pending.trip.pickupLandmark,
      notes: pending.trip.notes,
      expiresAt: pending.expiresAt.toISOString(),
      secondsRemaining,
      estimatedDistanceKm: pending.trip.routeDistanceKm || undefined,
      estimatedDurationSeconds: pending.trip.routeDurationSeconds || undefined,
    };
  }

  public clearAllTimers(): void {
    for (const [, timer] of this.activeTimers.entries()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }
}

export const dispatchService = new DispatchService();
