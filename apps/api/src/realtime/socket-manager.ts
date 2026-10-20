import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isAllowedOrigin } from '../config/cors.js';
import {
  SOCKET_EVENTS,
  UserRole,
  PatientTripUpdateDTO,
  HospitalInboundTripDTO,
  TrafficCorridorEventDTO,
  TripStatus,
  EmergencyPriority,
  EmergencyCategory,
} from '@aurangabad-ambulance/shared';
import { prisma } from '../prisma.js';

export interface AuthenticatedSocketUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  driverProfileId?: string | null;
  hospitalId?: string | null;
  jurisdictionZone?: string | null;
}

export class SocketManager {
  private static instance: SocketManager;
  private io: Server | null = null;

  private constructor() {}

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public initialize(httpServer: HttpServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (isAllowedOrigin(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Origin not allowed by CORS'));
          }
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 30000,
      pingInterval: 15000,
    });

    // Authentication Middleware for all Socket.IO connections
    this.io.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

        if (!token) {
          return next(new Error('Authentication required for socket connection.'));
        }

        const decoded = jwt.verify(token, env.JWT_SECRET) as any;
        if (!decoded || !decoded.id) {
          return next(new Error('Invalid token.'));
        }

        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          include: {
            driverProfile: true,
            hospitalStaff: true,
            trafficPoliceProfile: true,
          },
        });

        if (!user) {
          return next(new Error('User not found.'));
        }

        const authUser: AuthenticatedSocketUser = {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          driverProfileId: user.driverProfile?.id || null,
          hospitalId: user.hospitalStaff?.hospitalId || null,
          jurisdictionZone: user.trafficPoliceProfile?.jurisdictionZone || null,
        };

        (socket as any).user = authUser;
        next();
      } catch (err) {
        next(new Error('Socket authentication failed: ' + (err instanceof Error ? err.message : 'Unknown')));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user as AuthenticatedSocketUser;
      if (!user) return;

      // Automatically join user's private channel and role channel
      socket.join(`user:${user.userId}`);
      socket.join(`role:${user.role}`);

      if (user.driverProfileId) {
        socket.join(`driver:${user.driverProfileId}`);
      }

      if (user.hospitalId) {
        socket.join(`hospital:${user.hospitalId}`);
      }

      if (user.jurisdictionZone) {
        socket.join(`traffic:zone:${user.jurisdictionZone}`);
      }

      // Handle trip subscription with strict authorization checks
      socket.on(SOCKET_EVENTS.SUBSCRIBE_TRIP, async (payload: { tripId: string }) => {
        try {
          if (!payload || !payload.tripId) return;

          const trip = await prisma.trip.findUnique({
            where: { id: payload.tripId },
          });

          if (!trip) return;

          // Check if user is authorized for this trip:
          // Admin always has operational access
          // Patient can only access their own trip
          // Driver can only access their assigned trip
          // Hospital staff can only access trips inbound to their hospital
          const authorized = this.isUserAuthorizedForTrip(user, trip);
          if (authorized) {
            socket.join(`trip:${trip.id}`);
            socket.emit('subscription:success', { tripId: trip.id });
          } else {
            socket.emit('error:unauthorized', { message: 'Unauthorized trip subscription' });
          }
        } catch (err) {
          console.error('Error handling trip subscription:', err);
        }
      });

      socket.on(SOCKET_EVENTS.UNSUBSCRIBE_TRIP, (payload: { tripId: string }) => {
        if (payload?.tripId) {
          socket.leave(`trip:${payload.tripId}`);
        }
      });
    });

    return this.io;
  }

  public isUserAuthorizedForTrip(
    user: AuthenticatedSocketUser,
    trip: { patientId: string; driverId?: string | null; hospitalId?: string | null }
  ): boolean {
    if (user.role === UserRole.ADMIN) return true;
    if (trip.patientId === user.userId) return true;
    if (trip.driverId && trip.driverId === user.driverProfileId) return true;
    if (trip.hospitalId && trip.hospitalId === user.hospitalId) return true;
    return false;
  }

  public getIO(): Server {
    if (!this.io) {
      throw new Error('SocketManager has not been initialized with an HTTP server.');
    }
    return this.io;
  }

  // Scoped Emitters
  public emitDispatchOffer(driverProfileId: string, offer: any): void {
    if (!this.io) return;
    this.io.to(`driver:${driverProfileId}`).emit(SOCKET_EVENTS.DISPATCH_OFFER, offer);
  }

  public emitDispatchExpired(driverProfileId: string, data: any): void {
    if (!this.io) return;
    this.io.to(`driver:${driverProfileId}`).emit(SOCKET_EVENTS.DISPATCH_EXPIRED, data);
  }

  public emitTripUpdated(tripId: string, trip: any): void {
    if (!this.io) return;

    const isPostPickup =
      trip.status === TripStatus.PATIENT_PICKED_UP ||
      trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
      trip.status === TripStatus.ARRIVED_AT_HOSPITAL;

    // 1. Patient Scoped Event
    const patientPayload: PatientTripUpdateDTO = {
      tripId: trip.id,
      status: trip.status,
      emergencyCategory: trip.emergencyCategory,
      priority: trip.priority,
      pickupAddress: trip.pickupAddress,
      pickupLatitude: trip.pickupLatitude,
      pickupLongitude: trip.pickupLongitude,
      activeDestinationType: isPostPickup ? 'HOSPITAL' : 'PICKUP',
      activeDestinationName: isPostPickup && trip.hospital ? trip.hospital.name : 'Patient Pickup',
      activeDestinationAddress: isPostPickup && trip.hospital ? trip.hospital.address : trip.pickupAddress,
      activeDestinationLatitude: isPostPickup && trip.hospital ? trip.hospital.latitude : trip.pickupLatitude,
      activeDestinationLongitude: isPostPickup && trip.hospital ? trip.hospital.longitude : trip.pickupLongitude,
      driver: trip.driver
        ? {
            name: trip.driver.user?.name || 'Assigned Driver',
            phone: trip.driver.user?.phone,
            licenseNumber: trip.driver.licenseNumber,
          }
        : null,
      ambulance: trip.ambulance
        ? {
            registrationNumber: trip.ambulance.registrationNumber,
            type: trip.ambulance.type,
            currentLatitude: trip.ambulance.currentLatitude,
            currentLongitude: trip.ambulance.currentLongitude,
            isSimulated: trip.ambulance.isSimulated || false,
          }
        : null,
      hospital: trip.hospital
        ? {
            id: trip.hospital.id,
            name: trip.hospital.name,
            address: trip.hospital.address,
            latitude: trip.hospital.latitude,
            longitude: trip.hospital.longitude,
            phone: trip.hospital.phone,
          }
        : null,
      routeToPickup: trip.routeDistanceKm
        ? {
            distanceKm: trip.routeDistanceKm,
            durationSeconds: trip.routeDurationSeconds || 0,
            geometryGeoJson: trip.routePolyline ? JSON.parse(trip.routePolyline) : undefined,
            source: 'OSRM',
          }
        : null,
      routeToHospital: trip.hospitalRouteDistanceKm
        ? {
            distanceKm: trip.hospitalRouteDistanceKm,
            durationSeconds: trip.hospitalRouteDurationSeconds || 0,
            geometryGeoJson: trip.hospitalRoutePolyline ? JSON.parse(trip.hospitalRoutePolyline) : undefined,
            source: 'OSRM',
          }
        : null,
      predictedDelaySeconds: trip.predictedDelaySeconds,
      updatedAt: trip.updatedAt?.toISOString ? trip.updatedAt.toISOString() : new Date().toISOString(),
    };

    // Emit to patient's private channel and trip room
    this.io.to(`user:${trip.patientId}`).emit(SOCKET_EVENTS.TRIP_UPDATED, patientPayload);
    this.io.to(`trip:${tripId}`).emit(SOCKET_EVENTS.TRIP_UPDATED, patientPayload);

    // 2. Driver Scoped Event
    if (trip.driverId) {
      this.io.to(`driver:${trip.driverId}`).emit(SOCKET_EVENTS.TRIP_UPDATED, patientPayload);
    }

    // 3. Hospital Inbound Scoped Event (only for assigned hospital ER)
    if (trip.hospitalId && isPostPickup) {
      const hospitalPayload: HospitalInboundTripDTO = {
        tripId: trip.id,
        status: trip.status,
        emergencyCategory: trip.emergencyCategory,
        priority: trip.priority,
        patientName: trip.booking?.patientName || 'Emergency Patient',
        patientPhone: trip.booking?.patientPhone,
        pickupAddress: trip.pickupAddress,
        notes: trip.notes,
        ambulanceRegistration: trip.ambulance?.registrationNumber,
        ambulanceType: trip.ambulance?.type,
        driverName: trip.driver?.user?.name,
        driverPhone: trip.driver?.user?.phone,
        currentLatitude: trip.driver?.currentLatitude,
        currentLongitude: trip.driver?.currentLongitude,
        estimatedArrivalSeconds: trip.hospitalRouteDurationSeconds || null,
        arrivedHospitalAt: trip.arrivedHospitalAt?.toISOString() || null,
        updatedAt: new Date().toISOString(),
      };
      this.io.to(`hospital:${trip.hospitalId}`).emit(SOCKET_EVENTS.TRIP_UPDATED, hospitalPayload);
    }

    // 4. Traffic Police Scoped Event: Strictly ZERO-PII
    const trafficPayload: TrafficCorridorEventDTO = {
      tripId: trip.id,
      corridorStatus: trip.status === TripStatus.COMPLETED ? 'CLEARED' as any : 'ACTIVE' as any,
      emergencyPriority: trip.priority,
      emergencyCategory: trip.emergencyCategory,
      ambulanceRegistration: trip.ambulance?.registrationNumber,
      ambulanceType: trip.ambulance?.type,
      currentLatitude: trip.driver?.currentLatitude,
      currentLongitude: trip.driver?.currentLongitude,
      routeSummary: isPostPickup && trip.hospital ? `Transit to ${trip.hospital.name}` : `Transit to pickup`,
      hospitalName: trip.hospital?.name || null,
      isSimulated: trip.ambulance?.isSimulated || false,
      timestamp: new Date().toISOString(),
    };
    this.io.to(`role:${UserRole.TRAFFIC_POLICE}`).emit(SOCKET_EVENTS.TRIP_UPDATED, trafficPayload);

    // 5. Admin Scoped Event
    this.io.to(`role:${UserRole.ADMIN}`).emit(SOCKET_EVENTS.TRIP_UPDATED, patientPayload);
  }

  public emitHospitalAssignmentChanged(oldHospitalId: string, newHospitalId: string, tripId: string): void {
    if (!this.io) return;
    this.io.to(`hospital:${oldHospitalId}`).emit('hospital:assignment:diverted', {
      tripId,
      status: 'DIVERTED',
      message: 'Ambulance destination has been diverted to another receiving facility.',
    });
    this.io.to(`hospital:${newHospitalId}`).emit('hospital:assignment:incoming', {
      tripId,
      status: 'ASSIGNED',
      message: 'Inbound emergency ambulance assigned to your facility ER.',
    });
  }

  public emitDriverLocation(driverProfileId: string, tripId: string | null, locationData: any): void {
    if (!this.io) return;
    if (tripId) {
      this.io.to(`trip:${tripId}`).emit(SOCKET_EVENTS.DRIVER_LOCATION_CHANGED, locationData);
    }
    this.io.to(`role:${UserRole.ADMIN}`).emit(SOCKET_EVENTS.DRIVER_LOCATION_CHANGED, locationData);
    this.io.to(`role:${UserRole.TRAFFIC_POLICE}`).emit(SOCKET_EVENTS.DRIVER_LOCATION_CHANGED, {
      driverId: locationData.driverId,
      ambulanceId: locationData.ambulanceId,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      speed: locationData.speed,
      heading: locationData.heading,
      isSimulated: locationData.isSimulated,
      timestamp: locationData.timestamp,
    });
  }

  public emitHospitalCapacityChanged(hospitalId: string, capacityData: any): void {
    if (!this.io) return;
    this.io.to(`hospital:${hospitalId}`).emit(SOCKET_EVENTS.HOSPITAL_CAPACITY_CHANGED, capacityData);
    this.io.to(`role:${UserRole.ADMIN}`).emit(SOCKET_EVENTS.HOSPITAL_CAPACITY_CHANGED, capacityData);
  }

  public emitTrafficBlockageReported(blockage: any): void {
    if (!this.io) return;
    this.io.to(`role:${UserRole.TRAFFIC_POLICE}`).emit(SOCKET_EVENTS.TRAFFIC_BLOCKAGE_REPORTED, blockage);
    this.io.to(`role:${UserRole.ADMIN}`).emit(SOCKET_EVENTS.TRAFFIC_BLOCKAGE_REPORTED, blockage);
    this.io.to(`role:${UserRole.DRIVER}`).emit(SOCKET_EVENTS.TRAFFIC_BLOCKAGE_REPORTED, blockage);
  }

  public emitTrafficCorridorUpdated(corridorEvent: any): void {
    if (!this.io) return;
    // Emit only to the zone responsible and the central control room
    if (corridorEvent.jurisdictionZone) {
      this.io.to(`traffic:zone:${corridorEvent.jurisdictionZone}`).emit(SOCKET_EVENTS.TRAFFIC_CORRIDOR_UPDATED, corridorEvent);
    }
    this.io.to(`role:${UserRole.TRAFFIC_POLICE}`).emit(SOCKET_EVENTS.TRAFFIC_CORRIDOR_UPDATED, corridorEvent);
    this.io.to(`role:${UserRole.ADMIN}`).emit(SOCKET_EVENTS.TRAFFIC_CORRIDOR_UPDATED, corridorEvent);
  }
}
