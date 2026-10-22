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
import { EmergencyMap, calculateBearing } from '../../components/maps/EmergencyMap.js';
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
  Loader2,
  ChevronUp,
  ChevronDown,
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

  // In-flight action loading states (instant UI feedback and double-click prevention)
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [isDeclining, setIsDeclining] = useState<boolean>(false);
  const [transitioningTo, setTransitioningTo] = useState<TripStatus | null>(null);
  const [isTogglingAvailability, setIsTogglingAvailability] = useState<boolean>(false);

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
  const simWaypointIndexRef = useRef<number>(0);

  // Mobile layout sheet mode: 'peek' (minimal HUD) | 'half' (standard) | 'full' (expanded)
  const [mobileSheetMode, setMobileSheetMode] = useState<'peek' | 'half' | 'full'>('peek');

  const cycleSheetMode = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
    setMobileSheetMode((prev) => {
      if (prev === 'peek') return 'half';
      if (prev === 'half') return 'full';
      return 'peek';
    });
  };

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

    if (user) {
      loadDriverState();
    }
  }, [user]);

  // 1a. Real-time polling fallback for serverless deployments (polls for new dispatch offers every 2.5s)
  useEffect(() => {
    if (!user) return;
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

    const handleDriverLocation = (loc: any) => {
      if (activeTrip && activeTrip.driver && loc.driverId === activeTrip.driver.id) {
        setCurrentLat(loc.latitude);
        setCurrentLng(loc.longitude);
        setLastGpsUpdate(new Date().toLocaleTimeString());
      }
    };

    socket.on('dispatch:offer', handleOffer);
    socket.on('dispatch:expired', handleExpired);
    socket.on('trip:updated', handleTripUpdate);
    socket.on('driver:location:changed', handleDriverLocation);

    return () => {
      socket.off('dispatch:offer', handleOffer);
      socket.off('dispatch:expired', handleExpired);
      socket.off('trip:updated', handleTripUpdate);
      socket.off('driver:location:changed', handleDriverLocation);
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
    if (!pendingOffer || isAccepting || isDeclining) return;
    setIsAccepting(true);
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
    } finally {
      setIsAccepting(false);
    }
  };

  // 6. Handle Decline Offer
  const handleDeclineOffer = async () => {
    if (!pendingOffer || isAccepting || isDeclining) return;
    setIsDeclining(true);
    try {
      await api.post('/api/v1/dispatch/respond', {
        dispatchRequestId: pendingOffer.dispatchRequestId,
        action: 'DECLINE',
        reason: 'Driver unavailable at moment',
      });
      setPendingOffer(null);
    } catch (err: any) {
      alert(err.message || 'Error declining offer.');
    } finally {
      setIsDeclining(false);
    }
  };

  // 7. Handle Trip Status Transition (PHASE 2 Route Switching)
  const handleTransitionStatus = async (targetStatus: TripStatus) => {
    if (!activeTrip || transitioningTo !== null) return;
    setTransitioningTo(targetStatus);
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
    } finally {
      setTransitioningTo(null);
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
    if (isTogglingAvailability) return;
    setIsTogglingAvailability(true);
    const nextStatus =
      driverStatus === DriverStatus.AVAILABLE ? DriverStatus.OFFLINE : DriverStatus.AVAILABLE;
    try {
      const res = await api.patch<any>('/api/v1/drivers/availability', {
        status: nextStatus,
        currentLatitude: currentLat,
        currentLongitude: currentLng,
      });
      setDriverStatus(nextStatus);
      if (res.applicationStatus) {
        setAppStatusInfo((prev) =>
          prev
            ? {
                ...prev,
                applicationStatus: res.applicationStatus as DriverApplicationStatus,
                status: nextStatus,
                assignedAmbulance: res.assignedAmbulance ?? prev.assignedAmbulance,
              }
            : null
        );
      }
    } catch (err: any) {
      alert(err.message || 'Failed to change driver status.');
    } finally {
      setIsTogglingAvailability(false);
    }
  };

  const handleActivateDriver = async () => {
    if (isTogglingAvailability) return;
    setIsTogglingAvailability(true);
    try {
      const res = await api.post<{ success: boolean; driver: any }>('/api/v1/drivers/activate', {});
      if (res.driver) {
        setDriverStatus(DriverStatus.AVAILABLE);
        setAppStatusInfo((prev) =>
          prev
            ? {
                ...prev,
                applicationStatus: DriverApplicationStatus.APPROVED,
                status: DriverStatus.AVAILABLE,
                assignedAmbulance: res.driver.assignedAmbulance ?? prev.assignedAmbulance,
              }
            : null
        );
      }
    } catch (err: any) {
      alert(err.message || 'Failed to activate driver account.');
    } finally {
      setIsTogglingAvailability(false);
    }
  };

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

  // Reset simulator waypoint progression whenever trip status changes
  useEffect(() => {
    simWaypointIndexRef.current = 0;
  }, [activeTrip?.status, activeTrip?.id]);

  // 10. DEMO GPS Simulator Implementation: follows verified road waypoints smoothly
  useEffect(() => {
    if (!isSimulatingGps || !activeTrip) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    const isHospital =
      activeTrip.status === TripStatus.PATIENT_PICKED_UP ||
      activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL ||
      activeTrip.status === TripStatus.ARRIVED_AT_HOSPITAL;

    const targetLat = isHospital && activeTrip.hospital
      ? activeTrip.hospital.latitude
      : activeTrip.pickupLatitude;

    const targetLng = isHospital && activeTrip.hospital
      ? activeTrip.hospital.longitude
      : activeTrip.pickupLongitude;

    simIntervalRef.current = setInterval(async () => {
      let nextLat = targetLat;
      let nextLng = targetLng;
      let nextHeading: number | undefined;

      if (routeCoords.length >= 2) {
        if (simWaypointIndexRef.current < routeCoords.length - 1) {
          simWaypointIndexRef.current += 1;
          const [nLat, nLng] = routeCoords[simWaypointIndexRef.current];
          const [pLat, pLng] = routeCoords[simWaypointIndexRef.current - 1];
          nextLat = nLat;
          nextLng = nLng;
          nextHeading = Math.round(calculateBearing(pLat, pLng, nLat, nLng));
        } else {
          // Reached the destination waypoint
          const [lastLat, lastLng] = routeCoords[routeCoords.length - 1];
          nextLat = lastLat;
          nextLng = lastLng;

          if (activeTrip.status === TripStatus.ACCEPTED || activeTrip.status === TripStatus.EN_ROUTE_TO_PICKUP) {
            handleTransitionStatus(TripStatus.ARRIVED_AT_PICKUP);
          } else if (activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL) {
            handleTransitionStatus(TripStatus.ARRIVED_AT_HOSPITAL);
          }
        }
      } else {
        // Fallback step towards destination
        setCurrentLat((prevLat) => {
          nextLat = prevLat + (targetLat - prevLat) * 0.08;
          return nextLat;
        });
        setCurrentLng((prevLng) => {
          nextLng = prevLng + (targetLng - prevLng) * 0.08;
          return nextLng;
        });
        nextHeading = Math.round(calculateBearing(currentLat, currentLng, targetLat, targetLng));
      }

      setCurrentLat(nextLat);
      setCurrentLng(nextLng);
      setLastGpsUpdate(new Date().toLocaleTimeString());

      api.post('/api/v1/tracking/location', {
        latitude: nextLat,
        longitude: nextLng,
        heading: nextHeading,
        speed: 42,
        accuracy: 6,
        isSimulated: true,
      }).catch(console.warn);
    }, 1000);

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [isSimulatingGps, activeTrip?.status, activeTrip?.hospital?.id, routeCoords.length]);

  // Active ambulance representation
  const activeAmbulances = activeTrip?.ambulance
    ? [{ ...activeTrip.ambulance, currentLatitude: currentLat, currentLongitude: currentLng }]
    : [];

  const activeEtaMinutes =
    isRoadRoute && activeRoute?.durationSeconds && activeRoute.durationSeconds > 0
      ? Math.max(1, Math.round(activeRoute.durationSeconds / 60))
      : null;

  return (
    <div className="relative h-[calc(100dvh-48px)] sm:h-[calc(100vh-88px)] w-full flex flex-col md:flex-row overflow-hidden bg-neutral-950 font-sans text-neutral-100">
      {/* 1. UBER-STYLE DRIVER BOTTOM SHEET / DESKTOP SIDEBAR */}
      <div
        className={`z-20 w-full md:w-[440px] lg:w-[470px] xl:w-[490px] bg-neutral-900 md:border-r border-t md:border-t-0 border-neutral-800 shadow-2xl flex flex-col text-neutral-100 transition-all duration-300 order-1
          fixed inset-x-0 bottom-14 md:relative md:bottom-auto md:h-full mobile-bottom-sheet md:rounded-none
          ${
            mobileSheetMode === 'peek'
              ? 'max-h-[185px] md:max-h-none'
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
                ? '▲ Tap to expand mission details'
                : mobileSheetMode === 'half'
                ? 'Tap for full controls or map'
                : '▼ Tap to minimize sheet'}
            </span>
            <ChevronUp
              className={`w-3.5 h-3.5 transition-transform ${
                mobileSheetMode === 'full' ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>

        {/* Scrollable Driver Controls Body */}
        <div className="flex-1 overflow-y-auto">
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
              {appStatusInfo?.applicationStatus === DriverApplicationStatus.APPROVED ||
              appStatusInfo?.applicationStatus === DriverApplicationStatus.PENDING_REVIEW ? (
                <button
                  onClick={handleToggleAvailability}
                  disabled={isTogglingAvailability}
                  className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
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
                  <span>
                    {isTogglingAvailability
                      ? 'Updating...'
                      : driverStatus === DriverStatus.AVAILABLE
                      ? 'ONLINE (AVAILABLE)'
                      : 'OFFLINE (CLICK TO GO ONLINE)'}
                  </span>
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
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>DRIVER APPLICATION REGISTERED</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-900/60 text-amber-300 rounded border border-amber-700/60">
                    READY TO ACTIVATE
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-300/80">
                  License: <span className="font-semibold text-white">{appStatusInfo.licenseNumber}</span> | Requested Vehicle:{' '}
                  <span className="font-semibold text-white">{appStatusInfo.vehicleTypeRequested || 'BLS'}</span>. You can activate your profile and go online immediately to receive incoming patient requests.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleActivateDriver}
                    disabled={isTogglingAvailability}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black rounded-xl transition-all shadow-md shadow-amber-900/30 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>⚡ Activate Profile &amp; Go Online</span>
                  </button>
                </div>
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
                    disabled={isAccepting || isDeclining}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    {isAccepting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>ACCEPTING...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>ACCEPT ({countdown}s)</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDeclineOffer}
                    disabled={isAccepting || isDeclining}
                    className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 disabled:cursor-not-allowed text-neutral-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 border border-neutral-700"
                  >
                    {isDeclining ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>DECLINING...</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        <span>DECLINE</span>
                      </>
                    )}
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
                    disabled={isRecalculating}
                    className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-50 font-bold flex items-center justify-center gap-1 w-full"
                  >
                    {isRecalculating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCw className="w-3 h-3" />
                    )}
                    <span>{isRecalculating ? 'Recalculating...' : 'Recalculate Optimal Route'}</span>
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
                      disabled={transitioningTo !== null}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {transitioningTo === TripStatus.EN_ROUTE_TO_PICKUP ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating: En Route to Patient...</span>
                        </>
                      ) : (
                        <>
                          <Navigation className="w-4 h-4" />
                          <span>Start Driving to Patient (EN_ROUTE_TO_PICKUP)</span>
                        </>
                      )}
                    </button>
                  )}

                  {activeTrip.status === TripStatus.EN_ROUTE_TO_PICKUP && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.ARRIVED_AT_PICKUP)}
                      disabled={transitioningTo !== null}
                      className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {transitioningTo === TripStatus.ARRIVED_AT_PICKUP ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating: Arrived at Pickup...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Arrived at Pickup Scene (ARRIVED_AT_PICKUP)</span>
                        </>
                      )}
                    </button>
                  )}

                  {activeTrip.status === TripStatus.ARRIVED_AT_PICKUP && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.PATIENT_PICKED_UP)}
                      disabled={transitioningTo !== null}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {transitioningTo === TripStatus.PATIENT_PICKED_UP ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating: Patient Picked Up & Routing...</span>
                        </>
                      ) : (
                        <>
                          <Building2 className="w-4 h-4" />
                          <span>Patient Picked Up & Switch Route to Hospital</span>
                        </>
                      )}
                    </button>
                  )}

                  {activeTrip.status === TripStatus.PATIENT_PICKED_UP && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.EN_ROUTE_TO_HOSPITAL)}
                      disabled={transitioningTo !== null}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {transitioningTo === TripStatus.EN_ROUTE_TO_HOSPITAL ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating: En Route to Hospital...</span>
                        </>
                      ) : (
                        <>
                          <Navigation className="w-4 h-4" />
                          <span>Start Driving to Hospital ER (EN_ROUTE_TO_HOSPITAL)</span>
                        </>
                      )}
                    </button>
                  )}

                  {activeTrip.status === TripStatus.EN_ROUTE_TO_HOSPITAL && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.ARRIVED_AT_HOSPITAL)}
                      disabled={transitioningTo !== null}
                      className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {transitioningTo === TripStatus.ARRIVED_AT_HOSPITAL ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating: Arrived at Hospital...</span>
                        </>
                      ) : (
                        <>
                          <Building2 className="w-4 h-4" />
                          <span>Arrived at Hospital Emergency Dept (ARRIVED_AT_HOSPITAL)</span>
                        </>
                      )}
                    </button>
                  )}

                  {activeTrip.status === TripStatus.ARRIVED_AT_HOSPITAL && (
                    <button
                      onClick={() => handleTransitionStatus(TripStatus.COMPLETED)}
                      disabled={transitioningTo !== null}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {transitioningTo === TripStatus.COMPLETED ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Completing Handover...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Complete Handover & Restore Fleet (COMPLETED)</span>
                        </>
                      )}
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
      </div>

      {/* 2. FULLSCREEN INTERACTIVE DRIVER NAVIGATION MAP */}
      <div className="absolute inset-0 md:relative md:flex-1 h-full w-full z-0 order-2">
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
          invalidateTrigger={mobileSheetMode}
        />

        {/* Floating Mobile Incoming Offer Banner (Shown on top of map) */}
        {pendingOffer && (
          <div className="md:hidden absolute top-3 left-3 right-3 z-[450] bg-neutral-900/98 border-2 border-red-500 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-pulse">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-red-500 animate-ping" />
                DISPATCH OFFER ({countdown}s)
              </span>
              <span className="text-xs font-black text-white px-2 py-0.5 rounded bg-red-950 border border-red-800">
                {pendingOffer.emergencyCategory.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="text-xs font-semibold text-neutral-200 mt-1.5 truncate">
              📍 {pendingOffer.pickupAddress}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={handleAcceptOffer}
                disabled={isAccepting || isDeclining}
                className="py-3 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <CheckCircle className="w-4 h-4" />
                <span>ACCEPT ({countdown}s)</span>
              </button>
              <button
                onClick={handleDeclineOffer}
                disabled={isAccepting || isDeclining}
                className="py-3 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs rounded-xl border border-neutral-700 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <XCircle className="w-4 h-4" />
                <span>DECLINE</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
