import { describe, it, expect } from 'vitest';
import { extractFeatureVector, FEATURE_NAMES } from '../../ml/features/feature-extractor.js';
import { validateMLInput } from '../../ml/features/validation.js';
import { computeEvaluationMetrics } from '../../ml/evaluation/evaluator.js';
import { MLPredictor } from '../../ml/inference/predictor.js';
import { EmergencyCategory } from '@aurangabad-ambulance/shared';

describe('Machine Learning Subsystem (Pure TypeScript)', () => {
  it('validates ML input features strictly', () => {
    // Valid input
    const valid = validateMLInput({
      distanceKm: 5.2,
      osrmDurationSeconds: 420,
      emergencyCategory: EmergencyCategory.CARDIAC_ARREST,
      hourOfDay: 14,
      dayOfWeek: 2,
      activeBlockagesNearby: 1,
    });
    expect(valid.isValid).toBe(true);
    expect(valid.data?.distanceKm).toBe(5.2);

    // Negative distance rejected
    const invalidDist = validateMLInput({
      distanceKm: -2.0,
      osrmDurationSeconds: 400,
      emergencyCategory: EmergencyCategory.STROKE,
      hourOfDay: 10,
      dayOfWeek: 1,
    });
    expect(invalidDist.isValid).toBe(false);
    expect(invalidDist.errors[0]).toContain('distanceKm must be a positive number');

    // Invalid hour rejected
    const invalidHour = validateMLInput({
      distanceKm: 4.0,
      osrmDurationSeconds: 300,
      emergencyCategory: EmergencyCategory.TRAUMA_ACCIDENT,
      hourOfDay: 28,
      dayOfWeek: 1,
    });
    expect(invalidHour.isValid).toBe(false);
    expect(invalidHour.errors[0]).toContain('hourOfDay must be an integer between 0 and 23');
  });

  it('correctly maps raw features into normalized feature vectors', () => {
    const vector = extractFeatureVector({
      distanceKm: 8.5,
      osrmDurationSeconds: 700,
      emergencyCategory: EmergencyCategory.CARDIAC_ARREST, // Priority: CRITICAL -> code 2
      hourOfDay: 18, // Peak hour (17-20) -> 1
      dayOfWeek: 6, // Saturday -> weekend 1
      activeBlockagesNearby: 2,
    });

    expect(vector.length).toBe(FEATURE_NAMES.length);
    expect(vector[0]).toBe(8.5); // distance
    expect(vector[1]).toBe(700); // osrm duration
    expect(vector[2]).toBe(2); // priorityCode (Critical)
    expect(vector[3]).toBe(18); // hourOfDay
    expect(vector[4]).toBe(1); // isPeakHour
    expect(vector[5]).toBe(1); // isWeekend
    expect(vector[6]).toBe(2); // activeBlockages
  });

  it('mathematically evaluates regression predictions with MAE, RMSE, and R2', () => {
    // Perfect predictions test
    const actual = [100, 200, 300, 400];
    const predicted = [100, 200, 300, 400];
    const perfectMetrics = computeEvaluationMetrics(actual, predicted);

    expect(perfectMetrics.maeSeconds).toBe(0);
    expect(perfectMetrics.rmseSeconds).toBe(0);
    expect(perfectMetrics.r2Score).toBe(1.0);

    // Realistic error test
    const noisyPredicted = [120, 190, 310, 380]; // errors: +20, -10, +10, -20 -> MAE = 15
    const noisyMetrics = computeEvaluationMetrics(actual, noisyPredicted, 250);

    expect(noisyMetrics.maeSeconds).toBe(15);
    expect(noisyMetrics.r2Score).toBeGreaterThan(0.9);
  });

  it('provides reliable delay predictions with fallback when model uninitialized', () => {
    const predictor = new MLPredictor();
    const result = predictor.predictDelay({
      distanceKm: 6.0,
      osrmDurationSeconds: 500,
      emergencyCategory: EmergencyCategory.CARDIAC_ARREST,
      hourOfDay: 10,
      dayOfWeek: 1,
      activeBlockagesNearby: 1,
    });

    expect(result.predictedDelaySeconds).toBeGreaterThanOrEqual(0);
    expect(result.totalEstimatedDurationSeconds).toBeGreaterThan(500);
    expect(result.modelSource).toBeDefined();
  });
});
