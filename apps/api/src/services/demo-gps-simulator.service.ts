/**
 * Demo GPS Simulation Engine
 *
 * Route-following deterministic simulation that:
 * - Fetches OSRM road geometry for the current trip phase
 * - Advances the simulated ambulance along actual road waypoints
 * - Emits GPS telemetry via the tracking service on each tick
 * - Supports all trip phases: approach pickup → pickup → en-route to hospital → arrival
 * - Never displays simulated GPS as real GPS (always sets isSimulated=true)
 * - Centralized on the backend for consistency across all connected clients
 */

import { prisma } from '../prisma.js';
import { getRoute } from '../integrations/routing/osrm.js';
import { trackingService } from './tracking.service.js';
import { env } from '../config/env.js';
import { TripStatus } from '@aurangabad-ambulance/shared';

export interface SimulatorConfig {
  speedKmh: number;
  tickIntervalMs: number;
  proximityAlertRadiusKm: number;
  alertLeadTimeSeconds: number;
}

export interface ActiveSimulation {
  tripId: string;
  driverProfileId: string;
  routeWaypoints: [number, number][];
  currentWaypointIndex: number;
  phase: 'APPROACH_PICKUP' | 'AT_PICKUP' | 'TO_HOSPITAL' | 'ARRIVED';
  pickupLat: number;
  pickupLng: number;
  hospitalLat?: number;
  hospitalLng?: number;
  startedAt: number;
  lastTickAt: number;
}

const DEFAULT_CONFIG: SimulatorConfig = {
  speedKmh: 42,
  tickIntervalMs: 1000,
  proximityAlertRadiusKm: 0.8,
  alertLeadTimeSeconds: 300,
};

export class DemoGpsSimulatorService {
  private static instance: DemoGpsSimulatorService;
  private simulations = new Map<string, ActiveSimulation>();
  private config: SimulatorConfig = { ...DEFAULT_CONFIG };
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  private constructor() {}

  public static getInstance(): DemoGpsSimulatorService {
    if (!DemoGpsSimulatorService.instance) {
      DemoGpsSimulatorService.instance = new DemoGpsSimulatorService();
    }
    return DemoGpsSimulatorService.instance;
  }

