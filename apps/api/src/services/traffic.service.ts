import { prisma } from '../prisma.js';
import {
  TrafficBlockageDTO,
  TrafficCorridorDTO,
  TrafficBlockageCreateInput,
  TrafficCorridorActionInput,
  TrafficSignalDTO,
  TrafficCorridorEventDTO,
  CorridorStatus,
  TrafficSeverity,
  SignalClearanceStatus,
  EmergencyPriority,
  EmergencyCategory,
} from '@aurangabad-ambulance/shared';
import { NotFoundError, BadRequestError } from '../common/errors/app-error.js';
import { calculateHaversineDistanceKm } from '../integrations/routing/osrm.js';
import { SocketManager } from '../realtime/socket-manager.js';

export const AURANGABAD_CONFIGURED_SIGNALS = [
  {
    code: 'SIG-KRANTI-01',
    name: 'Kranti Chowk Junction',
    roadName: 'Jalna Road / Station Road',
    latitude: 19.8762,
    longitude: 75.3242,
    jurisdictionZone: 'CITY_CENTRAL',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-AMARPREET-02',
    name: 'Amarpreet Chowk',
    roadName: 'Jalna Road / Mondha Naka',
    latitude: 19.8735,
    longitude: 75.3370,
    jurisdictionZone: 'CITY_CENTRAL',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-SEVENHILLS-03',
    name: 'Seven Hills Junction',
    roadName: 'Jalna Road / Garkheda Road',
    latitude: 19.8748,
    longitude: 75.3524,
    jurisdictionZone: 'CIDCO',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-CIDCO-CONNAUGHT-04',
    name: 'CIDCO Connaught Place Junction',
    roadName: 'Jalna Road / CIDCO N-1',
    latitude: 19.8825,
    longitude: 75.3685,
    jurisdictionZone: 'CIDCO',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-BABA-PETROL-05',
    name: 'Baba Petrol Pump Chowk',
    roadName: 'Dr. Ambedkar Road / Mahaveer Chowk',
    latitude: 19.8805,
    longitude: 75.3160,
    jurisdictionZone: 'CITY_CENTRAL',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-NIRALA-06',
    name: 'Nirala Bazaar Chowk',
    roadName: 'Samarth Nagar / Tilak Path',
    latitude: 19.8845,
    longitude: 75.3265,
    jurisdictionZone: 'CITY_CENTRAL',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-CBS-07',
    name: 'Central Bus Station (CBS) Chowk',
    roadName: 'Aurangpura / CBS Road',
    latitude: 19.8885,
    longitude: 75.3220,
    jurisdictionZone: 'CITY_CENTRAL',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-RAILWAY-STN-08',
    name: 'Railway Station Junction',
    roadName: 'Station Road / Vedant Nagar',
    latitude: 19.8650,
    longitude: 75.3120,
    jurisdictionZone: 'CITY_SOUTH',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-MUKUNDWADI-09',
    name: 'Mukundwadi Railway Station Chowk',
    roadName: 'Jalna Road / Mukundwadi',
    latitude: 19.8760,
    longitude: 75.3850,
    jurisdictionZone: 'CIDCO',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-WALUJ-10',
    name: 'Waluj MIDC Main Chowk',
    roadName: 'Pune-Aurangabad Highway',
    latitude: 19.8250,
    longitude: 75.2400,
    jurisdictionZone: 'WALUJ',
    isVerified: true,
    verificationSource: 'AURANGABAD_POLICE_REGISTRY',
    isEnabled: true,
  },
  {
    code: 'SIG-SHAHNOOR-11',
    name: 'Shahnoor Miya Dargah Chowk',
    roadName: 'Beed Bypass / Garkheda',
    latitude: 19.8600,
    longitude: 75.3400,
    jurisdictionZone: 'CITY_SOUTH',
    isVerified: false,
    verificationSource: 'MANUAL_SURVEY_UNVERIFIED',
    isEnabled: true,
  },
];

export class TrafficService {
  /**
   * Idempotently seeds default configured signals if the registry table is empty.
   */
  public async ensureSignalsSeeded(): Promise<void> {
    const count = await prisma.trafficSignal.count();
    if (count === 0) {
      for (const sig of AURANGABAD_CONFIGURED_SIGNALS) {
        await prisma.trafficSignal.create({
          data: sig,
        });
      }
    }
  }

