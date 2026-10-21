import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma.js';
import {
  DriverAvailabilitySchema,
  DriverApplicationSchema,
  UserRole,
  DriverApplicationStatus,
  DriverStatus,
} from '@aurangabad-ambulance/shared';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import { authService } from '../../services/auth.service.js';

export async function driverRoutes(fastify: FastifyInstance) {
  // Public Driver Application Onboarding (PHASE 6)
  fastify.post('/api/v1/drivers/apply', async (request) => {
    const parsed = DriverApplicationSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid driver application payload', parsed.error.format());
    }

    return authService.applyDriver(parsed.data);
  });

  // Get current authenticated driver's application status
  fastify.get(
    '/api/v1/drivers/application-status',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.DRIVER])],
    },
    async (request) => {
      const driverProfileId = request.user!.driverProfileId;
      if (!driverProfileId) {
        throw new BadRequestError('User does not have a driver profile.');
      }

      const driver = await prisma.driverProfile.findUnique({
        where: { id: driverProfileId },
        include: { assignedAmbulance: true, user: true },
      });

      if (!driver) {
        throw new NotFoundError('Driver profile not found.');
      }

      return {
        id: driver.id,
        applicationStatus: driver.applicationStatus,
        status: driver.status,
        licenseNumber: driver.licenseNumber,
        vehicleTypeRequested: driver.vehicleTypeRequested,
        vehicleRegistrationRequested: driver.vehicleRegistrationRequested,
        rejectionReason: driver.rejectionReason,
        reviewedAt: driver.reviewedAt?.toISOString() || null,
        assignedAmbulance: driver.assignedAmbulance
          ? {
              id: driver.assignedAmbulance.id,
              registrationNumber: driver.assignedAmbulance.registrationNumber,
              type: driver.assignedAmbulance.type,
              status: driver.assignedAmbulance.status,
            }
          : null,
      };
    }
  );

  fastify.get(
    '/api/v1/drivers',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.ADMIN])],
    },
    async () => {
      const drivers = await prisma.driverProfile.findMany({
        include: { user: true, assignedAmbulance: true },
        orderBy: { createdAt: 'desc' },
      });

      return drivers.map((d) => ({
        id: d.id,
        userId: d.userId,
        name: d.user.name,
        email: d.user.email,
        phone: d.user.phone,
        licenseNumber: d.licenseNumber,
        status: d.status,
        applicationStatus: d.applicationStatus,
        currentLatitude: d.currentLatitude,
        currentLongitude: d.currentLongitude,
        ambulanceRegistration: d.assignedAmbulance?.registrationNumber,
        ambulanceType: d.assignedAmbulance?.type,
        lastLocationUpdate: d.lastLocationUpdate.toISOString(),
      }));
    }
  );

  fastify.patch(
    '/api/v1/drivers/availability',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.DRIVER])],
    },
    async (request) => {
      const driverProfileId = request.user!.driverProfileId;
      if (!driverProfileId) {
        throw new BadRequestError('User does not have an active driver profile.');
      }

      const driver = await prisma.driverProfile.findUnique({
        where: { id: driverProfileId },
      });

      if (!driver) {
        throw new NotFoundError('Driver profile not found.');
      }

      // Enforce: only approved drivers may toggle availability
      if (driver.applicationStatus !== DriverApplicationStatus.APPROVED) {
        throw new ForbiddenError(
          `Your driver application status is "${driver.applicationStatus}". You must be approved by the administrator before changing operational availability.`
        );
      }

      const parsed = DriverAvailabilitySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid availability payload', parsed.error.format());
      }

      const updateData: any = { status: parsed.data.status };
      if (parsed.data.currentLatitude !== undefined && parsed.data.currentLongitude !== undefined) {
        updateData.currentLatitude = parsed.data.currentLatitude;
        updateData.currentLongitude = parsed.data.currentLongitude;
        updateData.lastLocationUpdate = new Date();
      }

      const updated = await prisma.driverProfile.update({
        where: { id: driverProfileId },
        data: updateData,
        include: { user: true, assignedAmbulance: true },
      });

      if (parsed.data.status === DriverStatus.AVAILABLE && driver.assignedAmbulanceId) {
        await prisma.ambulance.update({
          where: { id: driver.assignedAmbulanceId },
          data: { status: 'AVAILABLE' },
        });
      }

      return {
        id: updated.id,
        status: updated.status,
        applicationStatus: updated.applicationStatus,
        currentLatitude: updated.currentLatitude,
        currentLongitude: updated.currentLongitude,
      };
    }
  );
}
