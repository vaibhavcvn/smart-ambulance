export interface EvaluationMetrics {
  sampleCount: number;
  maeSeconds: number;
  rmseSeconds: number;
  r2Score: number;
  baselineMaeSeconds: number;
}

export function computeEvaluationMetrics(
  actual: number[],
  predicted: number[],
  baselinePrediction?: number
): EvaluationMetrics {
  if (actual.length === 0 || predicted.length === 0 || actual.length !== predicted.length) {
    throw new Error('Actual and predicted arrays must be non-empty and of identical length.');
  }

  const n = actual.length;
  let absErrorSum = 0;
  let squaredErrorSum = 0;
  let totalSum = 0;

  for (let i = 0; i < n; i++) {
    const act = actual[i];
    const pred = predicted[i];
    const diff = pred - act;

    absErrorSum += Math.abs(diff);
    squaredErrorSum += diff * diff;
    totalSum += act;
  }

  const meanActual = totalSum / n;
  let totalSumSquares = 0;
  for (let i = 0; i < n; i++) {
    const diffMean = actual[i] - meanActual;
    totalSumSquares += diffMean * diffMean;
  }

  const mae = absErrorSum / n;
  const rmse = Math.sqrt(squaredErrorSum / n);
  // Prevent division by zero if all actual values are identical
  const r2 = totalSumSquares === 0 ? 1.0 : Math.max(-1.0, 1.0 - squaredErrorSum / totalSumSquares);

  // Baseline MAE: error if we always predict the baseline (e.g. mean or 0 delay)
  const defaultBaseline = baselinePrediction !== undefined ? baselinePrediction : meanActual;
  let baselineAbsError = 0;
  for (let i = 0; i < n; i++) {
    baselineAbsError += Math.abs(defaultBaseline - actual[i]);
  }
  const baselineMae = baselineAbsError / n;

  return {
    sampleCount: n,
    maeSeconds: Math.round(mae * 100) / 100,
    rmseSeconds: Math.round(rmse * 100) / 100,
    r2Score: Math.round(r2 * 1000) / 1000,
    baselineMaeSeconds: Math.round(baselineMae * 100) / 100,
  };
}
