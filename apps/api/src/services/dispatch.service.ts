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

    // Auto-heal: Ensure any approved driver has an assigned ambulance with status AVAILABLE
    const approvedWithoutAmbulance = await prisma.driverProfile.findMany({
      where: {
        applicationStatus: 'APPROVED',
        assignedAmbulanceId: null,
      },
    });
    for (const d of approvedWithoutAmbulance) {
      const newAmb = await prisma.ambulance.create({
        data: {
          registrationNumber: d.vehicleRegistrationRequested || `MH-20-AM-${Math.floor(1000 + Math.random() * 9000)}`,
          type: d.vehicleTypeRequested || 'BLS',
          status: AmbulanceStatus.AVAILABLE,
          currentLatitude: d.currentLatitude,
          currentLongitude: d.currentLongitude,
          isSimulated: d.isSimulated || false,
        },
      });
      await prisma.driverProfile.update({
        where: { id: d.id },
        data: { assignedAmbulanceId: newAmb.id },
      });
    }

    // Auto-heal: Ensure available drivers have their assigned ambulance status in sync
    const staleAmbulances = await prisma.driverProfile.findMany({
      where: {
        applicationStatus: 'APPROVED',
        status: DriverStatus.AVAILABLE,
        assignedAmbulanceId: { not: null },
        assignedAmbulance: {
          status: { not: AmbulanceStatus.AVAILABLE },
        },
      },
      select: { assignedAmbulanceId: true },
    });
    for (const d of staleAmbulances) {
      if (d.assignedAmbulanceId) {
        await prisma.ambulance.update({
          where: { id: d.assignedAmbulanceId },
          data: { status: AmbulanceStatus.AVAILABLE },
        }).catch(console.warn);
      }
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
      // Check if there are still active pending offers for this trip
      const activeOffersCount = await prisma.dispatchRequest.count({
        where: {
          tripId,
          status: DispatchRequestStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      });

      if (activeOffersCount > 0) {
        return { success: true, message: 'Existing dispatch offers are currently pending acceptance.' };
      }

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

    // Calculate distance and priority score for each candidate:
    // Prioritize actual (non-demo) drivers and ALS capability for critical emergencies
    const scoredCandidates = eligibleDrivers.map((driver) => {
      const distKm = calculateHaversineDistanceKm(
        driver.currentLatitude,
        driver.currentLongitude,
        trip.pickupLatitude,
        trip.pickupLongitude
      );

      // Prioritize real drivers over simulated drivers so actual entered drivers get fast response
      const realDriverBonus = driver.isSimulated ? 0 : 2;

      let capabilityBonus = 0;
      if (
        trip.priority === EmergencyPriority.CRITICAL &&
        driver.assignedAmbulance?.type === AmbulanceType.ALS
      ) {
        capabilityBonus = 1;
      }

      const score = distKm - realDriverBonus - capabilityBonus;
      return { driver, distKm, score };
    });

    scoredCandidates.sort((a, b) => a.score - b.score);

    // Multi-candidate broadcast: Select ALL nearby drivers within 5km!
    const nearbyCandidates = scoredCandidates.filter((c) => c.distKm <= 5.0);
    const chosenCandidates =
      nearbyCandidates.length > 0
        ? nearbyCandidates.slice(0, 10) // All nearby drivers within 5km (up to 10)
        : scoredCandidates.filter((c) => c.distKm <= env.DISPATCH_SEARCH_RADIUS_KM).slice(0, 3); // Fallback to top 3 within 25km

    if (chosenCandidates.length === 0) {
      return {
        success: false,
        message: 'No drivers within operating dispatch radius.',
      };
    }

    const expiryMs = env.DISPATCH_TIMEOUT_SECONDS * 1000;
    const expiresAt = new Date(Date.now() + expiryMs);

    // Atomically create dispatch requests for all chosen candidates
    let createdRequests: { candidate: typeof chosenCandidates[0]; req: any }[] = [];
    try {
      createdRequests = await prisma.$transaction(async (tx) => {
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
          return [];
        }

        const list: { candidate: typeof chosenCandidates[0]; req: any }[] = [];
        for (const candidate of chosenCandidates) {
          const req = await tx.dispatchRequest.create({
            data: {
              tripId,
              driverId: candidate.driver.id,
              status: DispatchRequestStatus.PENDING,
              expiresAt,
            },
          });
          list.push({ candidate, req });
        }

        await tx.trip.update({
          where: { id: tripId },
          data: { status: TripStatus.DRIVER_REQUESTED },
        });

        const driverNames = chosenCandidates
          .map((c) => `${c.driver.user.name} (${c.distKm.toFixed(1)} km${c.driver.isSimulated ? ', demo' : ', real'})`)
          .join(', ');

        await tx.tripStatusHistory.create({
          data: {
            tripId,
            fromStatus: liveTrip.status,
            toStatus: TripStatus.DRIVER_REQUESTED,
            notes: `Emergency dispatch offer broadcast to ${chosenCandidates.length} nearby driver(s) within 5km: ${driverNames}. Expiry: ${env.DISPATCH_TIMEOUT_SECONDS}s.`,
          },
        });

        return list;
      }, { maxWait: 10000, timeout: 20000 });
    } catch {
      return { success: false, message: 'Trip was concurrently modified or cancelled.' };
    }

    if (createdRequests.length === 0) {
      return { success: false, message: 'Trip is no longer in a dispatchable state.' };
    }

    // Emit private offers to each candidate driver and schedule server-side timers
    let primaryRouteInfo: any = null;

    for (const { candidate, req } of createdRequests) {
      let routeInfo: any = null;
      try {
        routeInfo = await getRoute(
          candidate.driver.currentLatitude,
          candidate.driver.currentLongitude,
          trip.pickupLatitude,
          trip.pickupLongitude
        );
        if (!primaryRouteInfo) primaryRouteInfo = routeInfo;
      } catch {
        // Fallback to Haversine
      }

      const offerDto: DispatchOfferDTO = {
        dispatchRequestId: req.id,
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
        estimatedDistanceKm: routeInfo?.distanceKm || candidate.distKm,
        estimatedDurationSeconds: routeInfo?.durationSeconds,
      };

      // Emit private offer to each candidate driver
      SocketManager.getInstance().emitDispatchOffer(candidate.driver.id, offerDto);

      // Schedule authoritative server-side expiry timer for this offer
      const timer = setTimeout(async () => {
        await this.handleDispatchExpiry(req.id);
      }, expiryMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.activeTimers.set(req.id, timer);
    }

    // Persist baseline route info from closest candidate
    const topCandidate = chosenCandidates[0];
    if (primaryRouteInfo && primaryRouteInfo.source === 'OSRM' && primaryRouteInfo.geometryGeoJson && primaryRouteInfo.isRoadGeometry) {
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          routeDistanceKm: primaryRouteInfo.distanceKm,
          routeDurationSeconds: primaryRouteInfo.durationSeconds,
          routePolyline: JSON.stringify(primaryRouteInfo.geometryGeoJson),
        },
      }).catch(console.warn);
    } else {
      await prisma.trip.update({
        where: { id: tripId },
        data: {
          routeDistanceKm: topCandidate.distKm,
          routeDurationSeconds: null,
          routePolyline: null,
        },
      }).catch(console.warn);
    }

    return {
      success: true,
      message: `Dispatch offer broadcast to ${chosenCandidates.length} nearby driver(s).`,
    };
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
        message: 'The dispatch offer window expired.',
      });

      // Check if any other pending offers remain for this trip
      const remainingPending = await prisma.dispatchRequest.count({
        where: {
          tripId: request.tripId,
          status: DispatchRequestStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      });

      // Advance dispatch engine to the next ring only if all contacted drivers have expired
      if (remainingPending === 0) {
        await this.startDispatch(request.tripId);
      }
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

      const remainingPending = await prisma.dispatchRequest.count({
        where: {
          tripId: request.tripId,
          status: DispatchRequestStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      });
      if (remainingPending === 0) {
        this.startDispatch(request.tripId).catch(console.error);
      }
      throw new ConflictError('The dispatch acceptance window has elapsed.');
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

      // Check if any other pending offers remain for this trip
      const remainingPending = await prisma.dispatchRequest.count({
        where: {
          tripId: request.tripId,
          status: DispatchRequestStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      });

      // Only seek next ring if all contacted drivers have declined/expired
      if (remainingPending === 0) {
        this.startDispatch(request.tripId).catch(console.error);
      }

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
    const { committedTrip, siblingOffers } = await prisma.$transaction(async (tx) => {
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
          return { committedTrip: existingAssignedTrip!, siblingOffers: [] };
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

      // 2b. Cancel / Expire all other sibling pending offers for this trip
      const siblingOffers = await tx.dispatchRequest.findMany({
        where: {
          tripId: request.tripId,
          id: { not: dispatchRequestId },
          status: DispatchRequestStatus.PENDING,
        },
        select: { id: true, driverId: true },
      });

      if (siblingOffers.length > 0) {
        await tx.dispatchRequest.updateMany({
          where: {
            tripId: request.tripId,
            id: { not: dispatchRequestId },
            status: DispatchRequestStatus.PENDING,
          },
          data: {
            status: DispatchRequestStatus.EXPIRED,
            respondedAt: new Date(),
            declineReason: `Trip claimed by nearby driver ${request.driver.user.name}.`,
          },
        });
      }

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

      return { committedTrip, siblingOffers };
    }, { maxWait: 10000, timeout: 20000 });

    // Clear active timers and notify all sibling candidate drivers that the offer was claimed
    for (const sibling of siblingOffers) {
      const siblingTimer = this.activeTimers.get(sibling.id);
      if (siblingTimer) {
        clearTimeout(siblingTimer);
        this.activeTimers.delete(sibling.id);
      }
      SocketManager.getInstance().emitDispatchExpired(sibling.driverId, {
        dispatchRequestId: sibling.id,
        tripId: request.tripId,
        message: `Trip was claimed by another nearby emergency responder (${request.driver.user.name}).`,
      });
    }

    // Notify all authorized subscribers of acceptance
    SocketManager.getInstance().emitTripUpdated(committedTrip.id, committedTrip);

    return { success: true, action: 'ACCEPTED', trip: committedTrip };
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
