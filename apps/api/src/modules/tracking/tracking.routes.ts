import { FastifyInstance } from 'fastify';
import { trackingService } from '../../services/tracking.service.js';
import { DriverLocationUpdateSchema, UserRole } from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';

export async function trackingRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v1/tracking/location',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.DRIVER])],
    },
    async (request) => {
      const driverProfileId = request.user!.driverProfileId;
      if (!driverProfileId) {
        throw new BadRequestError('User does not have an active driver profile.');
      }

      const parsed = DriverLocationUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid location telemetry payload', parsed.error.format());
      }

      return trackingService.updateDriverLocation(driverProfileId, parsed.data);
    }
  );

  fastify.get(
    '/api/v1/tracking/fleet',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.ADMIN, UserRole.TRAFFIC_POLICE, UserRole.HOSPITAL_STAFF]),
      ],
    },
    async () => {
      return trackingService.getFleetPositions();
    }
  );
}
