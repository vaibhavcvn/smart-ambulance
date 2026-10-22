import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma.js';
import {
  DriverAvailabilitySchema,
  DriverApplicationSchema,
  UserRole,
  DriverApplicationStatus,
  DriverStatus,
  AmbulanceStatus,
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

      // Enforce: only approved drivers may toggle availability, but allow pending drivers to self-activate into testing
      if (driver.applicationStatus === DriverApplicationStatus.SUSPENDED) {
        throw new ForbiddenError(
          'Your driver account has been suspended by the administrator.'
        );
      }
      if (driver.applicationStatus === DriverApplicationStatus.REJECTED) {
        throw new ForbiddenError(
          `Your driver application was rejected: ${driver.rejectionReason || 'Contact EMS administration.'}`
        );
      }

      const parsed = DriverAvailabilitySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid availability payload', parsed.error.format());
      }

      let applicationStatus = driver.applicationStatus;
      let assignedAmbulanceId = driver.assignedAmbulanceId;

      // Auto-approve and provision ambulance for pending drivers who go online
      if (
        driver.applicationStatus === DriverApplicationStatus.PENDING_REVIEW &&
        parsed.data.status === DriverStatus.AVAILABLE
      ) {
        applicationStatus = DriverApplicationStatus.APPROVED;
        if (!assignedAmbulanceId) {
          const reg =
            driver.vehicleRegistrationRequested ||
            `MH-20-REAL-${driver.id.slice(-4).toUpperCase()}`;
          const newAmb = await prisma.ambulance.create({
            data: {
              registrationNumber: reg,
              type: driver.vehicleTypeRequested || 'BLS',
              status: AmbulanceStatus.AVAILABLE,
              currentLatitude: parsed.data.currentLatitude ?? driver.currentLatitude,
              currentLongitude: parsed.data.currentLongitude ?? driver.currentLongitude,
              isSimulated: false,
            },
          });
          assignedAmbulanceId = newAmb.id;
        }
      }

      const updateData: any = {
        status: parsed.data.status,
        applicationStatus,
        assignedAmbulanceId,
      };

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

      if (parsed.data.status === DriverStatus.AVAILABLE && updated.assignedAmbulanceId) {
        await prisma.ambulance.update({
          where: { id: updated.assignedAmbulanceId },
          data: {
            status: AmbulanceStatus.AVAILABLE,
            ...(parsed.data.currentLatitude !== undefined && parsed.data.currentLongitude !== undefined
              ? {
                  currentLatitude: parsed.data.currentLatitude,
                  currentLongitude: parsed.data.currentLongitude,
                }
              : {}),
          },
        });
      }

      return {
        id: updated.id,
        status: updated.status,
        applicationStatus: updated.applicationStatus,
        currentLatitude: updated.currentLatitude,
        currentLongitude: updated.currentLongitude,
        assignedAmbulance: updated.assignedAmbulance
          ? {
              id: updated.assignedAmbulance.id,
              registrationNumber: updated.assignedAmbulance.registrationNumber,
              type: updated.assignedAmbulance.type,
              status: updated.assignedAmbulance.status,
            }
          : null,
      };
    }
  );

  // Dedicated driver self-activation endpoint
  fastify.post(
    '/api/v1/drivers/activate',
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
        include: { assignedAmbulance: true },
      });

      if (!driver) {
        throw new NotFoundError('Driver profile not found.');
      }

      if (driver.applicationStatus === DriverApplicationStatus.SUSPENDED) {
        throw new ForbiddenError('Suspended drivers cannot be activated.');
      }

      let assignedAmbulanceId = driver.assignedAmbulanceId;
      if (!assignedAmbulanceId) {
        const reg =
          driver.vehicleRegistrationRequested ||
          `MH-20-REAL-${driver.id.slice(-4).toUpperCase()}`;
        const newAmb = await prisma.ambulance.create({
          data: {
            registrationNumber: reg,
            type: driver.vehicleTypeRequested || 'BLS',
            status: AmbulanceStatus.AVAILABLE,
            currentLatitude: driver.currentLatitude,
            currentLongitude: driver.currentLongitude,
            isSimulated: false,
          },
        });
        assignedAmbulanceId = newAmb.id;
      } else {
        await prisma.ambulance.update({
          where: { id: assignedAmbulanceId },
          data: { status: AmbulanceStatus.AVAILABLE },
        });
      }

      const updated = await prisma.driverProfile.update({
        where: { id: driverProfileId },
        data: {
          applicationStatus: DriverApplicationStatus.APPROVED,
          status: DriverStatus.AVAILABLE,
          assignedAmbulanceId,
          reviewedAt: new Date(),
        },
        include: { user: true, assignedAmbulance: true },
      });

      return {
        success: true,
        message: 'Driver profile activated and online for emergency dispatches.',
        driver: {
          id: updated.id,
          applicationStatus: updated.applicationStatus,
          status: updated.status,
          assignedAmbulance: updated.assignedAmbulance
            ? {
                id: updated.assignedAmbulance.id,
                registrationNumber: updated.assignedAmbulance.registrationNumber,
                type: updated.assignedAmbulance.type,
                status: updated.assignedAmbulance.status,
              }
            : null,
        },
      };
    }
  );
}
