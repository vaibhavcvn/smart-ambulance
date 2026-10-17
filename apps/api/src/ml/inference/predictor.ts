import { ModelStore } from './model-store.js';
import { extractFeatureVector, RawMLTripFeatures } from '../features/feature-extractor.js';
import { validateMLInput } from '../features/validation.js';

export interface MLPredictionResult {
  predictedDelaySeconds: number;
  totalEstimatedDurationSeconds: number;
  osrmBaselineDurationSeconds: number;
  distanceKm: number;
  isModelPrediction: boolean;
  modelSource: 'RANDOM_FOREST' | 'ROUTING_HEURISTIC_FALLBACK';
  modelVersion?: string;
  notes?: string;
}

export class MLPredictor {
  private modelStore: ModelStore;
  private currentVersion: string = 'v1.0.0-rf';

  constructor(modelStore = ModelStore.getInstance()) {
    this.modelStore = modelStore;
  }

  public setVersion(version: string): void {
    this.currentVersion = version;
  }

  public predictDelay(rawInput: unknown): MLPredictionResult {
    const validation = validateMLInput(rawInput);
    if (!validation.isValid || !validation.data) {
      throw new Error(`Invalid ML input features: ${validation.errors.join('; ')}`);
    }

    const data = validation.data;
    const model = this.modelStore.getModel();

    if (model) {
      try {
        const featureVector = extractFeatureVector(data);
        const predictions = model.predict([featureVector]);
        const predictedRaw = predictions && predictions[0] !== undefined ? predictions[0] : 0;
        const predictedDelaySeconds = Math.max(0, Math.round(predictedRaw));

        return {
          predictedDelaySeconds,
          totalEstimatedDurationSeconds: data.osrmDurationSeconds + predictedDelaySeconds,
          osrmBaselineDurationSeconds: data.osrmDurationSeconds,
          distanceKm: data.distanceKm,
          isModelPrediction: true,
          modelSource: 'RANDOM_FOREST',
          modelVersion: this.currentVersion,
          notes: 'Predicted by Random Forest regression trained on Aurangabad emergency patterns.',
        };
      } catch (err) {
        console.warn('Error during Random Forest inference, falling back to heuristic:', err);
      }
    }

    // Heuristic fallback when ML model is offline / uninitialized
    const isPeakHour =
      (data.hourOfDay >= 9 && data.hourOfDay <= 11) ||
      (data.hourOfDay >= 17 && data.hourOfDay <= 20);
    const blockageDelay = (data.activeBlockagesNearby || 0) * 90;
    const peakDelay = isPeakHour ? 180 + data.distanceKm * 8 : 45;
    const heuristicDelay = Math.round(peakDelay + blockageDelay);

    return {
      predictedDelaySeconds: heuristicDelay,
      totalEstimatedDurationSeconds: data.osrmDurationSeconds + heuristicDelay,
      osrmBaselineDurationSeconds: data.osrmDurationSeconds,
      distanceKm: data.distanceKm,
      isModelPrediction: false,
      modelSource: 'ROUTING_HEURISTIC_FALLBACK',
      modelVersion: 'heuristic-fallback',
      notes: 'Model currently uninitialized; estimation calculated using baseline routing plus urban time-of-day heuristic.',
    };
  }
}
