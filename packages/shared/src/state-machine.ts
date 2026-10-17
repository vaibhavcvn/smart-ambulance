import { TripStatus, UserRole } from './enums.js';

export interface StateTransitionDefinition {
  allowedFrom: TripStatus[];
  allowedRoles: UserRole[];
  description: string;
}

export const TRIP_STATE_TRANSITIONS: Record<TripStatus, StateTransitionDefinition> = {
  [TripStatus.REQUESTED]: {
    allowedFrom: [],
    allowedRoles: [UserRole.PATIENT, UserRole.ADMIN],
    description: 'Initial booking created by patient',
  },
  [TripStatus.DISPATCHING]: {
    allowedFrom: [TripStatus.REQUESTED, TripStatus.DRIVER_REQUESTED],
    allowedRoles: [UserRole.ADMIN], // Or backend dispatch engine
    description: 'Engine is actively searching and ranking candidate ambulances',
  },
  [TripStatus.DRIVER_REQUESTED]: {
    allowedFrom: [TripStatus.DISPATCHING, TripStatus.REQUESTED],
    allowedRoles: [UserRole.ADMIN], // System dispatch offer emitted
    description: 'Dispatch offer sent to a specific driver candidate with 45s countdown',
  },
  [TripStatus.ACCEPTED]: {
    allowedFrom: [TripStatus.DRIVER_REQUESTED],
    allowedRoles: [UserRole.DRIVER, UserRole.ADMIN],
    description: 'Driver accepted the dispatch offer',
  },
  [TripStatus.EN_ROUTE_TO_PICKUP]: {
    allowedFrom: [TripStatus.ACCEPTED],
    allowedRoles: [UserRole.DRIVER, UserRole.ADMIN],
    description: 'Ambulance is driving towards the patient pickup location',
  },
  [TripStatus.ARRIVED_AT_PICKUP]: {
    allowedFrom: [TripStatus.EN_ROUTE_TO_PICKUP],
    allowedRoles: [UserRole.DRIVER, UserRole.ADMIN],
    description: 'Ambulance has reached patient location',
  },
  [TripStatus.PATIENT_PICKED_UP]: {
    allowedFrom: [TripStatus.ARRIVED_AT_PICKUP],
    allowedRoles: [UserRole.DRIVER, UserRole.ADMIN],
    description: 'Patient is loaded into ambulance; destination hospital selected/confirmed',
  },
  [TripStatus.EN_ROUTE_TO_HOSPITAL]: {
    allowedFrom: [TripStatus.PATIENT_PICKED_UP],
    allowedRoles: [UserRole.DRIVER, UserRole.ADMIN],
    description: 'Ambulance is en route to the receiving hospital',
  },
  [TripStatus.ARRIVED_AT_HOSPITAL]: {
    allowedFrom: [TripStatus.EN_ROUTE_TO_HOSPITAL],
    allowedRoles: [UserRole.DRIVER, UserRole.HOSPITAL_STAFF, UserRole.ADMIN],
    description: 'Ambulance has arrived at the hospital emergency department',
  },
  [TripStatus.COMPLETED]: {
    allowedFrom: [TripStatus.ARRIVED_AT_HOSPITAL],
    allowedRoles: [UserRole.DRIVER, UserRole.HOSPITAL_STAFF, UserRole.ADMIN],
    description: 'Patient handed over to emergency staff; fleet availability restored',
  },
  [TripStatus.CANCELLED]: {
    allowedFrom: [
      TripStatus.REQUESTED,
      TripStatus.DISPATCHING,
      TripStatus.DRIVER_REQUESTED,
      TripStatus.ACCEPTED,
      TripStatus.EN_ROUTE_TO_PICKUP,
    ],
    allowedRoles: [UserRole.PATIENT, UserRole.ADMIN, UserRole.DRIVER],
    description: 'Trip was cancelled before patient pickup',
  },
  [TripStatus.EXPIRED]: {
    allowedFrom: [TripStatus.DISPATCHING, TripStatus.DRIVER_REQUESTED, TripStatus.REQUESTED],
    allowedRoles: [UserRole.ADMIN], // System expiry when no driver accepts
    description: 'No eligible driver accepted within maximum allowed dispatch retries',
  },
};

export function isValidTripTransition(
  currentStatus: TripStatus,
  targetStatus: TripStatus,
  role?: UserRole
): { valid: boolean; reason?: string } {
  const definition = TRIP_STATE_TRANSITIONS[targetStatus];
  if (!definition) {
    return { valid: false, reason: `Target status "${targetStatus}" is not recognized.` };
  }

  if (!definition.allowedFrom.includes(currentStatus)) {
    return {
      valid: false,
      reason: `Illegal state transition from "${currentStatus}" to "${targetStatus}". Allowed prior states: [${definition.allowedFrom.join(', ')}].`,
    };
  }

  if (role && !definition.allowedRoles.includes(role)) {
    return {
      valid: false,
      reason: `User with role "${role}" is not authorized to transition trip to "${targetStatus}". Allowed roles: [${definition.allowedRoles.join(', ')}].`,
    };
  }

  return { valid: true };
}

export function isTerminalTripStatus(status: TripStatus): boolean {
  return status === TripStatus.COMPLETED || status === TripStatus.CANCELLED || status === TripStatus.EXPIRED;
}

export function isEnRouteStatus(status: TripStatus): boolean {
  return (
    status === TripStatus.ACCEPTED ||
    status === TripStatus.EN_ROUTE_TO_PICKUP ||
    status === TripStatus.PATIENT_PICKED_UP ||
    status === TripStatus.EN_ROUTE_TO_HOSPITAL
  );
}
