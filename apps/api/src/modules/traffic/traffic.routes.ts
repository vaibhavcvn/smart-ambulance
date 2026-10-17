import { FastifyInstance } from 'fastify';
import { trafficService } from '../../services/traffic.service.js';
import {
  TrafficBlockageCreateSchema,
  TrafficCorridorActionSchema,
  UserRole,
} from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';

export async function trafficRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/traffic/corridors',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.TRAFFIC_POLICE, UserRole.ADMIN]),
      ],
    },
    async (request) => {
      // Role-based jurisdiction filtering
      const zone = request.user!.role === UserRole.ADMIN ? 'ALL' : request.user!.jurisdictionZone;
      return trafficService.getActiveCorridors(zone);
    }
  );

  fastify.get(
    '/api/v1/traffic/signals',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.TRAFFIC_POLICE, UserRole.ADMIN]),
      ],
    },
    async () => {
      return trafficService.listSignals();
    }
  );

  fastify.post(
    '/api/v1/traffic/corridors/action',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.TRAFFIC_POLICE, UserRole.ADMIN]),
      ],
    },
    async (request) => {
      const parsed = TrafficCorridorActionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid corridor action parameters', parsed.error.format());
      }
      return trafficService.handleCorridorAction(request.user!.id, parsed.data);
    }
  );

  fastify.get('/api/v1/traffic/blockages', async () => {
    return trafficService.listBlockages();
  });

  fastify.post(
    '/api/v1/traffic/blockages',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.TRAFFIC_POLICE, UserRole.ADMIN]),
      ],
    },
    async (request) => {
      const parsed = TrafficBlockageCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid blockage report parameters', parsed.error.format());
      }
      return trafficService.reportBlockage(request.user!.id, parsed.data);
    }
  );

  fastify.patch(
    '/api/v1/traffic/blockages/:id/resolve',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.TRAFFIC_POLICE, UserRole.ADMIN]),
      ],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return trafficService.resolveBlockage(id);
    }
  );
}
