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
  /**
   * Clinical Severity & Proximity Multi-Factor Hospital Recommendation Engine:
   * Prioritizes life-saving clinical specialty (Trauma Center, Cath Lab, Stroke Unit, ICU)
   * combined with nearest road proximity to ensure survival during the golden hour.
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
      // Exclude closed hospitals
      if (h.status === 'CLOSED') continue;

      const distKm = calculateHaversineDistanceKm(pickupLat, pickupLng, h.latitude, h.longitude);

      // Base score starts at 100, proximity is heavily weighted to save life during golden hour
      let score = 100 - distKm * 10;

      // Bed capacity
      const erBeds = h.availableEmergencyBeds;
      const icuBeds = h.availableIcuBeds;

      if (erBeds === 0 && icuBeds === 0) {
        score -= 120; // 100% saturated capacity penalty
      } else {
        score += Math.min(erBeds, 25) * 3 + Math.min(icuBeds, 15) * 5;
      }

      let capabilityReason = '';
      let isMatched = false;

      switch (category) {
        case EmergencyCategory.TRAUMA_ACCIDENT:
          if (h.hasTraumaCenter) {
            score += 75;
            isMatched = true;
            capabilityReason = 'Level-1 Emergency Trauma Resuscitation Center with surgical theater';
          } else {
            // Crucial: facilities without emergency trauma surgery cannot treat polytrauma
            score -= 150;
          }
          break;

        case EmergencyCategory.CARDIAC_ARREST:
          if (h.hasCathLab) {
            score += 70;
            isMatched = true;
            capabilityReason = 'Dedicated 24/7 Cardiac Catheterization Lab active for acute PCI';
          } else {
            // Acute STEMI / cardiac arrest requires catheterization
            score -= 140;
          }
          break;

        case EmergencyCategory.STROKE:
          if (h.hasStrokeUnit) {
            score += 70;
            isMatched = true;
            capabilityReason = 'Specialized Stroke & Neuro-vascular Center with urgent thrombolysis';
          } else {
            score -= 140;
          }
          break;

        case EmergencyCategory.RESPIRATORY_FAILURE:
          if (icuBeds >= 4) {
            score += 60;
            isMatched = true;
            capabilityReason = 'Tertiary Intensive Care Facility with mechanical ventilators';
          } else if (icuBeds > 0) {
            score += 30;
            isMatched = true;
            capabilityReason = 'ICU Facility with respiratory support beds';
          } else {
            score -= 90;
          }
          break;

        case EmergencyCategory.MATERNITY_LABOR:
          score += 40;
          isMatched = true;
          capabilityReason = 'Emergency Obstetric & Neonatal Resuscitation Care';
          break;

        case EmergencyCategory.GENERAL_EMERGENCY:
        default:
          score += 30;
          isMatched = true;
          capabilityReason = 'Multi-specialty Emergency Dept with 24/7 triage';
          break;
      }

      // Proximity tier bonus: immediate response zone
      if (distKm <= 2.5) {
        score += 25;
      } else if (distKm <= 5.0) {
        score += 12;
      } else if (distKm > 10.0) {
        score -= 30;
      }

      if (h.status === 'DIVERTING') {
        score -= 80; // Heavy diverting penalty
      }

      if (score > bestScore) {
        bestScore = score;
        selectedHospital = h;
        selectedDistance = distKm;
        selectedReason = isMatched && capabilityReason
          ? `${capabilityReason} (${distKm.toFixed(1)} km away • ${erBeds} ER beds, ${icuBeds} ICU beds available)`
          : `Optimal combination of proximity (${distKm.toFixed(1)} km) and open bed capacity (${erBeds} ER beds)`;
      }
    }

    return {
      hospital: this.mapToDTO(selectedHospital),
      score: Math.round(bestScore),
      reason: selectedReason,
      distanceKm: Math.round(selectedDistance * 10) / 10,
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