  public async listSignals(jurisdictionZone?: string): Promise<TrafficSignalDTO[]> {
    await this.ensureSignalsSeeded();
    const where: any = {};
    if (jurisdictionZone) {
      where.jurisdictionZone = jurisdictionZone;
    }
    const signals = await prisma.trafficSignal.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    return signals.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      roadName: s.roadName,
      latitude: s.latitude,
      longitude: s.longitude,
      jurisdictionZone: s.jurisdictionZone,
      isVerified: s.isVerified,
      verificationSource: s.verificationSource,
      isEnabled: s.isEnabled,
      clearanceStatus: s.clearanceStatus as SignalClearanceStatus,
      currentCorridorId: s.currentCorridorId,
      lastClearedAt: s.lastClearedAt?.toISOString() || null,
    }));
  }

  /**
   * Returns active corridors matching the police user's jurisdiction.
   * Strictly enforces Zero-PII: No patient name, phone, notes, or identity.
   */
  public async getActiveCorridors(jurisdictionZone?: string | null): Promise<TrafficCorridorEventDTO[]> {
    const corridors = await prisma.trafficCorridor.findMany({
      where: {
        status: { in: [CorridorStatus.REQUESTED, CorridorStatus.ACTIVE] },
      },
      include: {
        trip: {
          include: {
            driver: { include: { user: true } },
            ambulance: true,
            hospital: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const signals = await this.listSignals();
    const signalMap = new Map(signals.map((s) => [s.id, s]));

    const dtos: TrafficCorridorEventDTO[] = corridors.map((c) => {
      const upcomingSig = c.upcomingSignalId ? signalMap.get(c.upcomingSignalId) || null : null;
      return {
        tripId: c.tripId,
        corridorId: c.id,
        corridorStatus: c.status as CorridorStatus,
        emergencyPriority: c.emergencyPriority as EmergencyPriority,
        emergencyCategory: c.trip?.emergencyCategory as EmergencyCategory,
        ambulanceRegistration: c.trip?.ambulance?.registrationNumber,
        ambulanceType: c.trip?.ambulance?.type as any,
        currentLatitude: c.trip?.driver?.currentLatitude,
        currentLongitude: c.trip?.driver?.currentLongitude,
        routeSummary: c.routeSummary,
        upcomingSignal: upcomingSig,
        estimatedArrivalSeconds: c.signalEtaSeconds || null,
        hospitalName: c.trip?.hospital?.name || null,
        jurisdictionZone: c.jurisdictionZone || upcomingSig?.jurisdictionZone || null,
        isSimulated: c.trip?.ambulance?.isSimulated || false,
        timestamp: c.updatedAt.toISOString(),
      };
    });

    // Jurisdiction filtering: Officers restricted to a specific zone only see their zone
    if (jurisdictionZone && jurisdictionZone !== 'ALL') {
      return dtos.filter(
        (c) => c.jurisdictionZone === jurisdictionZone || c.upcomingSignal?.jurisdictionZone === jurisdictionZone
      );
    }

    return dtos;
  }

  /**
   * Matches active ambulance position and route geometry against configured signals.
   * Identifies the closest upcoming signal ahead on the route and updates the corridor.
   */
  public async updateUpcomingSignalForTrip(
    tripId: string,
    currentLat?: number,
    currentLng?: number
  ): Promise<TrafficSignalDTO | null> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        ambulance: true,
        driver: true,
        hospital: true,
        trafficCorridor: true,
      },
    });

    if (!trip || !trip.trafficCorridor) return null;

    const ambLat = currentLat || trip.driver?.currentLatitude || trip.ambulance?.currentLatitude || trip.pickupLatitude;
    const ambLng = currentLng || trip.driver?.currentLongitude || trip.ambulance?.currentLongitude || trip.pickupLongitude;

    const isHospitalPhase =
      trip.status === 'PATIENT_PICKED_UP' ||
      trip.status === 'EN_ROUTE_TO_HOSPITAL' ||
      trip.status === 'ARRIVED_AT_HOSPITAL';

    const targetLat = isHospitalPhase && trip.hospital ? trip.hospital.latitude : trip.pickupLatitude;
    const targetLng = isHospitalPhase && trip.hospital ? trip.hospital.longitude : trip.pickupLongitude;

    const totalDistanceToTarget = calculateHaversineDistanceKm(ambLat, ambLng, targetLat, targetLng);

    // Fetch enabled signals
    await this.ensureSignalsSeeded();
    const signals = await prisma.trafficSignal.findMany({
      where: { isEnabled: true },
    });

    let bestUpcomingSignal: any = null;
    let minDistanceToAmbulance = Infinity;

    for (const sig of signals) {
      const distFromAmbKm = calculateHaversineDistanceKm(ambLat, ambLng, sig.latitude, sig.longitude);
      const distFromSigToTarget = calculateHaversineDistanceKm(sig.latitude, sig.longitude, targetLat, targetLng);

      // Signal must be ahead of the ambulance (closer to destination than ambulance is, or within forward threshold)
      const isAhead = distFromSigToTarget < totalDistanceToTarget + 0.3;
      // Proximity threshold: signal must be within 6 km of ambulance and along trajectory
      if (isAhead && distFromAmbKm < 6.0 && distFromAmbKm < minDistanceToAmbulance) {
        minDistanceToAmbulance = distFromAmbKm;
        bestUpcomingSignal = sig;
      }
    }

    if (bestUpcomingSignal) {
      // Estimated arrival time: assume average urban emergency speed of 40 km/h (11.1 m/s)
      const etaSeconds = Math.round((minDistanceToAmbulance / 40) * 3600);

      await prisma.trafficCorridor.updateMany({
        where: { tripId },
        data: {
          upcomingSignalId: bestUpcomingSignal.id,
          upcomingSignalName: bestUpcomingSignal.name,
          signalEtaSeconds: etaSeconds,
          jurisdictionZone: bestUpcomingSignal.jurisdictionZone,
        },
      });

      await prisma.trafficSignal.update({
        where: { id: bestUpcomingSignal.id },
        data: {
          clearanceStatus: SignalClearanceStatus.REQUESTED,
          currentCorridorId: trip.trafficCorridor.id,
        },
      });

      const signalDTO: TrafficSignalDTO = {
        id: bestUpcomingSignal.id,
        code: bestUpcomingSignal.code,
        name: bestUpcomingSignal.name,
        roadName: bestUpcomingSignal.roadName,
        latitude: bestUpcomingSignal.latitude,
        longitude: bestUpcomingSignal.longitude,
        jurisdictionZone: bestUpcomingSignal.jurisdictionZone,
        isVerified: bestUpcomingSignal.isVerified,
        verificationSource: bestUpcomingSignal.verificationSource,
        isEnabled: bestUpcomingSignal.isEnabled,
        clearanceStatus: SignalClearanceStatus.REQUESTED,
        currentCorridorId: trip.trafficCorridor.id,
        lastClearedAt: bestUpcomingSignal.lastClearedAt?.toISOString() || null,
      };

      const eventPayload: TrafficCorridorEventDTO = {
        tripId: trip.id,
        corridorId: trip.trafficCorridor.id,
        corridorStatus: trip.trafficCorridor.status as CorridorStatus,
        emergencyPriority: trip.priority as EmergencyPriority,
        emergencyCategory: trip.emergencyCategory as EmergencyCategory,
        ambulanceRegistration: trip.ambulance?.registrationNumber,
        ambulanceType: trip.ambulance?.type as any,
        currentLatitude: ambLat,
        currentLongitude: ambLng,
        routeSummary: trip.trafficCorridor.routeSummary,
        upcomingSignal: signalDTO,
        estimatedArrivalSeconds: etaSeconds,
        hospitalName: trip.hospital?.name || null,
        jurisdictionZone: bestUpcomingSignal.jurisdictionZone,
        isSimulated: trip.ambulance?.isSimulated || false,
        timestamp: new Date().toISOString(),
      };

      // Emit corridor event to responsible jurisdiction room and control room
      SocketManager.getInstance().emitTrafficCorridorUpdated(eventPayload);

      return signalDTO;
    }

    return null;
  }

  public async handleCorridorAction(
    userId: string,
    input: TrafficCorridorActionInput
  ): Promise<TrafficCorridorDTO> {
    const corridor = await prisma.trafficCorridor.findUnique({
      where: { tripId: input.tripId },
    });

    if (!corridor) {
      throw new NotFoundError('Traffic corridor not found for this trip.');
    }

    let targetStatus = corridor.status;
    const now = new Date();
    let clearedAt: Date | null = null;
    let clearanceStatus: SignalClearanceStatus = SignalClearanceStatus.NORMAL;

    if (input.action === 'ACKNOWLEDGE') {
      targetStatus = CorridorStatus.ACTIVE;
      clearanceStatus = SignalClearanceStatus.REQUESTED;
    } else if (input.action === 'ACTIVATE') {
      targetStatus = CorridorStatus.ACTIVE;
      clearanceStatus = SignalClearanceStatus.REQUESTED;
    } else if (input.action === 'CLEAR') {
      targetStatus = CorridorStatus.CLEARED;
      clearedAt = now;
      clearanceStatus = SignalClearanceStatus.CLEARED;

      if (corridor.upcomingSignalId) {
        await prisma.trafficSignal.update({
          where: { id: corridor.upcomingSignalId },
          data: {
            clearanceStatus: SignalClearanceStatus.CLEARED,
            lastClearedAt: now,
          },
        });
      }
    } else if (input.action === 'CANCEL') {
      targetStatus = CorridorStatus.CANCELLED;
      clearanceStatus = SignalClearanceStatus.NORMAL;
    }

    const updated = await prisma.trafficCorridor.update({
      where: { id: corridor.id },
      data: {
        status: targetStatus,
        acknowledgedByUserId: userId,
        clearedAt,
        corridorClearanceStatus: clearanceStatus,
        routeSummary: input.notes
          ? `${corridor.routeSummary || ''} | Note: ${input.notes}`
          : corridor.routeSummary,
      },
    });

    const dto: TrafficCorridorDTO = {
      id: updated.id,
      tripId: updated.tripId,
      status: updated.status as CorridorStatus,
      emergencyPriority: updated.emergencyPriority as any,
      originLat: updated.originLat,
      originLng: updated.originLng,
      destLat: updated.destLat,
      destLng: updated.destLng,
      routeSummary: updated.routeSummary || undefined,
      jurisdictionZone: updated.jurisdictionZone || undefined,
      signalEtaSeconds: updated.signalEtaSeconds || null,
      corridorClearanceStatus: clearanceStatus,
      updatedAt: updated.updatedAt.toISOString(),
    };

    SocketManager.getInstance().emitTrafficCorridorUpdated({
      tripId: updated.tripId,
      corridorId: updated.id,
      corridorStatus: updated.status as CorridorStatus,
      emergencyPriority: updated.emergencyPriority as any,
      jurisdictionZone: updated.jurisdictionZone || undefined,
      estimatedArrivalSeconds: updated.signalEtaSeconds || null,
      timestamp: updated.updatedAt.toISOString(),
    });

    return dto;
  }

  public async listBlockages(): Promise<TrafficBlockageDTO[]> {
    const records = await prisma.trafficBlockage.findMany({
      where: { isActive: true },
      include: { reportedBy: true },
      orderBy: { reportedAt: 'desc' },
    });

    return records.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      roadName: b.roadName,
      latitude: b.latitude,
      longitude: b.longitude,
      severity: b.severity as TrafficSeverity,
      reportedBy: b.reportedBy?.name || 'Traffic Officer',
      reportedAt: b.reportedAt.toISOString(),
      resolvedAt: b.resolvedAt?.toISOString() || null,
      isActive: b.isActive,
    }));
  }

  public async reportBlockage(
    userId: string,
    input: TrafficBlockageCreateInput
  ): Promise<TrafficBlockageDTO> {
    const blockage = await prisma.trafficBlockage.create({
      data: {
        title: input.title,
        description: input.description,
        roadName: input.roadName,
        latitude: input.latitude,
        longitude: input.longitude,
        severity: input.severity,
        reportedByUserId: userId,
        estimatedDurationMinutes: input.estimatedDurationMinutes,
        isActive: true,
      },
      include: { reportedBy: true },
    });

    const dto: TrafficBlockageDTO = {
      id: blockage.id,
      title: blockage.title,
      description: blockage.description,
      roadName: blockage.roadName,
      latitude: blockage.latitude,
      longitude: blockage.longitude,
      severity: blockage.severity as TrafficSeverity,
      reportedBy: blockage.reportedBy?.name || 'Traffic Officer',
      reportedAt: blockage.reportedAt.toISOString(),
      resolvedAt: null,
      isActive: true,
    };

    SocketManager.getInstance().emitTrafficBlockageReported(dto);
    return dto;
  }

  public async resolveBlockage(blockageId: string): Promise<{ success: boolean }> {
    const blockage = await prisma.trafficBlockage.findUnique({
      where: { id: blockageId },
    });
    if (!blockage) {
      throw new NotFoundError('Traffic blockage record not found.');
    }

    await prisma.trafficBlockage.update({
      where: { id: blockageId },
      data: {
        isActive: false,
        resolvedAt: new Date(),
      },
    });

    return { success: true };
  }
}

export const trafficService = new TrafficService();
