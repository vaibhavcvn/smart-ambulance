import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Server, Activity, ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react-native';
import { mobileConfig } from '../../config/env.js';
import { apiClient } from '../../services/api.js';

interface DiagnosticsScreenProps {
  onBack: () => void;
}

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

export const DiagnosticsScreen: React.FC<DiagnosticsScreenProps> = ({ onBack }) => {
  const [customIpInput, setCustomIpInput] = useState<string>(mobileConfig.apiUrl);
  const [health, setHealth] = useState<HealthCheckData | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const checkApiHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await apiClient.get<HealthCheckData>('/health');
      setHealth(res.data);
    } catch (err: any) {
      if (err?.response) {
        setHealthError(`HTTP ${err.response.status}: ${err.response.data?.message || err.response.statusText || 'Backend Error'}`);
      } else if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        setHealthError(`Connection Timeout: ${mobileConfig.apiUrl} did not respond within timeout.`);
      } else if (err?.message === 'Network Error' || !err?.response) {
        setHealthError(`Network Unreachable: Cannot reach ${mobileConfig.apiUrl}. Ensure Fastify is running with HOST=0.0.0.0 and your phone is on the same Wi-Fi.`);
      } else {
        setHealthError(err?.message || 'Failed to connect to backend.');
      }
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  const handleApplyIp = () => {
    const trimmed = customIpInput.trim().replace(/\/+$/, '');
    mobileConfig.setApiUrl(trimmed);
    checkApiHealth();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
        <ArrowLeft size={18} color="#94a3b8" />
        <Text style={styles.backButtonText}>Back to App</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={styles.badge}>
          <Server size={14} color="#3b82f6" />
          <Text style={styles.badgeText}>NETWORK DIAGNOSTICS</Text>
        </View>
        <Text style={styles.title}>API Gateway Settings</Text>
        <Text style={styles.subtitle}>
          Configure the Fastify API endpoint host for Android emulators, physical phones, or local dev.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend API Endpoint URL</Text>
        <Text style={styles.cardDesc}>
          Cloudflare Tunnel / Custom Backend API Endpoint
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={customIpInput}
            onChangeText={setCustomIpInput}
            placeholder="https://bull-emerging-knee-posted.trycloudflare.com"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.buttonSmall} onPress={handleApplyIp} activeOpacity={0.8}>
            <Text style={styles.buttonSmallText}>Save</Text>
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
            <View style={styles.row}>
              <CheckCircle2 size={16} color="#34d399" style={{ marginRight: 6 }} />
              <Text style={styles.healthSuccessTitle}>Connected to Fastify Backend</Text>
            </View>
            <Text style={styles.healthDetail}>Database: {health.database}</Text>
            <Text style={styles.healthDetail}>Version: {health.version}</Text>
            <Text style={styles.healthDetail}>ML Model: {health.services?.machineLearningModel || 'active'}</Text>
          </View>
        )}

        {healthError && (
          <View style={styles.healthErrorBox}>
            <View style={styles.row}>
              <AlertTriangle size={16} color="#f87171" style={{ marginRight: 6 }} />
              <Text style={styles.healthErrorTitle}>Connection Error</Text>
            </View>
            <Text style={styles.healthDetail}>{healthError}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  backButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  badgeText: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 18,
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
    paddingHorizontal: 16,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
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
  },
  healthDetail: {
    color: '#e2e8f0',
    fontSize: 11,
    marginTop: 1,
  },
});
