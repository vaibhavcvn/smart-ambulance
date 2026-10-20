import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  ShieldAlert,
  Radio,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Clock,
  Send,
  Sliders,
  Check,
  X,
} from 'lucide-react-native';
import {
  TrafficCorridorDTO,
  TrafficSignalDTO,
  TrafficBlockageDTO,
  CorridorStatus,
  SignalClearanceStatus,
} from '@aurangabad-ambulance/shared';
import { useMobileAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../services/api.js';
import { getMobileSocket } from '../../services/socket.js';
import { MobileEmergencyMap } from '../../components/map/MobileEmergencyMap.js';

export const TrafficPoliceDashboard: React.FC = () => {
  const { user } = useMobileAuth();

  const [corridors, setCorridors] = useState<TrafficCorridorDTO[]>([]);
  const [signals, setSignals] = useState<TrafficSignalDTO[]>([]);
  const [blockages, setBlockages] = useState<TrafficBlockageDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedCorridor, setSelectedCorridor] = useState<TrafficCorridorDTO | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchTrafficData = async () => {
    try {
      const [corrRes, sigRes, blockRes] = await Promise.allSettled([
        apiClient.get<TrafficCorridorDTO[]>('/api/v1/traffic/corridors'),
        apiClient.get<TrafficSignalDTO[]>('/api/v1/traffic/signals'),
        apiClient.get<TrafficBlockageDTO[]>('/api/v1/traffic/blockages'),
      ]);

      if (corrRes.status === 'fulfilled' && corrRes.value.data) {
        setCorridors(corrRes.value.data);
        if (corrRes.value.data.length > 0 && !selectedCorridor) {
          setSelectedCorridor(corrRes.value.data[0]);
        }
      }

      if (sigRes.status === 'fulfilled' && sigRes.value.data) {
        setSignals(sigRes.value.data);
      }

      if (blockRes.status === 'fulfilled' && blockRes.value.data) {
        setBlockages(blockRes.value.data);
      }
    } catch {
      // Keep existing data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrafficData();

    // Realtime listeners for corridor alerts and proximity warnings
    let isMounted = true;
    (async () => {
      try {
        const socket = await getMobileSocket();
        socket.on('traffic:corridor:updated', (updated: any) => {
          if (!isMounted) return;
          fetchTrafficData();
        });

        socket.on('traffic:signal:proximity_alert', (alertData: any) => {
          if (!isMounted) return;
          Alert.alert(
            'Ambulance Proximity Alert',
            `Emergency Unit approaching ${alertData.signalName || 'Junction'} in ~${Math.round(
              (alertData.estimatedArrivalSeconds || 60) / 60
            )} min.`
          );
        });
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTrafficData();
  };

  const handleCorridorAction = async (tripId: string, action: 'ACKNOWLEDGE' | 'ACTIVATE' | 'CLEAR') => {
    setActionInProgress(tripId);
    try {
      await apiClient.post('/api/v1/traffic/corridors/action', {
        tripId,
        action,
        notes: `Executed ${action} via Traffic Police Mobile Client`,
      });
      Alert.alert('Corridor Action Recorded', `Green Corridor status transitioned to ${action}.`);
      fetchTrafficData();
    } catch (err: any) {
      Alert.alert('Action Error', err.message || 'Could not update corridor.');
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Syncing Aurangabad Traffic Corridors...</Text>
      </View>
    );
  }

  const activeCorridors = corridors.filter(
    (c) => c.status === CorridorStatus.ACTIVE || c.status === CorridorStatus.REQUESTED
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
    >
      {/* Officer Header */}
      <View style={styles.card}>
        <View style={styles.policeHeader}>
          <View style={styles.policeAvatar}>
            <ShieldAlert size={24} color="#f59e0b" />
          </View>
          <View style={styles.policeMeta}>
            <Text style={styles.officerName}>{user?.name || 'Traffic Officer'}</Text>
            <Text style={styles.jurisdictionText}>
              Zone: {user?.jurisdictionZone || 'ALL AURANGABAD JURISDICTIONS'}
            </Text>
            <View style={styles.privacyBadge}>
              <Text style={styles.privacyBadgeText}>Zero-PII Operational View</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ACTIVE EMERGENCY CORRIDORS */}
      <View style={styles.sectionHeader}>
        <Radio size={16} color="#ef4444" />
        <Text style={styles.sectionTitle}>
          Active Emergency Corridors ({activeCorridors.length})
        </Text>
      </View>

      {activeCorridors.length === 0 ? (
        <View style={styles.emptyCard}>
          <CheckCircle2 size={24} color="#10b981" />
          <Text style={styles.emptyTitle}>All Corridors Clear</Text>
          <Text style={styles.emptyDesc}>
            No high-priority ambulance dispatches are currently requesting signal overrides in your zone.
          </Text>
        </View>
      ) : (
        activeCorridors.map((corridor) => {
          const isSelected = selectedCorridor?.id === corridor.id;
          return (
            <View key={corridor.id} style={styles.corridorCard}>
              <View style={styles.corridorHeader}>
                <View style={styles.corridorStatusChip}>
                  <Text style={styles.corridorStatusText}>{corridor.status}</Text>
                </View>
                <Text style={styles.corridorPriority}>{corridor.emergencyPriority}</Text>
              </View>

              <Text style={styles.corridorRoute}>
                Route: {corridor.routeSummary || 'Kranti Chowk to GMCH Ghati Corridor'}
              </Text>

              {corridor.upcomingSignal && (
                <View style={styles.signalAlertBox}>
                  <AlertTriangle size={16} color="#fbbf24" style={{ marginRight: 6 }} />
                  <Text style={styles.signalAlertText}>
                    Upcoming Signal: {corridor.upcomingSignal.name} (ETA ~
                    {Math.round((corridor.signalEtaSeconds || 45) / 60)} min)
                  </Text>
                </View>
              )}

              {/* Corridor Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.ackBtn]}
                  onPress={() => handleCorridorAction(corridor.tripId, 'ACKNOWLEDGE')}
                  disabled={actionInProgress === corridor.tripId}
                >
                  <Text style={styles.ackText}>ACKNOWLEDGE</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.clearBtn]}
                  onPress={() => handleCorridorAction(corridor.tripId, 'CLEAR')}
                  disabled={actionInProgress === corridor.tripId}
                >
                  <Text style={styles.clearText}>GREEN CORRIDOR (CLEAR)</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* Map Preview for Selected / Primary Corridor */}
      {selectedCorridor && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Corridor Geospatial Layout</Text>
          <View style={styles.mapWrapper}>
            <MobileEmergencyMap
              pickupLat={selectedCorridor.originLat}
              pickupLng={selectedCorridor.originLng}
              pickupLabel="Corridor Origin"
              hospitalLat={selectedCorridor.destLat}
              hospitalLng={selectedCorridor.destLng}
              hospitalLabel="Hospital Destination"
              style={styles.map}
            />
          </View>
        </View>
      )}

      {/* JUNCTION SIGNALS OVERVIEW */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Aurangabad Traffic Signals ({signals.length})</Text>
        <Text style={styles.cardSubtitle}>Monitored intelligent smart junction signals</Text>
        <View style={styles.signalList}>
          {signals.slice(0, 6).map((sig) => (
            <View key={sig.id} style={styles.signalRow}>
              <View style={styles.signalMeta}>
                <Text style={styles.signalName}>{sig.name}</Text>
                <Text style={styles.signalZone}>{sig.jurisdictionZone} Zone</Text>
              </View>
              <View
                style={[
                  styles.signalStatusBadge,
                  sig.clearanceStatus === SignalClearanceStatus.CLEARED
                    ? styles.badgeGreen
                    : styles.badgeNormal,
                ]}
              >
                <Text
                  style={[
                    styles.signalStatusText,
                    sig.clearanceStatus === SignalClearanceStatus.CLEARED
                      ? styles.textGreen
                      : styles.textNormal,
                  ]}
                >
                  {sig.clearanceStatus || 'NORMAL'}
                </Text>
              </View>
            </View>
          ))}
        </View>
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
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 12,
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
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#71717a',
    marginBottom: 12,
  },
  policeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  policeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
  },
  policeMeta: {
    flex: 1,
  },
  officerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  jurisdictionText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  privacyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  privacyBadgeText: {
    color: '#93c5fd',
    fontSize: 9,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  emptyCard: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 11,
    color: '#71717a',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  corridorCard: {
    backgroundColor: '#18181b',
    borderColor: '#3b82f6',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  corridorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  corridorStatusChip: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3b82f6',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  corridorStatusText: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: '800',
  },
  corridorPriority: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '800',
  },
  corridorRoute: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  signalAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  signalAlertText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ackBtn: {
    backgroundColor: '#1e293b',
    borderColor: '#475569',
    borderWidth: 1,
  },
  ackText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  clearBtn: {
    backgroundColor: '#16a34a',
  },
  clearText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  mapWrapper: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: '#27272a',
    borderWidth: 1,
    marginTop: 6,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  signalList: {
    gap: 8,
  },
  signalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 10,
    padding: 10,
  },
  signalMeta: {
    flex: 1,
  },
  signalName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  signalZone: {
    fontSize: 10,
    color: '#71717a',
    marginTop: 2,
  },
  signalStatusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeNormal: {
    backgroundColor: '#18181b',
  },
  badgeGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
  },
  signalStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textNormal: {
    color: '#71717a',
  },
  textGreen: {
    color: '#34d399',
  },
});
