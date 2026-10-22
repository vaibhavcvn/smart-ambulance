import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  AURANGABAD_BOUNDS,
  AmbulanceDTO,
  HospitalDTO,
  TrafficBlockageDTO,
  TrafficSignalDTO,
} from '@aurangabad-ambulance/shared';
import { api } from '../../lib/api-client.js';
import {
  Locate,
  Navigation,
  Compass,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Clock,
  Radio,
  Building2,
  ShieldAlert,
} from 'lucide-react';

// Safely patch Leaflet default icon URLs for production Vite/Vercel bundles
try {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
} catch {
  // Silent fallback
}

// Bearing calculation utility
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// Distance calculation utility in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Custom SVG-based Ambulance Marker with vehicle body, directional orientation, sirens & badges
const createAmbulanceIcon = (
  type: string,
  isSimulated = false,
  heading = 0,
  isMoving = false,
  isStale = false
) => {
  const isAls = type === 'ALS';
  const themeColor = isAls ? '#dc2626' : '#2563eb';

  return L.divIcon({
    className: 'custom-ambulance-div-icon',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 56px; height: 68px;">
        <!-- Directional Vehicle Container with smooth CSS rotation -->
        <div style="
          transform: rotate(${heading}deg);
          transition: transform 0.45s cubic-bezier(0.25, 1, 0.5, 1);
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          position: relative;
          opacity: ${isStale ? 0.75 : 1};
        ">
          <!-- Direction Arrow Indicator at front of vehicle -->
          <div style="
            position: absolute; top: -4px; width: 0; height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-bottom: 7px solid ${themeColor};
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
          "></div>

          <!-- Top-Down SVG Ambulance Chassis -->
          <svg width="42" height="42" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));">
            <!-- Shadow base -->
            <rect x="13" y="5" width="22" height="38" rx="7" fill="#000000" fill-opacity="0.2"/>
            <!-- White Ambulance Body -->
            <rect x="13" y="4" width="22" height="38" rx="6" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.8"/>
            
            <!-- Windshield -->
            <path d="M16 9C16 7.5 17 6.5 18.5 6.5H29.5C31 6.5 32 7.5 32 9V13.5H16V9Z" fill="#1E293B"/>
            
            <!-- Dual Flashing Siren Lightbars on Cab -->
            <rect x="17" y="14" width="6" height="3.5" rx="1" fill="#DC2626" class="${isMoving && !isStale ? 'siren-light-red' : ''}"/>
            <rect x="25" y="14" width="6" height="3.5" rx="1" fill="#2563EB" class="${isMoving && !isStale ? 'siren-light-blue' : ''}"/>
            
            <!-- Red Medical Stripe -->
            <rect x="13" y="20" width="22" height="6" fill="${themeColor}"/>
            
            <!-- Medical Cross Emblem ✚ -->
            <rect x="22" y="18" width="4" height="10" rx="0.5" fill="#FFFFFF"/>
            <rect x="19" y="21" width="10" height="4" rx="0.5" fill="#FFFFFF"/>
            <rect x="23" y="19" width="2" height="8" rx="0.3" fill="${themeColor}"/>
            <rect x="20" y="22" width="8" height="2" rx="0.3" fill="${themeColor}"/>

            <!-- Rear Windows -->
            <rect x="16" y="37" width="5.5" height="2.5" rx="0.8" fill="#475569"/>
            <rect x="26.5" y="37" width="5.5" height="2.5" rx="0.8" fill="#475569"/>
          </svg>
        </div>

        <!-- Status Badges Below Marker (Stationary relative to map) -->
        <div style="margin-top: -3px; display: flex; flex-direction: column; align-items: center; gap: 1px;">
          ${
            isStale
              ? `<span style="background: #475569; color: #f8fafc; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 4px; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.3);">STALE GPS</span>`
              : isSimulated
              ? `<span style="background: #f59e0b; color: #451a03; font-size: 8px; font-weight: 900; padding: 1px 5px; border-radius: 4px; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.25);">DEMO GPS</span>`
              : `<span style="background: ${isAls ? '#b91c1c' : '#1d4ed8'}; color: white; font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 4px; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.25);">${type}</span>`
          }
        </div>
      </div>
    `,
    iconSize: [56, 68],
    iconAnchor: [28, 28],
  });
};

// Custom Pickup Pin Icon (Uber-inspired clean round pin with ripple)
const createPickupIcon = () =>
  L.divIcon({
    className: 'custom-pickup-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div class="pulse-marker" style="
          width: 32px; height: 32px;
          background-color: #0f172a;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
        ">
          <div style="width: 10px; height: 10px; border-radius: 50%; background-color: #ef4444;"></div>
        </div>
        <span style="background: #0f172a; color: #ffffff; font-size: 8px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-top: 3px; letter-spacing: 0.5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
          PICKUP
        </span>
      </div>
    `,
    iconSize: [32, 48],
    iconAnchor: [16, 24],
  });

