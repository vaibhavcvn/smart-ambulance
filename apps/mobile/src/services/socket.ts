import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@aurangabad-ambulance/shared';
import { mobileConfig } from '../config/env.js';
import { authStorage } from './auth-storage.js';

let socket: Socket | null = null;
let connectedUrl: string | null = null;
let connectedToken: string | null = null;

export async function getMobileSocket(): Promise<Socket> {
  const token = await authStorage.getToken();
  const targetUrl = mobileConfig.apiUrl;
  const isSecure = targetUrl.startsWith('https://');

  // If already connected to the same URL and token, return existing socket instance
  if (socket && socket.connected && connectedUrl === targetUrl && connectedToken === token) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  connectedUrl = targetUrl;
  connectedToken = token;

  socket = io(targetUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    secure: isSecure,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  return socket;
}

export function disconnectMobileSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export async function subscribeToTrip(tripId: string): Promise<void> {
  const s = await getMobileSocket();
  s.emit(SOCKET_EVENTS.SUBSCRIBE_TRIP, { tripId });
}

export async function unsubscribeFromTrip(tripId: string): Promise<void> {
  if (socket) {
    socket.emit(SOCKET_EVENTS.UNSUBSCRIBE_TRIP, { tripId });
  }
}
