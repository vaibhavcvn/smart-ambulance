import { FastifyInstance } from 'fastify';
import { authService } from '../../services/auth.service.js';
import { LoginSchema, RegisterSchema } from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/auth/login', async (request) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.format());
    }
    return authService.login(parsed.data);
  });

  fastify.post('/api/v1/auth/register', async (request) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.format());
    }
    return authService.register(parsed.data);
  });

  fastify.get(
    '/api/v1/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!request.user) throw new BadRequestError('Unauthorized');
      return authService.getProfile(request.user.id);
    }
  );
}
