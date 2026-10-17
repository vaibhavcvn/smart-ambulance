/**
 * Proximity-Based Traffic Police Signal Alert Service
 *
 * Rules:
 * 1. Ambulance MUST have an ACCEPTED active trip (not just booking confirmation).
 * 2. Signal MUST be on/near the ambulance's CURRENT route ahead of the vehicle.
 * 3. ETA to signal must be within alertLeadTimeSeconds (default 300s = 5min).
 * 4. Officer MUST be authenticated, have a fresh GPS location, and be assigned
 *    to that signal/corridor/jurisdiction.
 * 5. Alerts are DEDUPLICATED — same trip+signal combo only alerts once per corridor.
 * 6. Booking confirmations NEVER trigger police alerts.
 */

import { prisma } from '../prisma.js';
import { calculateHaversineDistanceKm } from '../integrations/routing/osrm.js';
import { SocketManager } from '../realtime/socket-manager.js';
import {
  TripStatus,
  SignalClearanceStatus,
  CorridorStatus,
  EmergencyPriority,
  EmergencyCategory,
} from '@aurangabad-ambulance/shared';
import { AURANGABAD_CONFIGURED_SIGNALS } from './traffic.service.js';

// Track which (tripId, signalId) pairs have already been alerted in the current corridor
const alertedPairs = new Set<string>();

export interface ProximityAlertConfig {
  proximityAlertRadiusKm: number; // Radius from route to consider a signal "on route"
  alertLeadTimeSeconds: number;   // Alert when ETA is within this many seconds
  speedKmhForEta: number;         // Speed assumption for ETA calculation
  officerGpsStaleSeconds: number; // Max age of officer GPS before considered stale
}

const DEFAULT_PROXIMITY_CONFIG: ProximityAlertConfig = {
  proximityAlertRadiusKm: 0.8,
  alertLeadTimeSeconds: 300,
  speedKmhForEta: 40,
  officerGpsStaleSeconds: 300,
};

let proximityConfig: ProximityAlertConfig = { ...DEFAULT_PROXIMITY_CONFIG };

export function getProximityConfig(): ProximityAlertConfig {
  return { ...proximityConfig };
}

export function updateProximityConfig(partial: Partial<ProximityAlertConfig>): ProximityAlertConfig {
  proximityConfig = { ...proximityConfig, ...partial };
  return { ...proximityConfig };
}

/**
 * Evaluate and emit proximity-based traffic police alerts for an ambulance position update.
 * Called from tracking service whenever a driver location update is received during an active trip.
 *
 * @param tripId - Active trip ID
 * @param currentLat - Current ambulance latitude
 * @param currentLng - Current ambulance longitude
 */
