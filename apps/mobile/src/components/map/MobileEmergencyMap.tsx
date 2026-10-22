import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableWithoutFeedback,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { mobileConfig } from '../../config/env.js';

export interface MobileEmergencyMapProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupLabel?: string;
  ambulanceLat?: number | null;
  ambulanceLng?: number | null;
  ambulanceLabel?: string;
  hospitalLat?: number | null;
  hospitalLng?: number | null;
  hospitalLabel?: string;
  routeCoordinates?: [number, number][]; // [lat, lng] array
  onSelectLocation?: (lat: number, lng: number) => void;
  style?: object;
}

// OpenStreetMap tile (free, permitted with attribution)
const OSM_AURANGABAD_TILE_URI = 'https://tile.openstreetmap.org/13/5809/3698.png';

export const MobileEmergencyMap: React.FC<MobileEmergencyMapProps> = ({
  pickupLat = 19.8762,
  pickupLng = 75.3242,
  pickupLabel = 'Pickup Location',
  ambulanceLat = 19.8820,
  ambulanceLng = 75.3350,
  ambulanceLabel = 'Ambulance',
  hospitalLat = 19.8906,
  hospitalLng = 75.3218,
  hospitalLabel = 'Hospital',
  routeCoordinates = [],
  onSelectLocation,
  style,
}) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 340,
    height: 220,
  });
  const [tileFailed, setTileFailed] = useState<boolean>(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setDimensions({ width, height });
    }
  };

  // Collect all valid coordinate points to dynamically calculate bounds
  const allLats: number[] = [];
  const allLngs: number[] = [];

  if (typeof pickupLat === 'number') allLats.push(pickupLat);
  if (typeof pickupLng === 'number') allLngs.push(pickupLng);
  if (typeof ambulanceLat === 'number') allLats.push(ambulanceLat);
  if (typeof ambulanceLng === 'number') allLngs.push(ambulanceLng);
  if (typeof hospitalLat === 'number') allLats.push(hospitalLat);
  if (typeof hospitalLng === 'number') allLngs.push(hospitalLng);

  routeCoordinates.forEach((c) => {
    if (Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
      allLats.push(c[0]);
      allLngs.push(c[1]);
    }
  });

  if (allLats.length === 0) allLats.push(mobileConfig.aurangabadDefaultLocation.latitude);
  if (allLngs.length === 0) allLngs.push(mobileConfig.aurangabadDefaultLocation.longitude);

  const minLat = Math.min(...allLats) - 0.006;
  const maxLat = Math.max(...allLats) + 0.006;
  const minLng = Math.min(...allLngs) - 0.008;
  const maxLng = Math.max(...allLngs) + 0.008;

  const latSpan = maxLat - minLat || 0.01;
  const lngSpan = maxLng - minLng || 0.01;

  const toX = (lng: number) => Math.max(16, Math.min(dimensions.width - 16, ((lng - minLng) / lngSpan) * dimensions.width));
  const toY = (lat: number) => Math.max(16, Math.min(dimensions.height - 16, ((maxLat - lat) / latSpan) * dimensions.height));

  const handlePress = (e: any) => {
    if (!onSelectLocation) return;
    const { locationX, locationY } = e.nativeEvent;
    const tappedLng = minLng + (locationX / dimensions.width) * lngSpan;
    const tappedLat = maxLat - (locationY / dimensions.height) * latSpan;
    onSelectLocation(tappedLat, tappedLng);
  };

  const formattedRoute = routeCoordinates.filter(
    (c) => Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])
  );
  const routePointsString = formattedRoute
    .map((c) => `${toX(c[1]).toFixed(1)},${toY(c[0]).toFixed(1)}`)
    .join(' ');

  return (
    <TouchableWithoutFeedback onPress={handlePress}>
      <View style={[styles.container, style]} onLayout={onLayout}>
        {/* OpenStreetMap Raster Background */}
        {!tileFailed ? (
          <Image
            source={{ uri: OSM_AURANGABAD_TILE_URI }}
            style={styles.tileBackground}
            resizeMode="cover"
            onError={() => setTileFailed(true)}
          />
        ) : (
          /* High-precision dark vector schematic fallback if tile network is unavailable */
          <View style={styles.schematicBackground}>
            <View style={styles.gridCrosshairH} />
            <View style={styles.gridCrosshairV} />
            <Text style={styles.schematicLabel}>Aurangabad Central District</Text>
          </View>
        )}
        <View style={styles.darkOverlay} />

        {/* Vector SVG Layer for OSRM Route & Waypoint Connections */}
        <Svg style={StyleSheet.absoluteFill}>
          {formattedRoute.length >= 2 ? (
            <>
              {/* Outer Glow */}
              <Polyline
                points={routePointsString}
                fill="none"
                stroke="#60a5fa"
                strokeWidth={6}
                strokeOpacity={0.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Main Corridor Line */}
              <Polyline
                points={routePointsString}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            /* Fallback dashed corridor between pickup and hospital */
            typeof pickupLat === 'number' &&
            typeof pickupLng === 'number' &&
            typeof hospitalLat === 'number' &&
            typeof hospitalLng === 'number' && (
              <Line
                x1={toX(pickupLng)}
                y1={toY(pickupLat)}
                x2={toX(hospitalLng)}
                y2={toY(hospitalLat)}
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="4, 4"
              />
            )
          )}
        </Svg>

        {/* Markers */}
        {/* Patient Pickup Marker (Red) */}
        {typeof pickupLat === 'number' && typeof pickupLng === 'number' && (
          <View style={[styles.markerAnchor, { left: toX(pickupLng) - 12, top: toY(pickupLat) - 12 }]}>
            <View style={[styles.markerDot, styles.pickupDot]}>
              <View style={styles.innerDot} />
            </View>
            <Text style={styles.markerBadge} numberOfLines={1}>
              {pickupLabel}
            </Text>
          </View>
        )}

        {/* Ambulance Marker (Blue) */}
        {typeof ambulanceLat === 'number' && typeof ambulanceLng === 'number' && (
          <View style={[styles.markerAnchor, { left: toX(ambulanceLng) - 12, top: toY(ambulanceLat) - 12 }]}>
            <View style={[styles.markerDot, styles.ambulanceDot]}>
              <View style={styles.innerDot} />
            </View>
            <Text style={[styles.markerBadge, styles.ambulanceBadge]} numberOfLines={1}>
              {ambulanceLabel}
            </Text>
          </View>
        )}

        {/* Hospital Destination Marker (Green) */}
        {typeof hospitalLat === 'number' && typeof hospitalLng === 'number' && (
          <View style={[styles.markerAnchor, { left: toX(hospitalLng) - 12, top: toY(hospitalLat) - 12 }]}>
            <View style={[styles.markerDot, styles.hospitalDot]}>
              <View style={styles.innerDot} />
            </View>
            <Text style={[styles.markerBadge, styles.hospitalBadge]} numberOfLines={1}>
              {hospitalLabel}
            </Text>
          </View>
        )}

        {/* Top Corridor Status Pill */}
        <View style={styles.topPill}>
          <View style={styles.greenBeacon} />
          <Text style={styles.topPillText}>OSM &bull; Aurangabad Live Corridor</Text>
        </View>

        {/* Watermark / Map Attribution Badge */}
        <View style={styles.attributionPill}>
          <Text style={styles.attributionText}>© OpenStreetMap &bull; CARTO &bull; OSRM</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#090d16',
    borderRadius: 12,
  },
  tileBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  schematicBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1120',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCrosshairH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
  },
  gridCrosshairV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
  },
  schematicLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  topPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(9, 9, 11, 0.85)',
    borderColor: '#27272a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  greenBeacon: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  topPillText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  markerAnchor: {
    position: 'absolute',
    alignItems: 'center',
    width: 24,
    height: 24,
    justifyContent: 'center',
  },
  markerDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 4,
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  pickupDot: {
    backgroundColor: '#ef4444',
  },
  ambulanceDot: {
    backgroundColor: '#3b82f6',
  },
  hospitalDot: {
    backgroundColor: '#10b981',
  },
  markerBadge: {
    position: 'absolute',
    top: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#f87171',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    maxWidth: 100,
  },
  ambulanceBadge: {
    color: '#60a5fa',
  },
  hospitalBadge: {
    color: '#34d399',
  },
  attributionPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  attributionText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
  },
});
