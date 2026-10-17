# Machine Learning Subsystem — Random Forest Regression

## 1. Subsystem Architecture
The Machine Learning subsystem predicts expected urban emergency transit delays (in seconds) beyond standard baseline routing. It is implemented in **100% pure TypeScript/Node.js** via the `ml-random-forest` library, operating without Python scripts, subprocess wrappers, or external binary dependencies.

## 2. Feature Schema & Engineering
The regression model extracts 7 domain features from every trip:
1. `distanceKm`: Road distance between ambulance origin and destination (km).
2. `osrmDurationSeconds`: Baseline route travel time (seconds).
3. `priorityCode`: Ordinal emergency priority (0 = STANDARD, 1 = URGENT, 2 = CRITICAL).
4. `hourOfDay`: Time of request (0 - 23).
5. `isPeakHour`: Binary flag (1 if between 09:00-11:00 or 17:00-20:00 on Aurangabad corridors like Jalna Road).
6. `isWeekend`: Binary flag (1 if Saturday or Sunday).
7. `activeBlockagesNearby`: Number of active reported road blockages along the corridor.

## 3. Training & Evaluation Results
The model was trained on 600 realistic synthetic emergency transit records across Aurangabad, split 80% train (480 records) and 20% test (120 held-out records).

### Verified Evaluation Metrics:
- **Trained Model Artifact**: `data/ml/aurangabad_delay_rf.json`
- **Metadata Specification**: `data/ml/metadata.json`
- **Number of Estimator Trees**: 40 trees
- **Mean Absolute Error (MAE)**: **61.54 seconds** (~1.02 minutes)
- **Root Mean Squared Error (RMSE)**: **79.95 seconds** (~1.33 minutes)
- **Coefficient of Determination (R² Score)**: **0.776**
- **Baseline MAE (Predicting Mean Delay)**: **138.82 seconds** (~2.31 minutes)

*Evaluation demonstrates a 55.7% error reduction over the baseline mean prediction.*

## 4. Retraining Command
To retrain the model and regenerate evaluation metrics on demand:
```powershell
npm run ml:train
```

## 5. Resilience & Fallback
The core booking flow does not depend strictly on ML availability. If the serialized model is missing or uninitialized, the `MLPredictor` transparently falls back to a deterministic time-of-day heuristic with `isModelPrediction: false` and `modelSource: 'ROUTING_HEURISTIC_FALLBACK'`.
