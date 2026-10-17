import { buildApp } from './app.js';
import { env } from './config/env.js';
import { SocketManager } from './realtime/socket-manager.js';
import { AdminBootstrapService } from './services/admin-bootstrap.service.js';
import { trafficService } from './services/traffic.service.js';

async function startServer() {
  try {
    // 1. Idempotent bootstrap procedures
    await AdminBootstrapService.ensureCanonicalAdmin();
    await trafficService.ensureSignalsSeeded();

    const app = await buildApp();

    // 2. Start Fastify listening on configured HOST and PORT
    await app.listen({ port: env.PORT, host: env.HOST });

    // 3. Initialize Socket.IO on the underlying HTTP server
    const httpServer = app.server;
    SocketManager.getInstance().initialize(httpServer);

    app.log.info(`🚀 Aurangabad Smart Ambulance API Server running at http://${env.HOST}:${env.PORT}`);
    app.log.info(`📚 Swagger OpenAPI Documentation available at http://${env.HOST}:${env.PORT}/docs`);
    app.log.info(`⚡ Socket.IO authenticated server initialized`);
  } catch (err) {
    console.error('Fatal error starting Aurangabad Smart Ambulance server:', err);
    process.exit(1);
  }
}

startServer();
