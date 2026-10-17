import path from 'path';
import { fileURLToPath } from 'url';
import { RandomForestRegression } from 'ml-random-forest';
import { generateSyntheticDataset, saveSyntheticDataset } from './generate-synthetic-data.js';
import { extractFeatureVector, FEATURE_NAMES } from '../features/feature-extractor.js';
import { computeEvaluationMetrics } from '../evaluation/evaluator.js';
import { saveModelMetadata, ModelMetadata } from '../model-metadata/metadata.js';
import { ModelStore } from '../inference/model-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root paths
const rootDir = path.resolve(__dirname, '../../../../../');
const dataDir = path.join(rootDir, 'data/ml');
const datasetPath = path.join(dataDir, 'synthetic_training_data.json');
const modelPath = path.join(dataDir, 'aurangabad_delay_rf.json');
const metadataPath = path.join(dataDir, 'metadata.json');

export async function runTrainingPipeline(): Promise<{
  modelPath: string;
  metadataPath: string;
  metrics: any;
}> {
  console.log('🤖 Starting Pure TypeScript/Node.js Random Forest Training Pipeline...');
  console.log(`📁 Target directory: ${dataDir}`);

  // 1. Generate or load dataset
  console.log('📊 Generating 600 synthetic Aurangabad emergency trip records...');
  const dataset = generateSyntheticDataset(600, 42);
  saveSyntheticDataset(dataset, datasetPath);
  console.log(`💾 Saved synthetic dataset to ${datasetPath}`);

  // 2. Train / Test Split (80 / 20)
  const trainSize = Math.floor(dataset.length * 0.8);
  const trainData = dataset.slice(0, trainSize);
  const testData = dataset.slice(trainSize);

  console.log(`📐 Dataset split: ${trainData.length} training samples, ${testData.length} held-out test samples`);

  // 3. Extract Features and Targets
  const X_train = trainData.map((d) => extractFeatureVector(d));
  const y_train = trainData.map((d) => d.observedDelaySeconds);

  const X_test = testData.map((d) => extractFeatureVector(d));
  const y_test = testData.map((d) => d.observedDelaySeconds);

  // 4. Instantiate and Train Random Forest Regressor
  console.log('🌲 Training Random Forest Regression model (40 trees, pure JS/TS)...');
  const rfOptions = {
    seed: 42,
    maxFeatures: 5,
    replacement: true,
    nEstimators: 40,
  };

  const rf = new RandomForestRegression(rfOptions);
  rf.train(X_train, y_train);
  console.log('✅ Model training completed successfully!');

  // 5. Evaluate on Held-Out Test Set
  console.log('📈 Running inference on held-out test set...');
  const predictions: number[] = rf.predict(X_test);

  // Mean of training targets for baseline comparison
  const trainMean = y_train.reduce((a, b) => a + b, 0) / y_train.length;
  const metrics = computeEvaluationMetrics(y_test, predictions, trainMean);

  console.log('====================================================');
  console.log('📊 RANDOM FOREST REGRESSION EVALUATION METRICS:');
  console.log(`   Sample Count (Test Set): ${metrics.sampleCount}`);
  console.log(`   Mean Absolute Error (MAE): ${metrics.maeSeconds.toFixed(2)} seconds`);
  console.log(`   Root Mean Squared Error (RMSE): ${metrics.rmseSeconds.toFixed(2)} seconds`);
  console.log(`   R² Score (Coefficient of Determination): ${metrics.r2Score.toFixed(3)}`);
  console.log(`   Baseline MAE (Predicting Mean): ${metrics.baselineMaeSeconds.toFixed(2)} seconds`);
  console.log('====================================================');

  // 6. Serialize Model and Metadata
  console.log(`💾 Serializing trained model to ${modelPath}...`);
  const modelStore = ModelStore.getInstance();
  modelStore.saveModel(rf, modelPath);

  const metadata: ModelMetadata = {
    version: 'v1.0.0-rf-aurangabad',
    algorithm: 'RandomForestRegression (ml-random-forest)',
    trainedAt: new Date().toISOString(),
    hyperparameters: rfOptions,
    features: [...FEATURE_NAMES],
    metrics,
    isSynthetic: true,
    trainingSamplesCount: trainData.length,
    testSamplesCount: testData.length,
  };

  console.log(`💾 Saving model metadata to ${metadataPath}...`);
  saveModelMetadata(metadata, metadataPath);

  console.log('🎉 ML training pipeline completed successfully!');
  return { modelPath, metadataPath, metrics };
}

// Allow direct CLI execution: tsx src/ml/training/train.ts
if (process.argv[1] && process.argv[1].endsWith('train.ts')) {
  runTrainingPipeline().catch((err) => {
    console.error('❌ ML training failed:', err);
    process.exit(1);
  });
}
