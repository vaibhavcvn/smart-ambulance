# Aurangabad Smart Ambulance — Data Assets

This directory contains version-controlled geospatial and machine-learning assets.

## 1. Geospatial Assets (`data/geo/`)
- `aurangabad-boundary.geojson`: Operational boundary polygon for the emergency dispatch platform covering Chhatrapati Sambhajinagar (Aurangabad) urban agglomeration, CIDCO, Chikalthana, and Waluj MIDC. Used for point-in-polygon validation with `@turf/boolean-point-in-polygon`.

## 2. Machine Learning Assets (`data/ml/`)
- `synthetic_training_data.json`: Versioned synthetic training set modeling emergency ambulance travel times and delays in Aurangabad under various traffic proxy conditions, emergency priorities, and time-of-day slots.
- `aurangabad_delay_rf.json`: Serialized Random Forest regression model trained via pure Node.js/TypeScript using `ml-random-forest` with zero Python runtime dependencies.
- `metadata.json`: Model version, training parameters, evaluation metrics (MAE, RMSE, R² score), and held-out test split results.
