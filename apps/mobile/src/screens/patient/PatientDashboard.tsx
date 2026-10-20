import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import {
  Ambulance,
  MapPin,
  Search,
  AlertTriangle,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Hospital,
  User,
  Radio,
} from 'lucide-react-native';
import { EmergencyCategory, PatientTripUpdateDTO, TripStatus } from '@aurangabad-ambulance/shared';
import { useMobileAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../services/api.js';
import { getMobileSocket, subscribeToTrip, unsubscribeFromTrip } from '../../services/socket.js';
import { MobileEmergencyMap } from '../../components/map/MobileEmergencyMap.js';

interface SearchResult {
  placeId: number;
  displayName: string;
  latitude: number;
  longitude: number;
  type?: string;
}

const CATEGORY_OPTIONS: { label: string; value: EmergencyCategory; critical: boolean }[] = [
  { label: 'Cardiac Arrest', value: EmergencyCategory.CARDIAC_ARREST, critical: true },
  { label: 'Trauma / Road Accident', value: EmergencyCategory.TRAUMA_ACCIDENT, critical: true },
  { label: 'Stroke Symptoms', value: EmergencyCategory.STROKE, critical: true },
  { label: 'Severe Respiratory Failure', value: EmergencyCategory.RESPIRATORY_FAILURE, critical: true },
  { label: 'Maternity / Active Labor', value: EmergencyCategory.MATERNITY_LABOR, critical: false },
  { label: 'General Acute Emergency', value: EmergencyCategory.GENERAL_EMERGENCY, critical: false },
];

export const PatientDashboard: React.FC = () => {
  const { user } = useMobileAuth();

  // Active Trip State
  const [activeTrip, setActiveTrip] = useState<PatientTripUpdateDTO | null>(null);
  const [loadingActive, setLoadingActive] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Booking Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('Kranti Chowk, Aurangabad');
  const [pickupLat, setPickupLat] = useState(19.8762);
  const [pickupLng, setPickupLng] = useState(75.3242);
  const [pickupLandmark, setPickupLandmark] = useState('');
  const [emergencyCategory, setEmergencyCategory] = useState<EmergencyCategory>(
    EmergencyCategory.GENERAL_EMERGENCY
  );
  const [patientName, setPatientName] = useState(user?.name || '');
  const [patientPhone, setPatientPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const activeTripIdRef = useRef<string | null>(null);

  // Fetch active trip from API
  const fetchActiveTrip = async () => {
    try {
      const res = await apiClient.get<PatientTripUpdateDTO | null>('/api/v1/bookings/active');
      if (res.data && res.data.tripId) {
        setActiveTrip(res.data);
        activeTripIdRef.current = res.data.tripId;
        subscribeToTrip(res.data.tripId).catch(() => {});
      } else {
        setActiveTrip(null);
        if (activeTripIdRef.current) {
          unsubscribeFromTrip(activeTripIdRef.current).catch(() => {});
          activeTripIdRef.current = null;
        }
      }
    } catch {
      // Keep last known or clear on network error
    } finally {
      setLoadingActive(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActiveTrip();

    // Listen to real-time trip update socket events
    let isMounted = true;
    (async () => {
      try {
        const socket = await getMobileSocket();
        socket.on('trip:updated', (updated: PatientTripUpdateDTO) => {
          if (!isMounted) return;
          if (updated && updated.tripId) {
            setActiveTrip(updated);
            if (
              updated.status === TripStatus.COMPLETED ||
              updated.status === TripStatus.CANCELLED ||
              updated.status === TripStatus.EXPIRED
            ) {
              Alert.alert('Trip Status Update', `Your emergency dispatch has ended: ${updated.status}`);
            }
          }
        });
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveTrip();
  };

  // Debounced search using backend geocoding endpoint
  const handleSearchLocations = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await apiClient.get<SearchResult[]>('/api/v1/geo/search', {
        params: { q: query.trim() },
      });
      setSearchResults(res.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item: SearchResult) => {
    setPickupAddress(item.displayName);
    setPickupLat(item.latitude);
    setPickupLng(item.longitude);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleMapSelect = (lat: number, lng: number) => {
    setPickupLat(Number(lat.toFixed(6)));
    setPickupLng(Number(lng.toFixed(6)));
    // Reverse geocode to get a clean address
    apiClient
      .get<{ address: string }>('/api/v1/geo/reverse', {
        params: { lat: lat.toFixed(6), lng: lng.toFixed(6) },
      })
      .then((res) => {
        if (res.data?.address) setPickupAddress(res.data.address);
      })
      .catch(() => {});
  };

  const handleCreateBooking = async () => {
    setSubmittingBooking(true);
    setBookingError(null);

    try {
      const res = await apiClient.post<PatientTripUpdateDTO>('/api/v1/bookings', {
        pickupAddress,
        pickupLatitude: pickupLat,
        pickupLongitude: pickupLng,
        pickupLandmark: pickupLandmark.trim() || undefined,
        emergencyCategory,
        patientName: patientName.trim() || user?.name || undefined,
        patientPhone: patientPhone.trim() || user?.phone || undefined,
        notes: notes.trim() || undefined,
      });

      if (res.data && res.data.tripId) {
        setActiveTrip(res.data);
        activeTripIdRef.current = res.data.tripId;
        subscribeToTrip(res.data.tripId).catch(() => {});
        Alert.alert(
          'Dispatch Initiated',
          'Your emergency ambulance request has been submitted to Aurangabad EMS dispatch engine.'
        );
      }
    } catch (err: any) {
      setBookingError(err.message || 'Failed to dispatch ambulance. Please verify pickup location.');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleCancelTrip = () => {
    if (!activeTrip) return;

    Alert.alert(
      'Cancel Emergency Dispatch',
      'Are you sure you want to cancel this emergency ambulance request?',
      [
        { text: 'Keep Dispatch', style: 'cancel' },
        {
          text: 'Cancel Dispatch',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.patch(`/api/v1/trips/${activeTrip.tripId}/status`, {
                targetStatus: TripStatus.CANCELLED,
                notes: 'Cancelled by patient',
              });
              fetchActiveTrip();
            } catch (err: any) {
              Alert.alert('Cancellation Error', err.message || 'Could not cancel trip.');
            }
          },
        },
      ]
    );
  };

  if (loadingActive) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Connecting to Aurangabad Dispatch Engine...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
    >
      {/* ACTIVE TRIP SCREEN */}
      {activeTrip && activeTrip.status !== TripStatus.COMPLETED && activeTrip.status !== TripStatus.CANCELLED ? (
        <View style={styles.section}>
          {/* Trip Header Status Banner */}
          <View style={styles.statusBanner}>
            <View style={styles.statusBannerHeader}>
              <View style={styles.liveIndicator}>
                <Radio size={14} color="#10b981" />
                <Text style={styles.liveText}>DISPATCH ACTIVE</Text>
              </View>
              <Text style={styles.priorityBadge}>{activeTrip.priority || 'URGENT'}</Text>
            </View>
            <Text style={styles.statusTitle}>
              {activeTrip.status.replace(/_/g, ' ')}
            </Text>
            <Text style={styles.statusSub}>
              Category: {activeTrip.emergencyCategory?.replace(/_/g, ' ')}
            </Text>
          </View>

          {/* Interactive Live Tracking Map */}
          <View style={styles.mapCard}>
            <Text style={styles.mapCardTitle}>Live Incident & Ambulance Map</Text>
            <View style={styles.mapWrapper}>
              <MobileEmergencyMap
                pickupLat={activeTrip.pickupLatitude}
                pickupLng={activeTrip.pickupLongitude}
                pickupLabel={activeTrip.pickupAddress}
                ambulanceLat={activeTrip.ambulance?.currentLatitude || null}
                ambulanceLng={activeTrip.ambulance?.currentLongitude || null}
                ambulanceLabel={
                  activeTrip.ambulance
                    ? `${activeTrip.ambulance.registrationNumber} (${activeTrip.ambulance.type})`
                    : 'Dispatching Ambulance...'
                }
                hospitalLat={activeTrip.hospital?.latitude || null}
                hospitalLng={activeTrip.hospital?.longitude || null}
                hospitalLabel={activeTrip.hospital?.name || 'Assigned Hospital'}
                routeCoordinates={
                  (activeTrip.activeRoute?.geometryGeoJson?.coordinates || []).map(
                    (c: any) => [c[1], c[0]] as [number, number]
                  )
                }
                style={styles.map}
              />
            </View>
          </View>

          {/* Telemetry & Units Card */}
          <View style={styles.card}>
            <Text style={styles.cardSectionHeader}>Assigned Emergency Unit</Text>
            {activeTrip.ambulance ? (
              <View style={styles.unitRow}>
                <Ambulance size={28} color="#38bdf8" />
                <View style={styles.unitDetails}>
                  <Text style={styles.unitTitle}>
                    {activeTrip.ambulance.registrationNumber} ({activeTrip.ambulance.type})
                  </Text>
                  <Text style={styles.unitSub}>
                    Driver: {activeTrip.driver?.name || 'Paramedic Crew'} &bull;{' '}
                    {activeTrip.driver?.phone || 'Emergency Direct Contact'}
                  </Text>
                  {activeTrip.ambulance.isSimulated && (
                    <Text style={styles.simulatedNote}>Telemetry: Synthetic Demo Movement</Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.searchingUnitRow}>
                <ActivityIndicator size="small" color="#f59e0b" />
                <Text style={styles.searchingUnitText}>
                  Locating nearest available ALS/BLS unit in Aurangabad...
                </Text>
              </View>
            )}

            {/* Destination Hospital */}
            {activeTrip.hospital && (
              <View style={[styles.unitRow, { marginTop: 12 }]}>
                <Hospital size={26} color="#34d399" />
                <View style={styles.unitDetails}>
                  <Text style={styles.unitTitle}>{activeTrip.hospital.name}</Text>
                  <Text style={styles.unitSub}>{activeTrip.hospital.address}</Text>
                </View>
              </View>
            )}

            {/* ETA Info */}
            {activeTrip.activeRoute?.durationSeconds ? (
              <View style={styles.etaBox}>
                <Clock size={16} color="#60a5fa" />
                <Text style={styles.etaText}>
                  Estimated Arrival:{' '}
                  {Math.round(activeTrip.activeRoute.durationSeconds / 60)} minutes (
                  {activeTrip.activeRoute.distanceKm.toFixed(1)} km)
                </Text>
              </View>
            ) : null}

            {/* Cancel Trip Button */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelTrip}
              activeOpacity={0.8}
            >
              <XCircle size={16} color="#f87171" />
              <Text style={styles.cancelButtonText}>Cancel Emergency Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* DISPATCH REQUEST BOOKING FORM */
        <View style={styles.section}>
          {/* Hero Welcome */}
          <View style={styles.patientHero}>
            <View style={styles.patientBadge}>
              <Ambulance size={14} color="#38bdf8" />
              <Text style={styles.patientBadgeText}>CITIZEN EMERGENCY DISPATCH</Text>
            </View>
            <Text style={styles.heroTitle}>Request Smart Ambulance</Text>
            <Text style={styles.heroSubtitle}>
              Fastify + OSRM routing engine coordinates the nearest ambulance and hospital corridor.
            </Text>
          </View>

          {bookingError && (
            <View style={styles.errorBox}>
              <AlertTriangle size={18} color="#f87171" style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{bookingError}</Text>
            </View>
          )}

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardSectionHeader}>1. Pickup Incident Location</Text>

            {/* Address Search Bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputWrapper}>
                <Search size={16} color="#71717a" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={handleSearchLocations}
                  placeholder="Search Aurangabad landmarks (e.g. CIDCO, GMCH)..."
                  placeholderTextColor="#71717a"
                />
                {isSearching && <ActivityIndicator size="small" color="#3b82f6" />}
              </View>

              {/* Autocomplete Dropdown */}
              {searchResults.length > 0 && (
                <View style={styles.searchResultsDropdown}>
                  {searchResults.map((res) => (
                    <TouchableOpacity
                      key={res.placeId}
                      style={styles.searchResultItem}
                      onPress={() => selectSearchResult(res)}
                    >
                      <MapPin size={14} color="#60a5fa" style={{ marginRight: 8 }} />
                      <Text style={styles.searchResultText} numberOfLines={2}>
                        {res.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Current Selected Address */}
            <View style={styles.selectedLocationCard}>
              <View style={styles.locIconCol}>
                <MapPin size={18} color="#ef4444" />
              </View>
              <View style={styles.locTextCol}>
                <Text style={styles.locLabel}>Confirmed Pickup Point:</Text>
                <Text style={styles.locAddress}>{pickupAddress}</Text>
                <Text style={styles.locCoords}>
                  Coordinates: {pickupLat.toFixed(4)}, {pickupLng.toFixed(4)}
                </Text>
              </View>
            </View>

            {/* Interactive Location Map Pin Picker */}
            <Text style={styles.mapTip}>Tap anywhere on the map to fine-tune pickup position:</Text>
            <View style={styles.mapWrapperSmall}>
              <MobileEmergencyMap
                pickupLat={pickupLat}
                pickupLng={pickupLng}
                pickupLabel="Tapped Incident Point"
                onSelectLocation={handleMapSelect}
                style={styles.mapSmall}
              />
            </View>

            {/* Landmark Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Nearby Landmark (Optional)</Text>
              <TextInput
                style={styles.fieldInput}
                value={pickupLandmark}
                onChangeText={setPickupLandmark}
                placeholder="e.g. Near Kranti Chowk flyover pillar 12"
                placeholderTextColor="#52525b"
              />
            </View>

            {/* Emergency Severity Selector */}
            <Text style={[styles.cardSectionHeader, { marginTop: 16 }]}>
              2. Emergency Medical Category
            </Text>
            <View style={styles.categoryGrid}>
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = emergencyCategory === cat.value;
                return (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryCard,
                      isSelected && styles.categoryCardSelected,
                      cat.critical && styles.categoryCardCritical,
                    ]}
                    onPress={() => setEmergencyCategory(cat.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.categoryTitle,
                        isSelected && styles.categoryTitleSelected,
                        cat.critical && styles.categoryTextCritical,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Patient Details */}
            <Text style={[styles.cardSectionHeader, { marginTop: 16 }]}>
              3. Contact Information
            </Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Patient / Reporter Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={patientName}
                onChangeText={setPatientName}
                placeholder="Name"
                placeholderTextColor="#52525b"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Contact Phone Number</Text>
              <TextInput
                style={styles.fieldInput}
                value={patientPhone}
                onChangeText={setPatientPhone}
                placeholder="Phone number"
                placeholderTextColor="#52525b"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Medical Notes / Symptoms</Text>
              <TextInput
                style={[styles.fieldInput, { height: 60, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Brief description of patient condition..."
                placeholderTextColor="#52525b"
                multiline
              />
            </View>

            {/* Submit Emergency Button */}
            <TouchableOpacity
              style={[styles.dispatchButton, submittingBooking && styles.buttonDisabled]}
              onPress={handleCreateBooking}
              disabled={submittingBooking}
              activeOpacity={0.8}
            >
              {submittingBooking ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ambulance size={18} color="#ffffff" />
                  <Text style={styles.dispatchButtonText}>DISPATCH AMBULANCE NOW</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  patientHero: {
    marginBottom: 6,
  },
  patientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  patientBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 2,
    lineHeight: 16,
  },
  statusBanner: {
    backgroundColor: '#18181b',
    borderColor: '#3b82f6',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  statusBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '800',
  },
  priorityBadge: {
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
  statusTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  statusSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  mapCard: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  mapCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#a1a1aa',
    padding: 12,
    paddingBottom: 8,
  },
  mapWrapper: {
    height: 240,
    width: '100%',
  },
  mapWrapperSmall: {
    height: 180,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: '#27272a',
    borderWidth: 1,
    marginVertical: 10,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapSmall: {
    width: '100%',
    height: '100%',
  },
  mapTip: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 8,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderColor: '#27272a',
    borderWidth: 1,
  },
  cardSectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 10,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  unitDetails: {
    flex: 1,
  },
  unitTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  unitSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  simulatedNote: {
    fontSize: 10,
    color: '#eab308',
    marginTop: 2,
    fontStyle: 'italic',
  },
  searchingUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#09090b',
    borderRadius: 12,
    padding: 14,
  },
  searchingUnitText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  etaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  etaText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 14,
  },
  cancelButtonText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  searchContainer: {
    marginBottom: 10,
    zIndex: 10,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
  },
  searchResultsDropdown: {
    backgroundColor: '#18181b',
    borderColor: '#3b82f6',
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    maxHeight: 160,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomColor: '#27272a',
    borderBottomWidth: 1,
  },
  searchResultText: {
    color: '#e2e8f0',
    fontSize: 12,
    flex: 1,
  },
  selectedLocationCard: {
    flexDirection: 'row',
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  locIconCol: {
    marginRight: 10,
    marginTop: 2,
  },
  locTextCol: {
    flex: 1,
  },
  locLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#71717a',
    textTransform: 'uppercase',
  },
  locAddress: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 2,
  },
  locCoords: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  categoryCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  categoryCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  categoryCardCritical: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  categoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a1a1aa',
  },
  categoryTitleSelected: {
    color: '#ffffff',
  },
  categoryTextCritical: {
    color: '#f87171',
  },
  inputGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#ffffff',
  },
  dispatchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    height: 48,
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dispatchButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    flex: 1,
  },
});
