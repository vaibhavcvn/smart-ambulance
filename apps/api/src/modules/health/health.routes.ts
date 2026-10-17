import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma.js';
import { isPointInAurangabad } from '../../integrations/maps/boundary.js';
import { ModelStore } from '../../ml/inference/model-store.js';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    let dbStatus = 'healthy';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unreachable';
    }

    const memoryUsage = process.memoryUsage();
    const isModelLoaded = ModelStore.getInstance().isLoaded();
    const centerWithinBoundary = isPointInAurangabad(19.8762, 75.3433);

    return {
      status: dbStatus === 'healthy' ? 'ok' : 'degraded',
      platform: 'Aurangabad Smart Ambulance Dispatch Platform',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      services: {
        geospatialBoundary: centerWithinBoundary ? 'active' : 'misconfigured',
        machineLearningModel: isModelLoaded ? 'loaded' : 'unloaded_or_heuristic',
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round((memoryUsage.rss / 1024 / 1024) * 10) / 10,
        nodeVersion: process.version,
      },
    };
  });
}
