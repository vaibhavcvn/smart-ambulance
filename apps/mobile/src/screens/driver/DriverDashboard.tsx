import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  Ambulance,
  MapPin,
  Check,
  X,
  Play,
  Navigation,
  Radio,
  Hospital,
  AlertTriangle,
  Clock,
  Send,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import {
  DriverStatus,
  TripStatus,
  DriverApplicationStatus,
  AmbulanceType,
} from '@aurangabad-ambulance/shared';
import { useMobileAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../services/api.js';
import { getMobileSocket, subscribeToTrip } from '../../services/socket.js';
import { MobileEmergencyMap } from '../../components/map/MobileEmergencyMap.js';

interface DriverAppStatus {
  id: string;
  applicationStatus: DriverApplicationStatus;
  status: DriverStatus;
  licenseNumber: string;
  assignedAmbulance: {
    id: string;
    registrationNumber: string;
    type: AmbulanceType;
    status: string;
  } | null;
}

interface PendingOffer {
  id: string;
  expiresAt: string;
  trip: {
    id: string;
    emergencyCategory: string;
    priority: string;
    pickupAddress: string;
    pickupLatitude: number;
    pickupLongitude: number;
    pickupLandmark?: string;
    patientName?: string;
    patientPhone?: string;
    notes?: string;
    hospital?: {
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
    };
  };
}

export const DriverDashboard: React.FC = () => {
  const { user } = useMobileAuth();

  const [driverInfo, setDriverInfo] = useState<DriverAppStatus | null>(null);
  const [activeTrip, setActiveTrip] = useState<any | null>(null);
  const [pendingOffer, setPendingOffer] = useState<PendingOffer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [updatingAvailability, setUpdatingAvailability] = useState<boolean>(false);

  // GPS Telemetry State
  const [gpsActive, setGpsActive] = useState<boolean>(false);
  const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number } | null>(null);
  const [isGpsSimulated, setIsGpsSimulated] = useState<boolean>(false);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  // Load Driver Application & Active Status
  const fetchDriverData = async () => {
    try {
      const [appRes, tripRes, offerRes] = await Promise.allSettled([
        apiClient.get<DriverAppStatus>('/api/v1/drivers/application-status'),
        apiClient.get<any>('/api/v1/trips/driver/active'),
        apiClient.get<PendingOffer | null>('/api/v1/dispatch/pending'),
      ]);

      if (appRes.status === 'fulfilled' && appRes.value.data) {
        setDriverInfo(appRes.value.data);
        setIsAvailable(appRes.value.data.status === DriverStatus.AVAILABLE);
      }

      if (tripRes.status === 'fulfilled' && tripRes.value.data) {
        setActiveTrip(tripRes.value.data);
        subscribeToTrip(tripRes.value.data.id).catch(() => {});
      } else {
        setActiveTrip(null);
      }

      if (offerRes.status === 'fulfilled' && offerRes.value.data) {
        setPendingOffer(offerRes.value.data);
      } else {
        setPendingOffer(null);
      }
    } catch {
      // keep current state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDriverData();

    // Socket listeners for real-time dispatch offers & trip changes
    let isMounted = true;
    (async () => {
      try {
        const socket = await getMobileSocket();
        socket.on('dispatch:offer', (offer: PendingOffer) => {
          if (!isMounted) return;
          setPendingOffer(offer);
          Alert.alert('Incoming Dispatch Offer!', `Emergency at: ${offer.trip.pickupAddress}`);
        });

        socket.on('dispatch:expired', () => {
          if (!isMounted) return;
          setPendingOffer(null);
        });

        socket.on('trip:updated', (updated: any) => {
          if (!isMounted) return;
          if (updated) {
            setActiveTrip(updated);
          }
        });
      } catch {}
    })();

    return () => {
      isMounted = false;
      stopGpsTracking();
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDriverData();
  };

  // Toggle Driver Online / Offline Availability
  const handleToggleAvailability = async (newVal: boolean) => {
    if (!driverInfo) return;
    if (driverInfo.applicationStatus !== DriverApplicationStatus.APPROVED) {
      Alert.alert(
        'Application Pending',
        `Your driver application status is ${driverInfo.applicationStatus}. An administrator must review and approve your profile before you can go on-duty.`
      );
      return;
    }

    setUpdatingAvailability(true);
    const targetStatus = newVal ? DriverStatus.AVAILABLE : DriverStatus.OFFLINE;

    try {
      const res = await apiClient.patch('/api/v1/drivers/availability', {
        status: targetStatus,
        currentLatitude: currentGps?.lat,
        currentLongitude: currentGps?.lng,
      });
      setIsAvailable(res.data.status === DriverStatus.AVAILABLE);
    } catch (err: any) {
      Alert.alert('Availability Error', err.message || 'Could not update status.');
    } finally {
      setUpdatingAvailability(false);
    }
  };

  // Respond to Dispatch Offer
  const handleRespondOffer = async (action: 'ACCEPT' | 'DECLINE') => {
    if (!pendingOffer) return;
    const reqId = pendingOffer.id;

    try {
      await apiClient.post('/api/v1/dispatch/respond', {
        dispatchRequestId: reqId,
        action,
        reason: action === 'DECLINE' ? 'Driver declined via mobile' : undefined,
      });

      setPendingOffer(null);
      fetchDriverData();
    } catch (err: any) {
      Alert.alert('Response Error', err.message || 'Failed to submit dispatch response.');
    }
  };

  // Supported Sequential State Transitions
  const handleTransitionTrip = async (nextStatus: TripStatus) => {
    if (!activeTrip) return;

    try {
      const res = await apiClient.patch(`/api/v1/trips/${activeTrip.id}/status`, {
        targetStatus: nextStatus,
        notes: `Driver transitioned state to ${nextStatus}`,
      });
      setActiveTrip(res.data);
      if (nextStatus === TripStatus.COMPLETED) {
        Alert.alert('Trip Completed', 'Patient safely delivered. Status returned to available.');
        fetchDriverData();
      }
    } catch (err: any) {
      Alert.alert('Transition Error', err.message || 'Failed to update trip status.');
    }
  };

  // Start real GPS location watcher using Expo Location
  const startGpsTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Please allow GPS permissions to broadcast ambulance telemetry to dispatch.'
        );
        return;
      }

      setGpsActive(true);
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 10,
        },
        async (loc) => {
          const coords = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          };
          setCurrentGps(coords);

          // Stream telemetry to backend
          try {
            await apiClient.post('/api/v1/tracking/location', {
              latitude: coords.lat,
              longitude: coords.lng,
              speed: loc.coords.speed || 0,
              heading: loc.coords.heading || 0,
              accuracy: loc.coords.accuracy || 10,
              isSimulated: isGpsSimulated,
              tripId: activeTrip?.id || undefined,
            });
          } catch {}
        }
      );

      locationSubRef.current = sub;
    } catch (err: any) {
      Alert.alert('GPS Error', err.message || 'Could not start location tracking.');
      setGpsActive(false);
    }
  };

  const stopGpsTracking = () => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    setGpsActive(false);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading Driver Dispatch Terminal...</Text>
      </View>
    );
  }

  const isApproved = driverInfo?.applicationStatus === DriverApplicationStatus.APPROVED;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
    >
      {/* Driver Header & Operational Status Card */}
      <View style={styles.card}>
        <View style={styles.driverHeader}>
          <View style={styles.driverAvatar}>
            <Ambulance size={24} color="#38bdf8" />
          </View>
          <View style={styles.driverMeta}>
            <Text style={styles.driverName}>{user?.name || 'Ambulance Driver'}</Text>
            <Text style={styles.driverLicense}>
              License: {driverInfo?.licenseNumber || 'MH-20-DL-PENDING'}
            </Text>
            {driverInfo?.assignedAmbulance ? (
              <Text style={styles.ambulanceTag}>
                Vehicle: {driverInfo.assignedAmbulance.registrationNumber} (
                {driverInfo.assignedAmbulance.type})
              </Text>
            ) : (
              <Text style={styles.noAmbulanceTag}>No Ambulance Assigned Yet</Text>
            )}
          </View>
        </View>

        {/* Application Status Banner */}
        {!isApproved && (
          <View style={styles.pendingReviewBox}>
            <AlertTriangle size={16} color="#f59e0b" style={{ marginRight: 8 }} />
            <Text style={styles.pendingReviewText}>
              Application: {driverInfo?.applicationStatus || 'PENDING_REVIEW'}. Waiting for admin approval.
            </Text>
          </View>
        )}

        {/* On-Duty / Off-Duty Toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Dispatch Availability</Text>
            <Text style={styles.toggleSubtitle}>
              {isAvailable ? 'ONLINE — Receiving emergency calls' : 'OFFLINE — Out of service'}
            </Text>
          </View>
          {updatingAvailability ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <Switch
              value={isAvailable}
              onValueChange={handleToggleAvailability}
              trackColor={{ false: '#3f3f46', true: '#10b981' }}
              thumbColor="#ffffff"
              disabled={!isApproved}
            />
          )}
        </View>
      </View>

      {/* INCOMING DISPATCH OFFER POPUP */}
      {pendingOffer && (
        <View style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <View style={styles.offerBadge}>
              <Radio size={14} color="#ef4444" />
              <Text style={styles.offerBadgeText}>INCOMING DISPATCH OFFER</Text>
            </View>
            <Text style={styles.offerPriority}>{pendingOffer.trip.priority}</Text>
          </View>

          <Text style={styles.offerAddress}>{pendingOffer.trip.pickupAddress}</Text>
          <Text style={styles.offerCategory}>
            Category: {pendingOffer.trip.emergencyCategory.replace(/_/g, ' ')}
          </Text>
          {pendingOffer.trip.notes && (
            <Text style={styles.offerNotes}>Notes: {pendingOffer.trip.notes}</Text>
          )}

          <View style={styles.offerButtons}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => handleRespondOffer('DECLINE')}
              activeOpacity={0.8}
            >
              <X size={16} color="#f87171" />
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleRespondOffer('ACCEPT')}
              activeOpacity={0.8}
            >
              <Check size={16} color="#ffffff" />
              <Text style={styles.acceptText}>ACCEPT DISPATCH</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ACTIVE DISPATCH TRIP CONTROLLER */}
      {activeTrip && activeTrip.status !== TripStatus.COMPLETED && activeTrip.status !== TripStatus.CANCELLED ? (
        <View style={styles.section}>
          <View style={styles.tripCard}>
            <View style={styles.tripHeaderRow}>
              <Text style={styles.tripCardTitle}>Active Incident Mission</Text>
              <Text style={styles.tripStatusBadge}>{activeTrip.status.replace(/_/g, ' ')}</Text>
            </View>

            {/* Destination & Map */}
            <View style={styles.missionMapWrapper}>
              <MobileEmergencyMap
                pickupLat={activeTrip.pickupLatitude}
                pickupLng={activeTrip.pickupLongitude}
                pickupLabel={activeTrip.pickupAddress}
                ambulanceLat={currentGps?.lat || activeTrip.ambulance?.currentLatitude || null}
                ambulanceLng={currentGps?.lng || activeTrip.ambulance?.currentLongitude || null}
                ambulanceLabel="My Ambulance Position"
                hospitalLat={activeTrip.hospital?.latitude || null}
                hospitalLng={activeTrip.hospital?.longitude || null}
                hospitalLabel={activeTrip.hospital?.name || 'Destination Hospital'}
                routeCoordinates={
                  (activeTrip.activeRoute?.geometryGeoJson?.coordinates || []).map(
                    (c: any) => [c[1], c[0]] as [number, number]
                  )
                }
                style={styles.missionMap}
              />
            </View>

            {/* Sequential Trip Transitions */}
            <Text style={styles.controlHeader}>Mission Progression Controls</Text>
            <View style={styles.controlsGrid}>
              {activeTrip.status === TripStatus.ACCEPTED && (
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => handleTransitionTrip(TripStatus.EN_ROUTE_TO_PICKUP)}
                >
                  <Navigation size={16} color="#ffffff" />
                  <Text style={styles.actionBtnText}>EN ROUTE TO PICKUP</Text>
                </TouchableOpacity>
              )}

              {activeTrip.status === TripStatus.EN_ROUTE_TO_PICKUP && (
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => handleTransitionTrip(TripStatus.ARRIVED_AT_PICKUP)}
                >
                  <MapPin size={16} color="#ffffff" />
                  <Text style={styles.actionBtnText}>ARRIVED AT PICKUP</Text>
                </TouchableOpacity>
              )}

              {activeTrip.status === TripStatus.ARRIVED_AT_PICKUP && (
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => handleTransitionTrip(TripStatus.PATIENT_PICKED_UP)}
                >
                  <Check size={16} color="#ffffff" />
                  <Text style={styles.actionBtnText}>PATIENT ONBOARD (PICKED UP)</Text>
                </TouchableOpacity>
              )}

              {activeTrip.status === TripStatus.PATIENT_PICKED_UP && (
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => handleTransitionTrip(TripStatus.EN_ROUTE_TO_HOSPITAL)}
                >
                  <Hospital size={16} color="#ffffff" />
                  <Text style={styles.actionBtnText}>EN ROUTE TO HOSPITAL</Text>
                </TouchableOpacity>
              )}

              {activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL && (
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => handleTransitionTrip(TripStatus.ARRIVED_AT_HOSPITAL)}
                >
                  <Hospital size={16} color="#ffffff" />
                  <Text style={styles.actionBtnText}>ARRIVED AT HOSPITAL</Text>
                </TouchableOpacity>
              )}

              {activeTrip.status === TripStatus.ARRIVED_AT_HOSPITAL && (
                <TouchableOpacity
                  style={[styles.actionBtnPrimary, { backgroundColor: '#10b981' }]}
                  onPress={() => handleTransitionTrip(TripStatus.COMPLETED)}
                >
                  <Check size={16} color="#ffffff" />
                  <Text style={styles.actionBtnText}>COMPLETE TRIP</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {/* GPS Telemetry Broadcast Panel */}
      <View style={styles.card}>
        <Text style={styles.cardSectionHeader}>GPS Telemetry & Beacon</Text>
        <Text style={styles.gpsDesc}>
          Live location transmission allows the traffic corridor engine to clear upcoming signals.
        </Text>

        <View style={styles.gpsStatusRow}>
          <View style={styles.gpsIndicator}>
            <View style={[styles.gpsDot, gpsActive && styles.gpsDotActive]} />
            <Text style={styles.gpsStatusText}>
              {gpsActive ? 'GPS Beacon Broadcasting (Every 4s)' : 'GPS Inactive'}
            </Text>
          </View>
          {currentGps && (
            <Text style={styles.gpsCoords}>
              {currentGps.lat.toFixed(4)}, {currentGps.lng.toFixed(4)}
            </Text>
          )}
        </View>

        <View style={styles.gpsButtonRow}>
          {!gpsActive ? (
            <TouchableOpacity style={styles.gpsButtonStart} onPress={startGpsTracking}>
              <Play size={14} color="#ffffff" />
              <Text style={styles.gpsButtonText}>Start GPS Beacon</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.gpsButtonStop} onPress={stopGpsTracking}>
              <X size={14} color="#f87171" />
              <Text style={styles.gpsButtonStopText}>Stop GPS Beacon</Text>
            </TouchableOpacity>
          )}
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
  section: {
    gap: 16,
  },
  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderColor: '#27272a',
    borderWidth: 1,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderWidth: 1,
  },
  driverMeta: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  driverLicense: {
    fontSize: 11,
    color: '#a1a1aa',
    marginTop: 1,
  },
  ambulanceTag: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
    marginTop: 2,
  },
  noAmbulanceTag: {
    fontSize: 11,
    color: '#eab308',
    marginTop: 2,
  },
  pendingReviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  pendingReviewText: {
    color: '#fbbf24',
    fontSize: 11,
    flex: 1,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopColor: '#27272a',
    borderTopWidth: 1,
  },
  toggleInfo: {
    flex: 1,
    paddingRight: 10,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  toggleSubtitle: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 2,
  },
  offerCard: {
    backgroundColor: '#1c1917',
    borderColor: '#ef4444',
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  offerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerBadgeText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '900',
  },
  offerPriority: {
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
  offerAddress: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  offerCategory: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  offerNotes: {
    fontSize: 11,
    color: '#cbd5e1',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  offerButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    height: 44,
  },
  declineText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  acceptButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    height: 44,
  },
  acceptText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  tripCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderColor: '#3b82f6',
    borderWidth: 1,
  },
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  tripStatusBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa',
    borderColor: '#3b82f6',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '800',
  },
  missionMapWrapper: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: '#27272a',
    borderWidth: 1,
    marginBottom: 14,
  },
  missionMap: {
    width: '100%',
    height: '100%',
  },
  controlHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#a1a1aa',
    marginBottom: 8,
  },
  controlsGrid: {
    gap: 8,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 46,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  cardSectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  gpsDesc: {
    fontSize: 11,
    color: '#71717a',
    marginBottom: 12,
    lineHeight: 16,
  },
  gpsStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#71717a',
  },
  gpsDotActive: {
    backgroundColor: '#10b981',
  },
  gpsStatusText: {
    fontSize: 11,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  gpsCoords: {
    fontSize: 10,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  gpsButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gpsButtonStart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
    borderWidth: 1,
    borderRadius: 10,
    height: 38,
  },
  gpsButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  gpsButtonStop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    height: 38,
  },
  gpsButtonStopText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
});