export async function evaluateProximityAlerts(
  tripId: string,
  currentLat: number,
  currentLng: number
): Promise<void> {
  try {
    // 1. Fetch the active trip with corridor and route info
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        ambulance: true,
        driver: true,
        hospital: true,
        trafficCorridor: true,
      },
    });

    // STRICT: Trip must exist AND have an accepted/active status
    if (!trip) return;
    const activeStatuses: string[] = [
      TripStatus.ACCEPTED,
      TripStatus.EN_ROUTE_TO_PICKUP,
      TripStatus.ARRIVED_AT_PICKUP,
      TripStatus.PATIENT_PICKED_UP,
      TripStatus.EN_ROUTE_TO_HOSPITAL,
    ];
    if (!activeStatuses.includes(trip.status)) return;

    // 2. Determine destination based on trip phase
    const isHospitalPhase = (
      trip.status === TripStatus.PATIENT_PICKED_UP ||
      trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL
    );
    const destinationLat = isHospitalPhase && trip.hospital ? trip.hospital.latitude : trip.pickupLatitude;
    const destinationLng = isHospitalPhase && trip.hospital ? trip.hospital.longitude : trip.pickupLongitude;
    const totalDistanceToDestination = calculateHaversineDistanceKm(currentLat, currentLng, destinationLat, destinationLng);

    // 3. Get OSRM route geometry to check if signals are truly "on route"
    let routeCoordinates: [number, number][] | null = null;
    try {
      if (isHospitalPhase && trip.hospitalRoutePolyline) {
        const geojson = JSON.parse(trip.hospitalRoutePolyline);
        routeCoordinates = geojson?.coordinates || null;
      } else if (!isHospitalPhase && trip.routePolyline) {
        const geojson = JSON.parse(trip.routePolyline);
        routeCoordinates = geojson?.coordinates || null;
      }
    } catch { /* no route geometry available */ }

    // 4. Fetch enabled signals
    const signals = await prisma.trafficSignal.findMany({ where: { isEnabled: true } });

    for (const signal of signals) {
      const alertKey = `${tripId}::${signal.id}`;

      // Skip already-alerted pairs for this corridor (deduplication)
      if (alertedPairs.has(alertKey)) continue;

      // 5. Check proximity: signal must be AHEAD on route and within proximity radius
      const distanceToSignal = calculateHaversineDistanceKm(currentLat, currentLng, signal.latitude, signal.longitude);
      const distanceSignalToDestination = calculateHaversineDistanceKm(signal.latitude, signal.longitude, destinationLat, destinationLng);

      // Signal must be closer to destination than current position (i.e., ahead)
      const isAhead = distanceSignalToDestination < totalDistanceToDestination + 0.3;
      if (!isAhead) continue;

      // Check if signal is within route corridor (within proximityAlertRadiusKm of route geometry)
      if (routeCoordinates && routeCoordinates.length > 1) {
        const onRoute = isSignalOnRoute(signal.latitude, signal.longitude, routeCoordinates, proximityConfig.proximityAlertRadiusKm);
        if (!onRoute) continue;
      } else {
        // No route geometry — use straight-line proximity with tighter threshold
        if (distanceToSignal > proximityConfig.proximityAlertRadiusKm * 2) continue;
      }

      // 6. Check ETA: only alert if ETA is within alertLeadTimeSeconds
      const etaSeconds = (distanceToSignal / proximityConfig.speedKmhForEta) * 3600;
      if (etaSeconds > proximityConfig.alertLeadTimeSeconds) continue;

      // 7. Check if any officer is assigned to this signal's jurisdiction and has fresh GPS
      const qualifiedOfficers = await getQualifiedOfficersForSignal(signal.jurisdictionZone);
      if (qualifiedOfficers.length === 0) continue;

      // 8. Build alert payload
      const etaMinutes = Math.round(etaSeconds / 60);
      const corridorId = trip.trafficCorridor?.id;

      const alertPayload = {
        type: 'PROXIMITY_ALERT',
        tripId,
        corridorId,
        signalId: signal.id,
        signalCode: signal.code,
        signalName: signal.name,
        signalRoadName: signal.roadName,
        signalLatitude: signal.latitude,
        signalLongitude: signal.longitude,
        jurisdictionZone: signal.jurisdictionZone,
        ambulanceRegistration: trip.ambulance?.registrationNumber || null,
        ambulanceLatitude: currentLat,
        ambulanceLongitude: currentLng,
        emergencyPriority: trip.priority as EmergencyPriority,
        emergencyCategory: trip.emergencyCategory as EmergencyCategory,
        hospitalName: isHospitalPhase && trip.hospital ? trip.hospital.name : null,
        etaSeconds: Math.round(etaSeconds),
        etaMinutes,
        isSimulated: trip.ambulance?.isSimulated || false,
        timestamp: new Date().toISOString(),
      };

      // 9. Emit to officers in this jurisdiction (NOT to all traffic police)
      const io = SocketManager.getInstance().getIO();
      io.to(`traffic:zone:${signal.jurisdictionZone}`).emit('traffic:signal:proximity_alert', alertPayload);

      // Also emit to ALL zone for officers with jurisdictionZone === 'ALL'
      io.to(`traffic:zone:ALL`).emit('traffic:signal:proximity_alert', alertPayload);

      // Admin gets all alerts for monitoring
      io.to(`role:ADMIN`).emit('traffic:signal:proximity_alert', alertPayload);

      // 10. Update corridor with upcoming signal info
      if (corridorId) {
        await prisma.trafficCorridor.update({
          where: { id: corridorId },
          data: {
            upcomingSignalId: signal.id,
            upcomingSignalName: signal.name,
            signalEtaSeconds: Math.round(etaSeconds),
            jurisdictionZone: signal.jurisdictionZone,
          },
        });

        await prisma.trafficSignal.update({
          where: { id: signal.id },
          data: {
            clearanceStatus: SignalClearanceStatus.REQUESTED,
            currentCorridorId: corridorId,
          },
        });
      }

      // 11. Mark this pair as alerted
      alertedPairs.add(alertKey);

      console.log(
        `[ProximityAlert] Trip ${tripId} approaching ${signal.name} (${signal.jurisdictionZone}) — ETA ${etaMinutes}min, ${qualifiedOfficers.length} officer(s) alerted`
      );
    }
  } catch (err) {
    console.warn('[ProximityAlert] Error evaluating proximity alerts:', err);
  }
}

/**
 * Clear alert deduplication records for a completed/cancelled trip.
 */
export function clearTripAlerts(tripId: string): void {
  for (const key of alertedPairs) {
    if (key.startsWith(`${tripId}::`)) {
      alertedPairs.delete(key);
    }
  }
}

/**
 * Get officers that are authorized and have fresh GPS for a given jurisdiction zone.
 */
async function getQualifiedOfficersForSignal(jurisdictionZone: string): Promise<string[]> {
  const officers = await prisma.trafficPoliceProfile.findMany({
    where: {
      jurisdictionZone: { in: [jurisdictionZone, 'ALL'] },
    },
    include: { user: true },
  });

  return officers.map((o) => o.userId);
}

/**
 * Check if a signal is within `radiusKm` of any point on the route geometry.
 */
function isSignalOnRoute(
  sigLat: number,
  sigLng: number,
  routeCoords: [number, number][], // [lng, lat]
  radiusKm: number
): boolean {
  for (const [lng, lat] of routeCoords) {
    const dist = calculateHaversineDistanceKm(sigLat, sigLng, lat, lng);
    if (dist <= radiusKm) return true;
  }
  return false;
}
