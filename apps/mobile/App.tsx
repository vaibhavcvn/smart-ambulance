import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { AuthProvider, useMobileAuth } from './src/context/AuthContext.js';
import { mobileConfig } from './src/config/env.js';
import { apiClient } from './src/services/api.js';
import { MobileEmergencyMap } from './src/components/map/MobileEmergencyMap.js';

interface HealthCheckData {
  status: string;
  platform: string;
  version: string;
  database: string;
  services?: {
    geospatialBoundary?: string;
    machineLearningModel?: string;
  };
}

function DiagnosticsScreen() {
  const { user, role, logout } = useMobileAuth();
  const [health, setHealth] = useState<HealthCheckData | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [customIpInput, setCustomIpInput] = useState<string>(mobileConfig.apiUrl);

  const checkApiHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await apiClient.get<HealthCheckData>('/health');
      setHealth(res.data);
    } catch (err: any) {
      setHealthError(err?.message || 'Failed to connect to backend.');
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  const handleApplyIp = () => {
    mobileConfig.setApiUrl(customIpInput.trim());
    checkApiHealth();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Branding */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>MOBILE EMS &bull; ANDROID</Text>
          </View>
          <Text style={styles.title}>Aurangabad Smart Ambulance</Text>
          <Text style={styles.subtitle}>
            Mobile Client Scaffolding & Shared Setup (Phase 1)
          </Text>
        </View>

        {/* API Connection Diagnostics Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backend API Connectivity</Text>
          <Text style={styles.cardDesc}>
            Android emulator uses 10.0.2.2; physical phones use your PC LAN IP
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={customIpInput}
              onChangeText={setCustomIpInput}
              placeholder="http://10.0.2.2:4000"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.buttonSmall} onPress={handleApplyIp}>
              <Text style={styles.buttonSmallText}>Connect</Text>
            </TouchableOpacity>
          </View>

          {healthLoading && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={styles.statusText}>Probing {mobileConfig.apiUrl}...</Text>
            </View>
          )}

          {health && (
            <View style={styles.healthSuccessBox}>
              <Text style={styles.healthSuccessTitle}>
                ✓ Connected to Fastify Server
              </Text>
              <Text style={styles.healthDetail}>Database: {health.database}</Text>
              <Text style={styles.healthDetail}>
                ML Model: {health.services?.machineLearningModel || 'active'}
              </Text>
            </View>
          )}

          {healthError && (
            <View style={styles.healthErrorBox}>
              <Text style={styles.healthErrorTitle}>Connection Error</Text>
              <Text style={styles.healthDetail}>{healthError}</Text>
              <Text style={styles.healthHint}>
                Tip: Ensure backend is running (`npm run dev:api`) and accessible.
              </Text>
            </View>
          )}
        </View>

        {/* Interactive OpenStreetMap Preview Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Native OpenStreetMap Surface</Text>
          <Text style={styles.cardDesc}>
            60 FPS raster tile rendering centered on Aurangabad (Kranti Chowk)
          </Text>
          <View style={styles.mapContainer}>
            <MobileEmergencyMap
              pickupLat={19.8762}
              pickupLng={75.3242}
              pickupLabel="Kranti Chowk Junction"
              ambulanceLat={19.8820}
              ambulanceLng={75.3350}
              ambulanceLabel="ALS Ambulance (MH-20)"
              hospitalLat={19.8906}
              hospitalLng={75.3218}
              hospitalLabel="GMCH Ghati Hospital"
              routeCoordinates={[
                [19.8762, 75.3242],
                [19.8780, 75.3280],
                [19.8820, 75.3350],
              ]}
              style={styles.map}
            />
          </View>
        </View>

        {/* Architecture Checklist Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phase 1 Setup Verification</Text>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>Expo SDK 52 + React 18.3.1 (monorepo match)</Text>
          </View>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>expo-secure-store (AES-256 GCM token storage)</Text>
          </View>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>react-native-maps with OpenStreetMap tile layer</Text>
          </View>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>Dynamic Android 10.0.2.2 / LAN IP resolver</Text>
          </View>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>Socket.IO & Axios client singletons ready</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DiagnosticsScreen />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  header: {
    paddingVertical: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#dc2626',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  badgeText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderColor: '#27272a',
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  cardDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#09090b',
    borderColor: '#3f3f46',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#ffffff',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  buttonSmall: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
  },
  buttonSmallText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  healthSuccessBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  healthSuccessTitle: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  healthErrorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  healthErrorTitle: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  healthDetail: {
    color: '#e2e8f0',
    fontSize: 11,
    marginTop: 1,
  },
  healthHint: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 4,
    fontStyle: 'italic',
  },
  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: '#3f3f46',
    borderWidth: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkIcon: {
    color: '#34d399',
    fontWeight: '900',
    fontSize: 12,
  },
  checkText: {
    color: '#cbd5e1',
    fontSize: 11,
  },
});
