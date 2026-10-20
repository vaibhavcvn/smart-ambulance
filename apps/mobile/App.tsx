import React from 'react';
import { AuthProvider } from './src/context/AuthContext.js';
import { AppNavigator } from './src/navigation/AppNavigator.js';

/**
 * Aurangabad Smart Ambulance — Mobile Application
 *
 * Integrated features:
 * - Persistent authentication (JWT + SecureStore)
 * - Citizen / Patient registration & ambulance booking with real Nominatim search
 * - Live ambulance tracking, OSRM route polyline, and OpenStreetMap CARTO tiles
 * - Driver dispatch accept/reject, sequential state updates, and GPS telemetry streaming
 * - Traffic Police zero-PII corridor clearance and smart signal proximity alerts
 * - Hospital Staff incoming ambulance monitoring and live bed capacity updates
 * - Administrator live KPI metrics and driver application approval/rejection
 */
export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