// Custom Destination Hospital Icon (Uber-inspired emerald destination)
const createDestinationHospitalIcon = () =>
  L.divIcon({
    className: 'custom-destination-hospital-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div class="pulse-marker-hospital" style="
          width: 38px; height: 38px;
          background-color: #047857;
          border: 3px solid #ffffff;
          border-radius: 10px;
          box-shadow: 0 4px 16px rgba(4, 120, 87, 0.5);
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 18px; font-weight: bold;
        ">
          🏥
        </div>
        <span style="background: #065f46; color: white; font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px; margin-top: 3px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.25);">
          DESTINATION ER
        </span>
      </div>
    `,
    iconSize: [40, 56],
    iconAnchor: [20, 26],
  });

// Standard hospital icon
const createHospitalIcon = () =>
  L.divIcon({
    className: 'custom-hospital-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          width: 30px; height: 30px;
          background-color: #0284c7;
          border: 2px solid white;
          border-radius: 8px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.25);
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 15px;
        ">
          🏥
        </div>
      </div>
    `,
    iconSize: [30, 34],
    iconAnchor: [15, 17],
  });

// Traffic Signal Icon
const createSignalIcon = (status: string, isVerified: boolean) => {
  const isReq = status === 'REQUESTED';
  const isCleared = status === 'CLEARED';
  const bg = isReq ? '#f59e0b' : isCleared ? '#10b981' : '#64748b';
  return L.divIcon({
    className: 'custom-signal-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="
          width: 24px; height: 24px;
          background-color: ${bg};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 11px;
        ">
          🚦
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Traffic Blockage Icon
const createBlockageIcon = (severity: string) => {
  const isCritical = severity === 'CRITICAL' || severity === 'HIGH';
  return L.divIcon({
    className: 'custom-blockage-marker',
    html: `
      <div style="
        width: 26px; height: 26px;
        background-color: ${isCritical ? '#b91c1c' : '#d97706'};
        border: 2px solid white;
        border-radius: 6px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.25);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 13px;
      ">
        ⚠️
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

// Map click listener
function MapClickHandler({ onSelectLocation }: { onSelectLocation?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onSelectLocation) {
        onSelectLocation(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// Authoritative Map Invalidation & Mobile Layout Synchronization
function MapInvalidator({
  invalidateTrigger,
  routeCoordinates,
}: {
  invalidateTrigger?: any;
  routeCoordinates?: [number, number][];
}) {
  const map = useMap();

  // Handle container resizing and visibility transitions
  useEffect(() => {
    const doResize = () => {
      try {
        map.invalidateSize({ pan: false, animate: false });
      } catch {
        // Safe catch
      }
    };

    // Staggered triggers to catch mobile CSS transitions, drawer expansions, and browser chrome bar
    doResize();
    const t1 = setTimeout(doResize, 60);
    const t2 = setTimeout(doResize, 180);
    const t3 = setTimeout(doResize, 400);
    const t4 = setTimeout(doResize, 800);
    const t5 = setTimeout(doResize, 1500);

    // Modern ResizeObserver on map container element
    let ro: ResizeObserver | null = null;
    const container = map.getContainer();
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => {
        doResize();
      });
      ro.observe(container);
    }

    window.addEventListener('resize', doResize);
    window.addEventListener('orientationchange', doResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', doResize);
      window.removeEventListener('orientationchange', doResize);
    };
  }, [map, invalidateTrigger]);

  // Automatically fit bounds whenever route coordinates are provided
  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length >= 2) {
      try {
        const bounds = L.latLngBounds(routeCoordinates);
        map.fitBounds(bounds, {
          padding: [35, 35],
          maxZoom: 16,
          animate: true,
        });
      } catch {
        // Safe catch
      }
    }
  }, [map, routeCoordinates?.length]);

  return null;
}

// Recenter and Map Controls Component
function MapControlsWidget({
  center,
  ambulancePosition,
  routeBounds,
}: {
  center: [number, number];
  ambulancePosition?: [number, number];
  routeBounds?: [number, number][];
}) {
  const map = useMap();

  const handleRecenterCity = () => {
    map.flyTo(center, AURANGABAD_BOUNDS.defaultZoom, { duration: 1.2 });
  };

  const handleRecenterAmbulance = () => {
    if (ambulancePosition) {
      map.flyTo(ambulancePosition, 16, { duration: 1.2 });
    }
  };

  const handleFitRoute = () => {
    if (routeBounds && routeBounds.length > 1) {
      const bounds = L.latLngBounds(routeBounds);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  };

  return (
    <div className="absolute bottom-28 sm:bottom-5 right-3 sm:right-5 z-[400] flex flex-col gap-1.5 sm:gap-2 pointer-events-auto">
      {ambulancePosition && (
        <button
          onClick={handleRecenterAmbulance}
          className="bg-neutral-900/90 hover:bg-neutral-800 text-white p-2.5 sm:p-3 rounded-xl shadow-xl border border-neutral-700/80 backdrop-blur transition-all flex items-center justify-center group"
          title="Center on Ambulance"
        >
          <Navigation className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {routeBounds && routeBounds.length > 1 && (
        <button
          onClick={handleFitRoute}
          className="bg-neutral-900/90 hover:bg-neutral-800 text-white p-2.5 sm:p-3 rounded-xl shadow-xl border border-neutral-700/80 backdrop-blur transition-all flex items-center justify-center group"
          title="Fit Full Route"
        >
          <Maximize2 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
        </button>
      )}

      <button
        onClick={handleRecenterCity}
        className="bg-neutral-900/90 hover:bg-neutral-800 text-white p-2.5 sm:p-3 rounded-xl shadow-xl border border-neutral-700/80 backdrop-blur transition-all flex items-center justify-center group"
        title="Recenter to Aurangabad"
      >
        <Locate className="w-4 h-4 text-neutral-300 group-hover:scale-110 transition-transform" />
      </button>

      <div className="flex flex-col bg-neutral-900/90 rounded-xl shadow-xl border border-neutral-700/80 backdrop-blur overflow-hidden">
        <button
          onClick={() => map.zoomIn()}
          className="p-2 sm:p-2.5 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors border-b border-neutral-800 flex items-center justify-center"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => map.zoomOut()}
          className="p-2 sm:p-2.5 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors flex items-center justify-center"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Smooth Moving Ambulance Marker Component with Coordinate Interpolation and Heading Alignment
interface SmoothAmbulanceMarkerProps {
  ambulance: AmbulanceDTO;
}

const SmoothAmbulanceMarker: React.FC<SmoothAmbulanceMarkerProps> = ({ ambulance }) => {
  const rawLat = ambulance.currentLatitude ?? (ambulance as any).latitude;
  const rawLng = ambulance.currentLongitude ?? (ambulance as any).longitude;

  const isValidInitial =
    typeof rawLat === 'number' &&
    typeof rawLng === 'number' &&
    !isNaN(rawLat) &&
    !isNaN(rawLng) &&
    rawLat !== 0 &&
    rawLng !== 0;

  const [position, setPosition] = useState<[number, number]>(
    isValidInitial ? [rawLat, rawLng] : [0, 0]
  );
  const [heading, setHeading] = useState<number>(0);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const prevCoordRef = useRef<[number, number]>(
    isValidInitial ? [rawLat, rawLng] : [0, 0]
  );
  const animFrameRef = useRef<number | null>(null);

  // Smoothly interpolate coordinate movements using requestAnimationFrame
  useEffect(() => {
    const targetLat = ambulance.currentLatitude ?? (ambulance as any).latitude;
    const targetLng = ambulance.currentLongitude ?? (ambulance as any).longitude;

    if (
      typeof targetLat !== 'number' ||
      typeof targetLng !== 'number' ||
      isNaN(targetLat) ||
      isNaN(targetLng) ||
      targetLat === 0 ||
      targetLng === 0
    ) {
      return;
    }

    const [startLat, startLng] = prevCoordRef.current;
    if (isNaN(startLat) || isNaN(startLng) || startLat === 0 || startLng === 0) {
      prevCoordRef.current = [targetLat, targetLng];
      setPosition([targetLat, targetLng]);
      return;
    }

    const distMeters = getDistanceMeters(startLat, startLng, targetLat, targetLng);

    // If coordinates shifted significantly, compute heading direction
    if (distMeters > 1.5) {
      const calculatedHeading = calculateBearing(startLat, startLng, targetLat, targetLng);
      setHeading(calculatedHeading);
      setIsMoving(true);
    } else {
      setIsMoving(false);
    }

    const duration = 850; // Smooth 850ms interpolation
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out cubic curve
      const ease = 1 - Math.pow(1 - progress, 3);

      const nextLat = startLat + (targetLat - startLat) * ease;
      const nextLng = startLng + (targetLng - startLng) * ease;

      setPosition([nextLat, nextLng]);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        prevCoordRef.current = [targetLat, targetLng];
        setIsMoving(false);
      }
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    ambulance.currentLatitude,
    ambulance.currentLongitude,
    (ambulance as any).latitude,
    (ambulance as any).longitude,
  ]);

  // Check if location is stale (> 45s since update)
  const isStale = useMemo(() => {
    if (!ambulance.lastLocationUpdate) return false;
    const updateTime = new Date(ambulance.lastLocationUpdate).getTime();
    return Date.now() - updateTime > 45000;
  }, [ambulance.lastLocationUpdate]);

  const icon = useMemo(
    () =>
      createAmbulanceIcon(
        ambulance.type,
        ambulance.isSimulated || false,
        heading,
        isMoving,
        isStale
      ),
    [ambulance.type, ambulance.isSimulated, heading, isMoving, isStale]
  );

  // Guard against invalid coordinates reaching Leaflet Marker
  if (
    typeof position[0] !== 'number' ||
    typeof position[1] !== 'number' ||
    isNaN(position[0]) ||
    isNaN(position[1]) ||
    position[0] === 0 ||
    position[1] === 0
  ) {
    return null;
  }

  return (
    <Marker position={position} icon={icon}>
      <Popup>
        <div className="p-1 min-w-[200px]">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200">
            <span className="font-extrabold text-slate-900 text-sm">
              {ambulance.registrationNumber}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-900 text-white rounded">
              {ambulance.type}
            </span>
          </div>
          <div className="text-xs text-slate-600 mt-1.5">
            <strong>Status:</strong> {ambulance.status}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Coordinates: {position[0].toFixed(5)}, {position[1].toFixed(5)}
          </div>
          {ambulance.isSimulated && (
            <div className="mt-2 text-[10px] bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded border border-amber-300">
              DEMO GPS SIMULATOR ACTIVE
            </div>
          )}
          {isStale && (
            <div className="mt-1 text-[10px] bg-slate-200 text-slate-800 font-semibold px-1.5 py-0.5 rounded">
              ⚠️ Telemetry delayed (&gt;45s)
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

export interface EmergencyMapProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupLabel?: string;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationLabel?: string;
  destinationType?: 'PICKUP' | 'HOSPITAL';
  ambulances?: AmbulanceDTO[];
  hospitals?: HospitalDTO[];
  blockages?: TrafficBlockageDTO[];
  trafficSignals?: TrafficSignalDTO[];
  routeCoordinates?: [number, number][]; // [lat, lng] array
  routeColor?: string;
  onSelectLocation?: (lat: number, lng: number) => void;
  showBoundary?: boolean;
  className?: string;
  isRoutingLoading?: boolean;
  routingError?: string | null;
  activeEta?: string | null;
  activeDistance?: string | null;
  routeSource?: 'OSRM' | 'FALLBACK_HAVERSINE';
  isRoadGeometry?: boolean;
  routePointCount?: number;
  onRetryRouting?: () => void;
  invalidateTrigger?: any;
}

export const EmergencyMap: React.FC<EmergencyMapProps> = ({
  pickupLat,
  pickupLng,
  pickupLabel,
  destinationLat,
  destinationLng,
  destinationLabel,
  destinationType = 'PICKUP',
  ambulances = [],
  hospitals = [],
  blockages = [],
  trafficSignals = [],
  routeCoordinates = [],
  routeColor,
  onSelectLocation,
  showBoundary = true,
  className = 'h-full w-full',
  isRoutingLoading = false,
  routingError,
  activeEta,
  activeDistance,
  routeSource,
  isRoadGeometry = true,
  routePointCount,
  onRetryRouting,
  invalidateTrigger,
}) => {
  const [boundaryCoords, setBoundaryCoords] = useState<[number, number][]>([]);

  // Default center: Aurangabad
  const center: [number, number] = [
    pickupLat || AURANGABAD_BOUNDS.center.latitude,
    pickupLng || AURANGABAD_BOUNDS.center.longitude,
  ];

  // Primary active ambulance position for controls
  const primaryAmbulance = ambulances[0];
  const ambLat = primaryAmbulance
    ? (primaryAmbulance.currentLatitude ?? (primaryAmbulance as any).latitude)
    : null;
  const ambLng = primaryAmbulance
    ? (primaryAmbulance.currentLongitude ?? (primaryAmbulance as any).longitude)
    : null;

  const ambulancePos: [number, number] | undefined =
    primaryAmbulance &&
    typeof ambLat === 'number' &&
    typeof ambLng === 'number' &&
    !isNaN(ambLat) &&
    !isNaN(ambLng) &&
    ambLat !== 0 &&
    ambLng !== 0
      ? [ambLat, ambLng]
      : undefined;

  // Load Aurangabad Service Boundary
  useEffect(() => {
    async function loadBoundary() {
      try {
        const data = await api.get<any>('/api/v1/geo/boundary');
        const rawCoords =
          data?.geometry?.coordinates?.[0] || data?.features?.[0]?.geometry?.coordinates?.[0];
        if (rawCoords) {
          const converted: [number, number][] = rawCoords.map((c: [number, number]) => [c[1], c[0]]);
          setBoundaryCoords(converted);
        }
      } catch (err) {
        console.warn('Could not load boundary polygon:', err);
      }
    }
    if (showBoundary) {
      loadBoundary();
    }
  }, [showBoundary]);

  // Determine polyline colors: Emerald when en route to hospital, Electric Blue or Emergency Red when en route to pickup
  const resolvedRouteColor =
    routeColor || (destinationType === 'HOSPITAL' ? '#059669' : '#2563eb');

  return (
    <div className={`relative ${className} overflow-hidden min-h-[260px] sm:min-h-[350px]`}>
      {/* FLOATING TOP HUD STATUS PILL (Uber-Inspired Live Overlay) */}
      {(activeEta || activeDistance || isRoutingLoading || routingError || routeSource) && (
        <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-[400] max-w-lg w-full px-3 sm:px-4 pointer-events-none">
          <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 text-white rounded-full px-3.5 sm:px-4 py-1.5 sm:py-2 shadow-2xl flex items-center justify-between gap-2.5 sm:gap-3 pointer-events-auto">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${
                  isRoadGeometry && routeSource === 'OSRM'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              ></span>
              <span className="text-[11px] sm:text-xs font-bold text-neutral-200 truncate">
                {destinationType === 'HOSPITAL' ? 'Transit to Hospital ER' : 'Ambulance En Route'}
              </span>
            </div>

            {isRoutingLoading ? (
              <span className="text-[11px] sm:text-xs text-neutral-400 animate-pulse font-medium">Calculating road route...</span>
            ) : !isRoadGeometry || routeSource === 'FALLBACK_HAVERSINE' || routingError ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] sm:text-xs text-amber-400 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Road Route Unavailable (Direct Line Distance)</span>
                  <span className="sm:hidden">Direct Line</span>
                </span>
                {onRetryRouting && (
                  <button
                    onClick={onRetryRouting}
                    className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-bold px-2 py-0.5 rounded border border-neutral-700 cursor-pointer"
                  >
                    Retry
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-extrabold text-white shrink-0">
                {routePointCount && routePointCount > 0 && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60 hidden md:inline-block">
                    OSRM ({routePointCount} pts)
                  </span>
                )}
                {activeEta && <span className="bg-neutral-800 px-2 py-0.5 rounded text-emerald-400 text-[11px] sm:text-xs">{activeEta}</span>}
                {activeDistance && <span className="text-neutral-300 font-semibold text-[11px] sm:text-xs">{activeDistance}</span>}
              </div>
            )}
          </div>
        </div>
      )}


      <MapContainer
        center={center}
        zoom={AURANGABAD_BOUNDS.defaultZoom}
        scrollWheelZoom={true}
        className="h-full w-full"
        zoomControl={false}
      >
        <MapInvalidator invalidateTrigger={invalidateTrigger} routeCoordinates={routeCoordinates} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          keepBuffer={6}
          updateWhenIdle={false}
          updateWhenZooming={true}
        />

        <MapClickHandler onSelectLocation={onSelectLocation} />

        <MapControlsWidget
          center={[AURANGABAD_BOUNDS.center.latitude, AURANGABAD_BOUNDS.center.longitude]}
          ambulancePosition={ambulancePos}
          routeBounds={routeCoordinates.length > 1 ? routeCoordinates : undefined}
        />

        {/* Aurangabad EMS City Boundary Polygon */}
        {showBoundary && boundaryCoords.length > 0 && (
          <Polygon
            positions={boundaryCoords}
            pathOptions={{
              color: '#dc2626',
              weight: 1.8,
              dashArray: '5, 5',
              fillColor: '#ef4444',
              fillOpacity: 0.04,
            }}
          />
        )}

        {/* Uber-Style Layered Route Polyline */}
        {routeCoordinates.length > 0 && (
          <>
            {/* Outer shadow casing line */}
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: '#0f172a',
                weight: 8,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Inner primary route line */}
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: resolvedRouteColor,
                weight: 5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Patient Pickup Marker (Active pre-pickup) */}
        {pickupLat && pickupLng && destinationType !== 'HOSPITAL' && (
          <Marker position={[pickupLat, pickupLng]} icon={createPickupIcon()}>
            <Popup>
              <div className="p-1">
                <div className="font-bold text-slate-900 text-sm">Emergency Pickup</div>
                <div className="text-xs text-slate-600 mt-1">{pickupLabel || 'Selected Patient Location'}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {pickupLat.toFixed(4)}, {pickupLng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Hospital Marker (Active post-pickup) */}
        {destinationLat && destinationLng && destinationType === 'HOSPITAL' && (
          <Marker position={[destinationLat, destinationLng]} icon={createDestinationHospitalIcon()}>
            <Popup>
              <div className="p-1 max-w-[220px]">
                <div className="font-bold text-emerald-800 text-sm">Target Receiving Hospital</div>
                <div className="text-xs text-slate-800 font-semibold mt-1">
                  {destinationLabel || 'Assigned ER Facility'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Coordinates: {destinationLat.toFixed(4)}, {destinationLng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Smooth Moving Ambulances with Directional Heading and Live Telemetry */}
        {ambulances.map((amb) => (
          <SmoothAmbulanceMarker key={amb.id} ambulance={amb} />
        ))}

        {/* Hospitals Network */}
        {hospitals.map((h) => (
          <Marker key={h.id} position={[h.latitude, h.longitude]} icon={createHospitalIcon()}>
            <Popup>
              <div className="p-1 max-w-[210px]">
                <div className="font-bold text-slate-900 text-sm leading-tight">{h.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{h.address}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] bg-slate-50 p-1.5 rounded border border-slate-200">
                  <div>
                    <span className="text-slate-500 block text-[10px]">ER Beds</span>
                    <span className="font-bold text-red-600">{h.availableEmergencyBeds}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ICU Beds</span>
                    <span className="font-bold text-blue-600">{h.availableIcuBeds}</span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Traffic Signals */}
        {trafficSignals.map((sig) => (
          <Marker
            key={sig.id}
            position={[sig.latitude, sig.longitude]}
            icon={createSignalIcon(sig.clearanceStatus, sig.isVerified)}
          >
            <Popup>
              <div className="p-1 max-w-[220px]">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <span>🚦</span> {sig.name}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">{sig.roadName}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Zone: {sig.jurisdictionZone}</div>
                <div className="mt-1.5 p-1 bg-slate-50 rounded text-[11px]">
                  <span className="font-semibold">Clearance:</span>{' '}
                  <span
                    className={`font-bold ${
                      sig.clearanceStatus === 'REQUESTED'
                        ? 'text-amber-600'
                        : sig.clearanceStatus === 'CLEARED'
                        ? 'text-emerald-600'
                        : 'text-slate-600'
                    }`}
                  >
                    {sig.clearanceStatus}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Traffic Blockages */}
        {blockages.map((b) => (
          <Marker key={b.id} position={[b.latitude, b.longitude]} icon={createBlockageIcon(b.severity)}>
            <Popup>
              <div className="p-1 max-w-[220px]">
                <div className="font-bold text-amber-700 text-sm flex items-center gap-1">
                  <span>⚠️</span> {b.title}
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">{b.roadName}</div>
                {b.description && <div className="text-xs text-slate-600 mt-1">{b.description}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