  public getConfig(): SimulatorConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<SimulatorConfig>): SimulatorConfig {
    this.config = { ...this.config, ...partial };
    if (this.isRunning) {
      this.stopTicker();
      this.startTicker();
    }
    return { ...this.config };
  }

  public getActiveSimulations(): { tripId: string; phase: string; waypointsTotal: number; currentIndex: number }[] {
    return Array.from(this.simulations.values()).map((s) => ({
      tripId: s.tripId,
      phase: s.phase,
      waypointsTotal: s.routeWaypoints.length,
      currentIndex: s.currentWaypointIndex,
    }));
  }

  public async startSimulation(tripId: string): Promise<{ success: boolean; message: string }> {
    if (!env.ENABLE_DEMO_GPS_SIMULATOR) {
      return { success: false, message: 'Demo GPS simulator is disabled.' };
    }

    if (this.simulations.has(tripId)) {
      return { success: true, message: 'Simulation already active for this trip.' };
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: true, ambulance: true, hospital: true },
    });

    if (!trip) return { success: false, message: `Trip ${tripId} not found.` };
    if (!trip.driverId || !trip.driver) return { success: false, message: 'No driver assigned.' };

    const startLat = trip.driver.currentLatitude || 19.8762;
    const startLng = trip.driver.currentLongitude || 75.3433;

    let waypoints: [number, number][] = [];
    try {
      const route = await getRoute(startLat, startLng, trip.pickupLatitude, trip.pickupLongitude);
      if (route.isRoadGeometry && route.geometryGeoJson?.coordinates?.length >= 2) {
        waypoints = route.geometryGeoJson.coordinates as [number, number][];
      }
    } catch { /* fallback below */ }

    if (waypoints.length < 2) {
      waypoints = this.generateStraightLineWaypoints(startLng, startLat, trip.pickupLongitude, trip.pickupLatitude, 10);
    }

    const sim: ActiveSimulation = {
      tripId,
      driverProfileId: trip.driverId,
      routeWaypoints: waypoints,
      currentWaypointIndex: 0,
      phase: 'APPROACH_PICKUP',
      pickupLat: trip.pickupLatitude,
      pickupLng: trip.pickupLongitude,
      hospitalLat: trip.hospital?.latitude,
      hospitalLng: trip.hospital?.longitude,
      startedAt: Date.now(),
      lastTickAt: Date.now(),
    };

    this.simulations.set(tripId, sim);

    await prisma.driverProfile.update({ where: { id: trip.driverId }, data: { isSimulated: true } });
    if (trip.ambulanceId) {
      await prisma.ambulance.update({ where: { id: trip.ambulanceId }, data: { isSimulated: true } });
    }

    if (!this.isRunning) this.startTicker();

    return { success: true, message: `Demo GPS simulation started for trip ${tripId} with ${waypoints.length} waypoints.` };
  }

  public async stopSimulation(tripId: string): Promise<{ success: boolean }> {
    const sim = this.simulations.get(tripId);
    if (!sim) return { success: false };

    this.simulations.delete(tripId);

    try {
      await prisma.driverProfile.update({ where: { id: sim.driverProfileId }, data: { isSimulated: false } });
    } catch { /* non-critical */ }

    if (this.simulations.size === 0) this.stopTicker();
    return { success: true };
  }

  public async advanceSimulation(tripId: string): Promise<{ success: boolean; message: string }> {
    const sim = this.simulations.get(tripId);
    if (!sim) return { success: false, message: 'Simulation not active for this trip.' };

    // Advance 60% of remaining waypoints or jump straight to end if close
    const remaining = sim.routeWaypoints.length - 1 - sim.currentWaypointIndex;
    const jump = Math.max(1, Math.ceil(remaining * 0.6));
    sim.currentWaypointIndex = Math.min(sim.routeWaypoints.length - 1, sim.currentWaypointIndex + jump);

    const [currentLng, currentLat] = sim.routeWaypoints[sim.currentWaypointIndex];
    try {
      await trackingService.updateDriverLocation(sim.driverProfileId, {
        latitude: currentLat,
        longitude: currentLng,
        isSimulated: true,
        timestamp: new Date().toISOString(),
      });
    } catch { /* non-critical */ }

    if (sim.currentWaypointIndex >= sim.routeWaypoints.length - 1) {
      await this.handlePhaseCompletion(tripId, sim);
    }

    return {
      success: true,
      message: `Advanced trip ${tripId} to waypoint ${sim.currentWaypointIndex + 1}/${sim.routeWaypoints.length}.`,
    };
  }

  public async loadHospitalRoute(tripId: string, hospitalLat: number, hospitalLng: number): Promise<void> {
    const sim = this.simulations.get(tripId);
    if (!sim) return;

    const [currentLng, currentLat] = sim.routeWaypoints[Math.min(sim.currentWaypointIndex, sim.routeWaypoints.length - 1)];

    let waypoints: [number, number][] = [];
    try {
      const route = await getRoute(currentLat, currentLng, hospitalLat, hospitalLng);
      if (route.isRoadGeometry && route.geometryGeoJson?.coordinates?.length >= 2) {
        waypoints = route.geometryGeoJson.coordinates as [number, number][];
      }
    } catch { /* fallback */ }

    if (waypoints.length < 2) {
      waypoints = this.generateStraightLineWaypoints(currentLng, currentLat, hospitalLng, hospitalLat, 10);
    }

    sim.routeWaypoints = waypoints;
    sim.currentWaypointIndex = 0;
    sim.phase = 'TO_HOSPITAL';
    sim.hospitalLat = hospitalLat;
    sim.hospitalLng = hospitalLng;
  }

  private startTicker(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickTimer = setInterval(() => { this.tick().catch(console.warn); }, this.config.tickIntervalMs);
  }

  private stopTicker(): void {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    this.isRunning = false;
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const [tripId, sim] of this.simulations) {
      try { await this.tickSimulation(tripId, sim, now); }
      catch (err) { console.warn(`[DemoGPS] tick error for trip ${tripId}:`, err); }
    }
  }

  private async tickSimulation(tripId: string, sim: ActiveSimulation, now: number): Promise<void> {
    const elapsedSeconds = (now - sim.lastTickAt) / 1000;
    const speedMs = (this.config.speedKmh * 1000) / 3600;
    let remainingMeters = speedMs * elapsedSeconds;
    sim.lastTickAt = now;

    const prevPoint = sim.routeWaypoints[sim.currentWaypointIndex];

    while (remainingMeters > 0 && sim.currentWaypointIndex < sim.routeWaypoints.length - 1) {
      const [fromLng, fromLat] = sim.routeWaypoints[sim.currentWaypointIndex];
      const [toLng, toLat] = sim.routeWaypoints[sim.currentWaypointIndex + 1];
      const segmentMeters = this.haversineKm(fromLat, fromLng, toLat, toLng) * 1000;

      if (remainingMeters >= segmentMeters) {
        remainingMeters -= segmentMeters;
        sim.currentWaypointIndex++;
      } else {
        const fraction = remainingMeters / Math.max(segmentMeters, 1);
        sim.routeWaypoints[sim.currentWaypointIndex] = [
          fromLng + (toLng - fromLng) * fraction,
          fromLat + (toLat - fromLat) * fraction,
        ];
        remainingMeters = 0;
      }
    }

    const [currentLng, currentLat] = sim.routeWaypoints[sim.currentWaypointIndex];
    const bearing = this.calculateBearing(prevPoint[1], prevPoint[0], currentLat, currentLng);

    try {
      await trackingService.updateDriverLocation(sim.driverProfileId, {
        latitude: currentLat,
        longitude: currentLng,
        heading: !isNaN(bearing) && bearing > 0 ? Math.round(bearing) : undefined,
        speed: Math.round(this.config.speedKmh),
        isSimulated: true,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn(`[DemoGPS] Location update rejected for driver ${sim.driverProfileId}:`, err.message);
    }

    if (sim.currentWaypointIndex >= sim.routeWaypoints.length - 1) {
      await this.handlePhaseCompletion(tripId, sim);
    }
  }

  private async handlePhaseCompletion(tripId: string, sim: ActiveSimulation): Promise<void> {
    if (sim.phase === 'APPROACH_PICKUP' || sim.phase === 'AT_PICKUP') {
      sim.phase = 'AT_PICKUP';
      const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { hospital: true } });
      if (trip && (trip.status === TripStatus.PATIENT_PICKED_UP || trip.status === TripStatus.EN_ROUTE_TO_HOSPITAL) && trip.hospital) {
        await this.loadHospitalRoute(tripId, trip.hospital.latitude, trip.hospital.longitude);
      }
    } else if (sim.phase === 'TO_HOSPITAL') {
      sim.phase = 'ARRIVED';
      await this.stopSimulation(tripId);
    }
  }

  private generateStraightLineWaypoints(fromLng: number, fromLat: number, toLng: number, toLat: number, steps: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([fromLng + (toLng - fromLng) * t, fromLat + (toLat - fromLat) * t]);
    }
    return pts;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }
}

export const demoGpsSimulator = DemoGpsSimulatorService.getInstance();
