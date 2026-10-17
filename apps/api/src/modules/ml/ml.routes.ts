import { FastifyInstance } from 'fastify';
import { analyticsService } from '../../services/analytics.service.js';
import { MLPredictor } from '../../ml/inference/predictor.js';
import { MLPredictionInputSchema } from '@aurangabad-ambulance/shared';
import { BadRequestError } from '../../common/errors/app-error.js';

const predictor = new MLPredictor();

export async function mlRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/ml/metrics', async () => {
    return analyticsService.getMLModelDiagnostics();
  });

  fastify.post('/api/v1/ml/predict', async (request) => {
    const parsed = MLPredictionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid ML prediction input payload', parsed.error.format());
    }

    return predictor.predictDelay(parsed.data);
  });
}
