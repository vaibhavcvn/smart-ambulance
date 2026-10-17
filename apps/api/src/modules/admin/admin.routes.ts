import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma.js';
import {
  UserRole,
  DriverApplicationStatus,
  ProvisionHospitalStaffSchema,
  ProvisionPoliceOfficerSchema,
  AmbulanceStatus,
  DriverStatus,
} from '@aurangabad-ambulance/shared';
import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';
import { authService } from '../../services/auth.service.js';
import { trafficService } from '../../services/traffic.service.js';
import { z } from 'zod';

const RejectDriverSchema = z.object({
  reason: z.string().min(3, 'Rejection reason must be provided'),
});

const ApproveDriverSchema = z.object({
  ambulanceId: z.string().optional(),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // All admin endpoints require authentication and ADMIN role
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.authorize([UserRole.ADMIN]));

  // 1. List all driver applications
  fastify.get('/api/v1/admin/drivers/applications', async () => {
    const drivers = await prisma.driverProfile.findMany({
      include: {
        user: true,
        assignedAmbulance: true,
      },
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
      vehicleTypeRequested: d.vehicleTypeRequested,
      vehicleRegistrationRequested: d.vehicleRegistrationRequested,
      rejectionReason: d.rejectionReason,
      reviewedAt: d.reviewedAt?.toISOString() || null,
      assignedAmbulance: d.assignedAmbulance
        ? {
            id: d.assignedAmbulance.id,
            registrationNumber: d.assignedAmbulance.registrationNumber,
            type: d.assignedAmbulance.type,
          }
        : null,
      createdAt: d.createdAt.toISOString(),
    }));
  });

  // 2. Approve a driver application
  fastify.post('/api/v1/admin/drivers/:id/approve', async (request) => {
    const { id } = request.params as { id: string };
    const parsed = ApproveDriverSchema.safeParse(request.body || {});
    const driver = await prisma.driverProfile.findUnique({
      where: { id },
      include: { user: true, assignedAmbulance: true },
    });

    if (!driver) {
      throw new NotFoundError(`Driver profile with ID "${id}" was not found.`);
    }

    // Assign an ambulance if not already assigned
    let targetAmbulanceId = parsed.success ? parsed.data.ambulanceId : undefined;
    if (!targetAmbulanceId && !driver.assignedAmbulanceId) {
      // Find an available ambulance matching requested type or any available
      const candidateAmbulance = await prisma.ambulance.findFirst({
        where: {
          driverProfile: null,
          status: AmbulanceStatus.AVAILABLE,
        },
      });

      if (candidateAmbulance) {
        targetAmbulanceId = candidateAmbulance.id;
      } else {
        // Create an ambulance automatically based on requested registration/type
        const reg =
          driver.vehicleRegistrationRequested ||
          `MH-20-EM-${Math.floor(1000 + Math.random() * 9000)}`;
        const newAmb = await prisma.ambulance.create({
          data: {
            registrationNumber: reg,
            type: driver.vehicleTypeRequested || 'BLS',
            status: AmbulanceStatus.AVAILABLE,
          },
        });
        targetAmbulanceId = newAmb.id;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ambId = targetAmbulanceId || driver.assignedAmbulanceId;
      if (ambId) {
        await tx.ambulance.update({
          where: { id: ambId },
          data: { status: AmbulanceStatus.AVAILABLE },
        });
      }

      const d = await tx.driverProfile.update({
        where: { id },
        data: {
          applicationStatus: DriverApplicationStatus.APPROVED,
          status: DriverStatus.AVAILABLE,
          assignedAmbulanceId: ambId,
          reviewedAt: new Date(),
          reviewedByUserId: request.user!.id,
          rejectionReason: null,
        },
        include: { user: true, assignedAmbulance: true },
      });

      await tx.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DRIVER_APPLICATION_APPROVED',
          resourceType: 'DRIVER_PROFILE',
          resourceId: d.id,
          details: JSON.stringify({
            driverName: d.user.name,
            ambulanceId: ambId,
          }),
        },
      });

      return d;
    });

    return {
      success: true,
      message: `Driver ${updated.user.name} approved and activated for dispatch.`,
      driver: {
        id: updated.id,
        applicationStatus: updated.applicationStatus,
        status: updated.status,
        ambulanceRegistration: updated.assignedAmbulance?.registrationNumber,
      },
    };
  });

  // 3. Reject a driver application
  fastify.post('/api/v1/admin/drivers/:id/reject', async (request) => {
    const { id } = request.params as { id: string };
    const parsed = RejectDriverSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('A valid rejection reason is required', parsed.error.format());
    }

    const driver = await prisma.driverProfile.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError(`Driver profile with ID "${id}" was not found.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.driverProfile.update({
        where: { id },
        data: {
          applicationStatus: DriverApplicationStatus.REJECTED,
          status: DriverStatus.OFFLINE,
          rejectionReason: parsed.data.reason,
          reviewedAt: new Date(),
          reviewedByUserId: request.user!.id,
        },
        include: { user: true },
      });

      await tx.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DRIVER_APPLICATION_REJECTED',
          resourceType: 'DRIVER_PROFILE',
          resourceId: d.id,
          details: JSON.stringify({
            driverName: d.user.name,
            reason: parsed.data.reason,
          }),
        },
      });

      return d;
    });

    return {
      success: true,
      message: `Driver application for ${updated.user.name} rejected.`,
    };
  });

  // 4. Suspend a driver
  fastify.post('/api/v1/admin/drivers/:id/suspend', async (request) => {
    const { id } = request.params as { id: string };
    const driver = await prisma.driverProfile.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundError(`Driver profile with ID "${id}" was not found.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.driverProfile.update({
        where: { id },
        data: {
          applicationStatus: DriverApplicationStatus.SUSPENDED,
          status: DriverStatus.OFFLINE,
          reviewedAt: new Date(),
          reviewedByUserId: request.user!.id,
        },
        include: { user: true },
      });

      // Cancel any active dispatch offers for this driver
      await tx.dispatchRequest.updateMany({
        where: { driverId: d.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      await tx.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'DRIVER_SUSPENDED',
          resourceType: 'DRIVER_PROFILE',
          resourceId: d.id,
          details: JSON.stringify({
            driverName: d.user.name,
            status: DriverApplicationStatus.SUSPENDED,
          }),
        },
      });

      return d;
    });

    return {
      success: true,
      message: `Driver ${updated.user.name} has been suspended. Operational dispatch access revoked.`,
    };
  });

  // 5. Provision Hospital Staff (PHASE 7)
  fastify.post('/api/v1/admin/hospitals/provision-staff', async (request) => {
    const parsed = ProvisionHospitalStaffSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid hospital staff payload', parsed.error.format());
    }

    return authService.provisionHospitalStaff(request.user!.id, parsed.data);
  });

  // 6. Provision Traffic Police (PHASE 8)
  fastify.post('/api/v1/admin/traffic/provision-officer', async (request) => {
    const parsed = ProvisionPoliceOfficerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid traffic police payload', parsed.error.format());
    }

    return authService.provisionPoliceOfficer(request.user!.id, parsed.data);
  });

  // 7. Signal Registry (PHASE 4)
  fastify.get('/api/v1/admin/signals', async () => {
    return trafficService.listSignals();
  });

  // 8. Toggle Traffic Signal
  fastify.patch('/api/v1/admin/signals/:id/toggle', async (request) => {
    const { id } = request.params as { id: string };
    const sig = await prisma.trafficSignal.findUnique({ where: { id } });
    if (!sig) {
      throw new NotFoundError(`Signal with ID "${id}" was not found.`);
    }

    const updated = await prisma.trafficSignal.update({
      where: { id },
      data: { isEnabled: !sig.isEnabled },
    });

    return { success: true, signal: updated };
  });

  // 9. System Diagnostics & Audit Trail (PHASE 9)
  fastify.get('/api/v1/admin/audit-logs', async () => {
    return prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  });

  fastify.get('/api/v1/admin/system-health', async () => {
    const totalUsers = await prisma.user.count();
    const totalDrivers = await prisma.driverProfile.count();
    const approvedDrivers = await prisma.driverProfile.count({
      where: { applicationStatus: DriverApplicationStatus.APPROVED },
    });
    const pendingDrivers = await prisma.driverProfile.count({
      where: { applicationStatus: DriverApplicationStatus.PENDING_REVIEW },
    });
    const totalAmbulances = await prisma.ambulance.count();
    const totalTrips = await prisma.trip.count();
    const totalSignals = await prisma.trafficSignal.count();

    return {
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      architecture: 'Single Designated Administrator Model',
      counts: {
        totalUsers,
        totalDrivers,
        approvedDrivers,
        pendingDrivers,
        totalAmbulances,
        totalTrips,
        totalSignals,
      },
    };
  });
}
