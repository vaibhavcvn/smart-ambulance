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

/**
 * Centralized Backend API URL
 * Set to the active Cloudflare Tunnel URL so physical Android devices, emulators,
 * and web previews connect through the secure tunnel without LAN / Wi-Fi IP restrictions.
 * If the tunnel is restarted, replace this single URL.
 */
export const CLOUDFLARE_TUNNEL_URL = 'https://bull-emerging-knee-posted.trycloudflare.com';

// Detect Expo Host IP if running via Expo Go / Dev Client over local Wi-Fi LAN
function resolveAutoHostIp(): string | null {
  try {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost;
    if (hostUri) {
      const host = hostUri.split(':')[0];
      // Only treat host as a LAN IP if it is a valid IPv4 address (e.g. 10.x.x.x or 192.168.x.x)
      // Ignore localhost, 127.0.0.1, and Expo tunnel domains (*.exp.direct / *.ngrok.io)
      const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
      if (isIPv4 && host !== '127.0.0.1') {
        return host;
      }
    }
  } catch {}
  return null;
}

const autoIp = resolveAutoHostIp();

export function getDefaultApiBaseUrl(): string {
  // If a Cloudflare tunnel URL is configured, prioritize it across all platforms
  if (CLOUDFLARE_TUNNEL_URL && CLOUDFLARE_TUNNEL_URL.trim() !== '') {
    return CLOUDFLARE_TUNNEL_URL.trim().replace(/\/+$/, '');
  }

  if (Platform.OS === 'android') {
    // If running on a physical device over Wi-Fi LAN, use discovered computer LAN IP
    if (autoIp) {
      return `http://${autoIp}:4000`;
    }
    // Standard Android Emulator fallback (10.0.2.2 points to host loopback in emulator)
    return 'http://10.0.2.2:4000';
  }

  // iOS simulator or web preview
  return 'http://localhost:4000';
}

// Global runtime API URL override (can be changed directly on the mobile app UI)
let runtimeApiUrl: string = getDefaultApiBaseUrl();

export const mobileConfig = {
  get apiUrl(): string {
    return runtimeApiUrl;
  },
  setApiUrl(newUrl: string): void {
    runtimeApiUrl = newUrl.replace(/\/+$/, '');
  },
  defaultApiUrl: getDefaultApiBaseUrl(),
  tunnelUrl: CLOUDFLARE_TUNNEL_URL,
  detectedHostIp: autoIp,
  aurangabadDefaultLocation: {
    latitude: 19.8762,
    longitude: 75.3433,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  },
};

