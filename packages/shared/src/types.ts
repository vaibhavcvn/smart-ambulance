import { z } from 'zod';
import {
  UserRole,
  EmergencyCategory,
  EmergencyPriority,
  AmbulanceType,
  AmbulanceStatus,
  DriverStatus,
  TripStatus,
  TrafficSeverity,
  CorridorStatus,
  HospitalStatus,
  DriverApplicationStatus,
  SignalClearanceStatus,
} from './enums.js';
import {
  LoginSchema,
  RegisterSchema,
  CreateBookingSchema,
  DriverLocationUpdateSchema,
  DispatchResponseSchema,
  TripStateUpdateSchema,
  HospitalCapacityUpdateSchema,
  TrafficBlockageCreateSchema,
  TrafficCorridorActionSchema,
  MLPredictionInputSchema,
  DriverApplicationSchema,
  ProvisionHospitalStaffSchema,
  ProvisionPoliceOfficerSchema,
} from './schemas.js';

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type DriverApplicationInput = z.infer<typeof DriverApplicationSchema>;
export type ProvisionHospitalStaffInput = z.infer<typeof ProvisionHospitalStaffSchema>;
export type ProvisionPoliceOfficerInput = z.infer<typeof ProvisionPoliceOfficerSchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type DriverLocationUpdateInput = z.input<typeof DriverLocationUpdateSchema>;
export type DispatchResponseInput = z.infer<typeof DispatchResponseSchema>;
export type TripStateUpdateInput = z.infer<typeof TripStateUpdateSchema>;
export type HospitalCapacityUpdateInput = z.infer<typeof HospitalCapacityUpdateSchema>;
export type TrafficBlockageCreateInput = z.infer<typeof TrafficBlockageCreateSchema>;
export type TrafficCorridorActionInput = z.infer<typeof TrafficCorridorActionSchema>;
export type MLPredictionInput = z.infer<typeof MLPredictionInputSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string | null;
  driverProfileId?: string | null;
  driverApplicationStatus?: DriverApplicationStatus | null;
  hospitalId?: string | null;
  jurisdictionZone?: string | null;
}

export interface AmbulanceDTO {
  id: string;
  registrationNumber: string;
  type: AmbulanceType;
  status: AmbulanceStatus;
  currentLatitude: number;
  currentLongitude: number;
  lastLocationUpdate: string;
  heading?: number;
  speed?: number;
  isSimulated?: boolean;
}

export interface DriverDTO {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  licenseNumber: string;
  status: DriverStatus;
  applicationStatus: DriverApplicationStatus;
  vehicleTypeRequested?: AmbulanceType | null;
  vehicleRegistrationRequested?: string | null;
  rejectionReason?: string | null;
  ambulance?: AmbulanceDTO | null;
  currentLatitude: number;
  currentLongitude: number;
  lastActive: string;
}

export interface HospitalDTO {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: HospitalStatus;
  availableEmergencyBeds: number;
  availableIcuBeds: number;
  availableGeneralBeds: number;
  hasTraumaCenter: boolean;
  hasCathLab: boolean;
  hasStrokeUnit: boolean;
  phone: string;
  updatedAt: string;
}

export interface DispatchOfferDTO {
  dispatchRequestId: string;
  tripId: string;
  emergencyCategory: EmergencyCategory;
  priority: EmergencyPriority;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLandmark?: string | null;
  notes?: string | null;
  expiresAt: string;
  secondsRemaining: number;
  estimatedDistanceKm?: number;
  estimatedDurationSeconds?: number;
}

export interface TripRouteInfo {
  distanceKm: number;
  durationSeconds: number;
  geometryGeoJson?: any;
  source: 'OSRM' | 'FALLBACK_HAVERSINE';
  isRoadGeometry?: boolean;
  pointCount?: number;
  failureReason?: string | null;
  haversineDistanceKm?: number;
  createdAt?: string;
}

export interface TripDTO {
  id: string;
  bookingId: string;
  status: TripStatus;
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  emergencyCategory: EmergencyCategory;
  priority: EmergencyPriority;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLandmark?: string | null;
  notes?: string | null;
  driver?: DriverDTO | null;
  ambulance?: AmbulanceDTO | null;
  hospital?: HospitalDTO | null;
  hospitalId?: string | null;
  routeToPickup?: TripRouteInfo | null;
  routeToHospital?: TripRouteInfo | null;
  activeDestinationType?: 'PICKUP' | 'HOSPITAL';
  activeDestinationName?: string;
  activeDestinationAddress?: string;
  activeDestinationLatitude?: number;
  activeDestinationLongitude?: number;
  routingError?: string | null;
  routeLastUpdatedAt?: string;
  requestedAt: string;
  acceptedAt?: string | null;
  arrivedPickupAt?: string | null;
  pickedUpAt?: string | null;
  arrivedHospitalAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  predictedDelaySeconds?: number | null;
  recommendedHospitalReason?: string | null;
}

