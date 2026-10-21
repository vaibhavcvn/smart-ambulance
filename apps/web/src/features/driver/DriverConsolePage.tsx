import React, { useState, useEffect, useRef } from 'react';
import {
  DispatchOfferDTO,
  TripDTO,
  TripStatus,
  DriverStatus,
  DriverApplicationStatus,
} from '@aurangabad-ambulance/shared';
import { api } from '../../lib/api-client.js';
import { getSocket } from '../../lib/socket-client.js';
import { useAuth } from '../../hooks/use-auth.js';
import { EmergencyMap } from '../../components/maps/EmergencyMap.js';
import {
  Ambulance,
  CheckCircle,
  XCircle,
  Navigation,
  Clock,
  Building2,
  AlertCircle,
  Radio,
  Play,
  Pause,
  RotateCw,
  Crosshair,
  ShieldAlert,
  UserCheck,
  Compass,
} from 'lucide-react';

interface ApplicationStatusInfo {
  applicationStatus: DriverApplicationStatus;
  status?: DriverStatus | string;
  licenseNumber: string;
  vehicleTypeRequested?: string;
  vehicleRegistrationRequested?: string;
  rejectionReason?: string | null;
  assignedAmbulance?: {
    registrationNumber: string;
    type: string;
    status: string;
  } | null;
}

