import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Mobile API & Network Configuration
 *
 * Android Networking Rules:
 * 1. Android Emulator: The host machine running the Fastify API is reached at http://10.0.2.2:4000
 * 2. Physical Phone (Expo Go): Must use your PC's local LAN IP (e.g. http://192.168.1.X:4000)
 * 3. Web preview: http://localhost:4000
 */

// Detect Expo Host IP if running via Expo Go over Wi-Fi
function resolveAutoHostIp(): string | null {
  try {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return ip;
      }
    }
  } catch {}
  return null;
}

const autoIp = resolveAutoHostIp();

export function getDefaultApiBaseUrl(): string {
  if (Platform.OS === 'android') {
    // If running on a physical device via Expo Go, auto-resolve computer LAN IP
    if (autoIp) {
      return `http://${autoIp}:4000`;
    }
    // Standard Android Emulator fallback
    return 'http://10.0.2.2:4000';
  }

  // iOS simulator or web preview
  return 'http://localhost:4000';
}

// Global runtime API URL override (can be changed in developer settings on the mobile app)
let runtimeApiUrl: string = getDefaultApiBaseUrl();

export const mobileConfig = {
  get apiUrl(): string {
    return runtimeApiUrl;
  },
  setApiUrl(newUrl: string): void {
    runtimeApiUrl = newUrl.replace(/\/+$/, '');
  },
  defaultApiUrl: getDefaultApiBaseUrl(),
  aurangabadDefaultLocation: {
    latitude: 19.8762,
    longitude: 75.3433,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  },
};
