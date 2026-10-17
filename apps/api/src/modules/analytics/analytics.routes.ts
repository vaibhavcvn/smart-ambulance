import { FastifyInstance } from 'fastify';
import { analyticsService } from '../../services/analytics.service.js';
import { UserRole } from '@aurangabad-ambulance/shared';

export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/analytics/kpis',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.ADMIN])],
    },
    async () => {
      return analyticsService.getKPIs();
    }
  );

  fastify.get(
    '/api/v1/analytics/charts',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.ADMIN])],
    },
    async () => {
      return analyticsService.getTripVolumeChartData();
    }
  );

  fastify.get(
    '/api/v1/analytics/hospital-overview',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.ADMIN])],
    },
    async () => {
      return analyticsService.getHospitalCapacityOverview();
    }
  );
}
