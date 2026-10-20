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
  TextInput,
} from 'react-native';
import {
  Hospital,
  Ambulance,
  Bed,
  Clock,
  Phone,
  AlertCircle,
  Save,
  CheckCircle2,
  Plus,
  Minus,
} from 'lucide-react-native';
import {
  HospitalDTO,
  HospitalInboundTripDTO,
  HospitalStatus,
  TripStatus,
} from '@aurangabad-ambulance/shared';
import { useMobileAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../services/api.js';
import { getMobileSocket } from '../../services/socket.js';

export const HospitalStaffDashboard: React.FC = () => {
  const { user } = useMobileAuth();

  const [hospital, setHospital] = useState<HospitalDTO | null>(null);
  const [inboundTrips, setInboundTrips] = useState<HospitalInboundTripDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Bed Capacity Form State
  const [emergencyBeds, setEmergencyBeds] = useState<number>(0);
  const [icuBeds, setIcuBeds] = useState<number>(0);
  const [generalBeds, setGeneralBeds] = useState<number>(0);
  const [savingCapacity, setSavingCapacity] = useState<boolean>(false);

  const hospitalId = user?.hospitalId;

  const fetchHospitalData = async () => {
    if (!hospitalId) {
      // If staff has no hospital assigned, fetch all hospitals list to allow selecting or showing GMCH Ghati default
      try {
        const listRes = await apiClient.get<HospitalDTO[]>('/api/v1/hospitals');
        if (listRes.data && listRes.data.length > 0) {
          const defaultHosp = listRes.data[0];
          setHospital(defaultHosp);
          setEmergencyBeds(defaultHosp.availableEmergencyBeds);
          setIcuBeds(defaultHosp.availableIcuBeds);
          setGeneralBeds(defaultHosp.availableGeneralBeds);

          const inboundRes = await apiClient.get<HospitalInboundTripDTO[]>(
            `/api/v1/hospitals/${defaultHosp.id}/inbound`
          );
          setInboundTrips(inboundRes.data || []);
        }
      } catch {}
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [hospRes, inboundRes] = await Promise.allSettled([
        apiClient.get<HospitalDTO>(`/api/v1/hospitals/${hospitalId}`),
        apiClient.get<HospitalInboundTripDTO[]>(`/api/v1/hospitals/${hospitalId}/inbound`),
      ]);

      if (hospRes.status === 'fulfilled' && hospRes.value.data) {
        setHospital(hospRes.value.data);
        setEmergencyBeds(hospRes.value.data.availableEmergencyBeds);
        setIcuBeds(hospRes.value.data.availableIcuBeds);
        setGeneralBeds(hospRes.value.data.availableGeneralBeds);
      }

      if (inboundRes.status === 'fulfilled' && inboundRes.value.data) {
        setInboundTrips(inboundRes.value.data);
      }
    } catch {
      // retain state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHospitalData();

    // Socket listeners for live inbound ambulance alerts
    let isMounted = true;
    (async () => {
      try {
        const socket = await getMobileSocket();
        socket.on('trip:updated', () => {
          if (!isMounted) return;
          fetchHospitalData();
        });
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, [hospitalId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHospitalData();
  };

  const handleUpdateCapacity = async () => {
    if (!hospital) return;
    setSavingCapacity(true);

    try {
      const res = await apiClient.patch(`/api/v1/hospitals/${hospital.id}/capacity`, {
        availableEmergencyBeds: Math.max(0, emergencyBeds),
        availableIcuBeds: Math.max(0, icuBeds),
        availableGeneralBeds: Math.max(0, generalBeds),
      });

      setHospital(res.data);
      Alert.alert('Capacity Updated', 'Bed availability broadcasted to Aurangabad dispatch engine.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update capacity.');
    } finally {
      setSavingCapacity(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading Hospital Emergency Department...</Text>
      </View>
    );
  }

  const activeInbound = inboundTrips.filter(
    (t) => t.status !== TripStatus.COMPLETED && t.status !== TripStatus.CANCELLED
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
    >
      {/* Hospital Identity Header */}
      <View style={styles.card}>
        <View style={styles.hospitalHeader}>
          <View style={styles.hospitalAvatar}>
            <Hospital size={26} color="#34d399" />
          </View>
          <View style={styles.hospitalMeta}>
            <Text style={styles.hospitalName}>
              {hospital?.name || 'GMCH Ghati Hospital (Aurangabad)'}
            </Text>
            <Text style={styles.hospitalAddress}>
              {hospital?.address || 'Panchakki Road, Aurangabad 431001'}
            </Text>
            <Text style={styles.staffRole}>
              Staff Member: {user?.name} &bull; Emergency Reception
            </Text>
          </View>
        </View>

        {hospital && (
          <View style={styles.capabilityRow}>
            {hospital.hasTraumaCenter && (
              <View style={styles.capBadge}>
                <Text style={styles.capText}>Trauma Center</Text>
              </View>
            )}
            {hospital.hasCathLab && (
              <View style={styles.capBadge}>
                <Text style={styles.capText}>Cath Lab</Text>
              </View>
            )}
            {hospital.hasStrokeUnit && (
              <View style={styles.capBadge}>
                <Text style={styles.capText}>Stroke Unit</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* INCOMING EMERGENCY AMBULANCES */}
      <View style={styles.sectionHeader}>
        <Ambulance size={16} color="#ef4444" />
        <Text style={styles.sectionTitle}>
          Inbound Ambulances ({activeInbound.length})
        </Text>
      </View>

      {activeInbound.length === 0 ? (
        <View style={styles.emptyCard}>
          <CheckCircle2 size={24} color="#10b981" />
          <Text style={styles.emptyTitle}>No Inbound Ambulances</Text>
          <Text style={styles.emptyDesc}>
            All emergency cases currently admitted. Emergency triage bay is clear.
          </Text>
        </View>
      ) : (
        activeInbound.map((trip) => (
          <View key={trip.tripId} style={styles.inboundCard}>
            <View style={styles.inboundHeader}>
              <View style={styles.inboundStatusBadge}>
                <Text style={styles.inboundStatusText}>{trip.status.replace(/_/g, ' ')}</Text>
              </View>
              <Text style={styles.inboundPriorityBadge}>{trip.priority}</Text>
            </View>

            <Text style={styles.inboundCategory}>
              Category: {trip.emergencyCategory.replace(/_/g, ' ')}
            </Text>
            <Text style={styles.inboundAddress}>Pickup: {trip.pickupAddress}</Text>

            {trip.estimatedArrivalSeconds ? (
              <View style={styles.etaChip}>
                <Clock size={13} color="#60a5fa" />
                <Text style={styles.etaChipText}>
                  ETA: ~{Math.round(trip.estimatedArrivalSeconds / 60)} minutes
                </Text>
              </View>
            ) : null}

            {trip.ambulanceRegistration && (
              <View style={styles.ambulanceDetails}>
                <Text style={styles.ambText}>
                  Ambulance: {trip.ambulanceRegistration} ({trip.ambulanceType || 'ALS'})
                </Text>
                {trip.driverName && (
                  <Text style={styles.driverText}>
                    Crew: {trip.driverName} {trip.driverPhone ? `• ${trip.driverPhone}` : ''}
                  </Text>
                )}
              </View>
            )}
          </View>
        ))
      )}

      {/* BED CAPACITY LIVE UPDATE PANEL */}
      <View style={styles.card}>
        <View style={styles.capacityHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>Emergency Department Bed Capacity</Text>
            <Text style={styles.cardSubtitle}>
              Update live capacity to influence ambulance routing triage
            </Text>
          </View>
          <Bed size={20} color="#60a5fa" />
        </View>

        {/* Counter: ICU Beds */}
        <View style={styles.counterRow}>
          <View style={styles.counterMeta}>
            <Text style={styles.counterLabel}>ICU / Critical Care Beds</Text>
            <Text style={styles.counterHint}>Ventilator and cardiac monitor units</Text>
          </View>
          <View style={styles.stepperWrapper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setIcuBeds((prev) => Math.max(0, prev - 1))}
            >
              <Minus size={14} color="#cbd5e1" />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{icuBeds}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setIcuBeds((prev) => prev + 1)}
            >
              <Plus size={14} color="#cbd5e1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Counter: Emergency / Triage Beds */}
        <View style={styles.counterRow}>
          <View style={styles.counterMeta}>
            <Text style={styles.counterLabel}>Emergency Triage Beds</Text>
            <Text style={styles.counterHint}>Immediate resuscitation bay</Text>
          </View>
          <View style={styles.stepperWrapper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setEmergencyBeds((prev) => Math.max(0, prev - 1))}
            >
              <Minus size={14} color="#cbd5e1" />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{emergencyBeds}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setEmergencyBeds((prev) => prev + 1)}
            >
              <Plus size={14} color="#cbd5e1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Counter: General Ward Beds */}
        <View style={styles.counterRow}>
          <View style={styles.counterMeta}>
            <Text style={styles.counterLabel}>General Ward Beds</Text>
            <Text style={styles.counterHint}>Post-stabilization patient beds</Text>
          </View>
          <View style={styles.stepperWrapper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setGeneralBeds((prev) => Math.max(0, prev - 1))}
            >
              <Minus size={14} color="#cbd5e1" />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{generalBeds}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setGeneralBeds((prev) => prev + 1)}
            >
              <Plus size={14} color="#cbd5e1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, savingCapacity && styles.buttonDisabled]}
          onPress={handleUpdateCapacity}
          disabled={savingCapacity}
          activeOpacity={0.8}
        >
          {savingCapacity ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Save size={16} color="#ffffff" />
              <Text style={styles.saveBtnText}>Broadcast Updated Capacity</Text>
            </>
          )}
        </TouchableOpacity>
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
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 2,
    marginBottom: 12,
  },
  hospitalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hospitalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'rgba(52, 211, 153, 0.3)',
    borderWidth: 1,
  },
  hospitalMeta: {
    flex: 1,
  },
  hospitalName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  hospitalAddress: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  staffRole: {
    fontSize: 10,
    color: '#34d399',
    fontWeight: '700',
    marginTop: 3,
  },
  capabilityRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopColor: '#27272a',
    borderTopWidth: 1,
  },
  capBadge: {
    backgroundColor: '#09090b',
    borderColor: '#3f3f46',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  capText: {
    fontSize: 10,
    color: '#e2e8f0',
    fontWeight: '600',
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
  inboundCard: {
    backgroundColor: '#18181b',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  inboundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inboundStatusBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  inboundStatusText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '800',
  },
  inboundPriorityBadge: {
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
  inboundCategory: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  inboundAddress: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
  },
  etaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  etaChipText: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  ambulanceDetails: {
    backgroundColor: '#09090b',
    borderRadius: 8,
    padding: 8,
  },
  ambText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  driverText: {
    fontSize: 10,
    color: '#71717a',
    marginTop: 2,
  },
  capacityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  counterMeta: {
    flex: 1,
  },
  counterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  counterHint: {
    fontSize: 10,
    color: '#71717a',
    marginTop: 2,
  },
  stepperWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    minWidth: 24,
    textAlign: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 44,
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
