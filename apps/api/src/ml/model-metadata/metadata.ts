import fs from 'fs';
import path from 'path';
import { EvaluationMetrics } from '../evaluation/evaluator.js';

export interface ModelMetadata {
  version: string;
  algorithm: string;
  trainedAt: string;
  hyperparameters: {
    nEstimators: number;
    maxFeatures?: number | string;
    replacement: boolean;
    seed?: number;
  };
  features: string[];
  metrics: EvaluationMetrics;
  isSynthetic: boolean;
  trainingSamplesCount: number;
  testSamplesCount: number;
}

export function saveModelMetadata(metadata: ModelMetadata, filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
}

export function loadModelMetadata(filePath: string): ModelMetadata | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ModelMetadata;
  } catch (err) {
    console.error('Failed to load ML model metadata from', filePath, err);
    return null;
  }
}
