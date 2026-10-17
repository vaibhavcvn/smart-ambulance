import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@aurangabad-ambulance/shared';
import { demoGpsSimulator } from '../../services/demo-gps-simulator.service.js';
import { getProximityConfig, updateProximityConfig } from '../../services/proximity-alert.service.js';
import { clearTripAlerts } from '../../services/proximity-alert.service.js';
import { prisma } from '../../prisma.js';
import { env } from '../../config/env.js';

export async function demoControlRoutes(app: FastifyInstance): Promise<void> {
  // All demo control routes require ADMIN role
  const adminOnly = { preHandler: [(app as any).authenticate, requireAdmin] };

  /**
   * GET /api/v1/demo/status
   * Returns current simulator state: config, active simulations, enabled flag
   */
  app.get('/api/v1/demo/status', adminOnly, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      enabled: env.ENABLE_DEMO_GPS_SIMULATOR,
      config: demoGpsSimulator.getConfig(),
      proximityConfig: getProximityConfig(),
      activeSimulations: demoGpsSimulator.getActiveSimulations(),
    });
  });

  /**
   * POST /api/v1/demo/start/:tripId
   * Start Demo GPS simulation for a specific trip
   */
  app.post('/api/v1/demo/start/:tripId', adminOnly, async (req: FastifyRequest<{ Params: { tripId: string } }>, reply: FastifyReply) => {
    const { tripId } = req.params;
    const result = await demoGpsSimulator.startSimulation(tripId);
    return reply.code(result.success ? 200 : 400).send(result);
  });

  /**
   * POST /api/v1/demo/stop/:tripId
   * Stop Demo GPS simulation for a specific trip
   */
  app.post('/api/v1/demo/stop/:tripId', adminOnly, async (req: FastifyRequest<{ Params: { tripId: string } }>, reply: FastifyReply) => {
    const { tripId } = req.params;
    const result = await demoGpsSimulator.stopSimulation(tripId);
    clearTripAlerts(tripId);
    return reply.send(result);
  });

  /**
   * PATCH /api/v1/demo/config
   * Update simulator configuration: speed, tick interval, proximity radius, alert lead time
   */
  app.patch('/api/v1/demo/config', adminOnly, async (req: FastifyRequest<{
    Body: {
      speedKmh?: number;
      tickIntervalMs?: number;
      proximityAlertRadiusKm?: number;
      alertLeadTimeSeconds?: number;
      speedKmhForEta?: number;
      officerGpsStaleSeconds?: number;
    }
  }>, reply: FastifyReply) => {
    const body = req.body || {};

    const simConfig: any = {};
    if (typeof body.speedKmh === 'number') simConfig.speedKmh = body.speedKmh;
    if (typeof body.tickIntervalMs === 'number') simConfig.tickIntervalMs = body.tickIntervalMs;

    const proximityConfig: any = {};
    if (typeof body.proximityAlertRadiusKm === 'number') proximityConfig.proximityAlertRadiusKm = body.proximityAlertRadiusKm;
    if (typeof body.alertLeadTimeSeconds === 'number') proximityConfig.alertLeadTimeSeconds = body.alertLeadTimeSeconds;
    if (typeof body.speedKmhForEta === 'number') proximityConfig.speedKmhForEta = body.speedKmhForEta;
    if (typeof body.officerGpsStaleSeconds === 'number') proximityConfig.officerGpsStaleSeconds = body.officerGpsStaleSeconds;

    const updatedSimConfig = Object.keys(simConfig).length > 0 ? demoGpsSimulator.updateConfig(simConfig) : demoGpsSimulator.getConfig();
    const updatedProximityConfig = Object.keys(proximityConfig).length > 0 ? updateProximityConfig(proximityConfig) : getProximityConfig();

    return reply.send({
      simulatorConfig: updatedSimConfig,
      proximityConfig: updatedProximityConfig,
    });
  });

  /**
   * GET /api/v1/demo/active-trips
   * List trips that are currently in an active state (candidates for demo GPS)
   */
  app.get('/api/v1/demo/active-trips', adminOnly, async (_req: FastifyRequest, reply: FastifyReply) => {
    const activeTrips = await prisma.trip.findMany({
      where: {
        status: {
          in: ['ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL'],
        },
      },
      include: {
        driver: { include: { user: true } },
        ambulance: true,
        hospital: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return reply.send(
      activeTrips.map((t) => ({
        id: t.id,
        status: t.status,
        priority: t.priority,
        emergencyCategory: t.emergencyCategory,
        pickupAddress: t.pickupAddress,
        driverName: t.driver?.user?.name || null,
        ambulanceRegistration: t.ambulance?.registrationNumber || null,
        hospitalName: t.hospital?.name || null,
        isSimulated: t.ambulance?.isSimulated || false,
        isSimulationActive: demoGpsSimulator.getActiveSimulations().some((s) => s.tripId === t.id),
      }))
    );
  });
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = (req as any).user;
  if (!user || user.role !== UserRole.ADMIN) {
    reply.code(403).send({ success: false, message: 'Admin access required.' });
  }
}
