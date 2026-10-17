import { prisma } from '../prisma.js';
import {
  TripStatus,
  TripDTO,
  UserRole,
  DriverStatus,
  AmbulanceStatus,
  isValidTripTransition,
  CorridorStatus,
  HospitalStatus,
} from '@aurangabad-ambulance/shared';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../common/errors/app-error.js';
import { hospitalService } from './hospital.service.js';
import { getRoute, calculateHaversineDistanceKm } from '../integrations/routing/osrm.js';
import { SocketManager } from '../realtime/socket-manager.js';
import { bookingService } from './booking.service.js';
import { trafficService } from './traffic.service.js';
import { demoGpsSimulator } from './demo-gps-simulator.service.js';
import { clearTripAlerts } from './proximity-alert.service.js';

export class TripService {
  public async getTripById(
    tripId: string,
    userIdOrRole?: string | UserRole,
    userRole?: UserRole,
    driverProfileId?: string | null,
    hospitalId?: string | null
  ): Promise<TripDTO> {
    let resolvedUserId: string | undefined;
    let resolvedUserRole: UserRole | undefined;

    if (userIdOrRole && Object.values(UserRole).includes(userIdOrRole as UserRole)) {
      resolvedUserRole = userIdOrRole as UserRole;
    } else {
      resolvedUserId = userIdOrRole;
      resolvedUserRole = userRole;
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        booking: true,
        driver: { include: { user: true } },
        ambulance: true,
        hospital: true,
      },
    });

    if (!trip) {
      throw new NotFoundError(`Trip with ID "${tripId}" not found.`);
    }

    // Role-specific privacy & access isolation
    if (resolvedUserRole === UserRole.PATIENT) {
      if (trip.patientId !== resolvedUserId) {
        throw new ForbiddenError('Access denied: Patients may only access their own emergency bookings and trips.');
      }
    } else if (resolvedUserRole === UserRole.DRIVER) {
      if (trip.driverId !== driverProfileId) {
        throw new ForbiddenError('Access denied: Drivers may only access trips assigned directly to their account.');
      }
    } else if (resolvedUserRole === UserRole.HOSPITAL_STAFF) {
      if (trip.hospitalId !== hospitalId) {
        throw new ForbiddenError('Access denied: Hospital staff may only access trips assigned to their hospital.');
      }
    }

    const dto = bookingService.mapToDTO(trip);

    // Enforce Zero-PII rule for Traffic Police role
    if (resolvedUserRole === UserRole.TRAFFIC_POLICE) {
      delete dto.patientName;
      delete dto.patientPhone;
      delete dto.notes;
    }

    return dto;
  }

  public async updateTripStatus(
    tripId: string,
    targetStatus: TripStatus,
    userId: string,
    userRole: UserRole,
    driverProfileId?: string | null,
    hospitalId?: string | null,
    notes?: string
  ): Promise<TripDTO> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driver: { include: { user: true } },
        ambulance: true,
        hospital: true,
        booking: true,
      },
    });

    if (!trip) {
      throw new NotFoundError(`Trip with ID "${tripId}" was not found.`);
    }

    // Idempotent duplicate check: if already in target state, return current DTO without re-executing
    if (trip.status === targetStatus) {
      return bookingService.mapToDTO(trip);
    }

    // Role-specific authorization checks
    if (userRole === UserRole.DRIVER) {
      if (trip.driverId !== driverProfileId) {
        throw new ForbiddenError('You can only update trips assigned to your driver account.');
      }

      if (!driverProfileId) {
        throw new ForbiddenError('Driver profile ID is required for driver actions.');
      }

      // Enforce driver application vetting
      const driver = await prisma.driverProfile.findUnique({ where: { id: driverProfileId } });
      if (!driver || driver.applicationStatus !== 'APPROVED') {
        throw new ForbiddenError('Operational actions are restricted to approved drivers only.');
      }
    } else if (userRole === UserRole.PATIENT) {
      if (trip.patientId !== userId) {
        throw new ForbiddenError('You can only cancel your own trip.');
      }
      if (targetStatus !== TripStatus.CANCELLED) {
        throw new ForbiddenError('Patients are only authorized to cancel their trip.');
      }
    }

    // Validate state transition using shared state-machine rules
    const transitionCheck = isValidTripTransition(trip.status as TripStatus, targetStatus, userRole);
    if (!transitionCheck.valid) {
      throw new BadRequestError(transitionCheck.reason || 'Invalid state transition.');
    }

    const previousHospitalId = trip.hospitalId;

    const updatedTrip = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        status: targetStatus,
      };

      const now = new Date();

      if (targetStatus === TripStatus.EN_ROUTE_TO_PICKUP) {
        // Ambulance heading towards patient
      } else if (targetStatus === TripStatus.ARRIVED_AT_PICKUP) {
        updateData.arrivedPickupAt = now;
      } else if (targetStatus === TripStatus.PATIENT_PICKED_UP) {
        updateData.pickedUpAt = now;

        // Determine destination hospital (explicit or recommended)
        let chosenHospitalId = hospitalId || trip.hospitalId;
        let recommendationReason = trip.recommendedHospitalReason;

        if (!chosenHospitalId) {
          const rec = await hospitalService.recommendHospital(
            trip.pickupLatitude,
            trip.pickupLongitude,
            trip.emergencyCategory as any
          );
          chosenHospitalId = rec.hospital.id;
          recommendationReason = rec.reason;
        }

        const chosenHospital = await tx.hospital.findUnique({
          where: { id: chosenHospitalId },
        });

        if (!chosenHospital) {
          throw new BadRequestError(`Destination hospital with ID "${chosenHospitalId}" not found.`);
        }

        if (chosenHospital.status === HospitalStatus.CLOSED) {
          throw new BadRequestError(`Destination hospital "${chosenHospital.name}" is currently CLOSED.`);
        }

        updateData.hospitalId = chosenHospital.id;
        updateData.recommendedHospitalReason = recommendationReason;

        // Latest ambulance position for route calculation
        const ambLat = trip.driver?.currentLatitude || trip.ambulance?.currentLatitude || trip.pickupLatitude;
        const ambLng = trip.driver?.currentLongitude || trip.ambulance?.currentLongitude || trip.pickupLongitude;

        // Calculate route from ambulance location to hospital
        try {
          const hospitalRoute = await getRoute(
            ambLat,
            ambLng,
            chosenHospital.latitude,
            chosenHospital.longitude
          );
          if (hospitalRoute.source === 'OSRM' && hospitalRoute.geometryGeoJson && hospitalRoute.isRoadGeometry) {
            updateData.hospitalRouteDistanceKm = hospitalRoute.distanceKm;
            updateData.hospitalRouteDurationSeconds = hospitalRoute.durationSeconds;
            updateData.hospitalRoutePolyline = JSON.stringify(hospitalRoute.geometryGeoJson);
          } else {
            updateData.hospitalRouteDistanceKm = hospitalRoute.haversineDistanceKm || hospitalRoute.distanceKm;
            updateData.hospitalRouteDurationSeconds = null;
            updateData.hospitalRoutePolyline = null;
          }
        } catch {
          // Live OSRM failure: Truthful haversine fallback with clear labelling (no fake polyline)
          const fallbackKm = calculateHaversineDistanceKm(
            ambLat,
            ambLng,
            chosenHospital.latitude,
            chosenHospital.longitude
          );
          updateData.hospitalRouteDistanceKm = Math.round(fallbackKm * 10) / 10;
          updateData.hospitalRouteDurationSeconds = null;
          updateData.hospitalRoutePolyline = null;
        }

        // Update Traffic Corridor destination to hospital
        await tx.trafficCorridor.upsert({
          where: { tripId: trip.id },
          create: {
            tripId: trip.id,
            status: CorridorStatus.ACTIVE,
            emergencyPriority: trip.priority,
            originLat: ambLat,
            originLng: ambLng,
            destLat: chosenHospital.latitude,
            destLng: chosenHospital.longitude,
            routeSummary: `Emergency transit to ${chosenHospital.name}`,
            activatedAt: now,
          },
          update: {
            originLat: ambLat,
            originLng: ambLng,
            destLat: chosenHospital.latitude,
            destLng: chosenHospital.longitude,
            routeSummary: `Emergency transit to ${chosenHospital.name}`,
            corridorClearanceStatus: 'REQUESTED',
          },
        });
      } else if (targetStatus === TripStatus.EN_ROUTE_TO_HOSPITAL) {
        // En route to hospital
      } else if (targetStatus === TripStatus.ARRIVED_AT_HOSPITAL) {
        updateData.arrivedHospitalAt = now;
      } else if (targetStatus === TripStatus.COMPLETED) {
        updateData.completedAt = now;

        // Release driver back to AVAILABLE
        if (trip.driverId) {
          await tx.driverProfile.update({
            where: { id: trip.driverId },
            data: { status: DriverStatus.AVAILABLE },
          });
        }

        // Release ambulance back to AVAILABLE
        if (trip.ambulanceId) {
          await tx.ambulance.update({
            where: { id: trip.ambulanceId },
            data: { status: AmbulanceStatus.AVAILABLE },
          });
        }

        // Clear Traffic Corridor
        await tx.trafficCorridor.updateMany({
          where: { tripId: trip.id },
          data: { status: CorridorStatus.CLEARED, clearedAt: now },
        });
      } else if (targetStatus === TripStatus.CANCELLED) {
        updateData.cancelledAt = now;
        updateData.cancellationReason = notes || 'Cancelled by user or operator.';

        // Release driver and ambulance if already assigned
        if (trip.driverId) {
          await tx.driverProfile.update({
            where: { id: trip.driverId },
            data: { status: DriverStatus.AVAILABLE },
          });
        }
        if (trip.ambulanceId) {
          await tx.ambulance.update({
            where: { id: trip.ambulanceId },
            data: { status: AmbulanceStatus.AVAILABLE },
          });
        }

        await tx.trafficCorridor.updateMany({
          where: { tripId: trip.id },
          data: { status: CorridorStatus.CANCELLED },
        });
      }

      const committed = await tx.trip.update({
        where: { id: tripId },
        data: updateData,
        include: {
          booking: true,
          driver: { include: { user: true } },
          ambulance: true,
          hospital: true,
        },
      });

      await tx.tripStatusHistory.create({
        data: {
          tripId: committed.id,
          fromStatus: trip.status,
          toStatus: targetStatus,
          changedByUserId: userId,
          notes: notes || `Trip status progressed to ${targetStatus}`,
        },
      });

      return committed;
    });

    // Check if hospital assignment changed to notify previous and new hospital
    if (targetStatus === TripStatus.PATIENT_PICKED_UP && updatedTrip.hospitalId) {
      if (previousHospitalId && previousHospitalId !== updatedTrip.hospitalId) {
        SocketManager.getInstance().emitHospitalAssignmentChanged(
          previousHospitalId,
          updatedTrip.hospitalId,
          updatedTrip.id
        );
      }
    }

    // Refresh upcoming traffic signal coordination
    if (
      targetStatus === TripStatus.EN_ROUTE_TO_PICKUP ||
      targetStatus === TripStatus.PATIENT_PICKED_UP ||
      targetStatus === TripStatus.EN_ROUTE_TO_HOSPITAL
    ) {
      trafficService.updateUpcomingSignalForTrip(updatedTrip.id).catch(console.warn);
    }

    // Demo GPS Simulator integration
    if (targetStatus === TripStatus.ACCEPTED || targetStatus === TripStatus.EN_ROUTE_TO_PICKUP) {
      // Auto-start Demo GPS if the ambulance is marked as simulated
      if (updatedTrip.ambulance?.isSimulated) {
        demoGpsSimulator.startSimulation(updatedTrip.id).catch(console.warn);
      }
    } else if (targetStatus === TripStatus.PATIENT_PICKED_UP && updatedTrip.hospital) {
      // Load hospital route into the simulator when patient is picked up
      demoGpsSimulator.loadHospitalRoute(
        updatedTrip.id,
        updatedTrip.hospital.latitude,
        updatedTrip.hospital.longitude
      ).catch(console.warn);
    } else if (targetStatus === TripStatus.COMPLETED || targetStatus === TripStatus.CANCELLED) {
      // Stop simulation and clear alert deduplication
      demoGpsSimulator.stopSimulation(updatedTrip.id).catch(console.warn);
      clearTripAlerts(updatedTrip.id);
    }

    const dto = bookingService.mapToDTO(updatedTrip);

    // Emit scoped real-time events to authorized parties
    SocketManager.getInstance().emitTripUpdated(tripId, updatedTrip);

    return dto;
  }

  public async recalculateRoute(
    tripId: string,
    newHospitalId?: string,
    userId?: string,
    userRole?: UserRole
  ): Promise<TripDTO> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driver: true,
        ambulance: true,
        hospital: true,
        booking: true,
      },
    });

    if (!trip) {
      throw new NotFoundError(`Trip with ID "${tripId}" not found.`);
    }

    let activeHospital = trip.hospital;

    if (newHospitalId && newHospitalId !== trip.hospitalId) {
      const newHospital = await prisma.hospital.findUnique({ where: { id: newHospitalId } });
      if (!newHospital) {
        throw new NotFoundError(`Hospital with ID "${newHospitalId}" was not found.`);
      }

      await prisma.trip.update({
        where: { id: tripId },
        data: { hospitalId: newHospitalId },
      });

      if (trip.hospitalId) {
        SocketManager.getInstance().emitHospitalAssignmentChanged(
          trip.hospitalId,
          newHospitalId,
          tripId
        );
      }

      activeHospital = newHospital;
    }

    const ambLat = trip.driver?.currentLatitude || trip.ambulance?.currentLatitude || trip.pickupLatitude;
    const ambLng = trip.driver?.currentLongitude || trip.ambulance?.currentLongitude || trip.pickupLongitude;

    const isHospitalPhase =
      trip.status === TripStatus.PATIENT_PICKED_UP ||
      trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
      trip.status === TripStatus.ARRIVED_AT_HOSPITAL;

    let targetLat = trip.pickupLatitude;
    let targetLng = trip.pickupLongitude;

    if (isHospitalPhase && activeHospital) {
      targetLat = activeHospital.latitude;
      targetLng = activeHospital.longitude;
    }

    const route = await getRoute(ambLat, ambLng, targetLat, targetLng);
    const isRoad = route.source === 'OSRM' && !!route.geometryGeoJson && route.isRoadGeometry !== false;

    const updateData: any = {};
    if (isHospitalPhase) {
      updateData.hospitalRouteDistanceKm = route.distanceKm;
      updateData.hospitalRouteDurationSeconds = isRoad ? route.durationSeconds : null;
      updateData.hospitalRoutePolyline = isRoad ? JSON.stringify(route.geometryGeoJson) : null;
    } else {
      updateData.routeDistanceKm = route.distanceKm;
      updateData.routeDurationSeconds = isRoad ? route.durationSeconds : null;
      updateData.routePolyline = isRoad ? JSON.stringify(route.geometryGeoJson) : null;
    }

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: updateData,
      include: {
        driver: { include: { user: true } },
        ambulance: true,
        hospital: true,
        booking: true,
      },
    });

    SocketManager.getInstance().emitTripUpdated(tripId, updated);
    return bookingService.mapToDTO(updated);
  }

  public async getActiveDriverTrip(driverProfileId: string): Promise<TripDTO | null> {
    const trip = await prisma.trip.findFirst({
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
      include: {
        booking: true,
        driver: { include: { user: true } },
        ambulance: true,
        hospital: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return trip ? bookingService.mapToDTO(trip) : null;
  }

  public recalculateHospitalRoute = this.recalculateRoute.bind(this);
}

export const tripService = new TripService();
