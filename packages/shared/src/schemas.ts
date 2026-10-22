import { z } from 'zod';
import {
  UserRole,
  EmergencyCategory,
  TripStatus,
  TrafficSeverity,
  HospitalStatus,
  DriverStatus,
  AmbulanceType,
} from './enums.js';

export const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^[0-9+ -]{7,15}$/, 'Invalid phone number format').optional(),
  role: z.nativeEnum(UserRole).optional().default(UserRole.PATIENT),
  // Deprecated client-supplied fields (public registration will always be PATIENT)
  driverLicenseNumber: z.string().optional(),
  hospitalId: z.string().optional(),
  policeBadgeNumber: z.string().optional(),
});

export const DriverApplicationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().regex(/^[0-9+ -]{7,15}$/, 'Invalid phone number format').optional(),
  licenseNumber: z.string().min(4, 'Valid driver license number is required'),
  requestedAmbulanceType: z.nativeEnum(AmbulanceType).optional().default(AmbulanceType.BLS),
  requestedAmbulanceRegistration: z.string().optional(),
});

export const ProvisionHospitalStaffSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  hospitalId: z.string().min(1, 'Target hospital ID is required'),
  roleTitle: z.string().optional().default('Emergency Medical Officer'),
});

export const ProvisionPoliceOfficerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  badgeNumber: z.string().min(2, 'Badge number is required'),
  jurisdictionZone: z.string().min(2, 'Jurisdiction zone is required').default('ALL'),
  assignedPost: z.string().optional(),
});

export const CreateBookingSchema = z.object({
  pickupAddress: z.string().min(3, 'Pickup address is required'),
  pickupLatitude: z
    .number()
    .min(19.6, 'Latitude is outside Aurangabad region')
    .max(20.15, 'Latitude is outside Aurangabad region'),
  pickupLongitude: z
    .number()
    .min(75.1, 'Longitude is outside Aurangabad region')
    .max(75.65, 'Longitude is outside Aurangabad region'),
  pickupLandmark: z.string().optional(),
  emergencyCategory: z.nativeEnum(EmergencyCategory),
  hospitalId: z.string().optional(),
  patientName: z.string().min(2).optional(),
  patientPhone: z.string().optional(),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export const DriverLocationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).max(200).optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracy: z.number().min(0).max(500).optional(),
  isSimulated: z.boolean().optional().default(false),
  timestamp: z.string().optional(),
  tripId: z.string().optional(),
});

export const DispatchResponseSchema = z.object({
  dispatchRequestId: z.string().min(1, 'Dispatch request ID is required'),
  action: z.enum(['ACCEPT', 'DECLINE']),
  reason: z.string().optional(),
});

export const TripStateUpdateSchema = z.object({
  targetStatus: z.nativeEnum(TripStatus),
  hospitalId: z.string().optional(),
  notes: z.string().optional(),
});

export const DriverAvailabilitySchema = z.object({
  status: z.nativeEnum(DriverStatus),
  currentLatitude: z.number().min(-90).max(90).optional(),
  currentLongitude: z.number().min(-180).max(180).optional(),
});

export const HospitalCapacityUpdateSchema = z.object({
  availableEmergencyBeds: z.number().int().min(0, 'Beds count cannot be negative'),
  availableIcuBeds: z.number().int().min(0, 'Beds count cannot be negative'),
  availableGeneralBeds: z.number().int().min(0, 'Beds count cannot be negative'),
  status: z.nativeEnum(HospitalStatus).optional(),
});

export const TrafficBlockageCreateSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  description: z.string().optional(),
  roadName: z.string().min(2, 'Road name is required'),
  latitude: z.number().min(19.6).max(20.15),
  longitude: z.number().min(75.1).max(75.65),
  severity: z.nativeEnum(TrafficSeverity),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
});

export const TrafficCorridorActionSchema = z.object({
  tripId: z.string().min(1),
  action: z.enum(['ACKNOWLEDGE', 'ACTIVATE', 'CLEAR', 'CANCEL']),
  notes: z.string().optional(),
});

export const MLPredictionInputSchema = z.object({
  distanceKm: z.number().positive(),
  osrmDurationSeconds: z.number().positive(),
  emergencyCategory: z.nativeEnum(EmergencyCategory),
  hourOfDay: z.number().int().min(0).max(23),
  dayOfWeek: z.number().int().min(0).max(6),
  activeBlockagesNearby: z.number().int().min(0).default(0),
});
