import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Polyline, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
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

export const MobileEmergencyMap: React.FC<MobileEmergencyMapProps> = ({
  pickupLat,
  pickupLng,
  pickupLabel = 'Pickup Location',
  ambulanceLat,
  ambulanceLng,
  ambulanceLabel = 'Ambulance',
  hospitalLat,
  hospitalLng,
  hospitalLabel = 'Hospital',
  routeCoordinates = [],
  onSelectLocation,
  style,
}) => {
  const initialRegion = {
    latitude: pickupLat || ambulanceLat || mobileConfig.aurangabadDefaultLocation.latitude,
    longitude: pickupLng || ambulanceLng || mobileConfig.aurangabadDefaultLocation.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  // Convert [lat, lng] array to MapView { latitude, longitude } array
  const formattedRoute = routeCoordinates
    .filter((c) => Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1]))
    .map((c) => ({ latitude: c[0], longitude: c[1] }));

  return (
    <View style={[styles.container, style]}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={initialRegion}
        onPress={(e) => {
          if (onSelectLocation) {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            onSelectLocation(latitude, longitude);
          }
        }}
      >
        {/* OpenStreetMap Raster Tile Layer */}
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
          zIndex={1}
        />

        {/* Road Polyline (OSRM Geometry) */}
        {formattedRoute.length >= 2 && (
          <Polyline
            coordinates={formattedRoute}
            strokeColor="#3b82f6"
            strokeWidth={4}
            zIndex={2}
          />
        )}

        {/* Patient Pickup Marker */}
        {typeof pickupLat === 'number' && typeof pickupLng === 'number' && (
          <Marker
            coordinate={{ latitude: pickupLat, longitude: pickupLng }}
            title={pickupLabel}
            pinColor="#ef4444"
            zIndex={3}
          />
        )}

        {/* Ambulance Marker */}
        {typeof ambulanceLat === 'number' && typeof ambulanceLng === 'number' && (
          <Marker
            coordinate={{ latitude: ambulanceLat, longitude: ambulanceLng }}
            title={ambulanceLabel}
            pinColor="#3b82f6"
            zIndex={4}
          />
        )}

        {/* Hospital Destination Marker */}
        {typeof hospitalLat === 'number' && typeof hospitalLng === 'number' && (
          <Marker
            coordinate={{ latitude: hospitalLat, longitude: hospitalLng }}
            title={hospitalLabel}
            pinColor="#10b981"
            zIndex={3}
          />
        )}
      </MapView>

      {/* Watermark / Map Attribution Badge */}
      <View style={styles.attributionPill}>
        <Text style={styles.attributionText}>© OpenStreetMap contributors &bull; OSRM</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  attributionPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
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
