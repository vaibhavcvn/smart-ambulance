import { prisma } from '../prisma.js';
import {
  HospitalDTO,
  HospitalCapacityUpdateInput,
  EmergencyCategory,
  HospitalStatus,
  TripDTO,
} from '@aurangabad-ambulance/shared';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../common/errors/app-error.js';
import { calculateHaversineDistanceKm } from '../integrations/routing/osrm.js';
import { SocketManager } from '../realtime/socket-manager.js';

export interface HospitalRecommendationResult {
  hospital: HospitalDTO;
  score: number;
  reason: string;
  distanceKm: number;
}

export class HospitalService {
  public async listHospitals(): Promise<HospitalDTO[]> {
    const records = await prisma.hospital.findMany({
      orderBy: { name: 'asc' },
    });

    return records.map((h) => this.mapToDTO(h));
  }

  public async getHospitalById(id: string): Promise<HospitalDTO> {
    const record = await prisma.hospital.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundError(`Hospital with ID "${id}" was not found.`);
    }
    return this.mapToDTO(record);
  }

  public async updateCapacity(
    hospitalId: string,
    input: HospitalCapacityUpdateInput,
    userHospitalId?: string | null,
    isAdmin = false
  ): Promise<HospitalDTO> {
    // Enforce authorization isolation: staff can only update their own hospital
    if (!isAdmin && userHospitalId !== hospitalId) {
      throw new ForbiddenError('You are only authorized to modify bed capacity for your assigned hospital.');
    }

    if (
      input.availableEmergencyBeds < 0 ||
      input.availableIcuBeds < 0 ||
      input.availableGeneralBeds < 0
    ) {
      throw new BadRequestError('Bed counts cannot be negative.');
    }

    const updated = await prisma.hospital.update({
      where: { id: hospitalId },
      data: {
        availableEmergencyBeds: input.availableEmergencyBeds,
        availableIcuBeds: input.availableIcuBeds,
        availableGeneralBeds: input.availableGeneralBeds,
        status: input.status,
      },
    });

    const dto = this.mapToDTO(updated);

    // Notify real-time listeners
    SocketManager.getInstance().emitHospitalCapacityChanged(hospitalId, dto);

    return dto;
  }

  public async getInboundTrips(
    hospitalId: string,
    userHospitalId?: string | null,
    isAdmin = false
  ): Promise<any[]> {
    if (!isAdmin && userHospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied: You are only authorized to retrieve inbound trips for your assigned hospital.');
    }

    const trips = await prisma.trip.findMany({
      where: {
        hospitalId,
        status: {
          in: ['PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL', 'ARRIVED_AT_HOSPITAL'],
        },
      },
      include: {
        driver: { include: { user: true } },
        ambulance: true,
        booking: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return trips.map((t) => ({
      id: t.id,
      status: t.status,
      emergencyCategory: t.emergencyCategory,
      priority: t.priority,
      patientName: t.booking?.patientName || 'Emergency Patient',
      patientPhone: t.booking?.patientPhone,
      pickupAddress: t.pickupAddress,
      notes: t.notes,
      ambulanceRegistration: t.ambulance?.registrationNumber,
      driverName: t.driver?.user?.name,
      arrivedHospitalAt: t.arrivedHospitalAt,
      predictedDelaySeconds: t.predictedDelaySeconds,
      updatedAt: t.updatedAt,
    }));
  }

  /**
   * Transparent Multi-Factor Hospital Recommendation Scoring:
   * Score = (AvailableBeds * 15) + (CapabilityBonus * 40) - (DistanceKm * 8) - (DivertingPenalty)
   */
  public async recommendHospital(
    pickupLat: number,
    pickupLng: number,
    category: EmergencyCategory
  ): Promise<HospitalRecommendationResult> {
    const hospitals = await prisma.hospital.findMany();
    if (hospitals.length === 0) {
      throw new NotFoundError('No operational hospitals available in Aurangabad database.');
    }

    let bestScore = -Infinity;
    let selectedHospital = hospitals[0];
    let selectedReason = 'Nearest available general emergency medical center.';
    let selectedDistance = 0;

    for (const h of hospitals) {
      // Exclude closed or diverting hospitals
      if (h.status === 'CLOSED') continue;

      const distKm = calculateHaversineDistanceKm(pickupLat, pickupLng, h.latitude, h.longitude);
      let score = 100 - distKm * 8; // Closer is better

      const totalEmergencyBeds = h.availableEmergencyBeds + h.availableIcuBeds;
      score += Math.min(totalEmergencyBeds, 20) * 3; // Bed availability bonus

      let capabilityReason = '';

      if (category === EmergencyCategory.CARDIAC_ARREST) {
        if (h.hasCathLab) {
          score += 45;
          capabilityReason = 'Dedicated cardiac catheterization lab active.';
        }
      } else if (category === EmergencyCategory.TRAUMA_ACCIDENT) {
        if (h.hasTraumaCenter) {
          score += 50;
          capabilityReason = 'Level-1 Emergency Trauma Resuscitation Center.';
        }
      } else if (category === EmergencyCategory.STROKE) {
        if (h.hasStrokeUnit) {
          score += 45;
          capabilityReason = 'Specialized Stroke & Neuro-vascular Care Unit.';
        }
      }

      if (h.status === 'DIVERTING') {
        score -= 60; // Diverting penalty
      }

      if (score > bestScore) {
        bestScore = score;
        selectedHospital = h;
        selectedDistance = distKm;
        selectedReason = capabilityReason
          ? `${capabilityReason} (${distKm} km, ${h.availableEmergencyBeds} ER beds available)`
          : `Optimal combination of proximity (${distKm} km) and bed capacity (${h.availableEmergencyBeds} ER beds)`;
      }
    }

    return {
      hospital: this.mapToDTO(selectedHospital),
      score: Math.round(bestScore),
      reason: selectedReason,
      distanceKm: selectedDistance,
    };
  }

  private mapToDTO(h: any): HospitalDTO {
    return {
      id: h.id,
      name: h.name,
      address: h.address,
      latitude: h.latitude,
      longitude: h.longitude,
      status: h.status as HospitalStatus,
      availableEmergencyBeds: h.availableEmergencyBeds,
      availableIcuBeds: h.availableIcuBeds,
      availableGeneralBeds: h.availableGeneralBeds,
      hasTraumaCenter: h.hasTraumaCenter,
      hasCathLab: h.hasCathLab,
      hasStrokeUnit: h.hasStrokeUnit,
      phone: h.phone,
      updatedAt: h.updatedAt.toISOString(),
    };
  }
}

export const hospitalService = new HospitalService();
