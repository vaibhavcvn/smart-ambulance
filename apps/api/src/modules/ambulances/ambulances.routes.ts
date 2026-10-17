import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma.js';
import { UserRole } from '@aurangabad-ambulance/shared';

export async function ambulanceRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/ambulances',
    {
      preHandler: [
        fastify.authenticate,
        fastify.authorize([UserRole.ADMIN, UserRole.HOSPITAL_STAFF, UserRole.TRAFFIC_POLICE]),
      ],
    },
    async () => {
      const ambulances = await prisma.ambulance.findMany({
        include: {
          driverProfile: { include: { user: true } },
        },
        orderBy: { registrationNumber: 'asc' },
      });

      return ambulances.map((a) => ({
        id: a.id,
        registrationNumber: a.registrationNumber,
        type: a.type,
        status: a.status,
        currentLatitude: a.currentLatitude,
        currentLongitude: a.currentLongitude,
        lastLocationUpdate: a.lastLocationUpdate.toISOString(),
        isSimulated: a.isSimulated,
        assignedDriverName: a.driverProfile?.user?.name || null,
      }));
    }
  );
}
