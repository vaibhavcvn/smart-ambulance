import { FastifyInstance } from 'fastify';
import { bookingService } from '../../services/booking.service.js';
import { CreateBookingSchema, UserRole } from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';

export async function bookingRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v1/bookings',
    {
      preHandler: [fastify.authenticate, fastify.authorize([UserRole.PATIENT, UserRole.ADMIN])],
    },
    async (request) => {
      const parsed = CreateBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid booking request parameters', parsed.error.format());
      }

      return bookingService.createBooking(request.user!.id, parsed.data);
    }
  );

  fastify.get(
    '/api/v1/bookings/active',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return bookingService.getPatientActiveTrip(request.user!.id);
    }
  );
}
