import { FastifyInstance } from 'fastify';
import { hospitalService } from '../../services/hospital.service.js';
import {
  HospitalCapacityUpdateSchema,
  UserRole,
  EmergencyCategory,
} from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';
import { z } from 'zod';

const RecommendQuerySchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  emergencyCategory: z.nativeEnum(EmergencyCategory),
});

export async function hospitalRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/hospitals', async () => {
    return hospitalService.listHospitals();
  });

  fastify.get('/api/v1/hospitals/:id', async (request) => {
    const { id } = request.params as { id: string };
    return hospitalService.getHospitalById(id);
  });

  fastify.patch(
    '/api/v1/hospitals/:id/capacity',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.HOSPITAL_STAFF, UserRole.ADMIN]),
      ],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = HospitalCapacityUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid bed capacity payload', parsed.error.format());
      }

      return hospitalService.updateCapacity(
        id,
        parsed.data,
        request.user!.hospitalId,
        request.user!.role === UserRole.ADMIN
      );
    }
  );

  fastify.get(
    '/api/v1/hospitals/:id/inbound',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.HOSPITAL_STAFF, UserRole.ADMIN]),
      ],
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return hospitalService.getInboundTrips(
        id,
        request.user!.hospitalId,
        request.user!.role === UserRole.ADMIN
      );
    }
  );

  fastify.post('/api/v1/hospitals/recommend', async (request) => {
    const parsed = RecommendQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid recommendation parameters', parsed.error.format());
    }

    return hospitalService.recommendHospital(
      parsed.data.latitude,
      parsed.data.longitude,
      parsed.data.emergencyCategory
    );
  });
}