export interface TrafficSignalDTO {
  id: string;
  code: string;
  name: string;
  roadName: string;
  latitude: number;
  longitude: number;
  jurisdictionZone: string;
  isVerified: boolean;
  verificationSource?: string | null;
  isEnabled: boolean;
  clearanceStatus: SignalClearanceStatus;
  currentCorridorId?: string | null;
  lastClearedAt?: string | null;
}

export interface TrafficBlockageDTO {
  id: string;
  title: string;
  description?: string | null;
  roadName: string;
  latitude: number;
  longitude: number;
  severity: TrafficSeverity;
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string | null;
  isActive: boolean;
}

export interface TrafficCorridorDTO {
  id: string;
  tripId: string;
  status: CorridorStatus;
  emergencyPriority: EmergencyPriority;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  routeSummary?: string;
  jurisdictionZone?: string;
  upcomingSignal?: TrafficSignalDTO | null;
  signalEtaSeconds?: number | null;
  corridorClearanceStatus?: SignalClearanceStatus;
  updatedAt: string;
}

/** Zero-PII Corridor Event strictly for Traffic Police */
export interface TrafficCorridorEventDTO {
  tripId: string;
  corridorId?: string;
  corridorStatus: CorridorStatus;
  emergencyPriority: EmergencyPriority;
  emergencyCategory?: EmergencyCategory;
  ambulanceRegistration?: string;
  ambulanceType?: AmbulanceType;
  currentLatitude?: number;
  currentLongitude?: number;
  heading?: number | null;
  speed?: number | null;
  routeSummary?: string | null;
  upcomingSignal?: TrafficSignalDTO | null;
  estimatedArrivalSeconds?: number | null;
  hospitalName?: string | null;
  jurisdictionZone?: string | null;
  isSimulated?: boolean;
  timestamp: string;
}

/** Scoped Event for Inbound Hospital Preparation */
export interface HospitalInboundTripDTO {
  tripId: string;
  status: TripStatus;
  emergencyCategory: EmergencyCategory;
  priority: EmergencyPriority;
  patientName?: string;
  patientPhone?: string;
  pickupAddress: string;
  notes?: string | null;
  ambulanceRegistration?: string;
  ambulanceType?: AmbulanceType;
  driverName?: string;
  driverPhone?: string;
  currentLatitude?: number;
  currentLongitude?: number;
  estimatedArrivalSeconds?: number | null;
  arrivedHospitalAt?: string | null;
  updatedAt: string;
}

/** Scoped Event for Patient Map Tracking */
export interface PatientTripUpdateDTO {
  tripId: string;
  status: TripStatus;
  emergencyCategory: EmergencyCategory;
  priority: EmergencyPriority;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  activeDestinationType: 'PICKUP' | 'HOSPITAL';
  activeDestinationName: string;
  activeDestinationAddress: string;
  activeDestinationLatitude: number;
  activeDestinationLongitude: number;
  driver?: {
    name: string;
    phone?: string | null;
    licenseNumber: string;
  } | null;
  ambulance?: {
    registrationNumber: string;
    type: AmbulanceType;
    currentLatitude: number;
    currentLongitude: number;
    isSimulated: boolean;
  } | null;
  hospital?: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    phone: string;
  } | null;
  activeRoute?: TripRouteInfo | null;
  routeToPickup?: TripRouteInfo | null;
  routeToHospital?: TripRouteInfo | null;
  routingError?: string | null;
  predictedDelaySeconds?: number | null;
  updatedAt: string;
}

export interface SystemKPIs {
  totalBookings: number;
  completedTrips: number;
  activeTrips: number;
  availableAmbulances: number;
  totalAmbulances: number;
  availableDrivers: number;
  totalDrivers: number;
  dispatchSuccessRatePercent: number;
  averageResponseTimeSeconds: number;
  averageTripDurationMinutes: number;
}

export interface MLModelEvaluationMetrics {
  version: string;
  trainedAt: string;
  algorithm: string;
  sampleCount: number;
  maeSeconds: number;
  rmseSeconds: number;
  r2Score: number;
  baselineMaeSeconds: number;
  features: string[];
  isSynthetic: boolean;
}
