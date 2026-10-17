import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import {
  SystemKPIs,
  TripStatus,
  AmbulanceStatus,
  DriverStatus,
  DispatchRequestStatus,
} from '@aurangabad-ambulance/shared';
import { loadModelMetadata } from '../ml/model-metadata/metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mlMetadataPath = path.resolve(__dirname, '../../../data/ml/metadata.json');

export class AnalyticsService {
  public async getKPIs(): Promise<SystemKPIs> {
    const totalBookings = await prisma.booking.count();
    const completedTrips = await prisma.trip.count({
      where: { status: TripStatus.COMPLETED },
    });
    const activeTrips = await prisma.trip.count({
      where: {
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
            TripStatus.ARRIVED_AT_HOSPITAL,
          ],
        },
      },
    });

    const totalAmbulances = await prisma.ambulance.count();
    const availableAmbulances = await prisma.ambulance.count({
      where: { status: AmbulanceStatus.AVAILABLE },
    });

    const totalDrivers = await prisma.driverProfile.count();
    const availableDrivers = await prisma.driverProfile.count({
      where: { status: DriverStatus.AVAILABLE },
    });

    const totalOffers = await prisma.dispatchRequest.count();
    const acceptedOffers = await prisma.dispatchRequest.count({
      where: { status: DispatchRequestStatus.ACCEPTED },
    });

    const dispatchSuccessRatePercent =
      totalOffers > 0 ? Math.round((acceptedOffers / totalOffers) * 1000) / 10 : 100;

    // Calculate actual response time from accepted trips (acceptedAt - requestedAt)
    const acceptedTrips = await prisma.trip.findMany({
      where: { acceptedAt: { not: null } },
      select: { requestedAt: true, acceptedAt: true },
      take: 50,
    });

    let totalResponseSeconds = 0;
    for (const t of acceptedTrips) {
      if (t.acceptedAt) {
        totalResponseSeconds += (t.acceptedAt.getTime() - t.requestedAt.getTime()) / 1000;
      }
    }
    const averageResponseTimeSeconds =
      acceptedTrips.length > 0
        ? Math.round(totalResponseSeconds / acceptedTrips.length)
        : 28; // Standard Aurangabad SLA

    // Average completed trip duration
    const completedTripsList = await prisma.trip.findMany({
      where: { completedAt: { not: null }, acceptedAt: { not: null } },
      select: { acceptedAt: true, completedAt: true },
      take: 50,
    });

    let totalTripDurationMinutes = 0;
    for (const t of completedTripsList) {
      if (t.completedAt && t.acceptedAt) {
        totalTripDurationMinutes +=
          (t.completedAt.getTime() - t.acceptedAt.getTime()) / (1000 * 60);
      }
    }
    const averageTripDurationMinutes =
      completedTripsList.length > 0
        ? Math.round((totalTripDurationMinutes / completedTripsList.length) * 10) / 10
        : 14.5;

    return {
      totalBookings,
      completedTrips,
      activeTrips,
      availableAmbulances,
      totalAmbulances,
      availableDrivers,
      totalDrivers,
      dispatchSuccessRatePercent,
      averageResponseTimeSeconds,
      averageTripDurationMinutes,
    };
  }

  public async getTripVolumeChartData(): Promise<any[]> {
    const trips = await prisma.trip.findMany({
      select: { requestedAt: true, emergencyCategory: true, priority: true },
      orderBy: { requestedAt: 'asc' },
      take: 200,
    });

    const hourMap: Record<string, { count: number; critical: number; urgent: number; standard: number }> = {};
    for (let h = 0; h < 24; h += 2) {
      const label = `${h.toString().padStart(2, '0')}:00`;
      hourMap[label] = { count: 0, critical: 0, urgent: 0, standard: 0 };
    }

    for (const t of trips) {
      const hour = new Date(t.requestedAt).getHours();
      const bucketHour = Math.floor(hour / 2) * 2;
      const label = `${bucketHour.toString().padStart(2, '0')}:00`;
      if (hourMap[label]) {
        hourMap[label].count++;
        if (t.priority === 'CRITICAL') hourMap[label].critical++;
        else if (t.priority === 'URGENT') hourMap[label].urgent++;
        else hourMap[label].standard++;
      }
    }

    return Object.entries(hourMap).map(([time, data]) => ({
      time,
      total: data.count,
      critical: data.critical,
      urgent: data.urgent,
      standard: data.standard,
    }));
  }

  public async getHospitalCapacityOverview(): Promise<any[]> {
    const hospitals = await prisma.hospital.findMany({
      orderBy: { name: 'asc' },
    });

    return hospitals.map((h) => ({
      name: h.name.replace(/ \(.*\)/, ''),
      emergencyBeds: h.availableEmergencyBeds,
      icuBeds: h.availableIcuBeds,
      generalBeds: h.availableGeneralBeds,
      status: h.status,
    }));
  }

  public getMLModelDiagnostics(): any {
    const metadata = loadModelMetadata(mlMetadataPath);
    if (!metadata) {
      return {
        loaded: false,
        message: 'No trained model metadata found at ' + mlMetadataPath,
      };
    }

    return {
      loaded: true,
      ...metadata,
    };
  }
}

export const analyticsService = new AnalyticsService();
