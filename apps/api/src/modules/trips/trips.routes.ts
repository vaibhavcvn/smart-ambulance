import { FastifyInstance } from 'fastify';
import { tripService } from '../../services/trip.service.js';
import { TripStateUpdateSchema, UserRole } from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';

export async function tripRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/trips/:id',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };
      return tripService.getTripById(
        id,
        request.user!.id,
        request.user!.role,
        request.user!.driverProfileId,
        request.user!.hospitalId
      );
    }
  );

  fastify.get(
    '/api/v1/trips/driver/active',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.DRIVER])],
    },
    async (request) => {
      const driverProfileId = request.user!.driverProfileId;
      if (!driverProfileId) {
        throw new BadRequestError('User does not have an active driver profile.');
      }
      return tripService.getActiveDriverTrip(driverProfileId);
    }
  );

  fastify.patch(
    '/api/v1/trips/:id/status',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = TripStateUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid trip status update payload', parsed.error.format());
      }

      return tripService.updateTripStatus(
        id,
        parsed.data.targetStatus,
        request.user!.id,
        request.user!.role,
        request.user!.driverProfileId,
        parsed.data.hospitalId || request.user!.hospitalId,
        parsed.data.notes
      );
    }
  );

  fastify.post(
    '/api/v1/trips/:id/recalculate-route',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };
      return tripService.recalculateRoute(id);
    }
  );
}
