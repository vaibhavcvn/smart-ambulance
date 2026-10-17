import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../prisma.js';
import { UnauthorizedError, ForbiddenError } from '../common/errors/app-error.js';
import { UserRole, AuthUser } from '@aurangabad-ambulance/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or malformed Authorization header.');
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      if (!decoded || !decoded.id) {
        throw new UnauthorizedError('Invalid authentication token.');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { driverProfile: true, hospitalStaff: true },
      });

      if (!user) {
        throw new UnauthorizedError('User account not found or deactivated.');
      }

      request.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserRole,
        phone: user.phone,
        driverProfileId: user.driverProfile?.id || null,
        hospitalId: user.hospitalStaff?.hospitalId || null,
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError(err.message || 'Authentication failed.');
    }
  });

  fastify.decorate('authorize', (allowedRoles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      if (!allowedRoles.includes(request.user.role)) {
        throw new ForbiddenError(
          `Access denied for role "${request.user.role}". Required roles: [${allowedRoles.join(', ')}].`
        );
      }
    };
  });
}

export default fp(authPlugin);
