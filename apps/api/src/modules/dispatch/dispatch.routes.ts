import { FastifyInstance } from 'fastify';
import { dispatchService } from '../../services/dispatch.service.js';
import { DispatchResponseSchema, UserRole } from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';

export async function dispatchRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/dispatch/pending',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.DRIVER])],
    },
    async (request) => {
      const driverProfileId = request.user!.driverProfileId;
      if (!driverProfileId) {
        throw new BadRequestError('User does not have an associated driver profile.');
      }
      return dispatchService.getPendingOfferForDriver(driverProfileId);
    }
  );

  fastify.post(
    '/api/v1/dispatch/respond',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.DRIVER])],
    },
    async (request) => {
      const driverProfileId = request.user!.driverProfileId;
      if (!driverProfileId) {
        throw new BadRequestError('User does not have an associated driver profile.');
      }

      const parsed = DispatchResponseSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid dispatch response parameters', parsed.error.format());
      }

      return dispatchService.respondToOffer(
        parsed.data.dispatchRequestId,
        driverProfileId,
        parsed.data.action,
        parsed.data.reason
      );
    }
  );
}
