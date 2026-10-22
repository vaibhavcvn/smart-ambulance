import React, { useState, useEffect, useRef } from 'react';
import {
  EmergencyCategory,
  EMERGENCY_CATEGORIES_META,
  AURANGABAD_LANDMARKS,
  TripDTO,
  TripStatus,
  HospitalDTO,
} from '@aurangabad-ambulance/shared';
import { api, ApiError } from '../../lib/api-client.js';
import { getSocket } from '../../lib/socket-client.js';
import { useAuth } from '../../hooks/use-auth.js';
import { EmergencyMap } from '../../components/maps/EmergencyMap.js';
import {
  AlertTriangle,
  MapPin,
  Navigation,
  Clock,
  Building2,
  Phone,
  Search,
  Sparkles,
  HeartPulse,
  Activity,
  Crosshair,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Locate,
  Layers,
  ArrowRight,
  UserCheck,
  Compass,
  Loader2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

export const PatientBookingPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTrip, setActiveTrip] = useState<TripDTO | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState<boolean>(true);

  // Form State
  const [pickupAddress, setPickupAddress] = useState<string>('Kranti Chowk, Jalna Road, Aurangabad');
  const [pickupLat, setPickupLat] = useState<number>(19.8762);
  const [pickupLng, setPickupLng] = useState<number>(75.3242);
  const [landmark, setLandmark] = useState<string>('Kranti Chowk');
  const [selectedCategory, setSelectedCategory] = useState<EmergencyCategory>(
    EmergencyCategory.CARDIAC_ARREST
  );
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isRetryingRouting, setIsRetryingRouting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search autocomplete state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Mobile layout sheet mode: 'peek' (minimal HUD) | 'half' (standard) | 'full' (expanded)
  const [mobileSheetMode, setMobileSheetMode] = useState<'peek' | 'half' | 'full'>('half');

  const cycleSheetMode = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
    setMobileSheetMode((prev) => {
      if (prev === 'peek') return 'half';
      if (prev === 'half') return 'full';
      return 'peek';
    });
  };

  // Hospitals for map and recommendation preview
  const [hospitals, setHospitals] = useState<HospitalDTO[]>([]);

  // Telemetry status
  const [lastLocationPing, setLastLocationPing] = useState<string | null>(null);

  // 1. Fetch active trip and hospitals on load
  useEffect(() => {
    let isMounted = true;

    async function loadActive() {
      try {
        const trip = await api.get<TripDTO | null>('/api/v1/bookings/active');
        if (isMounted) setActiveTrip(trip);
      } catch (err) {
        console.warn('No active trip or failed to load:', err);
      } finally {
        if (isMounted) setIsLoadingTrip(false);
      }
    }

    async function loadHospitals() {
      try {
        const list = await api.get<HospitalDTO[]>('/api/v1/hospitals');
        if (isMounted) setHospitals(list);
      } catch (err) {
        console.warn('Failed to load hospitals:', err);
      }
    }

    if (user) {
      loadActive();
    } else {
      setIsLoadingTrip(false);
    }
    loadHospitals();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // 2a. Serverless Polling Fallback: poll for trip updates every 3s when active
  useEffect(() => {
    if (!activeTrip || !user) return;
    let isMounted = true;
    let isPolling = false;
    const pollInterval = setInterval(async () => {
      if (!isMounted || isPolling) return;
      isPolling = true;
      try {
        const trip = await api.get<TripDTO | null>('/api/v1/bookings/active');
        if (isMounted) {
          if (trip) {
            setActiveTrip(trip);
          } else {
            setActiveTrip(null);
          }
        }
      } catch {
        // Silent catch for background polling
      } finally {
        isPolling = false;
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [activeTrip?.id, activeTrip?.status]);

  // 2. Real-time Socket.IO listener for active trip
  useEffect(() => {
    if (!activeTrip) return;

    const socket = getSocket();
    socket.emit('trip:subscribe', { tripId: activeTrip.id });

    const handleTripUpdate = (updatedTrip: TripDTO) => {
      if (updatedTrip.id === activeTrip.id) {
        setActiveTrip(updatedTrip);
      }
    };

    const handleDriverLocation = (loc: any) => {
      if (activeTrip && activeTrip.driver && loc.driverId === activeTrip.driver.id) {
        setLastLocationPing(new Date().toLocaleTimeString());
        setActiveTrip((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            driver: prev.driver
              ? {
                  ...prev.driver,
                  currentLatitude: loc.latitude,
                  currentLongitude: loc.longitude,
                }
              : null,
            ambulance: prev.ambulance
              ? {
                  ...prev.ambulance,
                  currentLatitude: loc.latitude,
                  currentLongitude: loc.longitude,
                  isSimulated: loc.isSimulated ?? prev.ambulance.isSimulated,
                }
              : null,
          };
        });
      }
    };

    socket.on('trip:updated', handleTripUpdate);
    socket.on('driver:location:changed', handleDriverLocation);

    return () => {
      socket.emit('trip:unsubscribe', { tripId: activeTrip.id });
      socket.off('trip:updated', handleTripUpdate);
      socket.off('driver:location:changed', handleDriverLocation);
    };
  }, [activeTrip?.id]);

  // 3. Search input debouncer
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.get<any[]>(`/api/v1/geo/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(results);
      } catch (err) {
        console.warn('Geocoding search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Browser Geolocation
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickupLat(lat);
        setPickupLng(lng);
        try {
          const res = await api.get<{ address: string }>(`/api/v1/geo/reverse?lat=${lat}&lng=${lng}`);
          setPickupAddress(res.address);
          setLandmark('Current GPS Location');
        } catch {
          setPickupAddress(`GPS Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        }
      },
      (err) => {
        alert(`Location access denied: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Map Click Pin
  const handleMapClick = async (lat: number, lng: number) => {
    if (activeTrip) return; // Do not modify pin while tracking active trip
    setPickupLat(lat);
    setPickupLng(lng);
    try {
      const res = await api.get<{ address: string }>(`/api/v1/geo/reverse?lat=${lat}&lng=${lng}`);
      setPickupAddress(res.address);
      setLandmark('Custom Pin Location');
    } catch {
      setPickupAddress(`Map Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    }
  };

  // Select Landmark shortcut
  const handleSelectLandmark = (lm: (typeof AURANGABAD_LANDMARKS)[0]) => {
    setPickupLat(lm.latitude);
    setPickupLng(lm.longitude);
    setPickupAddress(`${lm.name}, ${lm.locality}, Chhatrapati Sambhajinagar`);
    setLandmark(lm.name);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Handle Booking Submission
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.location.href = '/login';
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const trip = await api.post<TripDTO>('/api/v1/bookings', {
        pickupAddress: pickupAddress || 'Central Aurangabad Location',
        pickupLatitude: pickupLat,
        pickupLongitude: pickupLng,
        pickupLandmark: landmark,
        emergencyCategory: selectedCategory,
        notes: notes.trim() || undefined,
        patientName: user.name,
        patientPhone: user.phone || undefined,
      });

      setActiveTrip(trip);
      setMobileSheetMode('half');
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to dispatch ambulance. Please verify location is inside Aurangabad.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Cancel Trip
  const handleCancelTrip = async () => {
    if (!activeTrip || isCancelling) return;
    const confirm = window.confirm('Are you sure you want to cancel this emergency ambulance request?');
    if (!confirm) return;

    setIsCancelling(true);
    try {
      const updated = await api.patch<TripDTO>(`/api/v1/trips/${activeTrip.id}/status`, {
        targetStatus: TripStatus.CANCELLED,
        notes: 'Cancelled by patient.',
      });
      setActiveTrip(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel trip.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle route recalculation retry
  const handleRetryRouting = async () => {
    if (!activeTrip || isRetryingRouting) return;
    setIsRetryingRouting(true);
    try {
      const updated = await api.post<TripDTO>(`/api/v1/trips/${activeTrip.id}/recalculate-route`, {});
      setActiveTrip(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to recalculate route.');
    } finally {
      setIsRetryingRouting(false);
    }
  };

  // Authoritative Phase 2 Route Transition state
  const isPostPickup =
    activeTrip?.status === TripStatus.PATIENT_PICKED_UP ||
    activeTrip?.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
    activeTrip?.status === TripStatus.ARRIVED_AT_HOSPITAL;

  const activeRoute = isPostPickup ? activeTrip?.routeToHospital : activeTrip?.routeToPickup;

  // Strict road geometry validation: only draw polyline when verified OSRM road geometry is available (> 2 points)
  const isRoadRoute =
    activeRoute?.source === 'OSRM' &&
    activeRoute?.isRoadGeometry !== false &&
    Array.isArray(activeRoute?.geometryGeoJson?.coordinates) &&
    activeRoute.geometryGeoJson.coordinates.length >= 2;

  const routeCoords: [number, number][] = [];
  if (isRoadRoute && activeRoute?.geometryGeoJson?.coordinates) {
    for (const c of activeRoute.geometryGeoJson.coordinates) {
      if (Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
        routeCoords.push([c[1], c[0]]); // Leaflet uses [lat, lng] from GeoJSON [lng, lat]
      }
    }
  }

  // Active Ambulances for map
  const activeAmbulances = activeTrip?.ambulance ? [activeTrip.ambulance] : [];

  // Formatted ETA & Distance: do not invent fake road ETA if road route is unavailable
  const activeEtaMinutes =
    isRoadRoute && activeRoute?.durationSeconds && activeRoute.durationSeconds > 0
      ? Math.max(1, Math.round(activeRoute.durationSeconds / 60))
      : null;
  const activeEtaString = activeEtaMinutes ? `${activeEtaMinutes} MIN` : null;
  const activeDistanceString = activeRoute?.distanceKm ? `${activeRoute.distanceKm} km` : null;

  const [isRetryingRoute, setIsRetryingRoute] = useState<boolean>(false);
  const handleRetryRoute = async () => {
    if (!activeTrip?.id) return;
    setIsRetryingRoute(true);
    try {
      const updated = await api.post<TripDTO>(`/api/v1/trips/${activeTrip.id}/recalculate-route`);
      setActiveTrip(updated);
    } catch (err: any) {
      console.warn('Failed to recalculate road route:', err);
    } finally {
      setIsRetryingRoute(false);
    }
  };

  return (
    <div className="relative h-[calc(100dvh-48px)] sm:h-[calc(100vh-88px)] w-full flex flex-col md:flex-row overflow-hidden bg-neutral-950 font-sans">
      {/* 1. UBER-STYLE DESKTOP SIDEBAR / MOBILE BOTTOM SHEET DRAWER */}
      <div
        id="tracking-card"
        className={`z-20 w-full md:w-[440px] lg:w-[470px] xl:w-[490px] bg-neutral-900 md:border-r border-t md:border-t-0 border-neutral-800 shadow-2xl flex flex-col text-neutral-100 transition-all duration-300 order-1
          fixed inset-x-0 bottom-14 md:relative md:bottom-auto md:h-full mobile-bottom-sheet md:rounded-none
          ${
            mobileSheetMode === 'peek'
              ? 'max-h-[170px] md:max-h-none'
              : mobileSheetMode === 'half'
              ? 'max-h-[58dvh] md:max-h-none'
              : 'max-h-[85dvh] md:max-h-none'
          }
        `}
      >
        {/* Mobile Drag Handle & Sheet Height Toggle */}
        <div
          onClick={cycleSheetMode}
          className="md:hidden flex flex-col items-center pt-2 pb-1.5 cursor-pointer select-none bg-neutral-900 border-b border-neutral-800/80 active:bg-neutral-800/80 transition-colors"
        >
          <div className="sheet-drag-handle" />
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-neutral-400 tracking-wider">
            <span>
              {mobileSheetMode === 'peek'
                ? '▲ Tap to expand options'
                : mobileSheetMode === 'half'
                ? 'Tap for full sheet / map'
                : '▼ Tap to minimize sheet'}
            </span>
            <ChevronUp
              className={`w-3.5 h-3.5 transition-transform ${
                mobileSheetMode === 'full' ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>

        {/* Scrollable Form / Tracking Body */}
        <div className="flex-1 overflow-y-auto">
        {!activeTrip || activeTrip.status === TripStatus.COMPLETED || activeTrip.status === TripStatus.CANCELLED ? (
          /* ======================== PATIENT BOOKING FORM ======================== */
          <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-6">
            <div>
              {/* Header Title */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow-lg shadow-red-900/30">
                    <HeartPulse className="w-6 h-6" />
                  </div>
                  <div>
                    <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-none">
                      Request Ambulance
                    </h1>
                    <span className="text-xs text-neutral-400 font-medium">
                      Aurangabad Rapid Emergency Dispatch
                    </span>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-black tracking-wider px-2.5 py-1 bg-red-950 text-red-400 border border-red-800/80 rounded-full animate-pulse">
                  24x7 Priority
                </span>
              </div>

              {errorMessage && (
                <div className="mt-4 p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleCreateBooking} className="mt-5 space-y-5">
                {/* 1. Pickup Location Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span>1. Emergency Pickup Point</span>
                    </label>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setMobileSheetMode('peek')}
                        className="md:hidden text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>View Map</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleUseMyLocation}
                        className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>Use GPS</span>
                      </button>
                    </div>
                  </div>

                  {/* Connected Uber-style pin input */}
                  <div className="relative">
                    <div className="absolute left-3.5 top-3.5 text-neutral-400">
                      <MapPin className="w-4 h-4 text-red-500" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search landmark or street (e.g. Kranti Chowk, CIDCO)..."
                      value={searchQuery || pickupAddress}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPickupAddress(e.target.value);
                      }}
                      className="w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
                      required
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-3 text-[10px] text-neutral-400 animate-pulse">
                        Searching...
                      </div>
                    )}
                  </div>

                  {/* Autocomplete Dropdown */}
                  {searchResults.length > 0 && (
                    <div className="mt-1.5 bg-neutral-950 border border-neutral-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-neutral-800 z-30">
                      {searchResults.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setPickupLat(item.latitude);
                            setPickupLng(item.longitude);
                            setPickupAddress(item.displayName);
                            setLandmark(item.displayName.split(',')[0]);
                            setSearchResults([]);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 flex items-center justify-between text-neutral-200 transition-colors"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-white block truncate">
                              {item.displayName.split(',')[0]}
                            </span>
                            <span className="text-neutral-400 block truncate text-[11px]">
                              {item.displayName}
                            </span>
                          </div>
                          {!item.isWithinBoundary && (
                            <span className="text-[9px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded font-bold shrink-0 border border-red-800">
                              Outside City
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quick Aurangabad Landmarks */}
                  <div className="mt-2.5">
                    <span className="text-[11px] text-neutral-400 block mb-1.5 font-medium">
                      Popular Aurangabad Hubs:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {AURANGABAD_LANDMARKS.slice(0, 5).map((lm) => (
                        <button
                          key={lm.id}
                          type="button"
                          onClick={() => handleSelectLandmark(lm)}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                            pickupLat === lm.latitude
                              ? 'bg-red-950 text-red-300 border-red-600 font-bold shadow-sm'
                              : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700 hover:text-white'
                          }`}
                        >
                          {lm.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. Emergency Category & Severity */}
                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-neutral-300 block mb-2">
                    2. Emergency Category & Clinical Severity
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(EmergencyCategory).map((cat) => {
                      const meta = EMERGENCY_CATEGORIES_META[cat];
                      const isSelected = selectedCategory === cat;
                      const isCritical = meta.priority === 'CRITICAL';

                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? isCritical
                                ? 'border-red-500 bg-red-950/40 ring-1 ring-red-500 shadow-md'
                                : 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500 shadow-md'
                              : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white block truncate">
                              {meta.label}
                            </span>
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                isCritical
                                  ? 'bg-red-600 text-white'
                                  : meta.priority === 'URGENT'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              {meta.priority}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 mt-1 block">
                            Recommended: <strong className="text-neutral-200">{meta.recommendedAmbulance}</strong>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Patient Notes */}
                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-neutral-300 block mb-1.5">
                    3. Patient Symptoms / Medical Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="E.g., conscious, difficulty breathing, gate landmark..."
                    className="w-full p-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                  />
                </div>

                {/* Nearest Hospital ER Preview */}
                {hospitals.length > 0 && (
                  <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                    <div className="flex items-center justify-between text-xs font-bold text-neutral-200 mb-1">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Recommended ER Facility</span>
                      </span>
                      <span className="text-[10px] text-emerald-400 font-extrabold">LIVE CAPACITY</span>
                    </div>
                    <div className="text-xs font-semibold text-white truncate">
                      {hospitals[0]?.name}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-400 mt-1">
                      <span>
                        Available ER Beds: <strong className="text-red-400">{hospitals[0]?.availableEmergencyBeds}</strong>
                      </span>
                      <span>
                        ICU Beds: <strong className="text-blue-400">{hospitals[0]?.availableIcuBeds}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-red-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <Activity className="w-5 h-5 animate-pulse text-white" />
                  )}
                  <span>
                    {isSubmitting
                      ? 'Dispatching Emergency Unit...'
                      : 'Dispatch Immediate Ambulance'}
                  </span>
                </button>
              </form>
            </div>

            {/* Prototype footnote */}
            <div className="pt-3 border-t border-neutral-800 text-[11px] text-neutral-500 text-center">
              Chhatrapati Sambhajinagar EMS &bull; AI-Powered Priority Triage & Routing
            </div>
          </div>
        ) : (
          /* ======================== UBER-INSPIRED LIVE TRACKING CARD ======================== */
          <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-5">
            <div>
              {/* Trip Header Bar */}
              <div className="flex items-center justify-between pb-3.5 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Trip #{activeTrip.id.slice(-6).toUpperCase()}
                  </span>
                </div>
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-200 border border-neutral-700">
                  {activeTrip.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Uber-Style Hero ETA Card */}
              <div className="my-4 p-4 rounded-2xl bg-gradient-to-br from-neutral-950 to-neutral-900 border border-neutral-800 shadow-xl">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black text-white tracking-tight">
                      {activeEtaString || 'CALCULATING'}
                    </span>
                    <span className="text-xs text-neutral-400 font-semibold block mt-0.5">
                      {isPostPickup
                        ? 'Estimated Arrival at Hospital ER'
                        : 'Estimated Arrival at Your Location'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-bold text-neutral-300">
                      {activeDistanceString || '--'}
                    </span>
                    <span className="text-[10px] text-neutral-500 block">
                      {isRoadRoute ? 'Road Distance' : 'Direct Distance (Haversine)'}
                    </span>
                  </div>
                </div>

                {/* Honest Fallback Alert Banner */}
                {!isRoadRoute && (
                  <div className="mt-3 p-2.5 bg-amber-950/40 border border-amber-800/80 rounded-xl text-xs text-amber-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Road route unavailable. Showing direct estimated distance.</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleRetryRoute}
                      disabled={isRetryingRoute}
                      className="ml-2 px-2.5 py-1 bg-amber-900/60 hover:bg-amber-800 text-amber-200 font-bold rounded-lg border border-amber-700 text-[10px] shrink-0 transition-colors"
                    >
                      {isRetryingRoute ? 'Retrying...' : 'Retry Route'}
                    </button>
                  </div>
                )}

                {/* Trip State Progression Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400 mb-1.5">
                    <span>Dispatch Mission Phase</span>
                    <span className="text-emerald-400">
                      {activeTrip.status === TripStatus.REQUESTED && 'Locating Nearest Ambulance'}
                      {activeTrip.status === TripStatus.DRIVER_REQUESTED && 'Offering Mission to Driver'}
                      {activeTrip.status === TripStatus.ACCEPTED && 'Ambulance Assigned'}
                      {activeTrip.status === TripStatus.EN_ROUTE_TO_PICKUP && 'En Route to Scene'}
                      {activeTrip.status === TripStatus.ARRIVED_AT_PICKUP && 'Ambulance on Scene'}
                      {activeTrip.status === TripStatus.PATIENT_PICKED_UP && 'Patient Onboard'}
                      {activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL && 'En Route to Hospital ER'}
                      {activeTrip.status === TripStatus.ARRIVED_AT_HOSPITAL && 'Handover at Emergency Dept'}
                    </span>
                  </div>

                  <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-700 ${
                        isPostPickup ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                      style={{
                        width:
                          activeTrip.status === TripStatus.REQUESTED
                            ? '15%'
                            : activeTrip.status === TripStatus.DRIVER_REQUESTED
                            ? '30%'
                            : activeTrip.status === TripStatus.ACCEPTED
                            ? '45%'
                            : activeTrip.status === TripStatus.EN_ROUTE_TO_PICKUP
                            ? '60%'
                            : activeTrip.status === TripStatus.ARRIVED_AT_PICKUP
                            ? '75%'
                            : activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL
                            ? '90%'
                            : '100%',
                      }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Assigned Driver & Ambulance Fleet Profile (Uber Driver Card) */}
              {activeTrip.driver ? (
                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-neutral-800 text-neutral-100 flex items-center justify-center font-bold text-base border border-neutral-700">
                        {activeTrip.driver.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-white">
                            {activeTrip.driver.name}
                          </span>
                          <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <span className="text-xs text-neutral-400 block font-medium">
                          License: {activeTrip.driver.licenseNumber}
                        </span>
                        <span className="text-xs font-bold text-red-400 block mt-0.5">
                          {activeTrip.ambulance?.registrationNumber || 'Emergency Unit'} &bull;{' '}
                          {activeTrip.ambulance?.type || 'ALS'}
                        </span>
                      </div>
                    </div>

                    {activeTrip.driver.phone && (
                      <a
                        href={`tel:${activeTrip.driver.phone}`}
                        className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors border border-neutral-700 flex items-center justify-center"
                        title="Call Driver"
                      >
                        <Phone className="w-4 h-4 text-emerald-400" />
                      </a>
                    )}
                  </div>

                  {/* Telemetry Indicator */}
                  <div className="mt-3 pt-2.5 border-t border-neutral-800 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="text-neutral-300 font-medium">
                        {activeTrip.ambulance?.isSimulated
                          ? 'Demo Simulator Active'
                          : 'Live Device GPS Connected'}
                      </span>
                    </div>
                    {lastLocationPing && (
                      <span className="text-neutral-500">Updated: {lastLocationPing}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-2xl mb-4 text-xs text-amber-200 flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-spin" />
                  <span>Broadcasting priority dispatch offer to nearest Aurangabad ambulances...</span>
                </div>
              )}

              {/* ACTIVE DESTINATION TRANSITION CARD (Pickup vs Hospital ER) */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block">
                      {isPostPickup ? 'Target Receiving Hospital' : 'Emergency Pickup Point'}
                    </span>
                    <span className="text-sm font-extrabold text-white block mt-0.5">
                      {isPostPickup && activeTrip.hospital
                        ? activeTrip.hospital.name
                        : activeTrip.pickupAddress}
                    </span>
                    <span className="text-xs text-neutral-400 block mt-0.5">
                      {isPostPickup && activeTrip.hospital
                        ? activeTrip.hospital.address
                        : activeTrip.pickupLandmark || 'Near Aurangabad landmark'}
                    </span>

                    {/* Recommendation reason if post pickup */}
                    {isPostPickup && activeTrip.recommendedHospitalReason && (
                      <div className="mt-2 text-[11px] text-emerald-300 bg-emerald-950/60 border border-emerald-800/70 p-2 rounded-lg">
                        <strong>ER Routing Reason:</strong> {activeTrip.recommendedHospitalReason}
                      </div>
                    )}
                  </div>

                  {isPostPickup ? (
                    <Building2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <MapPin className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  )}
                </div>
              </div>

              {/* AI Traffic & Delay Metrics */}
              <div className="grid grid-cols-2 gap-2.5 text-center mb-4">
                <div className="bg-neutral-950 border border-neutral-800 p-2.5 rounded-xl">
                  <span className="text-[10px] text-neutral-400 block font-medium">AI Traffic Delay</span>
                  <span className="text-xs font-bold text-white block mt-0.5">
                    {activeTrip.predictedDelaySeconds
                      ? `+${Math.round(activeTrip.predictedDelaySeconds / 60)} min expected`
                      : 'On Schedule'}
                  </span>
                  <span className="text-[9px] text-neutral-500">Random Forest</span>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 p-2.5 rounded-xl">
                  <span className="text-[10px] text-neutral-400 block font-medium">Routing Engine</span>
                  <span className="text-xs font-bold text-white block mt-0.5">
                    {activeRoute?.source === 'FALLBACK_HAVERSINE' ? 'Haversine Mode' : 'OSRM Live Road'}
                  </span>
                  <span className="text-[9px] text-neutral-500">Turn-by-turn</span>
                </div>
              </div>

              {/* Route Error & Recalculate Retry */}
              {activeTrip.routingError && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl mb-4 text-xs text-amber-200 flex items-center justify-between">
                  <span>{activeTrip.routingError}</span>
                  <button
                    onClick={handleRetryRouting}
                    disabled={isRetryingRouting}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-[11px] rounded transition-colors flex items-center gap-1"
                  >
                    {isRetryingRouting && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{isRetryingRouting ? 'Retrying...' : 'Retry Route'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Actions: Cancel Ambulance Request (allowed only pre-pickup) */}
            <div className="space-y-2">
              {!isPostPickup && (
                <button
                  onClick={handleCancelTrip}
                  disabled={isCancelling}
                  className="w-full py-2.5 px-4 bg-neutral-950 hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      <span>Cancelling Request...</span>
                    </>
                  ) : (
                    <span>Cancel Ambulance Request</span>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* 2. FULLSCREEN INTERACTIVE LIVE MAP (Always mounted and active) */}
      <div className="absolute inset-0 md:relative md:flex-1 h-full w-full z-0 order-2">
        <EmergencyMap
          pickupLat={activeTrip ? activeTrip.pickupLatitude : pickupLat}
          pickupLng={activeTrip ? activeTrip.pickupLongitude : pickupLng}
          pickupLabel={activeTrip ? activeTrip.pickupAddress : pickupAddress}
          destinationType={isPostPickup ? 'HOSPITAL' : 'PICKUP'}
          destinationLat={isPostPickup && activeTrip?.hospital ? activeTrip.hospital.latitude : undefined}
          destinationLng={isPostPickup && activeTrip?.hospital ? activeTrip.hospital.longitude : undefined}
          destinationLabel={isPostPickup && activeTrip?.hospital ? activeTrip.hospital.name : undefined}
          ambulances={activeAmbulances}
          hospitals={hospitals}
          routeCoordinates={routeCoords}
          routeColor={isPostPickup ? '#059669' : '#2563eb'}
          onSelectLocation={!activeTrip ? handleMapClick : undefined}
          showBoundary={true}
          activeEta={activeEtaString}
          activeDistance={activeDistanceString}
          routingError={activeTrip?.routingError}
          routeSource={activeRoute?.source}
          isRoadGeometry={isRoadRoute}
          routePointCount={routeCoords.length}
          onRetryRouting={activeTrip ? handleRetryRoute : undefined}
          isRoutingLoading={isRetryingRoute}
          invalidateTrigger={mobileSheetMode}
        />

        {/* Mobile Guidance Banner: Tap to Pin on Map */}
        {!activeTrip && (
          <div className="md:hidden absolute top-2.5 left-1/2 -translate-x-1/2 z-[400] bg-neutral-900/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-neutral-700/80 shadow-2xl text-[11px] font-bold text-neutral-200 flex items-center gap-1.5 pointer-events-none">
            <MapPin className="w-3.5 h-3.5 text-red-500 animate-bounce" />
            <span>Tap map to set emergency pickup point</span>
          </div>
        )}
      </div>
    </div>
  );
};
