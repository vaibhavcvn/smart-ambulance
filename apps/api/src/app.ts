import fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { isAllowedOrigin } from './config/cors.js';
import { AppError } from './common/errors/app-error.js';
import { redactSensitiveData } from './common/logging/logger.js';
import authPlugin from './plugins/auth.js';
import swaggerPlugin from './plugins/swagger.js';
import { ModelStore } from './ml/inference/model-store.js';

// Route imports
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { bookingRoutes } from './modules/bookings/bookings.routes.js';
import { dispatchRoutes } from './modules/dispatch/dispatch.routes.js';
import { tripRoutes } from './modules/trips/trips.routes.js';
import { driverRoutes } from './modules/drivers/drivers.routes.js';
import { ambulanceRoutes } from './modules/ambulances/ambulances.routes.js';
import { hospitalRoutes } from './modules/hospitals/hospitals.routes.js';
import { trackingRoutes } from './modules/tracking/tracking.routes.js';
import { trafficRoutes } from './modules/traffic/traffic.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { mlRoutes } from './modules/ml/ml.routes.js';
import { geocodingRoutes } from './modules/geocoding/geocoding.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { demoControlRoutes } from './modules/admin/demo-control.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    pluginTimeout: 60000,
    logger: {
      level: env.LOG_LEVEL,
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
  });

  // 1. Core plugins
  await app.register(sensible);
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, isAllowedOrigin(origin));
    },
    credentials: true,
  });

  // 2. Swagger / OpenAPI Documentation
  await app.register(swaggerPlugin);

  // 3. Authentication & Authorization
  await app.register(authPlugin);

  // 4. Initialize Machine Learning Model Store
  const candidateMlPaths = [
    path.resolve(process.cwd(), 'data/ml/aurangabad_delay_rf.json'),
    path.resolve(__dirname, '../../../data/ml/aurangabad_delay_rf.json'),
    path.resolve(__dirname, '../../../../data/ml/aurangabad_delay_rf.json'),
  ];
  const store = ModelStore.getInstance();
  let loaded = false;
  let activeMlPath = candidateMlPaths[0];
  for (const p of candidateMlPaths) {
    if (store.loadModel(p)) {
      loaded = true;
      activeMlPath = p;
      break;
    }
  }
  if (loaded) {
    app.log.info('🧠 Pure TS/JS Random Forest ML model loaded successfully into memory.');
  } else {
    app.log.warn(`⚠️ ML model at ${activeMlPath} not loaded. Predictions will use heuristic fallback.`);
  }

  // 5. Register Application Modules
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(bookingRoutes);
  await app.register(dispatchRoutes);
  await app.register(tripRoutes);
  await app.register(driverRoutes);
  await app.register(ambulanceRoutes);
  await app.register(hospitalRoutes);
  await app.register(trackingRoutes);
  await app.register(trafficRoutes);
  await app.register(analyticsRoutes);
  await app.register(mlRoutes);
  await app.register(geocodingRoutes);
  await app.register(adminRoutes);
  await app.register(demoControlRoutes);

  // 6. Centralized Error Handler with sensitive data redaction
  app.setErrorHandler((error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        success: false,
        code: error.code,
        message: error.message,
        details: redactSensitiveData(error.details),
      });
      return;
    }

    if (error.validation) {
      reply.status(400).send({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload format.',
        details: error.validation,
      });
      return;
    }

    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: statusCode === 500 ? 'An unexpected server error occurred.' : error.message,
    });
  });

  return app;
}
