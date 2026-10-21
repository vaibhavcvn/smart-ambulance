import { prisma } from '../prisma.js';
import {
  CreateBookingInput,
  TripDTO,
  TripStatus,
  EMERGENCY_CATEGORIES_META,
} from '@aurangabad-ambulance/shared';
import {
  BadRequestError,
  OutsideBoundaryError,
  ConflictError,
} from '../common/errors/app-error.js';
import { isPointInAurangabad } from '../integrations/maps/boundary.js';
import { dispatchService } from './dispatch.service.js';
import { MLPredictor } from '../ml/inference/predictor.js';
import { getRoute, calculateHaversineDistanceKm } from '../integrations/routing/osrm.js';
import { AURANGABAD_BOUNDS } from '@aurangabad-ambulance/shared';

const mlPredictor = new MLPredictor();

export class BookingService {
  public async createBooking(patientId: string, input: CreateBookingInput): Promise<TripDTO> {
    // 1. Boundary Validation: Enforce that emergency location is within Aurangabad EMS jurisdiction
    const insideBoundary = isPointInAurangabad(input.pickupLatitude, input.pickupLongitude);
    if (!insideBoundary) {
      throw new OutsideBoundaryError(
        'The specified pickup coordinate is outside the operational boundary of Aurangabad emergency services. Please contact local district emergency authorities.'
      );
    }

    // 2. Prevent duplicate active bookings for the same patient
    const activeTrip = await prisma.trip.findFirst({
      where: {
        patientId,
        status: {
          in: [
            TripStatus.REQUESTED,
            TripStatus.DISPATCHING,
            TripStatus.DRIVER_REQUESTED,
            TripStatus.ACCEPTED,
            TripStatus.EN_ROUTE_TO_PICKUP,
            TripStatus.ARRIVED_AT_PICKUP,
            TripStatus.PATIENT_PICKED_UP,
            TripStatus.EN_ROUTE_TO_HOSPITAL,
          ],
        },
      },
    });

    if (activeTrip) {
      throw new ConflictError(
        'You already have an active emergency ambulance trip in progress. Please monitor the existing trip or contact emergency control.'
      );
    }

    const categoryMeta = EMERGENCY_CATEGORIES_META[input.emergencyCategory];
    const priority = categoryMeta.priority;

    // 3. Fast baseline route calculation from city center for initial ML delay prediction
    // Use direct urban road approximation to guarantee instant sub-millisecond response without blocking
    const directKm = calculateHaversineDistanceKm(
      AURANGABAD_BOUNDS.center.latitude,
      AURANGABAD_BOUNDS.center.longitude,
      input.pickupLatitude,
      input.pickupLongitude
    );
    const distKm = Math.max(1.0, Math.round(directKm * 1.3 * 100) / 100);
    const osrmDuration = Math.max(120, Math.round((distKm / 35) * 3600));

    // 4. ML Prediction: Predict expected transit delay
    let predictedDelaySeconds: number | null = null;
    try {
      const now = new Date();
      const mlResult = mlPredictor.predictDelay({
        distanceKm: distKm,
        osrmDurationSeconds: osrmDuration,
        emergencyCategory: input.emergencyCategory,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
        activeBlockagesNearby: 1,
      });
      predictedDelaySeconds = mlResult.predictedDelaySeconds;
    } catch (err) {
      console.warn('ML Prediction failed during booking creation, continuing without delay estimate:', err);
    }

    // 5. Transactional Creation of Booking and Trip records
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          patientId,
          pickupAddress: input.pickupAddress,
          pickupLatitude: input.pickupLatitude,
          pickupLongitude: input.pickupLongitude,
          pickupLandmark: input.pickupLandmark,
          emergencyCategory: input.emergencyCategory,
          priority,
          patientName: input.patientName,
          patientPhone: input.patientPhone,
          notes: input.notes,
        },
      });

      const trip = await tx.trip.create({
        data: {
          bookingId: booking.id,
          patientId,
          status: TripStatus.REQUESTED,
          pickupAddress: input.pickupAddress,
          pickupLatitude: input.pickupLatitude,
          pickupLongitude: input.pickupLongitude,
          pickupLandmark: input.pickupLandmark,
          emergencyCategory: input.emergencyCategory,
          priority,
          notes: input.notes,
          predictedDelaySeconds,
          requestedAt: new Date(),
        },
        include: {
          booking: true,
          driver: { include: { user: true } },
          ambulance: true,
          hospital: true,
        },
      });

      await tx.tripStatusHistory.create({
        data: {
          tripId: trip.id,
          fromStatus: 'NONE',
          toStatus: TripStatus.REQUESTED,
          changedByUserId: patientId,
          notes: `Emergency booking registered by patient. Priority: ${priority}. Category: ${input.emergencyCategory}.`,
        },
      });

      return trip;
    }, { maxWait: 10000, timeout: 20000 });

    // 6. Initiate Server-Side Dispatch Engine (await to ensure candidate offer is created before serverless freeze)
    try {
      await dispatchService.startDispatch(result.id);
    } catch (err) {
      console.error(`Error launching dispatch for trip ${result.id}:`, err);
    }

    return this.mapToDTO(result);
  }

  public async getPatientActiveTrip(patientId: string): Promise<TripDTO | null> {
    const trip = await prisma.trip.findFirst({
      where: {
        patientId,
        status: {
          notIn: [TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.EXPIRED],
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

    return trip ? this.mapToDTO(trip) : null;
  }

  public mapToDTO(trip: any): TripDTO {
    return {
      id: trip.id,
      bookingId: trip.bookingId,
      status: trip.status,
      patientId: trip.patientId,
      patientName: trip.patientName || trip.booking?.patientName || undefined,
      patientPhone: trip.patientPhone || trip.booking?.patientPhone || undefined,
      emergencyCategory: trip.emergencyCategory,
      priority: trip.priority,
      hospitalId: trip.hospitalId || trip.hospital?.id || undefined,
      pickupAddress: trip.pickupAddress,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
      pickupLandmark: trip.pickupLandmark,
      notes: trip.notes,
      driver: trip.driver
        ? {
            id: trip.driver.id,
            userId: trip.driver.userId,
            name: trip.driver.user?.name || 'Assigned Driver',
            email: trip.driver.user?.email || '',
            phone: trip.driver.user?.phone,
            licenseNumber: trip.driver.licenseNumber,
            status: trip.driver.status,
            applicationStatus: trip.driver.applicationStatus || 'APPROVED',
            vehicleTypeRequested: trip.driver.vehicleTypeRequested,
            vehicleRegistrationRequested: trip.driver.vehicleRegistrationRequested,
            rejectionReason: trip.driver.rejectionReason,
            currentLatitude: trip.driver.currentLatitude,
            currentLongitude: trip.driver.currentLongitude,
            lastActive: trip.driver.lastLocationUpdate?.toISOString() || new Date().toISOString(),
          }
        : null,
      ambulance: trip.ambulance
        ? {
            id: trip.ambulance.id,
            registrationNumber: trip.ambulance.registrationNumber,
            type: trip.ambulance.type,
            status: trip.ambulance.status,
            currentLatitude: trip.ambulance.currentLatitude,
            currentLongitude: trip.ambulance.currentLongitude,
            lastLocationUpdate: trip.ambulance.lastLocationUpdate?.toISOString() || new Date().toISOString(),
            isSimulated: trip.ambulance.isSimulated,
          }
        : null,
      hospital: trip.hospital
        ? {
            id: trip.hospital.id,
            name: trip.hospital.name,
            address: trip.hospital.address,
            latitude: trip.hospital.latitude,
            longitude: trip.hospital.longitude,
            status: trip.hospital.status,
            availableEmergencyBeds: trip.hospital.availableEmergencyBeds,
            availableIcuBeds: trip.hospital.availableIcuBeds,
            availableGeneralBeds: trip.hospital.availableGeneralBeds,
            hasTraumaCenter: trip.hospital.hasTraumaCenter,
            hasCathLab: trip.hospital.hasCathLab,
            hasStrokeUnit: trip.hospital.hasStrokeUnit,
            phone: trip.hospital.phone,
            updatedAt: trip.hospital.updatedAt?.toISOString() || new Date().toISOString(),
          }
        : null,
      routeToPickup: trip.routeDistanceKm != null
        ? (() => {
            let parsedGeometry: any = null;
            let isValidRoad = false;
            let pointCount = 0;
            if (trip.routePolyline) {
              try {
                parsedGeometry = JSON.parse(trip.routePolyline);
                if (
                  parsedGeometry &&
                  parsedGeometry.type === 'LineString' &&
                  Array.isArray(parsedGeometry.coordinates) &&
                  parsedGeometry.coordinates.length >= 2
                ) {
                  isValidRoad = true;
                  pointCount = parsedGeometry.coordinates.length;
                }
              } catch {
                parsedGeometry = null;
              }
            }
            return {
              distanceKm: trip.routeDistanceKm,
              durationSeconds: trip.routeDurationSeconds || 0,
              geometryGeoJson: isValidRoad ? parsedGeometry : null,
              source: isValidRoad ? ('OSRM' as const) : ('FALLBACK_HAVERSINE' as const),
              isRoadGeometry: isValidRoad,
              pointCount,
              haversineDistanceKm: trip.routeDistanceKm,
              failureReason: isValidRoad ? null : (trip.routingError || 'OSRM road route unavailable'),
            };
          })()
        : null,
      routeToHospital: trip.hospitalRouteDistanceKm != null
        ? (() => {
            let parsedGeometry: any = null;
            let isValidRoad = false;
            let pointCount = 0;
            if (trip.hospitalRoutePolyline) {
              try {
                parsedGeometry = JSON.parse(trip.hospitalRoutePolyline);
                if (
                  parsedGeometry &&
                  parsedGeometry.type === 'LineString' &&
                  Array.isArray(parsedGeometry.coordinates) &&
                  parsedGeometry.coordinates.length >= 2
                ) {
                  isValidRoad = true;
                  pointCount = parsedGeometry.coordinates.length;
                }
              } catch {
                parsedGeometry = null;
              }
            }
            return {
              distanceKm: trip.hospitalRouteDistanceKm,
              durationSeconds: trip.hospitalRouteDurationSeconds || 0,
              geometryGeoJson: isValidRoad ? parsedGeometry : null,
              source: isValidRoad ? ('OSRM' as const) : ('FALLBACK_HAVERSINE' as const),
              isRoadGeometry: isValidRoad,
              pointCount,
              haversineDistanceKm: trip.hospitalRouteDistanceKm,
              failureReason: isValidRoad ? null : (trip.routingError || 'OSRM road route unavailable'),
            };
          })()
        : null,
      activeDestinationType:
        trip.status === TripStatus.PATIENT_PICKED_UP ||
        trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
        trip.status === TripStatus.ARRIVED_AT_HOSPITAL
          ? 'HOSPITAL'
          : 'PICKUP',
      activeDestinationName:
        (trip.status === TripStatus.PATIENT_PICKED_UP ||
        trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
        trip.status === TripStatus.ARRIVED_AT_HOSPITAL) &&
        trip.hospital
          ? trip.hospital.name
          : 'Patient Pickup',
      activeDestinationAddress:
        (trip.status === TripStatus.PATIENT_PICKED_UP ||
        trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
        trip.status === TripStatus.ARRIVED_AT_HOSPITAL) &&
        trip.hospital
          ? trip.hospital.address
          : trip.pickupAddress,
      activeDestinationLatitude:
        (trip.status === TripStatus.PATIENT_PICKED_UP ||
        trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
        trip.status === TripStatus.ARRIVED_AT_HOSPITAL) &&
        trip.hospital
          ? trip.hospital.latitude
          : trip.pickupLatitude,
      activeDestinationLongitude:
        (trip.status === TripStatus.PATIENT_PICKED_UP ||
        trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
        trip.status === TripStatus.ARRIVED_AT_HOSPITAL) &&
        trip.hospital
          ? trip.hospital.longitude
          : trip.pickupLongitude,
      routeLastUpdatedAt: trip.updatedAt?.toISOString() || new Date().toISOString(),
      requestedAt: trip.requestedAt.toISOString(),
      acceptedAt: trip.acceptedAt?.toISOString() || null,
      arrivedPickupAt: trip.arrivedPickupAt?.toISOString() || null,
      pickedUpAt: trip.pickedUpAt?.toISOString() || null,
      arrivedHospitalAt: trip.arrivedHospitalAt?.toISOString() || null,
      completedAt: trip.completedAt?.toISOString() || null,
      cancelledAt: trip.cancelledAt?.toISOString() || null,
      cancellationReason: trip.cancellationReason,
      predictedDelaySeconds: trip.predictedDelaySeconds,
      recommendedHospitalReason: trip.recommendedHospitalReason,
    };
  }
}

export const bookingService = new BookingService();