export const DriverConsolePage: React.FC = () => {
  const { user } = useAuth();
  const [driverStatus, setDriverStatus] = useState<DriverStatus>(DriverStatus.AVAILABLE);
  const [appStatusInfo, setAppStatusInfo] = useState<ApplicationStatusInfo | null>(null);
  const [pendingOffer, setPendingOffer] = useState<DispatchOfferDTO | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripDTO | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Driver telemetry coordinates
  const [currentLat, setCurrentLat] = useState<number>(19.8762);
  const [currentLng, setCurrentLng] = useState<number>(75.3242);

  // REAL DEVICE GPS STATE
  const [isRealGpsActive, setIsRealGpsActive] = useState<boolean>(false);
  const [gpsPermissionState, setGpsPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [lastGpsUpdate, setLastGpsUpdate] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastGpsSentTimeRef = useRef<number>(0);
  const isSendingGpsRef = useRef<boolean>(false);

  // DEMO GPS SIMULATOR STATE
  const [isSimulatingGps, setIsSimulatingGps] = useState<boolean>(false);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile layout tab toggle: 'panel' vs 'map'
  const [mobileView, setMobileView] = useState<'panel' | 'map'>('panel');

  // 1. Fetch application status, pending offer & active trip on mount
  useEffect(() => {
    async function loadDriverState() {
      try {
        const appStatus = await api.get<ApplicationStatusInfo>('/api/v1/drivers/application-status');
        setAppStatusInfo(appStatus);
        if (appStatus.status) {
          setDriverStatus(appStatus.status as DriverStatus);
        }

        const trip = await api.get<TripDTO | null>('/api/v1/trips/driver/active');
        setActiveTrip(trip);

        if (!trip && appStatus.applicationStatus === DriverApplicationStatus.APPROVED) {
          const offer = await api.get<DispatchOfferDTO | null>('/api/v1/dispatch/pending');
          if (offer && offer.secondsRemaining > 0) {
            setPendingOffer(offer);
            setCountdown(offer.secondsRemaining);
          }
        }
      } catch (err) {
        console.warn('Error loading driver state:', err);
      }
    }

    loadDriverState();
  }, [user]);

  // 1a. Real-time polling fallback for serverless deployments (polls for new dispatch offers every 2.5s)
  useEffect(() => {
    let isMounted = true;
    let isPolling = false;
    const pollInterval = setInterval(async () => {
      if (!isMounted || isPolling) return;
      isPolling = true;
      try {
        if (!activeTrip) {
          const offer = await api.get<DispatchOfferDTO | null>('/api/v1/dispatch/pending');
          if (isMounted) {
            if (offer && offer.secondsRemaining > 0) {
              setPendingOffer((prev) => {
                if (!prev || prev.dispatchRequestId !== offer.dispatchRequestId) {
                  setCountdown(offer.secondsRemaining);
                  return offer;
                }
                return prev;
              });
            } else if (!offer) {
              setPendingOffer(null);
            }
          }
        } else {
          const trip = await api.get<TripDTO | null>('/api/v1/trips/driver/active');
          if (isMounted && trip) {
            setActiveTrip(trip);
          }
        }
      } catch {
        // Silent catch for background polling
      } finally {
        isPolling = false;
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [activeTrip?.id]);

  // 2. Countdown timer for pending offer
  useEffect(() => {
    if (!pendingOffer || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPendingOffer(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingOffer, countdown]);

  // 3. Socket listener for incoming offers and trip updates
  useEffect(() => {
    const socket = getSocket();

    const handleOffer = (offer: DispatchOfferDTO) => {
      setPendingOffer(offer);
      setCountdown(offer.secondsRemaining || 45);
    };

    const handleExpired = () => {
      setPendingOffer(null);
      setCountdown(0);
    };

    const handleTripUpdate = (updatedTrip: TripDTO) => {
      if (activeTrip && updatedTrip.id === activeTrip.id) {
        setActiveTrip(updatedTrip);
      }
    };

    socket.on('dispatch:offer', handleOffer);
    socket.on('dispatch:expired', handleExpired);
    socket.on('trip:updated', handleTripUpdate);

    return () => {
      socket.off('dispatch:offer', handleOffer);
      socket.off('dispatch:expired', handleExpired);
      socket.off('trip:updated', handleTripUpdate);
    };
  }, [activeTrip?.id]);

  // 4. REAL DEVICE GPS WATCHER
  const handleToggleRealGps = () => {
    if (isRealGpsActive) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsRealGpsActive(false);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('HTML5 Geolocation is not supported in this browser.');
      return;
    }

    if (isSimulatingGps) {
      setIsSimulatingGps(false);
    }

    setGpsError(null);
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        const spd = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : undefined;
        const hdg = pos.coords.heading ? Math.round(pos.coords.heading) : undefined;

        setCurrentLat(lat);
        setCurrentLng(lng);
        setGpsAccuracy(acc);
        setLastGpsUpdate(new Date().toLocaleTimeString());
        setGpsPermissionState('granted');
        setGpsError(null);

        const nowMs = Date.now();
        // Throttle updates: send to backend at most once every 3s and prevent concurrent overlapping requests
        if (nowMs - lastGpsSentTimeRef.current < 3000 || isSendingGpsRef.current) {
          return;
        }

        isSendingGpsRef.current = true;
        lastGpsSentTimeRef.current = nowMs;

        try {
          await api.post('/api/v1/tracking/location', {
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            speed: spd,
            heading: hdg,
            isSimulated: false,
          });
        } catch (err: any) {
          console.warn('Real GPS submission error:', err);
        } finally {
          isSendingGpsRef.current = false;
        }
      },
      (err) => {
        setGpsPermissionState(err.code === 1 ? 'denied' : 'prompt');
        setGpsError(err.message || 'Unable to retrieve device GPS coordinates.');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );

    watchIdRef.current = id;
    setIsRealGpsActive(true);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // 5. Handle Accept Offer
  const handleAcceptOffer = async () => {
    if (!pendingOffer) return;
    try {
      const res = await api.post<{ success: boolean; trip: TripDTO }>('/api/v1/dispatch/respond', {
        dispatchRequestId: pendingOffer.dispatchRequestId,
        action: 'ACCEPT',
      });
      setActiveTrip(res.trip);
      setPendingOffer(null);
    } catch (err: any) {
      alert(err.message || 'Failed to accept dispatch offer.');
      setPendingOffer(null);
    }
  };

  // 6. Handle Decline Offer
  const handleDeclineOffer = async () => {
    if (!pendingOffer) return;
    try {
      await api.post('/api/v1/dispatch/respond', {
        dispatchRequestId: pendingOffer.dispatchRequestId,
        action: 'DECLINE',
        reason: 'Driver unavailable at moment',
      });
      setPendingOffer(null);
    } catch (err: any) {
      alert(err.message || 'Error declining offer.');
    }
  };

  // 7. Handle Trip Status Transition (PHASE 2 Route Switching)
  const handleTransitionStatus = async (targetStatus: TripStatus) => {
    if (!activeTrip) return;
    try {
      const updated = await api.patch<TripDTO>(`/api/v1/trips/${activeTrip.id}/status`, {
        targetStatus,
      });

      if (targetStatus === TripStatus.COMPLETED) {
        setActiveTrip(null);
        setIsSimulatingGps(false);
      } else {
        setActiveTrip(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update trip progression.');
    }
  };

  // 8. Handle Recalculate Route Retry
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const handleRecalculateRoute = async () => {
    if (!activeTrip) return;
    setIsRecalculating(true);
    try {
      const updated = await api.post<TripDTO>(`/api/v1/trips/${activeTrip.id}/recalculate-route`, {});
      setActiveTrip(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to recalculate route.');
    } finally {
      setIsRecalculating(false);
    }
  };

  // 9. Toggle Online Availability
  const handleToggleAvailability = async () => {
    const nextStatus =
      driverStatus === DriverStatus.AVAILABLE ? DriverStatus.OFFLINE : DriverStatus.AVAILABLE;
    try {
      await api.patch('/api/v1/drivers/availability', {
        status: nextStatus,
        currentLatitude: currentLat,
        currentLongitude: currentLng,
      });
      setDriverStatus(nextStatus);
    } catch (err: any) {
      alert(err.message || 'Failed to change driver status.');
    }
  };

  // 10. DEMO GPS Simulator Implementation
  useEffect(() => {
    if (!isSimulatingGps || !activeTrip) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    const isHospitalPhase =
      activeTrip.status === TripStatus.PATIENT_PICKED_UP ||
      activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
      activeTrip.status === TripStatus.ARRIVED_AT_HOSPITAL;

    const targetLat = isHospitalPhase && activeTrip.hospital
      ? activeTrip.hospital.latitude
      : activeTrip.pickupLatitude;

    const targetLng = isHospitalPhase && activeTrip.hospital
      ? activeTrip.hospital.longitude
      : activeTrip.pickupLongitude;

    simIntervalRef.current = setInterval(async () => {
      setCurrentLat((prevLat) => {
        const stepLat = (targetLat - prevLat) * 0.12;
        return prevLat + stepLat;
      });

      setCurrentLng((prevLng) => {
        const stepLng = (targetLng - prevLng) * 0.12;
        const newLng = prevLng + stepLng;

        api.post('/api/v1/tracking/location', {
          latitude: currentLat,
          longitude: newLng,
          speed: 48,
          accuracy: 10,
          isSimulated: true,
        }).catch(console.warn);

        return newLng;
      });
    }, 3000);

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [isSimulatingGps, activeTrip?.status, activeTrip?.hospital?.id]);

  // Phase 2 Route Transition
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

  // Active ambulance representation
  const activeAmbulances = activeTrip?.ambulance
    ? [{ ...activeTrip.ambulance, currentLatitude: currentLat, currentLongitude: currentLng }]
    : [];

  const activeEtaMinutes =
    isRoadRoute && activeRoute?.durationSeconds && activeRoute.durationSeconds > 0
      ? Math.max(1, Math.round(activeRoute.durationSeconds / 60))
      : null;

  return (
    <div className="relative h-[calc(100vh-88px)] w-full flex flex-col md:flex-row overflow-hidden bg-neutral-950 font-sans text-neutral-100">
      {/* MOBILE VIEW TOGGLE TABS */}
      <div className="md:hidden z-30 flex border-b border-neutral-800 bg-neutral-900 text-xs font-bold">
        <button
          onClick={() => setMobileView('panel')}
          className={`flex-1 py-3 text-center transition-colors flex items-center justify-center gap-1.5 ${
            mobileView === 'panel'
              ? 'text-white border-b-2 border-blue-500 bg-neutral-800'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Ambulance className="w-4 h-4 text-blue-500" />
          <span>Driver Terminal</span>
        </button>
        <button
          onClick={() => setMobileView('map')}
          className={`flex-1 py-3 text-center transition-colors flex items-center justify-center gap-1.5 ${
            mobileView === 'map'
              ? 'text-white border-b-2 border-blue-500 bg-neutral-800'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Compass className="w-4 h-4 text-emerald-400" />
          <span>Live Route Map</span>
        </button>
      </div>

      {/* LEFT: DRIVER ACTION CONTROL PANEL */}
      <div
        className={`z-20 w-full md:w-[440px] lg:w-[470px] xl:w-[490px] h-full bg-neutral-900 border-r border-neutral-800 shadow-2xl flex flex-col overflow-y-auto ${
          mobileView === 'map' ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-5">
          <div>
            {/* Driver Identity Card */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg shadow-blue-900/40">
                  <Ambulance className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white leading-tight">
                    {user?.name || 'Driver Console'}
                  </h2>
                  <span className="text-xs text-neutral-400 font-medium block">
                    {user?.email}
                  </span>
                  {appStatusInfo?.assignedAmbulance && (
                    <span className="text-[11px] font-bold text-blue-400 block mt-0.5">
                      Vehicle: {appStatusInfo.assignedAmbulance.registrationNumber} ({appStatusInfo.assignedAmbulance.type})
                    </span>
                  )}
                </div>
              </div>

              {/* Online/Offline Toggle */}
              {appStatusInfo?.applicationStatus === DriverApplicationStatus.APPROVED ? (
                <button
                  onClick={handleToggleAvailability}
                  className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                    driverStatus === DriverStatus.AVAILABLE
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      driverStatus === DriverStatus.AVAILABLE ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                    }`}
                  ></span>
                  <span>{driverStatus}</span>
                </button>
              ) : (
                <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-amber-950 text-amber-300 rounded-full border border-amber-800">
                  {appStatusInfo?.applicationStatus || 'PENDING'}
                </span>
              )}
            </div>

            {/* ONBOARDING NOTICES */}
            {appStatusInfo?.applicationStatus === DriverApplicationStatus.PENDING_REVIEW && (
              <div className="my-4 p-4 bg-amber-950/40 border border-amber-800/80 rounded-2xl text-xs text-amber-200">
                <div className="flex items-center gap-2 font-bold mb-1 text-amber-300">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>DRIVER APPLICATION UNDER REVIEW</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-300/80">
                  Your credentials (License: {appStatusInfo.licenseNumber}) and requested vehicle ({appStatusInfo.vehicleTypeRequested || 'BLS'}) are being verified by the Aurangabad EMS Administrator.
                </p>
              </div>
            )}

            {appStatusInfo?.applicationStatus === DriverApplicationStatus.REJECTED && (
              <div className="my-4 p-4 bg-red-950/40 border border-red-800/80 rounded-2xl text-xs text-red-200">
                <div className="flex items-center gap-2 font-bold mb-1 text-red-400">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                  <span>APPLICATION REJECTED</span>
                </div>
                <p className="text-[11px] text-red-300">
                  Reason: {appStatusInfo.rejectionReason || 'Credentials could not be verified.'}
                </p>
              </div>
            )}

            {/* GPS TELEMETRY MODE CONTROLS */}
            <div className="my-4 space-y-3">
              {/* REAL DEVICE GPS */}
              <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                      <Crosshair className="w-3.5 h-3.5 text-blue-400" />
                      <span>REAL DEVICE GPS</span>
                    </span>
                    <span className="text-[11px] text-neutral-400 block">
                      Browser Geolocation API (HTML5)
                    </span>
                  </div>
                  <button
                    onClick={handleToggleRealGps}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isRealGpsActive
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                    }`}
                  >
                    {isRealGpsActive ? 'Disable GPS' : 'Enable Device GPS'}
                  </button>
                </div>

                {isRealGpsActive && (
                  <div className="mt-3 pt-2.5 border-t border-neutral-800 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-neutral-500 block text-[10px]">Status:</span>
                      <span className="font-bold text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        LIVE TELEMETRY
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px]">Accuracy:</span>
                      <span className="font-bold text-white">
                        {gpsAccuracy ? `±${gpsAccuracy} m` : 'Acquiring...'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px]">Last Update:</span>
                      <span className="font-semibold text-neutral-300">{lastGpsUpdate || 'Connecting...'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px]">Permission:</span>
                      <span className="font-semibold text-emerald-400 uppercase">{gpsPermissionState}</span>
                    </div>
                  </div>
                )}

                {gpsError && (
                  <div className="mt-2 p-2 bg-red-950/60 border border-red-800 text-red-300 text-[11px] rounded-lg flex items-center justify-between">
                    <span>{gpsError}</span>
                    <button
                      onClick={handleToggleRealGps}
                      className="text-xs font-bold underline text-red-400"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* DEMO GPS SIMULATOR */}
              <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-amber-300 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded uppercase tracking-wider block w-fit mb-1">
                      DEMO GPS — SIMULATOR
                    </span>
                    <span className="text-[11px] text-neutral-400 block">
                      Synthetic vehicular telemetry along Aurangabad streets
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (!isSimulatingGps && isRealGpsActive) {
                        handleToggleRealGps();
                      }
                      setIsSimulatingGps(!isSimulatingGps);
                    }}
                    disabled={!activeTrip}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      isSimulatingGps
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 disabled:opacity-40'
                    }`}
                  >
                    {isSimulatingGps ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isSimulatingGps ? 'Pause' : 'Start Demo'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PENDING DISPATCH OFFER ALERT (45s COUNTDOWN) */}
            {pendingOffer && (
              <div className="my-5 p-5 bg-gradient-to-br from-red-950 to-neutral-950 border-2 border-red-500 rounded-2xl shadow-2xl animate-pulse">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-red-500 animate-ping" />
                    INCOMING DISPATCH OFFER
                  </span>
                  <div className="flex items-center gap-1 text-sm font-black text-red-400 bg-neutral-900 px-3 py-1 rounded-full border border-red-800">
                    <Clock className="w-4 h-4" />
                    <span>{countdown}s</span>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-base font-black text-white">
                    {pendingOffer.emergencyCategory.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-neutral-300 mt-1 flex items-start gap-1">
                    <span className="font-bold shrink-0 text-red-400">Pickup:</span>
                    <span>{pendingOffer.pickupAddress}</span>
                  </div>
                  {pendingOffer.estimatedDistanceKm && (
                    <div className="text-xs text-neutral-400 mt-0.5">
                      Distance: ~{pendingOffer.estimatedDistanceKm} km
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={handleAcceptOffer}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>ACCEPT ({countdown}s)</span>
                  </button>
                  <button
                    onClick={handleDeclineOffer}
                    className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 border border-neutral-700"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>DECLINE</span>
                  </button>
                </div>
              </div>
            )}

            {/* ACTIVE TRIP STEPWISE ACTION INTERFACE */}
            {activeTrip ? (
              <div className="mt-4 space-y-4">
                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Emergency Mission Phase</span>
                    <span className="font-extrabold text-white px-2 py-0.5 bg-neutral-800 rounded border border-neutral-700">
                      {activeTrip.status}
                    </span>
                  </div>

                  <div className="mt-3 text-sm font-black text-white">
                    {activeTrip.emergencyCategory.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-neutral-300 mt-1">
                    Patient: {activeTrip.patientName || 'Emergency Patient'}
                  </div>
                  <div className="text-xs text-neutral-300 mt-0.5">
                    Pickup: {activeTrip.pickupAddress}
                  </div>

                  {activeTrip.hospital && (
                    <div className="mt-3 p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl text-xs text-emerald-200">
                      <div className="flex items-center justify-between">
                        <strong>Receiving ER: {activeTrip.hospital.name}</strong>
                        <span className="text-[10px] bg-emerald-900 text-emerald-200 font-bold px-1.5 py-0.5 rounded">
                          Beds: {activeTrip.hospital.availableEmergencyBeds}
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-300/80 mt-0.5">{activeTrip.hospital.address}</div>
                    </div>
                  )}

                  {/* Route Distance & Timing */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-neutral-900 p-2 rounded-xl border border-neutral-800">
                      <span className="text-neutral-500 block text-[10px]">
                        {isRoadRoute
                          ? isPostPickup
                            ? 'Hospital Road Dist'
                            : 'Pickup Road Dist'
                          : 'Direct Distance (Haversine)'}
                      </span>
                      <span className="font-bold text-white">
                        {activeRoute?.distanceKm ? `${activeRoute.distanceKm} km` : 'En Route'}
                      </span>
                    </div>
                    <div className="bg-neutral-900 p-2 rounded-xl border border-neutral-800">
                      <span className="text-neutral-500 block text-[10px]">Routing Status</span>
                      <span
                        className={`font-bold ${
                          isRoadRoute ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {isRoadRoute
                          ? `OSRM Verified (${routeCoords.length} pts)`
                          : 'Haversine Direct'}
                      </span>
                    </div>
                  </div>

                  {/* Recalculate Route Option */}
                  <button
                    onClick={handleRecalculateRoute}
                    className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 font-bold flex items-center justify-center gap-1 w-full"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Recalculate Optimal Route</span>
                  </button>
                </div>

                {/* Stepwise Progression Controls */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-400 block">
                    Sequential Mission Controls
                  </span>

                  {activeTrip.status === TripStatus.ACCEPTED && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.EN_ROUTE_TO_PICKUP)}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Start Driving to Patient (EN_ROUTE_TO_PICKUP)</span>
                    </button>
                  )}

                  {activeTrip.status === TripStatus.EN_ROUTE_TO_PICKUP && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.ARRIVED_AT_PICKUP)}
                      className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Arrived at Pickup Scene (ARRIVED_AT_PICKUP)</span>
                    </button>
                  )}

                  {activeTrip.status === TripStatus.ARRIVED_AT_PICKUP && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.PATIENT_PICKED_UP)}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Patient Picked Up & Switch Route to Hospital</span>
                    </button>
                  )}

                  {activeTrip.status === TripStatus.PATIENT_PICKED_UP && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.EN_ROUTE_TO_HOSPITAL)}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Start Driving to Hospital ER (EN_ROUTE_TO_HOSPITAL)</span>
                    </button>
                  )}

                  {activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.ARRIVED_AT_HOSPITAL)}
                      className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Arrived at Hospital Emergency Dept (ARRIVED_AT_HOSPITAL)</span>
                    </button>
                  )}

                  {activeTrip.status === TripStatus.ARRIVED_AT_HOSPITAL && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.COMPLETED)}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Complete Handover & Restore Fleet (COMPLETED)</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              !pendingOffer && (
                <div className="my-10 text-center text-neutral-500">
                  <Ambulance className="w-12 h-12 mx-auto text-neutral-600 mb-2 stroke-1" />
                  <p className="text-sm font-bold text-neutral-300">No active dispatches</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {appStatusInfo?.applicationStatus === DriverApplicationStatus.APPROVED
                      ? 'Keep status set to AVAILABLE to receive emergency dispatch offers.'
                      : 'Awaiting administrator vetting before operational dispatch.'}
                  </p>
                </div>
              )
            )}
          </div>

          <div className="text-[11px] text-neutral-500 text-center pt-3 border-t border-neutral-800">
            Aurangabad Smart Mobility &bull; Authenticated Driver Terminal
          </div>
        </div>
      </div>

      {/* RIGHT: LIVE MAP VIEW */}
      <div
        className={`flex-1 h-full w-full relative ${
          mobileView === 'panel' ? 'hidden md:block' : 'block'
        }`}
      >
        <EmergencyMap
          pickupLat={activeTrip ? activeTrip.pickupLatitude : currentLat}
          pickupLng={activeTrip ? activeTrip.pickupLongitude : currentLng}
          pickupLabel={activeTrip?.pickupAddress}
          destinationType={isPostPickup ? 'HOSPITAL' : 'PICKUP'}
          destinationLat={isPostPickup && activeTrip?.hospital ? activeTrip.hospital.latitude : undefined}
          destinationLng={isPostPickup && activeTrip?.hospital ? activeTrip.hospital.longitude : undefined}
          destinationLabel={isPostPickup && activeTrip?.hospital ? activeTrip.hospital.name : undefined}
          ambulances={activeAmbulances}
          routeCoordinates={routeCoords}
          routeColor={isPostPickup ? '#059669' : '#2563eb'}
          showBoundary={true}
          activeEta={activeEtaMinutes ? `${activeEtaMinutes} MIN` : null}
          activeDistance={activeRoute?.distanceKm ? `${activeRoute.distanceKm} km` : null}
          routeSource={activeRoute?.source}
          isRoadGeometry={isRoadRoute}
          routePointCount={routeCoords.length}
          onRetryRouting={handleRecalculateRoute}
          isRoutingLoading={isRecalculating}
        />
      </div>
    </div>
  );
};
